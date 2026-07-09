import "server-only";

/**
 * Rewrite an editable report's `<script id="__cfg">` so the page talks to
 * BrokerComply instead of its original target: same-origin save/submit
 * endpoints, a correlation token, and previously-saved edits to replay.
 * Original fields (format/metaFile/client…) are preserved by merging over
 * them. Shared by the Fillout diagnostic review and the website-audit report.
 */
export function injectCfg(html: string, overrides: Record<string, unknown>): string {
  const re = /(<script[^>]*id="__cfg"[^>]*>)([\s\S]*?)(<\/script>)/;
  const m = html.match(re);
  let base: Record<string, unknown> = {};
  if (m) {
    try {
      base = JSON.parse(m[2]);
    } catch {
      base = {};
    }
  }
  // Escape `<` so officer-entered text can never break out of the script tag.
  const json = JSON.stringify({ ...base, ...overrides }).replace(/</g, "\\u003c");
  if (m) return html.replace(re, (_all, p1: string, _p2: string, p3: string) => p1 + json + p3);
  // Fallback: no __cfg in the template — inject one as the first thing in <body>.
  return html.replace(
    /<body([^>]*)>/i,
    (_all, attrs: string) =>
      `<body${attrs}><script type="application/json" id="__cfg">${json}</script>`,
  );
}
