import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  clearProspectLogo,
  getProspect,
  getProspectLogo,
  setProspectLogo,
} from '@brokercomply/shared';
import { getDb } from '@/lib/db.server';

export const runtime = 'nodejs';

/** Logo upload cap — a company logo is a few hundred KB. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** PNG file signature (first 8 bytes). Enforced server-side; the client is untrusted. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(buf: Buffer): boolean {
  if (buf.length < PNG_MAGIC.length) return false;
  return PNG_MAGIC.every((byte, i) => buf[i] === byte);
}

async function exists(id: string): Promise<boolean> {
  return (await getProspect({ db: getDb() }, id)) !== null;
}

/**
 * Upload a prospect agency's logo. PNG only (validated by MIME *and* magic
 * bytes); anything else is rejected with 415 so the client can point the user
 * to a converter. No brand-colour extraction (unlike brokers — not needed here).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await exists(id))) return NextResponse.json({ error: 'not-found' }, { status: 404 });

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

  await setProspectLogo({ db: getDb() }, id, buffer.toString('base64'), 'image/png');
  revalidatePath(`/suivi-commercial/${id}`);
  return NextResponse.json({ ok: true, hasLogo: true });
}

/** Serve the stored logo bytes (inline). 404 when the agency has no logo. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const logo = await getProspectLogo({ db: getDb() }, id);
  if (!logo) return new NextResponse('Logo introuvable', { status: 404 });
  return new NextResponse(Buffer.from(logo.base64, 'base64'), {
    status: 200,
    headers: {
      'content-type': logo.mimeType,
      'cache-control': 'private, max-age=60',
    },
  });
}

/** Remove the agency logo. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!(await exists(id))) return NextResponse.json({ error: 'not-found' }, { status: 404 });
  await clearProspectLogo({ db: getDb() }, id);
  revalidatePath(`/suivi-commercial/${id}`);
  return NextResponse.json({ ok: true, hasLogo: false });
}
