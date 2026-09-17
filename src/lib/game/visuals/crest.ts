import { escapeXml, hslToHex, pick } from './hash';

/**
 * Generated team crests. Every crest is plain geometry (a silhouette, a two-color palette, a simple pattern and
 * initials) derived from the organization key, so the same org gets the same crest in every year and the picture
 * never resembles a real logo: no mascots, no emblem art, no external references. Pure module: no data imports,
 * no randomness, safe for the components shared with `/online` and for the `html-to-image` share export.
 */
export type CrestShape = 'shield' | 'kite' | 'hexagon' | 'roundel' | 'diamond' | 'pennant' | 'plate';
export type CrestPattern = 'none' | 'stripes' | 'chevron' | 'split' | 'band' | 'sash';

export interface CrestDescriptor {
  /** Normalized organization key the crest is derived from. */
  key: string;
  shape: CrestShape;
  pattern: CrestPattern;
  /** Silhouette fill (dark, always readable under white initials). */
  primary: string;
  /** Rim and pattern color. */
  secondary: string;
  /** Initials color. */
  ink: string;
  /** One to three characters. */
  initials: string;
}

export const CREST_SHAPES: readonly CrestShape[] = ['shield', 'kite', 'hexagon', 'roundel', 'diamond', 'pennant', 'plate'];
export const CREST_PATTERNS: readonly CrestPattern[] = ['none', 'stripes', 'chevron', 'split', 'band', 'sash'];
export const CREST_VIEWBOX = '0 0 64 64';

/** Silhouettes as path data inside the 64×64 box. */
export const CREST_SHAPE_PATHS: Record<CrestShape, string> = {
  shield: 'M8 6H56V34C56 48 44 56 32 60C20 56 8 48 8 34Z',
  kite: 'M8 6H56V36L32 60L8 36Z',
  hexagon: 'M32 4L58 18V46L32 60L6 46V18Z',
  roundel: 'M32 4A28 28 0 1 1 31.99 4Z',
  diamond: 'M32 3L61 32L32 61L3 32Z',
  pennant: 'M8 6H56V48L32 60L8 48Z',
  plate: 'M14 6H50A8 8 0 0 1 58 14V50A8 8 0 0 1 50 58H14A8 8 0 0 1 6 50V14A8 8 0 0 1 14 6Z'
};

/** Pattern pieces in the secondary color; the renderer clips them to the silhouette. */
export const CREST_PATTERN_PATHS: Record<CrestPattern, string[]> = {
  none: [],
  stripes: ['M10 0H16V64H10Z', 'M29 0H35V64H29Z', 'M48 0H54V64H48Z'],
  chevron: ['M0 30L32 12L64 30V42L32 24L0 42Z'],
  split: ['M0 0H32V64H0Z'],
  band: ['M0 22H64V42H0Z'],
  sash: ['M0 64L64 0V18L18 64Z']
};

const HUES = [0, 22, 40, 90, 140, 165, 195, 215, 240, 265, 300, 330];
const NEUTRAL_SECONDARIES = ['#f1ecdc', '#ddb440', '#c5cbd1', '#14181c'];
const INK = '#ffffff';
export const CREST_FONT_FAMILY = "'Arial Narrow', Impact, 'Barlow Condensed', sans-serif";

const stripYears = (value: string) => value.replace(/\b(19|20)\d{2}\b/g, ' ');

/**
 * Organization key of a team: the explicit org id when the identity layer knows one, else the team name (or id)
 * without years, accents and punctuation, so "Astralis 2016" and "astralis-2018" share one crest.
 */
export function crestKey(input: { orgId?: string | null; name?: string | null; id?: string | null }): string {
  const explicit = input.orgId?.trim().toLowerCase();
  if (explicit) return explicit;
  const source = input.name?.trim() || input.id?.trim() || '';
  const key = stripYears(source.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return key || 'team';
}

/** One to three characters: initials of multi-word names, first letters of single words, letter+digits for "G2"/"Cloud9". */
export function crestInitials(name: string | null | undefined): string {
  const words = stripYears(name ?? '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) {
    const word = words[0];
    const lettersThenDigits = /^(\p{L})\p{L}*(\p{N}{1,2})$/u.exec(word);
    return (lettersThenDigits ? `${lettersThenDigits[1]}${lettersThenDigits[2]}` : word.slice(0, 3)).toUpperCase();
  }
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export function crestFor(input: { orgId?: string | null; name?: string | null; id?: string | null }): CrestDescriptor {
  const key = crestKey(input);
  const hue = HUES[pick(key, 'hue', HUES.length)];
  const secondaryVariant = pick(key, 'secondary', NEUTRAL_SECONDARIES.length + 2);
  const secondary =
    secondaryVariant < NEUTRAL_SECONDARIES.length
      ? NEUTRAL_SECONDARIES[secondaryVariant]
      : secondaryVariant === NEUTRAL_SECONDARIES.length
        ? hslToHex(hue + 180, 55, 52)
        : hslToHex(hue + 35, 62, 60);
  return {
    key,
    shape: CREST_SHAPES[pick(key, 'shape', CREST_SHAPES.length)],
    pattern: CREST_PATTERNS[pick(key, 'pattern', CREST_PATTERNS.length)],
    primary: hslToHex(hue, 50, 30),
    secondary,
    ink: INK,
    initials: crestInitials(input.name ?? input.id)
  };
}

export interface CrestParts {
  viewBox: string;
  shapePath: string;
  patternPaths: string[];
  fontSize: number;
  fontFamily: string;
}

/** Geometry the Svelte renderer needs; the text size shrinks with the number of initials. */
export function crestParts(crest: CrestDescriptor): CrestParts {
  return {
    viewBox: CREST_VIEWBOX,
    shapePath: CREST_SHAPE_PATHS[crest.shape],
    patternPaths: CREST_PATTERN_PATHS[crest.pattern],
    fontSize: crest.initials.length >= 3 ? 19 : crest.initials.length === 2 ? 25 : 30,
    fontFamily: CREST_FONT_FAMILY
  };
}

/** Standalone inline SVG markup (same drawing as `TeamBadge.svelte`); `clipId` must be unique in the document. */
export function crestSvg(crest: CrestDescriptor, options: { size?: number; clipId?: string; title?: string } = {}): string {
  const { size = 64, clipId = `crest-${crest.key}`, title } = options;
  const parts = crestParts(crest);
  const safeClipId = clipId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const pattern = parts.patternPaths.map((path) => `<path d="${path}" fill="${crest.secondary}"/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${parts.viewBox}" width="${size}" height="${size}" role="img" aria-hidden="${title ? 'false' : 'true'}">` +
    (title ? `<title>${escapeXml(title)}</title>` : '') +
    `<clipPath id="${safeClipId}"><path d="${parts.shapePath}"/></clipPath>` +
    `<path d="${parts.shapePath}" fill="${crest.primary}"/>` +
    `<g clip-path="url(#${safeClipId})">${pattern}</g>` +
    `<path d="${parts.shapePath}" fill="none" stroke="${crest.secondary}" stroke-width="2.5"/>` +
    `<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="${escapeXml(parts.fontFamily)}" font-weight="900" font-size="${parts.fontSize}" fill="${crest.ink}" stroke="#0b0e10" stroke-width="2" paint-order="stroke" letter-spacing=".5">${escapeXml(crest.initials)}</text>` +
    '</svg>'
  );
}
