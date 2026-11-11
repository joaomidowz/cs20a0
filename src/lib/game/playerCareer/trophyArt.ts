// src/lib/game/playerCareer/trophyArt.ts
// Qual troféu 3D vai na estante: um por organizador (pelo nome do campeonato), na versão de Major ou de Tier S, e as
// medalhas de MVP e EVP. As folhas de sprite saem de scripts/career-trophies (24 quadros de 320px de largura, a altura de
// cada uma no manifesto); campeonato de organizador sem troféu próprio usa a taça genérica do tier.
import manifest from '$lib/data/career-trophies.json';
import type { EventTier } from './calendar';

export type TrophyOrganizer = 'iem' | 'pgl' | 'blast' | 'esl' | 'perfectworld' | 'starladder' | 'firesports' | 'ewc' | 'dreamhack' | 'epicenter' | 'eleague';

/** O organizador pelo começo do nome do campeonato (o CS Asia Championships é da Perfect World). */
const ORGANIZER_OF: Array<[RegExp, TrophyOrganizer]> = [
  [/^(IEM|Intel Extreme Masters)\b/i, 'iem'],
  [/^PGL\b/i, 'pgl'],
  [/^BLAST/i, 'blast'],
  [/^ESL\b/i, 'esl'],
  [/^(Perfect World|CS Asia Championships)/i, 'perfectworld'],
  [/^StarLadder/i, 'starladder'],
  [/^FiReSPORTS/i, 'firesports'],
  [/^Esports World Cup/i, 'ewc'],
  [/^DreamHack/i, 'dreamhack'],
  [/^EPICENTER/i, 'epicenter'],
  [/^ELEAGUE/i, 'eleague']
];

export function trophyOrganizerOf(name: string): TrophyOrganizer | null {
  return ORGANIZER_OF.find(([pattern]) => pattern.test(name.trim()))?.[1] ?? null;
}

const HEIGHTS: Record<string, number> = manifest.heights;

/** A folha de sprite do troféu ("iem-major", "blast-s", "mvp"…) e a altura do quadro dela. */
export function trophyArt(kind: 'title' | 'mvp' | 'evp', tier: EventTier, name: string): { art: string; height: number } {
  const generic = kind !== 'title' ? kind : tier === 'Major' ? 'major' : 's';
  const organizer = kind === 'title' ? trophyOrganizerOf(name) : null;
  const own = organizer ? `${organizer}-${tier === 'Major' ? 'major' : 's'}` : null;
  const art = own && HEIGHTS[own] ? own : generic;
  return { art, height: HEIGHTS[art] ?? 400 };
}

export const TROPHY_FRAME_WIDTH = manifest.width;
export const TROPHY_FRAMES = manifest.frames;
