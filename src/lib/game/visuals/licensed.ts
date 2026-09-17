import licensedJson from '$lib/data/licensed-images.json';

/**
 * Licensed image slot. The generated crests and avatars are the default everywhere; a real logo or photo is only
 * shown when `src/lib/data/licensed-images.json` carries an entry with a written license, whose evidence lives in
 * `docs/permissions/granted/`. The file is empty today. `tests/licensedImages.test.ts` checks every entry.
 */
export type LicensedImageKind = 'team' | 'org' | 'player';

export interface LicensedImageLicense {
  /** Who granted the license (organization or person). */
  holder: string;
  /** Kind of grant, e.g. "permissão escrita", "CC BY 4.0", "press kit". */
  type: string;
  /** What the grant covers, e.g. "logo no cs13a0, uso não comercial". */
  scope: string;
  /** ISO date of the grant. */
  grantedAt: string;
  /** Path under `docs/permissions/granted/` with the written grant. */
  evidence: string;
}

export interface LicensedImageEntry {
  kind: LicensedImageKind;
  /** `team`: team-year id (`astralis-2016`); `org`: crest key or org id (`astralis`); `player`: base id (`device`) or, for one year only, the player-year id (`device-2016`), which wins over the base id. */
  key: string;
  /** Path under `static/`, always inside `licensed/` (e.g. `licensed/orgs/astralis.svg`). Never a URL. */
  file: string;
  license: LicensedImageLicense;
  /** Credit line shown in `/credits`. */
  attribution: string;
}

export interface LicensedImagesFile {
  version: number;
  entries: LicensedImageEntry[];
}

export const LICENSED_IMAGES: LicensedImagesFile = licensedJson as LicensedImagesFile;

const index = new Map(LICENSED_IMAGES.entries.map((entry) => [`${entry.kind}:${entry.key}`, entry]));

export function licensedImageFor(kind: LicensedImageKind, key: string | null | undefined): LicensedImageEntry | null {
  if (!key) return null;
  return index.get(`${kind}:${key}`) ?? null;
}

/** Same-origin URL of a licensed file (kept local so the share export never needs CORS). */
export const licensedImageSrc = (entry: LicensedImageEntry) => `/${entry.file.replace(/^\/+/, '')}`;
