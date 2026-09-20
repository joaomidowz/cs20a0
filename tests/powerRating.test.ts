// tests/powerRating.test.ts
// O rating 0-99 mostrado nas telas. É só exibição: nenhuma regra de partida lê isto.
import { describe, expect, it } from 'vitest';
import { RATING_CEILING, RATING_FLOOR, RATING_MAX, RATING_MIN, courtRating, courtRatingDelta, formatRating, powerRating, powerRatingDelta } from '../src/lib/game/powerRating';
import { COURT_TOP } from '../src/lib/game/courtPower';
import { RAW_TOP } from '../src/lib/game/balance';
import { collectionPlayers as players, collectionCoaches, collectionTeams } from '../src/lib/game/online/collection-pool';
import { applyCollectionLineup, collectionBaseTeam, eligibleRolesOf, isStarEffective, toSelectedPlayer, type CollectionSlotRole } from '../src/lib/game/online/collection-lineup';
import { applyCoachToTeam, coachAffinity } from '../src/lib/game/dynasty/coach';
import { calculateHistoricalTeamPower } from '../src/lib/game/simulation';
import type { OrgStyle } from '../src/lib/game/types';

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

  it('online: a melhor line montável lê ~98 e nem no melhor dia chega a 100', { timeout: 120_000 }, () => {
    const STYLES: OrgStyle[] = ['aggressive', 'balanced', 'tactical'];
    const topCoach = [...collectionCoaches].sort((a, b) => b.tactics - a.tactics)[0];
    let strongest = 0;
    for (const teamId of new Set(players.map((player) => player.teamId))) {
      const squad = players.filter((player) => player.teamId === teamId).sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 5);
      if (squad.length < 5) continue;
      const roles: CollectionSlotRole[] = [];
      for (const player of squad) { const el = eligibleRolesOf(player); roles.push(el.find((role) => !roles.includes(role)) ?? el[0]); }
      for (const coach of [collectionCoaches.find((item) => item.teamId === teamId), topCoach]) {
        if (!coach) continue;
        for (const style of STYLES) {
          const base = collectionBaseTeam(squad, style, squad.map((p, i) => toSelectedPlayer(p.id, roles[i])), 'rating');
          for (const star of [null, ...squad.map((p) => p.id)]) {
            if (star && !isStarEffective(squad, star, roles)) continue;
            const synergized = applyCollectionLineup(base, { players: squad, roles, starPlayerId: star, style, coachId: coach.id });
            strongest = Math.max(strongest, applyCoachToTeam(synergized, coach, coachAffinity(coach, squad, collectionTeams as never)).power);
          }
        }
      }
    }
    // O topo da escala é a melhor line montável: se esta falhar, o conteúdo (ou uma sinergia) mudou e o RAW_TOP de
    // `src/lib/game/balance.ts` precisa receber o número que aparece na mensagem.
    expect(strongest, `RAW_TOP deveria ser ${strongest.toFixed(2)}`).toBeCloseTo(RAW_TOP, 1);
    expect(courtRating(strongest)).toBeCloseTo(COURT_TOP, 0);
    expect(courtRating(strongest)).toBeLessThan(100);
    // E os bots seguem abaixo do melhor jogador, na mesma escala.
    const bots = collectionTeams.map((team) => calculateHistoricalTeamPower(team as never, players).power);
    expect(courtRating(Math.max(...bots))).toBeLessThan(courtRating(strongest));
    expect(courtRatingDelta(100, 110)).toBeCloseTo(courtRating(110) - courtRating(100), 10);
  });
});
