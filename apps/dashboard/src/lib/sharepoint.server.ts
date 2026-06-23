import 'server-only';
import {
  findBrokerBySharePointPath,
  formatGraphError,
  joinPath,
  sanitizeFolderName,
  setSharePointFolder,
  sharePointFromConfig,
  type SharePointClient,
} from '@brokercomply/shared';
import { getDb } from './db.server';

/** Inline folder-create timeout so a slow/hung Graph call never blocks broker creation. */
const FOLDER_TIMEOUT_MS = 10_000;

// Cache the Graph-backed client across HMR reloads / requests. `null` once we've
// determined SharePoint is not configured, so we don't retry building it every call.
const globalForSp = globalThis as unknown as {
  __bcSharePoint?: SharePointClient | null;
};

/** The shared SharePoint client, or null when credentials/config are absent. */
export function getSharePointClient(): SharePointClient | null {
  if (globalForSp.__bcSharePoint !== undefined) return globalForSp.__bcSharePoint;
  try {
    globalForSp.__bcSharePoint = sharePointFromConfig();
    console.info('[sharepoint] client configured (site + credentials present).');
  } catch (err) {
    // Not configured (missing AZURE_*/SHAREPOINT_SITE_ID) — disable gracefully,
    // but say WHY so a misconfigured env is obvious in the logs.
    console.warn(`[sharepoint] disabled — ${(err as Error).message}`);
    globalForSp.__bcSharePoint = null;
  }
  return globalForSp.__bcSharePoint;
}

/** Whether SharePoint syncing is configured in this environment. */
export function isSharePointConfigured(): boolean {
  return getSharePointClient() !== null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Best-effort, NON-BLOCKING provisioning of a broker's SharePoint folder.
 *
 * Never throws — any failure is caught and recorded as `pending` (retryable from
 * the UI) so broker creation is never rolled back. Outcomes:
 *  - not configured        → status unchanged (stays null; no folder feature)
 *  - name clash (Q2)       → status 'error' (another broker owns that folder path)
 *  - created/linked        → status 'linked' + folder id/url/path persisted
 *  - timeout/Graph failure → status 'pending'
 *
 * Idempotent: `ensureBrokerFolder` links an existing folder rather than
 * duplicating, and never deletes.
 */
export async function provisionBrokerFolder(brokerId: string, societe: string): Promise<void> {
  const client = getSharePointClient();
  if (!client) {
    console.warn(`[sharepoint] provisioning skipped for broker ${brokerId}: client not configured.`);
    return; // feature disabled in this environment
  }

  const name = sanitizeFolderName(societe);
  const targetPath = joinPath(client.root, name);
  console.info(
    `[sharepoint] provisioning broker ${brokerId} — folder "${name}" under "${client.root}" (path: ${targetPath})`,
  );

  try {
    // Q2: refuse to link two brokers to the same folder (would mix documents).
    const clash = await findBrokerBySharePointPath({ db: getDb() }, targetPath, brokerId);
    if (clash) {
      console.warn(
        `[sharepoint] broker ${brokerId}: path "${targetPath}" already owned by broker ${clash.slug} — marking 'error'.`,
      );
      await setSharePointFolder({ db: getDb() }, brokerId, { path: targetPath, status: 'error' });
      return;
    }

    const ref = await withTimeout(
      client.ensureBrokerFolder(name),
      FOLDER_TIMEOUT_MS,
      'ensureBrokerFolder',
    );
    console.info(
      `[sharepoint] broker ${brokerId}: folder ${ref.created ? 'CREATED' : 'LINKED'} id=${ref.id} url=${ref.webUrl}`,
    );
    await setSharePointFolder({ db: getDb() }, brokerId, {
      folderId: ref.id,
      webUrl: ref.webUrl,
      path: ref.path,
      status: 'linked',
    });
  } catch (err) {
    // Surface the real cause (Graph status/body/request-id), not just 'pending'.
    console.error(
      `[sharepoint] folder provisioning FAILED for broker ${brokerId}: ${formatGraphError(err)}`,
    );
    await setSharePointFolder({ db: getDb() }, brokerId, {
      path: targetPath,
      status: 'pending',
    }).catch(() => {
      /* swallow: provisioning is best-effort */
    });
  }
}
