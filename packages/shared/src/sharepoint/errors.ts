/** Structured view of a Microsoft Graph SDK error. */
export interface GraphErrorInfo {
  statusCode?: number;
  code?: string;
  message: string;
  body?: unknown;
  requestId?: string;
}

/** Extract the useful fields from a Graph SDK error (GraphError) or any throwable. */
export function describeGraphError(error: unknown): GraphErrorInfo {
  const e = error as {
    statusCode?: number;
    code?: string;
    message?: string;
    body?: unknown;
    requestId?: string;
    headers?: { get?: (k: string) => string | null };
  };
  return {
    statusCode: e?.statusCode,
    code: e?.code,
    message: e?.message ?? String(error),
    body: e?.body,
    requestId: e?.requestId ?? e?.headers?.get?.('request-id') ?? undefined,
  };
}

/** One-line, fully-detailed description of a Graph error for logs. */
export function formatGraphError(error: unknown): string {
  const i = describeGraphError(error);
  const parts = ['Graph error'];
  if (i.statusCode !== undefined) parts.push(String(i.statusCode));
  if (i.code) parts.push(`[${i.code}]`);
  let line = `${parts.join(' ')}: ${i.message}`;
  if (i.body !== undefined && i.body !== null && i.body !== '') {
    line += ` | body: ${typeof i.body === 'string' ? i.body : JSON.stringify(i.body)}`;
  }
  if (i.requestId) line += ` | request-id: ${i.requestId}`;
  return line;
}
