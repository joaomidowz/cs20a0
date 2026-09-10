import type { Language, RoundKill } from './types';

/**
 * Kill feed glyphs in the spirit of the Counter-Strike 2 HUD (headshot, no-scope, blind, wallbang, through smoke, in the
 * air, assist and flash assist). Hand-drawn simplified SVGs that follow the surrounding text colour.
 */
export type KillFlag = 'headshot' | 'noscope' | 'blind' | 'wallbang' | 'smoke' | 'airborne' | 'assist' | 'flashAssist';

const svg = (body: string, viewBox = '0 0 24 24') =>
  `<svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;

export const KILL_FLAG_ICONS: Record<KillFlag, string> = {
  // Skull with a spark where the shot landed.
  headshot: svg('<path fill="currentColor" d="M11 3a7 7 0 0 0-7 7c0 2.4 1.1 4.3 2.6 5.5V19h2v2h5v-2h2v-3.5C17.9 14.3 19 12.4 19 10a7 7 0 0 0-8-7Zm-3 8a1.6 1.6 0 1 1 0-3.2A1.6 1.6 0 0 1 8 11Zm6 0a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2Zm-3 4-1.2-2h2.4L11 15Z"/><path fill="currentColor" d="m18.5 3 1.2 2.3L22 6.5l-2.3 1.2L18.5 10l-1.2-2.3L15 6.5l2.3-1.2Z"/>'),
  // Scope crossed out.
  noscope: svg('<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5M5 5l14 14"/>'),
  // Eye with a slash.
  blind: svg('<path fill="none" stroke="currentColor" stroke-width="2" d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path stroke="currentColor" stroke-width="2.4" d="M4 20 20 4"/>'),
  // Bullet punching through a wall.
  wallbang: svg('<path fill="currentColor" d="M9 3h4v18H9z"/><path fill="none" stroke="currentColor" stroke-width="2" d="M2 12h6M15 12h7"/><path fill="currentColor" d="M18.5 9 22 12l-3.5 3z"/>'),
  // Smoke cloud.
  smoke: svg('<path fill="currentColor" d="M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 8.6 4 4 0 0 1 17.5 18H7Z"/>'),
  // Wing: kill while in the air.
  airborne: svg('<path fill="currentColor" d="M22 4c-6 0-11 2.5-14.5 7L4 10l-2 2 4 1-1 4 2 1 2-3.5c2 .3 3.7 0 5.5-1C19 11 22 8 22 4Z"/>'),
  // Assist: plus inside a ring.
  assist: svg('<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2.4" d="M12 7.5v9M7.5 12h9"/>'),
  // Flash assist: burst with a plus.
  flashAssist: svg('<path fill="currentColor" d="m10 2 1.5 5.5L17 6l-4 4 5 2.5-5.5.5L14 19l-4-4-2.5 5-.5-5.5L2 16l4-4-4-2.5 5.5-.5Z"/><path stroke="currentColor" stroke-width="2.2" d="M19 15v6M16 18h6"/>')
};

export const KILL_FLAG_LABELS: Record<Language, Record<KillFlag, string>> = {
  'pt-BR': { headshot: 'Headshot', noscope: 'Sem mira', blind: 'Cego', wallbang: 'Varado', smoke: 'Pela smoke', airborne: 'No ar', assist: 'Assistência', flashAssist: 'Assistência de flash' },
  es: { headshot: 'Headshot', noscope: 'Sin mira', blind: 'Cegado', wallbang: 'A través de la pared', smoke: 'A través del humo', airborne: 'En el aire', assist: 'Asistencia', flashAssist: 'Asistencia de flash' },
  en: { headshot: 'Headshot', noscope: 'No scope', blind: 'Blind', wallbang: 'Wallbang', smoke: 'Through smoke', airborne: 'In the air', assist: 'Assist', flashAssist: 'Flash assist' }
};

/** Flags of a kill in the order the CS2 feed shows them (assists are rendered next to the names, not here). */
export function killFlags(kill: RoundKill): KillFlag[] {
  const flags: KillFlag[] = [];
  if (kill.airborne) flags.push('airborne');
  if (kill.noscope) flags.push('noscope');
  if (kill.headshot) flags.push('headshot');
  if (kill.blind) flags.push('blind');
  if (kill.smoke) flags.push('smoke');
  if (kill.wallbang) flags.push('wallbang');
  return flags;
}
