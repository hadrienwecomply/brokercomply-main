import { NextResponse, type NextRequest } from "next/server";
import { getBrokerById } from "@brokercomply/shared";
import { getDb } from "@/lib/db.server";
import { startPubAuditsFromUpload, type UploadedImage } from "@/lib/pub-audit.server";

export const runtime = "nodejs";

/** Per-image upload cap. Print creatives can be large scans; 10 MB is generous. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Max images per batch, to bound a single upload's cost. */
const MAX_IMAGES = 20;

/** Detect an accepted image type from magic bytes (client MIME is untrusted). */
function detectImageType(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function brokerSlug(id: string): Promise<string | null> {
  const plan = await getBrokerById({ db: getDb() }, id);
  return plan?.broker.slug ?? null;
}

/**
 * Upload one or more advertising creatives (images) for a broker and launch a
 * separate compliance audit for each. PNG / JPEG / WebP only, validated by
 * magic bytes. Videos are out of scope (V2).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const slug = await brokerSlug(id);
  if (!slug) return NextResponse.json({ error: "Broker not found" }, { status: 404 });

  // Reject an over-sized body before req.formData() buffers it all into memory.
  // Cap = max images × per-image cap + generous multipart overhead.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  const MAX_BODY_BYTES = MAX_IMAGES * MAX_IMAGE_BYTES + 1 * 1024 * 1024;
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "too-large" }, { status: 413 });
  }

  let files: File[] = [];
  try {
    const form = await req.formData();
    files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  if (files.length === 0) return NextResponse.json({ error: "no-file" }, { status: 400 });
  if (files.length > MAX_IMAGES) {
    return NextResponse.json({ error: "too-many", max: MAX_IMAGES }, { status: 413 });
  }

  const images: UploadedImage[] = [];
  const rejected: Array<{ fileName: string; reason: string }> = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      rejected.push({ fileName: file.name, reason: "too-large" });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = detectImageType(buffer);
    if (!mimeType) {
      rejected.push({ fileName: file.name, reason: "unsupported-format" });
      continue;
    }
    images.push({ fileName: file.name, base64: buffer.toString("base64"), mimeType });
  }

  if (images.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Aucune image valide (formats acceptés : PNG, JPEG, WebP).", rejected },
      { status: 415 },
    );
  }

  const res = await startPubAuditsFromUpload(slug, images);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, batchId: res.batchId, count: images.length, rejected });
}
