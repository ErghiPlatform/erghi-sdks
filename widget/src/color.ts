/** Colour helpers for workspace branding. Everything that reaches the stylesheet goes through
 * normalizeHex first, so a hostile or malformed value can never inject CSS. */

export type Rgb = [number, number, number];

/** Surfaces the accent is drawn on, per theme. Keep in step with styles.ts. */
export const LIGHT_SURFACE = '#ffffff';
export const DARK_SURFACE = '#1c1f26';

/** WCAG AA for text; non-text accents (rings, dots) need only 3:1, so text is the binding case. */
export const MIN_TEXT_CONTRAST = 4.5;

/** "#abc" or "#aabbcc" (any case, surrounding spaces ignored) to lowercase "#aabbcc"; null otherwise. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].split('').map(d => d + d).join('') : match[1];
  return `#${digits.toLowerCase()}`;
}

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two normalized hex colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(toRgb(a));
  const lb = luminance(toRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Mixes towards black (amount < 0) or white (amount > 0); amount in [-1, 1]. */
function mix(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  return toHex(toRgb(hex).map(v => v + (target - v) * t) as Rgb);
}

/**
 * The accent as it should be drawn on `surface`: unchanged when it already reads, otherwise
 * stepped towards the readable side (darker on a light surface, lighter on a dark one) until it
 * does. Never returns a colour that fails; falls back to `fallback` if nothing passes.
 */
export function readableAccent(accent: string, surface: string, fallback: string): string {
  if (contrast(accent, surface) >= MIN_TEXT_CONTRAST) return accent;
  const direction = luminance(toRgb(surface)) > 0.5 ? -1 : 1;
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(accent, direction * step * 0.05);
    if (contrast(candidate, surface) >= MIN_TEXT_CONTRAST) return candidate;
  }
  return fallback;
}
