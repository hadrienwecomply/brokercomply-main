import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  driveItemToDocumentUpsert,
  getBrokerById,
  upsertBrokerDocument,
} from '@brokercomply/shared';
import { getDb } from '@/lib/db.server';
import { getSharePointClient } from '@/lib/sharepoint.server';

export const runtime = 'nodejs';

/** Upload size cap to avoid abuse; SharePoint itself supports far larger. */
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

/**
 * Upload a file into a broker's SharePoint folder (push side of the bilateral
 * sync). Native multipart form POST so large files stream without the ~1 MB
 * Server Action body limit. On success, optimistically mirrors the new file's
 * metadata and redirects back to the Documents tab.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: brokerId } = await ctx.params;
  const broker = (await getBrokerById({ db: getDb() }, brokerId))?.broker;
  const slug = broker?.slug;
  const docsUrl = (query = '') =>
    NextResponse.redirect(new URL(`/courtiers/${slug}/documents${query}`, req.url), {
      status: 303,
    });

  const client = getSharePointClient();
  if (!broker || !slug) return NextResponse.json({ error: 'Broker not found' }, { status: 404 });
  if (!client || !broker.sharePointFolderId) return docsUrl('?error=not-linked');

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File && f.size > 0) file = f;
  } catch {
    return docsUrl('?error=bad-request');
  }
  if (!file) return docsUrl('?error=no-file');
  if (file.size > MAX_UPLOAD_BYTES) return docsUrl('?error=too-large');

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const item = await client.uploadFile(
      broker.sharePointFolderId,
      file.name,
      buffer,
      file.type || 'application/octet-stream',
    );
    // Optimistically reflect the new file; the next delta reconciles anyway.
    await upsertBrokerDocument({ db: getDb() }, driveItemToDocumentUpsert(brokerId, item));
    revalidatePath(`/courtiers/${slug}/documents`);
    return docsUrl('?uploaded=1');
  } catch (err) {
    console.error(`[sharepoint] upload failed for broker ${brokerId}:`, err);
    return docsUrl('?error=upload-failed');
  }
}
