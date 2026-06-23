import { config as globalConfig } from '../config/index.js';
import { encodeDrivePath, joinPath, trimSlashes } from './paths.js';
import { createGraphTransport } from './transport.js';
import type {
  DeltaResult,
  DriveItem,
  DriveItemPage,
  FolderRef,
  GraphTransport,
  SharePointSettings,
} from './types.js';

/** Graph's simple-upload (`PUT …/content`) cap is ~4 MiB; above it we chunk. */
export const SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/** Upload-session chunk size. Must be a multiple of 320 KiB per Graph rules. */
const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;

interface UploadSession {
  uploadUrl: string;
  expirationDateTime?: string;
}

/**
 * Raw range-PUT used for chunked upload sessions. The session URL is a
 * pre-authenticated storage endpoint that must be called WITHOUT the Graph auth
 * header, so it bypasses {@link GraphTransport}. Injectable for testing.
 */
export type RangePut = (
  url: string,
  chunk: Buffer,
  headers: { 'Content-Length': string; 'Content-Range': string },
) => Promise<{ status: number; item?: DriveItem }>;

const defaultRangePut: RangePut = async (url, chunk, headers) => {
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: new Uint8Array(chunk),
  });
  const status = res.status;
  let item: DriveItem | undefined;
  if (status === 200 || status === 201) item = (await res.json()) as DriveItem;
  return { status, item };
};

function statusCodeOf(error: unknown): number | undefined {
  return (error as { statusCode?: number })?.statusCode;
}

const CHILD_SELECT =
  'id,name,size,webUrl,eTag,cTag,file,folder,deleted,createdDateTime,lastModifiedDateTime,parentReference';

/**
 * Thin, well-typed wrapper over the SharePoint document library of a single
 * site. Provides exactly what the broker document sync needs:
 *
 *  - {@link ensureBrokerFolder} — idempotent folder provisioning (links an
 *    existing folder, never duplicates, never deletes).
 *  - {@link uploadFile} — push a file (simple PUT, or upload session > 4 MiB).
 *  - {@link listFolderChildren} — list a folder's contents.
 *  - {@link syncDriveDelta} — pull library changes with a resumable token.
 */
export class SharePointClient {
  private readonly transport: GraphTransport;
  private readonly siteId: string;
  private readonly rootPath: string;
  private readonly rangePut: RangePut;
  private driveId: string | null = null;

  constructor(
    transport: GraphTransport,
    settings: SharePointSettings,
    options: { rangePut?: RangePut } = {},
  ) {
    this.transport = transport;
    this.siteId = settings.siteId;
    this.rootPath = trimSlashes(settings.rootPath);
    this.rangePut = options.rangePut ?? defaultRangePut;
  }

  /** The configured drive-relative root under which broker folders live. */
  get root(): string {
    return this.rootPath;
  }

  /** Resolve and cache the site's default document-library drive id. */
  async getDriveId(): Promise<string> {
    if (this.driveId) return this.driveId;
    const drive = await this.transport.get<{ id: string }>(
      `/sites/${this.siteId}/drive?$select=id`,
    );
    this.driveId = drive.id;
    return drive.id;
  }

  /** GET a driveItem by drive-relative path, or null on 404. */
  private async getItemByPath(path: string): Promise<DriveItem | null> {
    const driveId = await this.getDriveId();
    const rel = path ? `:/${encodeDrivePath(path)}` : '';
    try {
      return await this.transport.get<DriveItem>(`/drives/${driveId}/root${rel}`);
    } catch (error) {
      if (statusCodeOf(error) === 404) return null;
      throw error;
    }
  }

