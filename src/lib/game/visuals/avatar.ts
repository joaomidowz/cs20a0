import { hslToHex, pick } from './hash';

/**
 * Generated player avatars: a geometric head-and-shoulders silhouette on a colored background, derived from the
 * player's base id so every card year of the same player shows the same avatar. Never a photo, never a likeness:
 * the only variation is background hue, silhouette proportions and a small geometric accent. Pure module: no data
 * imports, no randomness, safe for the components shared with `/online` and for the `html-to-image` share export.
 */
export type AvatarAccent = 'none' | 'headset' | 'cap' | 'collar';

export interface AvatarDescriptor {
  /** Normalized key the avatar is derived from (base id when known, else the card id). */
  key: string;
  background: string;
  /** Silhouette fill. */
  figure: string;
  accent: AvatarAccent;
  accentColor: string;
  /** Head radius in the 64×64 box. */
  headRadius: number;
  /** Half width of the shoulders in the 64×64 box. */
  shoulderHalfWidth: number;
}

export const AVATAR_ACCENTS: readonly AvatarAccent[] = ['none', 'headset', 'cap', 'collar'];
export const AVATAR_VIEWBOX = '0 0 64 64';

const HUES = [0, 25, 45, 95, 150, 175, 200, 225, 250, 280, 310, 340];
const ACCENT_COLORS = ['#c8ff32', '#ffb020', '#ff7134', '#36d1dc'];
const HEAD_RADII = [9, 10, 11];
const SHOULDER_HALF_WIDTHS = [22, 25, 28];
const HEAD_CENTER_Y = 24;

/** The key: base id when present, else the card id; lowercased and trimmed so "s1mple-2018" and "s1mple-2021" agree through `baseId`. */
export function avatarKey(input: { baseId?: string | null; id?: string | null } | string): string {
  const raw = typeof input === 'string' ? input : input.baseId?.trim() || input.id?.trim() || '';
  return raw.trim().toLowerCase() || 'player';
}

export function avatarFor(input: { baseId?: string | null; id?: string | null } | string): AvatarDescriptor {
  const key = avatarKey(input);
  const hue = HUES[pick(key, 'hue', HUES.length)];
  return {
    key,
    background: hslToHex(hue, 38, 26),
    figure: hslToHex(hue, 22, 74),
    accent: AVATAR_ACCENTS[pick(key, 'accent', AVATAR_ACCENTS.length)],
    accentColor: ACCENT_COLORS[pick(key, 'accentColor', ACCENT_COLORS.length)],
    headRadius: HEAD_RADII[pick(key, 'head', HEAD_RADII.length)],
    shoulderHalfWidth: SHOULDER_HALF_WIDTHS[pick(key, 'shoulders', SHOULDER_HALF_WIDTHS.length)]
  };
}

export interface AvatarParts {
  viewBox: string;
  head: { cx: number; cy: number; r: number };
  /** Neck and shoulders as one path. */
  bodyPath: string;
  /** Accent pieces: each is either a filled path or a stroked path. */
  accents: Array<{ d: string; fill?: string; stroke?: string; strokeWidth?: number }>;
}

export function avatarParts(avatar: AvatarDescriptor): AvatarParts {
  const { headRadius: r, shoulderHalfWidth: w, accentColor } = avatar;
  const left = 32 - w;
  const right = 32 + w;
  const bodyPath = `M28 ${HEAD_CENTER_Y + r - 3}H36V40C${36 + w / 3} 40 ${right} 46 ${right} 64H${left}C${left} 46 ${28 - w / 3} 40 28 40Z`;
  const accents: AvatarParts['accents'] = [];
  if (avatar.accent === 'headset') {
    accents.push({ d: `M${32 - r - 2} ${HEAD_CENTER_Y}A${r + 2} ${r + 2} 0 0 1 ${32 + r + 2} ${HEAD_CENTER_Y}`, stroke: accentColor, strokeWidth: 2.5 });
    accents.push({ d: `M${32 - r - 4} ${HEAD_CENTER_Y - 1}H${32 - r + 1}V${HEAD_CENTER_Y + 5}H${32 - r - 4}Z`, fill: accentColor });
    accents.push({ d: `M${32 + r - 1} ${HEAD_CENTER_Y - 1}H${32 + r + 4}V${HEAD_CENTER_Y + 5}H${32 + r - 1}Z`, fill: accentColor });
  } else if (avatar.accent === 'cap') {
    accents.push({ d: `M${32 - r} ${HEAD_CENTER_Y - r + 3}H${32 + r}V${HEAD_CENTER_Y - r + 7}H${32 - r}Z`, fill: accentColor });
  } else if (avatar.accent === 'collar') {
    accents.push({ d: `M26 44L32 51L38 44V47L32 54L26 47Z`, fill: accentColor });
  }
  return { viewBox: AVATAR_VIEWBOX, head: { cx: 32, cy: HEAD_CENTER_Y, r }, bodyPath, accents };
}

/** Standalone inline SVG markup (same drawing as `PlayerAvatar.svelte`). */
export function avatarSvg(avatar: AvatarDescriptor, options: { size?: number } = {}): string {
  const { size = 64 } = options;
  const parts = avatarParts(avatar);
  const accents = parts.accents
    .map((piece) =>
      piece.stroke
        ? `<path d="${piece.d}" fill="none" stroke="${piece.stroke}" stroke-width="${piece.strokeWidth ?? 2}" stroke-linecap="round"/>`
        : `<path d="${piece.d}" fill="${piece.fill}"/>`
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${parts.viewBox}" width="${size}" height="${size}" aria-hidden="true">` +
    `<rect width="64" height="64" fill="${avatar.background}"/>` +
    `<path d="${parts.bodyPath}" fill="${avatar.figure}"/>` +
    `<circle cx="${parts.head.cx}" cy="${parts.head.cy}" r="${parts.head.r}" fill="${avatar.figure}"/>` +
    accents +
    '</svg>'
  );
}
