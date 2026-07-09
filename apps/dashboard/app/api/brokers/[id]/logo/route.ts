import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getBrokerById } from '@brokercomply/shared';
import { getDb } from '@/lib/db.server';
import { clearBrokerLogo, getBrokerLogo, setBrokerLogo } from '@/lib/brokers.server';

export const runtime = 'nodejs';

/** Logo upload cap — small by construction; a company logo is a few hundred KB. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** PNG file signature (first 8 bytes). Enforced server-side; the client is untrusted. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(buf: Buffer): boolean {
  if (buf.length < PNG_MAGIC.length) return false;
  return PNG_MAGIC.every((byte, i) => buf[i] === byte);
}

async function brokerSlug(id: string): Promise<string | null> {
  const plan = await getBrokerById({ db: getDb() }, id);
  return plan?.broker.slug ?? null;
}

/**
 * Upload a broker's company logo. PNG only (validated by MIME *and* magic bytes);
 * anything else is rejected with 415 so the client can point the user to a PNG
 * converter. On success the logo is stored and, if the broker has no brand colour
 * yet, one is extracted from the logo via vision and returned.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const slug = await brokerSlug(id);
  if (!slug) return NextResponse.json({ error: 'Broker not found' }, { status: 404 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File && f.size > 0) file = f;
  } catch {
    return NextResponse.json({ error: 'bad-request' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'no-file' }, { status: 400 });
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: 'too-large' }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.type !== 'image/png' || !isPng(buffer)) {
    return NextResponse.json({ error: 'not-png' }, { status: 415 });
  }

  const { primaryColor } = await setBrokerLogo(id, buffer.toString('base64'), 'image/png');
  revalidatePath(`/courtiers/${slug}`);
  return NextResponse.json({ ok: true, hasLogo: true, primaryColor });
}

/** Serve the stored logo bytes (inline). 404 when the broker has no logo. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const logo = await getBrokerLogo(id);
  if (!logo) return new NextResponse('Logo introuvable', { status: 404 });
  return new NextResponse(Buffer.from(logo.base64, 'base64'), {
    status: 200,
    headers: {
      'content-type': logo.mimeType,
      'cache-control': 'private, max-age=60',
    },
  });
}

/** Remove the broker's logo (brand colour is kept). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const slug = await brokerSlug(id);
  if (!slug) return NextResponse.json({ error: 'Broker not found' }, { status: 404 });
  await clearBrokerLogo(id);
  revalidatePath(`/courtiers/${slug}`);
  return NextResponse.json({ ok: true, hasLogo: false });
}