  /**
   * Idempotently ensure a broker's folder exists directly under the configured
   * root. GETs by path first and links the existing folder when present (never
   * duplicates); only creates when absent, with `conflictBehavior: fail` so a
   * concurrent create can never replace/delete an existing folder. NEVER deletes.
   */
  async ensureBrokerFolder(folderName: string): Promise<FolderRef> {
    const name = folderName.trim();
    if (!name) throw new Error('folderName is required');
    const path = joinPath(this.rootPath, name);

    const existing = await this.getItemByPath(path);
    if (existing) {
      return {
        id: existing.id,
        name: existing.name ?? name,
        webUrl: existing.webUrl ?? '',
        path,
        created: false,
      };
    }

    const driveId = await this.getDriveId();
    const parent = this.rootPath ? `:/${encodeDrivePath(this.rootPath)}:` : '';
    const created = await this.transport.post<DriveItem>(
      `/drives/${driveId}/root${parent}/children`,
      { name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
    );
    return {
      id: created.id,
      name: created.name ?? name,
      webUrl: created.webUrl ?? '',
      path,
      created: true,
    };
  }

  /**
   * Resolve an EXISTING folder by an explicit drive-relative path (used by the
   * backfill to link already-created folders without re-creating them). Returns
   * null when the path is absent or is not a folder.
   */
  async resolveFolderByPath(path: string): Promise<FolderRef | null> {
    const clean = trimSlashes(path);
    const item = await this.getItemByPath(clean);
    if (!item || !item.folder) return null;
    return {
      id: item.id,
      name: item.name ?? '',
      webUrl: item.webUrl ?? '',
      path: clean,
      created: false,
    };
  }

  /** List immediate children of a folder by item id (follows pagination). */
  async listFolderChildren(folderId: string): Promise<DriveItem[]> {
    const driveId = await this.getDriveId();
    const out: DriveItem[] = [];
    let url: string | undefined =
      `/drives/${driveId}/items/${folderId}/children?$select=${CHILD_SELECT}`;
    while (url) {
      const page: DriveItemPage = await this.transport.get<DriveItemPage>(url);
      out.push(...(page.value ?? []));
      url = page['@odata.nextLink'];
    }
    return out;
  }

  /** Short-lived pre-authenticated download URL for an item, or null. */
  async getDownloadUrl(itemId: string): Promise<string | null> {
    const driveId = await this.getDriveId();
    const item = await this.transport.get<DriveItem>(
      `/drives/${driveId}/items/${itemId}?$select=id,@microsoft.graph.downloadUrl`,
    );
    return item['@microsoft.graph.downloadUrl'] ?? null;
  }

  /**
   * Upload a file into a folder. Uses a simple PUT for files up to the
   * simple-upload limit and an upload session (chunked) above it.
   */
  async uploadFile(
    folderId: string,
    fileName: string,
    content: Buffer,
    contentType = 'application/octet-stream',
  ): Promise<DriveItem> {
    const name = fileName.trim();
    if (!name) throw new Error('fileName is required');
    const driveId = await this.getDriveId();
    if (content.byteLength <= SIMPLE_UPLOAD_MAX_BYTES) {
      // conflictBehavior=rename: never overwrite an existing compliance document.
      return this.transport.put<DriveItem>(
        `/drives/${driveId}/items/${folderId}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=rename`,
        content,
        contentType,
      );
    }
    return this.uploadLargeFile(driveId, folderId, name, content);
  }

  private async uploadLargeFile(
    driveId: string,
    folderId: string,
    name: string,
    content: Buffer,
  ): Promise<DriveItem> {
    const session = await this.transport.post<UploadSession>(
      `/drives/${driveId}/items/${folderId}:/${encodeURIComponent(name)}:/createUploadSession`,
      { item: { '@microsoft.graph.conflictBehavior': 'rename', name } },
    );

    const total = content.byteLength;
    let start = 0;
    let item: DriveItem | undefined;
    while (start < total) {
      const end = Math.min(start + UPLOAD_CHUNK_BYTES, total);
      const chunk = content.subarray(start, end);
      const { status, item: got } = await this.rangePut(session.uploadUrl, chunk, {
        'Content-Length': String(chunk.byteLength),
        'Content-Range': `bytes ${start}-${end - 1}/${total}`,
      });
      if (status >= 400) throw new Error(`Upload session chunk failed with status ${status}`);
      if (got) item = got;
      start = end;
    }
    if (!item) throw new Error('Upload session completed without returning a driveItem');
    return item;
  }

  /**
   * Pull changes within a single broker FOLDER subtree via the folder-scoped
   * delta query, following `@odata.nextLink` pages and returning the accumulated
   * items plus the next `@odata.deltaLink` to persist. An expired/invalid token
   * (410 Gone) triggers a full resync of that folder.
   *
   * Folder-scoped delta is fully supported for SharePoint drives and is the
   * recommended way to track changes incrementally, so the sync touches only the
   * broker's content rather than the entire document library.
   */
  async syncFolderDelta(folderId: string, deltaLink?: string): Promise<DeltaResult> {
    const driveId = await this.getDriveId();
    const base = `/drives/${driveId}/items/${folderId}/delta`;
    let url = deltaLink ?? base;
    const items: DriveItem[] = [];
    for (;;) {
      let page: DriveItemPage;
      try {
        page = await this.transport.get<DriveItemPage>(url);
      } catch (error) {
        if (statusCodeOf(error) === 410 && url !== base) {
          url = base;
          items.length = 0;
          continue;
        }
        throw error;
      }
      items.push(...(page.value ?? []));
      const next = page['@odata.nextLink'];
      if (next) {
        url = next;
        continue;
      }
      return { items, deltaLink: page['@odata.deltaLink'] ?? '' };
    }
  }
}

/** Build a {@link SharePointClient} from explicit credentials + settings. */
export function createSharePointClient(params: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteId: string;
  rootPath: string;
  maxRetries?: number;
  rangePut?: RangePut;
}): SharePointClient {
  const transport = createGraphTransport({
    tenantId: params.tenantId,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    maxRetries: params.maxRetries,
  });
  return new SharePointClient(
    transport,
    { siteId: params.siteId, rootPath: params.rootPath },
    { rangePut: params.rangePut },
  );
}

/**
 * Build a {@link SharePointClient} from the validated global config. Throws a
 * readable error when any required SharePoint/Graph credential is missing, so
 * the feature fails loudly at the edge rather than deep inside a Graph call.
 */
export function sharePointFromConfig(): SharePointClient {
  const missing = (
    [
      ['AZURE_TENANT_ID', globalConfig.AZURE_TENANT_ID],
      ['AZURE_CLIENT_ID', globalConfig.AZURE_CLIENT_ID],
      ['AZURE_CLIENT_SECRET', globalConfig.AZURE_CLIENT_SECRET],
      ['SHAREPOINT_SITE_ID', globalConfig.SHAREPOINT_SITE_ID],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`SharePoint sync is not configured. Missing env: ${missing.join(', ')}`);
  }
  return createSharePointClient({
    tenantId: globalConfig.AZURE_TENANT_ID as string,
    clientId: globalConfig.AZURE_CLIENT_ID as string,
    clientSecret: globalConfig.AZURE_CLIENT_SECRET as string,
    siteId: globalConfig.SHAREPOINT_SITE_ID as string,
    rootPath: globalConfig.SHAREPOINT_ROOT_PATH,
  });
}
