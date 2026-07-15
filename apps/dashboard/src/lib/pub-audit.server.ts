import "server-only";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import {
  applyPubEdits,
  config,
  createLLMClient,
  createPubAudit,
  diffPubEdits,
  extractPubFeedback,
  getBrokerById,
  getBrokerBySlug,
  getPubAuditById,
  getPubFeedbackMap,
  getPubGuidanceMap,
  listPubAuditsForBroker,
  PubAuditPayloadSchema,
  recordPubFeedback,
  renderPubHtml,
  runPubAudit,
  updatePubAudit,
  type Db,
  type NewPubAuditFeedbackRow,
  type PubAuditPayload,
  type PubAuditRow,
} from "@brokercomply/shared";
import { getDb } from "./db.server";

/** A pub-audit row flattened for the "Audit pub" tab. */
export interface PubAuditView {
  id: string;
  batchId: string;
  fileName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
  hasReview: boolean;
  reviewStatus: string | null;
  pdfRef: string | null;
  niveau: { code: string; libelle: string } | null;
  decompte: { non_conforme: number; a_verifier: number; conforme: number; non_applicable: number } | null;
}

function toView(row: PubAuditRow): PubAuditView {
  const findings = row.findings as PubAuditPayload | null;
  return {
    id: row.id,
    batchId: row.batchId,
    fileName: row.fileName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    errorMessage: row.errorMessage,
    hasReview: row.reviewHtml != null,
    reviewStatus: row.reviewStatus,
    pdfRef: row.pdfRef,
    niveau: findings ? { code: findings.niveauGlobal.code, libelle: findings.niveauGlobal.libelle } : null,
    decompte: findings ? findings.niveauGlobal.decompte : null,
  };
}

/** Max images analysed at once in a batch (each does up to 4 vision calls). */
const PUB_AUDIT_JOB_CONCURRENCY = 3;

/** Run audit jobs with bounded concurrency; failures are isolated per job. */
async function runJobPool(auditIds: string[], size: number): Promise<void> {
  const queue = [...auditIds];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (;;) {
        const id = queue.shift();
        if (id === undefined) return;
        try {
          await runPubAuditJob(id);
        } catch (e) {
          console.error("[pub-audit] runPubAuditJob failed", e);
        }
      }
    }),
  );
}

interface AuditBroker {
  slug: string;
  societe: string;
  /** Logo as a `data:...;base64,...` URI, or null. */
  logo: string | null;
  primaryColor: string | null;
}

async function getBrokerBySlugId(brokerDbId: string): Promise<AuditBroker | null> {
  const found = await getBrokerById({ db: getDb() }, brokerDbId);
  if (!found) return null;
  const b = found.broker;
  const logo = b.logoBase64
    ? `data:${b.logoMimeType ?? "image/png"};base64,${b.logoBase64}`
    : null;
  return { slug: b.slug, societe: b.societe, logo, primaryColor: b.primaryColor ?? null };
}

/**
 * Reduce the editor's full payload to a delta against the audit's findings, so
 * `review_edits` stores only what the officer actually changed. Falls back to
 * the raw edits if findings can't be parsed — a diff failure must never block a
 * save. The delta replays identically (applyPubEdits only sets present fields).
 */
function toStoredEdits(row: PubAuditRow, edits: unknown): unknown {
  const base = row.findings as PubAuditPayload | null;
  if (!base) return edits;
  try {
    return diffPubEdits(PubAuditPayloadSchema.parse(base), edits);
  } catch {
    return edits;
  }
}

/**
 * Mine the officer's corrections (verdict flips + reformulation rewrites) into
 * the feedback table. Best-effort; callers must not let a failure here block
 * the PDF request.
 */
