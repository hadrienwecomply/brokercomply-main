/**
 * Tiny, dependency-free template interpolation for action-plan email templates.
 *
 * Templates use bracketed tokens, e.g. "Bonjour [Prénom], …". We substitute a
 * whitelisted set of variables built from the broker/step, then surface any
 * tokens left unresolved so the UI can warn before the officer sends. Always
 * paired with an editable preview — we never auto-send the rendered output.
 */

/** Matches `[Token]` where Token is any run of non-`]`/non-newline characters. */
const TOKEN_RE = /\[([^\]\n]+)\]/g;

export interface RenderResult {
  text: string;
  /** Distinct tokens present in the template that had no matching variable. */
  missing: string[];
}

/**
 * Replace `[Key]` tokens with `vars[Key]`. Keys are matched trimmed and
 * case-insensitively (so `[prénom]` and `[Prénom]` both resolve). Tokens with
 * no matching variable are left verbatim and reported in `missing`.
 */
export function renderTemplate(text: string, vars: Record<string, string>): RenderResult {
  const lookup = new Map<string, string>();
  for (const [k, v] of Object.entries(vars)) lookup.set(k.trim().toLowerCase(), v);

  const missing = new Set<string>();
  const out = text.replace(TOKEN_RE, (whole, rawKey: string) => {
    const value = lookup.get(rawKey.trim().toLowerCase());
    if (value === undefined || value === '') {
      missing.add(rawKey.trim());
      return whole;
    }
    return value;
  });

  return { text: out, missing: [...missing] };
}

export interface EmailTemplateInput {
  subject: string;
  body: string;
}

/** Render both subject and body, merging the missing-token sets. */
export function renderEmailTemplate(
  template: EmailTemplateInput,
  vars: Record<string, string>,
): { subject: string; body: string; missing: string[] } {
  const subject = renderTemplate(template.subject, vars);
  const body = renderTemplate(template.body, vars);
  return {
    subject: subject.text,
    body: body.text,
    missing: [...new Set([...subject.missing, ...body.missing])],
  };
}
