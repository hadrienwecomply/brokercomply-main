/**
 * Deterministic brand-colour helpers (WCAG-aware).
 *
 * Ported from the n8n Client-Enrichment theme engine (`report/_lib/theme.mjs`),
 * which stays the source of truth for the branded PDF workflow. Kept minimal
 * here: eligibility of a candidate brand colour + clamping a colour to a legible
 * font colour on a given background. Pure and unit-testable.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const m = String(hex ?? '')
    .trim()
    .match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: hue(p, q, h + 1 / 3) * 255, g: hue(p, q, h) * 255, b: hue(p, q, h - 1 / 3) * 255 };
}

// ---------- WCAG ----------
export function relLuminance(rgb: Rgb): number {
  const f = (c: number) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

export function contrast(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * A candidate brand colour is eligible when it carries identity: reject invalid
 * hex, near-white pastels (too light) and mid/light neutral greys (no saturation).
 * Very dark neutrals (ink black/navy, luminance ≤ 0.15) are accepted.
 */
export function isEligible(hex: string | null | undefined): boolean {
  const rgb = hexToRgb(hex ?? '');
  if (!rgb) return false;
  const { s } = rgbToHsl(rgb);
  const lum = relLuminance(rgb);
  if (lum > 0.82) return false; // white / too-light pastel
  if (s < 0.15 && lum > 0.15) return false; // grey without identity
  return true;
}

const shade = (h: number, s: number, l: number): string =>
  rgbToHex(hslToRgb({ h, s: Math.max(0, Math.min(1, s)), l: Math.max(0, Math.min(1, l)) }));

/** Darken `hex` (lowering lightness) until it reaches `minRatio` contrast on `against`. */
export function darkenUntil(hex: string, against: string, minRatio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let { h, s, l } = rgbToHsl(rgb);
  let out = hex;
  for (let i = 0; i < 40 && contrast(out, against) < minRatio && l > 0.02; i++) {
    l -= 0.02;
    out = shade(h, s, l);
  }
  return out;
}

/**
 * Clamp a brand colour to a legible font/accent colour on `background` (default
 * white), guaranteeing at least `minRatio` WCAG contrast (4.5:1 = normal text).
 * This is the "within visible limits" guard-rail for using the primary colour as
 * text: a too-light brand colour is darkened until it reads.
 */
export function legibleFontColor(hex: string, background = '#ffffff', minRatio = 4.5): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return darkenUntil(rgbToHex(rgb), background, minRatio);
}