async function capturePubFeedback(
  db: Db,
  row: PubAuditRow,
  storedEdits: unknown,
): Promise<void> {
  const base = row.findings as PubAuditPayload | null;
  if (!base) return;
  const payload = PubAuditPayloadSchema.parse(base);
  const deltas = extractPubFeedback(payload, storedEdits);
  const rows: NewPubAuditFeedbackRow[] = deltas.map((d) => ({
    auditId: row.id,
    brokerId: row.brokerId,
    checkId: d.checkId,
    field: d.field,
    valueLlm: d.valueLlm,
    valueOfficer: d.valueOfficer,
    correctionNote: d.correctionNote,
    catalogVersion: payload.meta?.catalogVersion ?? null,
  }));
  // Always call (even with 0 rows) so a re-submit that removed a correction
  // clears the previously-captured row instead of leaving it stale.
  await recordPubFeedback({ db }, row.id, rows);
}

/** True for an IPv4 literal in a loopback / private / link-local / CGNAT / reserved range. */
function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → block
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true; // this-network / private / loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  return false;
}

/**
 * True for any address we must not connect to (SSRF). Handles IPv4, IPv6
 * (loopback, ULA fc00::/7, link-local fe80::/10) and IPv4-mapped IPv6 forms.
 * Anything that isn't a parseable public IP literal is treated as blocked.
 */
function isPrivateIp(addr: string): boolean {
  let ip = addr.trim().toLowerCase();
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone); // strip scope id (fe80::1%eth0)
  const kind = net.isIP(ip);
  if (kind === 4) return ipv4IsPrivate(ip);
  if (kind === 6) {
    if (ip === "::1" || ip === "::") return true;
    const mapped = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return ipv4IsPrivate(mapped[1]);
    const head = parseInt(ip.split(":")[0] || "0", 16);
    if (Number.isNaN(head)) return true;
    if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    return false;
  }
  return true; // not a valid IP literal
}

/**
 * Decide whether a landing-page host is safe to fetch (SSRF defence). Rejects
 * loopback-ish names and — crucially — resolves the hostname and validates the
 * *resolved* addresses, so an attacker domain pointing at 127.0.0.1 / cloud
 * metadata / an internal IP is rejected (the literal-string check alone is not
 * enough). Residual risk: DNS rebinding between this lookup and fetch's own
 * connect; acceptable for this internal, officer-only tool.
 */
async function isHostFetchable(hostname: string): Promise<boolean> {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return false;
  }
  if (net.isIP(h)) return !isPrivateIp(h);
  let addrs: Array<{ address: string }>;
  try {
    addrs = await dnsLookup(h, { all: true });
  } catch {
    return false;
  }
  return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
}

/** Strip an HTML document down to plain text for the checker prompts. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetch a landing page and reduce it to plain text for the checker prompts.
 * Redirects are followed MANUALLY so every hop is re-validated against the SSRF
 * guard (a public URL must not 3xx into an internal one). Best-effort: any
 * failure (timeout, blocked host, non-HTML, huge page) yields undefined so the
 * audit still runs on the image + accompanying text alone.
 */
