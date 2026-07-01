#!/usr/bin/env node
/**
 * End-to-end test of the Fillout → broker-match → n8n pipeline WITHOUT Fillout.
 *
 * Fillout's API can't create submissions, so we instead replay a *real* one into
 * our own webhook: fetch an authentic submission (real shape + question ids),
 * optionally override the "Email de contact" so matching hits a known broker,
 * give it a fresh submissionId (idempotency would otherwise skip the re-trigger),
 * then POST it to the webhook with the same auth Fillout uses.
 *
 * Usage:
 *   node apps/dashboard/scripts/test-fillout-webhook.mjs [--email=jean@cabinet.be] [--form=eMsizNkfBXus] [--url=http://localhost:3000]
 *
 * Reads FILLOUT_API_KEY, FILLOUT_URL_TOKEN, FILLOUT_WEBHOOK_SECRET from the
 * nearest .env (walks up from cwd).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- tiny .env loader (walk up to repo root) -------------------------------
function loadEnv() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    try {
      const txt = readFileSync(resolve(dir, ".env"), "utf8");
      const env = {};
      for (const line of txt.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2];
      }
      return env;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("No .env found walking up from the script directory.");
}

// --- args ------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  }),
);
const FORM_ID = args.form || "eMsizNkfBXus";
const EMAIL_FIELD_ID = args.emailField || "3kzV"; // "Email de contact"
const BASE_URL = (args.url || "http://localhost:3000").replace(/\/$/, "");
const OVERRIDE_EMAIL = typeof args.email === "string" ? args.email : null;

const env = loadEnv();
const { FILLOUT_API_KEY, FILLOUT_URL_TOKEN, FILLOUT_WEBHOOK_SECRET } = env;
for (const [k, v] of Object.entries({ FILLOUT_API_KEY, FILLOUT_URL_TOKEN, FILLOUT_WEBHOOK_SECRET })) {
  if (!v) throw new Error(`Missing ${k} in .env`);
}

// --- 1. fetch one real submission (authentic shape + question ids) ---------
const apiRes = await fetch(`https://api.fillout.com/v1/api/forms/${FORM_ID}/submissions?limit=1&sort=desc`, {
  headers: { Authorization: `Bearer ${FILLOUT_API_KEY}` },
});
if (!apiRes.ok) throw new Error(`Fillout API ${apiRes.status}: ${await apiRes.text()}`);
const { responses } = await apiRes.json();
if (!responses?.length) throw new Error("No submissions to replay for this form.");

// The webhook receives a single submission entry, not the {responses:[...]} wrapper.
const submission = responses[0];

// --- 2. make it a fresh, optionally broker-matching submission -------------
submission.submissionId = `e2e-test-${Date.now()}`;
submission.formId = FORM_ID;

if (OVERRIDE_EMAIL) {
  const q = (submission.questions || []).find((x) => x.id === EMAIL_FIELD_ID);
  if (q) {
    q.value = OVERRIDE_EMAIL;
  } else {
    submission.questions = [
      { id: EMAIL_FIELD_ID, name: "Email de contact", type: "ShortAnswer", value: OVERRIDE_EMAIL },
      ...(submission.questions || []),
    ];
  }
}

// --- 3. POST to our webhook exactly like Fillout would ---------------------
const url = `${BASE_URL}/api/webhooks/fillout/${FILLOUT_URL_TOKEN}`;
console.log(`POST ${url}`);
console.log(`  submissionId: ${submission.submissionId}`);
console.log(`  email (${EMAIL_FIELD_ID}): ${OVERRIDE_EMAIL ?? "(unchanged from real submission)"}`);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-webhook-secret": FILLOUT_WEBHOOK_SECRET,
  },
  body: JSON.stringify(submission),
});
const body = await res.text();
console.log(`\n← ${res.status} ${res.statusText}`);
console.log(body);
process.exit(res.ok ? 0 : 1);
