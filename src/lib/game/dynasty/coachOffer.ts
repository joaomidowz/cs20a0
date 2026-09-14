// src/lib/game/dynasty/coachOffer.ts
import { createSeededRng } from '../simulation';
import type { Coach } from '../types';
import { isDraftableCoach } from './coach';

export const COACH_OFFER_SIZE = 3;

/** Three different people, from teams the user did not draft from, at least one with overall 80+. Same seed and rerolls → same offer. */
export function offerCoaches(coaches: Coach[], seed: string, usedTeamIds: readonly string[], rerollsUsed = 0): Coach[] {
  const used = new Set(usedTeamIds);
  const pool = coaches.filter((coach) => isDraftableCoach(coach) && !used.has(coach.teamId));
  const rng = createSeededRng(`${seed}:coach:${[...usedTeamIds].sort().join('|')}:${rerollsUsed}`);
  const offer: Coach[] = [];
  const people = new Set<string>();
  const draw = (candidates: Coach[]) => {
    const available = candidates.filter((coach) => !people.has(coach.baseId));
    if (!available.length) return false;
    const chosen = available[Math.floor(rng() * available.length)];
    offer.push(chosen);
    people.add(chosen.baseId);
    return true;
  };
  draw(pool.filter((coach) => coach.overall >= 80));
  while (offer.length < COACH_OFFER_SIZE && draw(pool));
  return offer;
}
