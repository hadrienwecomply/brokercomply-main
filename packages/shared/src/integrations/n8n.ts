import type { MatchMethod } from '../forms/matching.js';

/**
 * The payload BrokerComply POSTs to an n8n Webhook node to trigger a workflow.
 * Stable contract — versioned alongside the workflow JSON exports in
 * `integrations/n8n/`. n8n routes on `formType` when a single global URL is used.
 */
export interface N8nTriggerPayload {
  submissionId: string;
  filloutSubmissionId: string;
  formType: string | null;
  matchMethod: MatchMethod;
  broker: {
    id: string;
    slug: string;
    societe: string;
    /** Drives the n8n Client Enrichment branch (IF "Has Website" → Site Explorer). */
    website: string | null;
    /** Company logo as a `data:image/png;base64,…` URI, or null. Personalises the form/report. */
    logo: string | null;
    /** Brand accent colour `#rrggbb` (already clamped legible), or null. */
    primaryColor: string | null;
  };
  answers: Array<{
    questionId: string;
    name: string | null;
    type: string | null;
    value: unknown;
  }>;
}

export interface N8nTriggerResult {
  ok: boolean;
  /** HTTP status from n8n, or null if the request never completed. */
  status: number | null;
  /** Execution id, if the n8n "Respond to Webhook" node returns one. */
  executionId: string | null;
  error?: string;
}

/** Header carrying the shared secret the n8n Webhook node validates. */
export const N8N_SECRET_HEADER = 'x-n8n-secret';

/** Build the n8n trigger payload (pure — unit-testable without the network). */
export function buildN8nPayload(args: {
  submissionId: string;
  filloutSubmissionId: string;
  formType: string | null;
  matchMethod: MatchMethod;
  broker: {
    id: string;
    slug: string;
    societe: string;
    website?: string | null;
    logo?: string | null;
    primaryColor?: string | null;
  };
  answers: Array<{ questionId: string; name?: string | null; type?: string | null; value?: unknown }>;
}): N8nTriggerPayload {
  return {
    submissionId: args.submissionId,
    filloutSubmissionId: args.filloutSubmissionId,
    formType: args.formType,
    matchMethod: args.matchMethod,
    broker: {
      id: args.broker.id,
      slug: args.broker.slug,
      societe: args.broker.societe,
      website: args.broker.website ?? null,
      logo: args.broker.logo ?? null,
      primaryColor: args.broker.primaryColor ?? null,
    },
    answers: args.answers.map((a) => ({
      questionId: a.questionId,
      name: a.name ?? null,
      type: a.type ?? null,
      value: a.value ?? null,
    })),
  };
}

/** Pull an execution id out of n8n's response body, tolerant of its shape. */
function readExecutionId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const candidate = b.executionId ?? b.execution_id ?? b.id;
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : null;
}

/**
 * Trigger an n8n workflow by POSTing the submission payload to its webhook URL.
 * Never throws — failures (timeout, non-2xx, network) are returned as
 * `{ ok: false }` so the caller can mark the submission `failed` and still
 * respond 200 to Fillout. A short timeout keeps the inbound request snappy.
 */
export async function triggerN8nWorkflow(opts: {
  url: string;
  secret?: string | null;
  payload: N8nTriggerPayload;
  timeoutMs?: number;
}): Promise<N8nTriggerResult> {
  const { url, secret, payload, timeoutMs = 8000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { [N8N_SECRET_HEADER]: secret } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      return { ok: false, status: res.status, executionId: null, error: `n8n responded ${res.status}` };
    }
    return { ok: true, status: res.status, executionId: readExecutionId(body) };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'n8n request failed';
    return { ok: false, status: null, executionId: null, error };
  } finally {
    clearTimeout(timer);
  }
}
