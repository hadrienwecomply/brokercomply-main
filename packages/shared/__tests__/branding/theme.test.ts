import { describe, expect, it } from 'vitest';
import { contrast, isEligible, legibleFontColor } from '../../src/branding/theme.js';

describe('isEligible', () => {
  it('rejects invalid hex, near-white and identity-less greys', () => {
    expect(isEligible('nope')).toBe(false);
    expect(isEligible('#ffffff')).toBe(false); // white
    expect(isEligible('#f3f4f6')).toBe(false); // very light grey
    expect(isEligible('#9ca3af')).toBe(false); // mid grey, no saturation
  });

  it('accepts saturated brand colours and very dark neutrals', () => {
    expect(isEligible('#242fd0')).toBe(true); // brand blue
    expect(isEligible('#0e7490')).toBe(true); // teal
    expect(isEligible('#111827')).toBe(true); // ink black
  });
});

describe('legibleFontColor', () => {
  it('darkens a too-light brand colour until it is legible on white (>= 4.5:1)', () => {
    const out = legibleFontColor('#ffd1d1'); // pale pink, unreadable as text
    expect(contrast(out, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves an already-legible colour essentially unchanged', () => {
    const dark = '#1f2937';
    expect(legibleFontColor(dark)).toBe(dark);
  });

  it('returns the input for invalid hex', () => {
    expect(legibleFontColor('bogus')).toBe('bogus');
  });
});
