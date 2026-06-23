import 'server-only';
import { listBrokerDocuments, type BrokerDocument } from '@brokercomply/shared';
import { getDb } from './db.server';

export interface DocumentDTO {
  id: string; // drive_item_id (stable)
  name: string;
  path: string | null;
  webUrl: string | null;
  size: number | null;
  mimeType: string | null;
  lastModifiedAt: string | null; // ISO
}

function toDocDTO(r: BrokerDocument): DocumentDTO {
  return {
    id: r.driveItemId,
    name: r.name,
    path: r.path ?? null,
    webUrl: r.webUrl ?? null,
    size: r.size ?? null,
    mimeType: r.mimeType ?? null,
    lastModifiedAt: r.lastModifiedAt ? new Date(r.lastModifiedAt).toISOString() : null,
  };
}

/**
 * The broker's files for the Documents tab — a FLAT list (Q10). Folders are
 * mirrored in the DB but not shown; their files appear with a relative `path`.
 * Sorted most-recently-modified first.
 */
export async function getBrokerDocuments(brokerDbId: string): Promise<DocumentDTO[]> {
  const rows = await listBrokerDocuments({ db: getDb() }, brokerDbId);
  return rows
    .filter((r) => !r.isFolder)
    .map(toDocDTO)
    .sort((a, b) => (b.lastModifiedAt ?? '').localeCompare(a.lastModifiedAt ?? ''));
}
