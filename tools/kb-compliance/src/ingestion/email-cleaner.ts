import { convert } from 'html-to-text';

/**
 * Length-preserving diacritic fold (à→a, Envoyé→Envoye, À→A …). Used ONLY to
 * match markers; the original text is what we keep. Mapping one char → one char
 * keeps string indices aligned so a match offset is valid in the original.
 */
const FOLD_FROM = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ';
const FOLD_TO = 'aaaaaaceeeeiiiinooooouuuuyy';
const FOLD_MAP = new Map<string, string>();
for (let i = 0; i < FOLD_FROM.length; i++) {
  const lower = FOLD_FROM[i]!;
  const base = FOLD_TO[i]!;
  FOLD_MAP.set(lower, base);
  FOLD_MAP.set(lower.toUpperCase(), base.toUpperCase());
}

/** Replace accented characters with their ASCII base, preserving every index. */
function foldForMatch(text: string): string {
  let out = '';
  for (const ch of text) out += FOLD_MAP.get(ch) ?? ch;
  return out;
}

/**
 * Signature delimiters, sign-off lines and boilerplate disclaimers (FR/NL/EN).
 * Everything from the first match onward is dropped. Matched against the
 * diacritic-folded text, so markers are written without accents.
 */
const SIGNATURE_MARKERS: RegExp[] = [
  /^--\s*$/m, // RFC 3676 signature delimiter
  /^__+\s*$/m,
  /^\s*sent from my .*/im,
  /^\s*verzonden vanaf .*/im,
  /^\s*envoye depuis .*/im,
  /^\s*(cordialement|bien (a vous|a toi|cordialement)|sinceres salutations)\b.*/im,
  /^\s*(bonne journee|belle journee|bonne (fin de )?journee|bonne reception)\b.*/im,
  /^\s*(met vriendelijke groeten|mvg|hoogachtend|groeten|met groet)\b.*/im,
  /^\s*(kind regards|best regards|regards|sincerely)\b.*/im,
  // Confidentiality / legal disclaimers (usually trail the signature).
  /^\s*the information contained\b.*/im,
  /^\s*this (e-?mail|message|communication)\b.*/im,
  /^\s*(les informations|l'information) (contenue|contenues|reprise|reprises)\b.*/im,
  /^\s*ce(t|tte)? (e-?mail|courriel|message|courrier|communication)\b.{0,80}(confidentiel|destine|strictement|prive)/im,
];

/** Quoted-reply block markers — drop the line and everything after it. */
const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*original message\s*-{2,}.*/im,
  /^-{2,}\s*(message d'origine|oorspronkelijk bericht)\s*-{2,}.*/im,
  /^\s*(on .+ wrote:)\s*$/im,
  /^\s*(le .+ a ecrit\s*:)\s*$/im,
  /^\s*(op .+ schreef .+:)\s*$/im,
  // Outlook-style forwarded/replied header block: a "From/De/Van/Von:" line
  // followed by 1-5 "Sent/Envoye/To/A/Cc/Objet/Subject:" lines.
  /^\s*(van|de|from|von)\s*:.*\n(\s*(verzonden|envoye|sent|aan|to|a|cc|objet|subject|onderwerp)\s*:.*\n?){1,5}/im,
];

/** Index of the earliest marker match in `folded`, or the full length. */
function earliestCut(folded: string, markers: RegExp[]): number {
  let cut = folded.length;
  for (const marker of markers) {
    const m = marker.exec(folded);
    if (m && m.index < cut) cut = m.index;
  }
  return cut;
}

/** Cut `text` at the earliest marker match (matched on its folded copy). */
function stripFrom(text: string, markers: RegExp[]): string {
  return text.slice(0, earliestCut(foldForMatch(text), markers));
}

/** Drop lines that are purely quoted (`>` prefixed). */
function stripQuotedLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');
}

/** Collapse excess blank lines and trailing whitespace. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Clean a single email body into plain text: HTML→text when needed, then strip
 * quoted replies, signatures and disclaimers, and normalise whitespace. Marker
 * matching is diacritic-insensitive; the kept text retains its accents. Pure
 * and deterministic.
 */
export function cleanEmailBody(body: string, contentType: 'html' | 'text' = 'text'): string {
  if (!body) return '';
  let text =
    contentType === 'html'
      ? convert(body, {
          wordwrap: false,
          selectors: [
            { selector: 'img', format: 'skip' },
            { selector: 'a', options: { ignoreHref: true } },
          ],
        })
      : body;

  text = stripQuotedLines(text);
  text = stripFrom(text, QUOTE_MARKERS);
  text = stripFrom(text, SIGNATURE_MARKERS);
  return normalizeWhitespace(text);
}
