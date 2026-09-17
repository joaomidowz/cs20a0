/**
 * Deterministic hashing shared by the generated visuals (crests, avatars). Pure: no data imports, no randomness,
 * so the same key renders the same picture in every build, every year and on every machine (including the share PNG).
 */

/** FNV-1a 32-bit over UTF-16 code units. Unsigned result. */
export function fnv1a(value: string, seed = 2166136261): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable integer in `[0, size)` for one key and one salt; different salts decorrelate the picks of one key. */
export function pick(key: string, salt: string, size: number): number {
  return size <= 1 ? 0 : fnv1a(`${salt}:${key}`) % size;
}

/** `hsl()` to `#rrggbb`, so the SVG carries plain hex colors (no CSS variables, no color functions to resolve on export). */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.min(100, Math.max(0, saturation)) / 100;
  const l = Math.min(100, Math.max(0, lightness)) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r, g, b] =
    h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x];
  const channel = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Escapes the characters that would break out of an SVG text node or attribute. */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}
