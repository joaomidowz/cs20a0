// tests/powerRating.test.ts
// O rating 0-99 mostrado nas telas. É só exibição: nenhuma regra de partida lê isto.
import { describe, expect, it } from 'vitest';
import { RATING_CEILING, RATING_FLOOR, RATING_MAX, RATING_MIN, formatRating, powerRating, powerRatingDelta } from '../src/lib/game/powerRating';
import { collectionPlayers as players, collectionCoaches, collectionTeams } from '../src/lib/game/online/collection-pool';
import { applyCollectionLineup, eligibleRolesOf, isStarEffective, toSelectedPlayer, type CollectionSlotRole } from '../src/lib/game/online/collection-lineup';
import { applyCoachToTeam, coachAffinity } from '../src/lib/game/dynasty/coach';
import { calculateHistoricalTeamPower, calculateUserTeamPower } from '../src/lib/game/simulation';
import type { OrgStyle, Player } from '../src/lib/game/types';

describe('rating de poder (0-99)', () => {
  it('ancora o piso, leva o teto a 99 e nunca sai da faixa', () => {
    expect(powerRating(RATING_FLOOR)).toBe(RATING_FLOOR);
    expect(powerRating(RATING_CEILING)).toBeCloseTo(RATING_MAX, 6);
    expect(powerRating(RATING_CEILING + 50)).toBe(RATING_MAX);
    expect(powerRating(-999)).toBe(RATING_MIN);
    expect(powerRating(0)).toBeGreaterThanOrEqual(RATING_MIN);
  });

  it('é crescente: time mais forte nunca lê um número menor', () => {
    let last = -Infinity;
    for (let power = 40; power <= RATING_CEILING; power += 0.5) {
      const rating = powerRating(power);
      expect(rating).toBeGreaterThanOrEqual(last);
      last = rating;
    }
  });

  it('os números que o dono vê', () => {
    expect(Math.round(powerRating(134))).toBe(97);
    expect(Math.round(powerRating(106))).toBe(86);
    expect(Math.round(powerRating(81.8))).toBe(77);
    expect(formatRating(134)).toBe('97.0');
    expect(powerRatingDelta(10)).toBeCloseTo(10 * (RATING_MAX - RATING_FLOOR) / (RATING_CEILING - RATING_FLOOR), 10);
  });

  it('o teto cobre a melhor line montável hoje: nada estoura 99', { timeout: 120_000 }, () => {
    const STYLES: OrgStyle[] = ['aggressive', 'balanced', 'tactical'];
    // O coach é multiplicador fixo: o melhor dele sai uma vez por time, fora do laço de estilo e star.
    const bestCoachFactor = (team: Player[]) => {
      let factor = 1;
      for (const coach of collectionCoaches) {
        const got = applyCoachToTeam({ power: 100, mental: 50 } as never, coach, coachAffinity(coach, team, collectionTeams as never)).power / 100;
        if (got > factor) factor = got;
      }
      return factor;
    };
    const bestOf = (team: Player[], roles: CollectionSlotRole[], coachId: string | null) => {
      let top = 0;
      for (const style of STYLES) {
        const base = calculateUserTeamPower(team, style, team.map((p, i) => toSelectedPlayer(p.id, roles[i])), 'rating');
        for (const star of [null, ...team.map((p) => p.id)]) {
          if (star && !isStarEffective(team, star, roles)) continue;
          top = Math.max(top, applyCollectionLineup(base, { players: team, roles, starPlayerId: star, style, coachId }).power);
        }
      }
      return top * bestCoachFactor(team);
    };
    let strongest = 0;
    for (const teamId of new Set(players.map((player) => player.teamId))) {
      const squad = players.filter((player) => player.teamId === teamId).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 5);
      if (squad.length < 5) continue;
      const roles: CollectionSlotRole[] = [];
      for (const player of squad) { const el = eligibleRolesOf(player); roles.push(el.find((role) => !roles.includes(role)) ?? el[0]); }
      strongest = Math.max(strongest, bestOf(squad, roles, collectionCoaches.find((c) => c.teamId === teamId)?.id ?? null));
    }
    // Se esta falhar, o conteúdo passou do teto medido: remedir RATING_CEILING.
    expect(strongest).toBeLessThanOrEqual(RATING_CEILING);
    expect(powerRating(strongest)).toBeLessThanOrEqual(RATING_MAX);
    // E os bots continuam abaixo do jogador no topo, como no cru.
    const bots = collectionTeams.map((team) => calculateHistoricalTeamPower(team as never, players).power);
    expect(powerRating(Math.max(...bots))).toBeLessThan(powerRating(strongest));
    expect(powerRating(Math.min(...bots))).toBeGreaterThanOrEqual(RATING_MIN);
  });
});