async function fetchLandingText(url: string): Promise<string | undefined> {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (!(await isHostFetchable(parsed.hostname))) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(parsed.toString(), {
        signal: controller.signal,
        headers: { accept: "text/html,application/xhtml+xml" },
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return undefined;
        current = new URL(loc, parsed).toString(); // re-validated at loop top
        continue;
      }
      if (!res.ok) return undefined;
      const ctype = res.headers.get("content-type") ?? "";
      if (!ctype.includes("html") && !ctype.includes("text")) return undefined;
      const text = htmlToPlainText((await res.text()).slice(0, 500_000));
      return text ? text.slice(0, 8_000) : undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
  return undefined; // too many redirects
}

/** Build the report `branding` slot (logo + brand colour) from a broker, or undefined. */
function brandingFor(broker: AuditBroker | null): PubAuditPayload["branding"] | undefined {
  if (!broker) return undefined;
  const branding: NonNullable<PubAuditPayload["branding"]> = { firmName: broker.societe };
  if (broker.logo) branding.logoUrl = broker.logo;
  if (broker.primaryColor) branding.primaryColor = broker.primaryColor;
  return branding;
}

/**
 * Analyse one uploaded ad. Fire-and-forget from the upload route: statuses land
 * in the row and the UI polls them (router.refresh). Runs detached, OUTSIDE any
 * request context — must never call revalidatePath (see website-audit.server).
 */
async function runPubAuditJob(auditId: string): Promise<void> {
  const db = getDb();
  const row = await getPubAuditById({ db }, auditId);
  if (!row) return;
  const broker = await getBrokerBySlugId(row.brokerId);

  try {
    await updatePubAudit({ db }, auditId, { status: "running", errorMessage: null });

    // Phase 3/4 — steer the checkers with the cabinet's approved guidance and
    // its past corrections. Phase 2 — extract the linked landing page's text.
    const [guidance, feedback, landingText] = await Promise.all([
      getPubGuidanceMap({ db }).catch(() => ({})),
      getPubFeedbackMap({ db }).catch(() => ({})),
      row.landingUrl ? fetchLandingText(row.landingUrl) : Promise.resolve(undefined),
    ]);

    const llm = createLLMClient();
    const result = await runPubAudit(llm, {
      fileName: row.fileName,
      imageBase64: row.imageBase64,
      imageMediaType: row.imageMimeType,
      entiteName: broker?.societe,
      branding: brandingFor(broker),
      accompanyingText: row.accompanyingText ?? undefined,
      landingText,
      guidance,
      feedback,
    });

    // Show the analysed creative in the report (injected at render time, not
    // persisted in `findings` — the image already lives in its own column).
    const imageDataUrl = `data:${row.imageMimeType};base64,${row.imageBase64}`;
    const html = renderPubHtml({
      ...result.payload,
      support: { ...result.payload.support, image: imageDataUrl },
    });
    // Surface partial failures (a vision pass errored → its checks fell back to
    // "à vérifier") without failing the whole audit, so the officer sees it.
    const passWarning =
      result.errors.length > 0
        ? `Analyse partielle : ${result.errors.length} passe(s) en échec (${result.errors
            .map((e) => e.pass)
            .join(", ")}) — contrôle manuel recommandé pour les points « à vérifier ».`
        : null;
    await updatePubAudit({ db }, auditId, {
      status: "review_pending",
      findings: result.payload,
      qualification: result.qualification,
      reviewHtml: html,
      reviewStatus: "pending",
      // A re-run produces a fresh analysis: drop any officer edits captured
      // against the previous findings, otherwise that stale full/delta snapshot
      // would be replayed on top of (or overwrite) the new report.
      reviewEdits: null,
      errorMessage: passWarning,
    });
    // Also drop feedback mined from the previous findings: its valueLlm/checkId
    // pairing no longer corresponds to any real output and would keep feeding
    // the few-shot / calibration views. Best-effort.
    await recordPubFeedback({ db }, auditId, []).catch((e) =>
      console.error("[pub-audit] clearing stale feedback failed", e),
    );
  } catch (error) {
    await updatePubAudit({ db }, auditId, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface UploadedImage {
  fileName: string;
  base64: string;
  mimeType: string;
}

export interface StartPubAuditResult {
  ok: boolean;
  batchId?: string;
  auditIds?: string[];
  error?: string;
}

/**
 * Create one queued pub audit per uploaded image (sharing a batch id) and kick
 * each analysis job off. Each image is analysed independently (one report per
 * ad, per the skill).
 */
export interface PubUploadContext {
  /** Caption / body text supplied with the creatives (applies to the batch). */
  accompanyingText?: string;
  /** Landing page the ads link to (its text is fetched at analysis time). */
  landingUrl?: string;
}

export async function startPubAuditsFromUpload(
  slug: string,
  images: UploadedImage[],
  context: PubUploadContext = {},
): Promise<StartPubAuditResult> {
  const db = getDb();
  const plan = await getBrokerBySlug({ db }, slug);
  if (!plan) return { ok: false, error: "Courtier introuvable" };
  if (images.length === 0) return { ok: false, error: "Aucune image fournie." };

  const batchId = randomUUID();
  const auditIds: string[] = [];
  for (const img of images) {
    const row = await createPubAudit(
      { db },
      {
        brokerId: plan.broker.id,
        fileName: img.fileName,
        imageBase64: img.base64,
        imageMimeType: img.mimeType,
        batchId,
        ...(context.accompanyingText ? { accompanyingText: context.accompanyingText } : {}),
        ...(context.landingUrl ? { landingUrl: context.landingUrl } : {}),
      },
    );
    auditIds.push(row.id);
  }

  // Run the batch through a small concurrency pool instead of firing every job
  // at once: each audit does up to 4 vision calls, so 20 images launched
  // simultaneously would burst ~80 concurrent Anthropic requests. Detached from
  // the request (UI polls); the .catch() is a hard safety net.
  void runJobPool(auditIds, PUB_AUDIT_JOB_CONCURRENCY).catch((e) =>
    console.error("[pub-audit] batch pool failed", e),
  );

  revalidatePath(`/courtiers/${slug}`);
  return { ok: true, batchId, auditIds };
}

/** Re-run a finished/stuck pub audit in place ("Relancer"). */
export async function retryPubAudit(auditId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const row = await getPubAuditById({ db }, auditId);
  if (!row) return { ok: false, error: "Audit introuvable" };
  await updatePubAudit({ db }, auditId, { status: "queued", errorMessage: null });
  void runPubAuditJob(auditId).catch((e) => console.error("[pub-audit] runPubAuditJob failed", e));
  return { ok: true };
}

/** Audits of a broker (newest first), flattened for the UI. */
export async function listPubAudits(brokerDbId: string): Promise<PubAuditView[]> {
  const rows = await listPubAuditsForBroker({ db: getDb() }, brokerDbId);
  return rows.map(toView);
}

export interface PubAuditReview {
  html: string;
  edits: unknown;
  brokerSlug: string;
}

/** Load a pub audit's editable report HTML + saved edits (null if none yet). */
export async function getPubAuditReview(auditId: string): Promise<PubAuditReview | null> {
  const db = getDb();
  const row = await getPubAuditById({ db }, auditId);
  if (!row || row.reviewHtml == null) return null;
  const broker = await getBrokerBySlugId(row.brokerId);
  return { html: row.reviewHtml, edits: row.reviewEdits ?? null, brokerSlug: broker?.slug ?? "" };
}

/** Persist the officer's edits (stored as a delta) without generating a PDF ("Enregistrer"). */
export async function savePubAuditEdits(auditId: string, edits: unknown): Promise<boolean> {
  const db = getDb();
  const existing = await getPubAuditById({ db }, auditId);
  if (!existing) return false;
  const stored = toStoredEdits(existing, edits);
  const row = await updatePubAudit({ db }, auditId, { reviewEdits: stored, reviewStatus: "edited" });
  if (!row) return false;
  const broker = await getBrokerBySlugId(row.brokerId);
  if (broker) revalidatePath(`/courtiers/${broker.slug}`);
  return true;
}

export interface RequestPubPdfResult {
  ok: boolean;
  found: boolean;
  error?: string;
}

/**
 * Save the latest edits, re-inject them into the payload and trigger the n8n
 * pub-report workflow ("Générer le PDF"). The workflow renders the branded PDF
 * and posts it back via the n8n callback with a pubAuditId correlation key.
 * Optimistic status with rollback.
 */
export async function requestPubAuditPdf(auditId: string, edits: unknown): Promise<RequestPubPdfResult> {
  const db = getDb();
  const existing = await getPubAuditById({ db }, auditId);
  if (!existing) return { ok: false, found: false };
  const stored = toStoredEdits(existing, edits);
  const row = await updatePubAudit({ db }, auditId, {
    reviewEdits: stored,
    reviewStatus: "pdf_requested",
  });
  if (!row) return { ok: false, found: false };

  const broker = await getBrokerBySlugId(row.brokerId);
  const brokerPath = broker ? `/courtiers/${broker.slug}` : null;
  if (brokerPath) revalidatePath(brokerPath);

  const rollback = async (error: string): Promise<RequestPubPdfResult> => {
    await updatePubAudit({ db }, auditId, { reviewStatus: "edited" });
    if (brokerPath) revalidatePath(brokerPath);
    return { ok: false, found: true, error };
  };

  const url = config.N8N_PUB_RAPPORT_WEBHOOK_URL ?? config.N8N_RAPPORT_WEBHOOK_URL;
  if (!url) return rollback("N8N_PUB_RAPPORT_WEBHOOK_URL non configuré");

  const base = row.findings as PubAuditPayload | null;
  if (!base) return rollback("Payload d'audit introuvable — relancez l'audit.");

  // Mine the officer's corrections into the feedback loop before rendering.
  // Best-effort: a feedback-capture failure must never block PDF generation.
  try {
    await capturePubFeedback(db, existing, stored);
  } catch (e) {
    console.error("[pub-audit] capturePubFeedback failed", e);
  }

  let payload: PubAuditPayload;
  try {
    payload = applyPubEdits(PubAuditPayloadSchema.parse(base), stored);
    const branding = brandingFor(broker);
    if (branding) payload = { ...payload, branding: { ...payload.branding, ...branding } };
    // Embed the analysed creative so the n8n PDF can render it (not stored in findings).
    payload = {
      ...payload,
      support: { ...payload.support, image: `data:${row.imageMimeType};base64,${row.imageBase64}` },
    };
  } catch (e) {
    return rollback(
      `Modifications invalides : ${e instanceof Error ? e.message.slice(0, 200) : "format inattendu"}`,
    );
  }

  const callbackUrl = config.N8N_CALLBACK_TOKEN
    ? `${config.N8N_CALLBACK_BASE_URL.replace(/\/+$/, "")}/${config.N8N_CALLBACK_TOKEN}`
    : null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.N8N_WEBHOOK_SECRET ? { "x-n8n-secret": config.N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({
        source: "pub-audit",
        pubAuditId: auditId,
        ...(callbackUrl ? { callbackUrl } : {}),
        broker: broker ? { slug: broker.slug, societe: broker.societe } : null,
        payload,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return rollback(`n8n a répondu ${res.status}`);
    return { ok: true, found: true };
  } catch (e) {
    return rollback(e instanceof Error ? e.message : "Échec de l'appel n8n");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Record the PDF posted back by the n8n pub-report workflow (callback with a
 * pubAuditId correlation key).
 */
export async function recordPubPdfCallback(input: {
  pubAuditId: string;
  status?: string | null;
  pdfBase64?: string | null;
  error?: string | null;
}): Promise<{ found: boolean }> {
  const db = getDb();
  const isError = input.status === "error" || !input.pdfBase64;
  const row = await updatePubAudit(
    { db },
    input.pubAuditId,
    isError
      ? { reviewStatus: "edited", errorMessage: input.error ?? "Génération PDF échouée" }
      : {
          reviewStatus: "pdf_ready",
          pdfBase64: input.pdfBase64!,
          pdfRef: `/api/pub-audits/${input.pubAuditId}/pdf/file`,
        },
  );
  if (!row) return { found: false };
  const broker = await getBrokerBySlugId(row.brokerId);
  if (broker) revalidatePath(`/courtiers/${broker.slug}`);
  return { found: true };
}

export interface PubAuditPdf {
  base64: string;
  filename: string;
}

/** Load the stored PDF for a pub audit (null if none yet). */
export async function getPubAuditPdf(auditId: string): Promise<PubAuditPdf | null> {
  const db = getDb();
  const row = await getPubAuditById({ db }, auditId);
  if (!row || row.pdfBase64 == null) return null;
  const broker = await getBrokerBySlugId(row.brokerId);
  return { base64: row.pdfBase64, filename: `audit-pub-${broker?.slug ?? "courtier"}-${auditId.slice(0, 8)}.pdf` };
}
