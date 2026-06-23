import { NextResponse, type NextRequest } from 'next/server';
import { getBrokerDocument } from '@brokercomply/shared';
import { getDb } from '@/lib/db.server';
import { getSharePointClient } from '@/lib/sharepoint.server';

export const runtime = 'nodejs';

/**
 * Download a broker document: verifies the item belongs to this broker (so one
 * can't fetch another broker's file by guessing its id), then 302-redirects to
 * the short-lived Graph pre-authenticated download URL.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id: brokerId, itemId } = await ctx.params;

  const doc = await getBrokerDocument({ db: getDb() }, brokerId, itemId);
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const client = getSharePointClient();
  if (!client) return NextResponse.json({ error: 'SharePoint not configured' }, { status: 503 });

  const url = await client.getDownloadUrl(itemId);
  if (!url) return NextResponse.json({ error: 'Download URL unavailable' }, { status: 404 });

  return NextResponse.redirect(url, { status: 302 });
}
