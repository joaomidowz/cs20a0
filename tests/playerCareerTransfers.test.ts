// tests/playerCareerTransfers.test.ts
// Mercado durante a temporada: corte por fase ruim, proposta de time de cima por fase boa, calendário refeito
// na troca e dispensa no fim de uma temporada ruim.
import { describe, expect, it } from 'vitest';
import {
  acceptMove, chooseStartingOrg, createPlayerCareer, decentRatingFor, declineMove, finishSeason, goToLanHouse, midSeasonCheck,
  orgOf, recordEventResult, startSeason, starRatingFor, stayAtOrg, type PlayerCareerState
} from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';

function seasonAt(seed: string): PlayerCareerState {
  const career = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  return startSeason(chooseStartingOrg(career, career.pendingDraw!.find((option) => option.kind === 'real')!.orgId));
}

const playN = (state: PlayerCareerState, count: number, rating: number) => {
  let next = state;
  for (let index = 0; index < count; index += 1) {
    next = recordEventResult(next, index, { name: next.calendar![index].name, placement: 'Quartas', rating, seriesWins: 0, seriesLosses: 1 });
  }
  return next;
};

describe('corte no meio da temporada', () => {
  it('fase ruim com clima pesado: em algum seed o time corta, com ofertas e motivo claro', () => {
    let cuts = 0;
    for (let index = 0; index < 12; index += 1) {
      const base = seasonAt(`cut-${index}`);
      const decent = decentRatingFor('rifler', orgOf(base.orgId).level);
      const state = midSeasonCheck({ ...playN(base, 3, decent - 0.25), morale: 35 }, 40);
      if (state.pendingMove?.kind === 'cut') {
        cuts += 1;
        expect(state.pendingMove.reason).toContain('Média');
        expect(state.pendingMove.reason).not.toMatch(/—/);
      }
    }
    expect(cuts).toBeGreaterThan(2);
  });

  it('fase normal não mexe em nada', () => {
    for (let index = 0; index < 8; index += 1) {
      const base = seasonAt(`calm-${index}`);
      const decent = decentRatingFor('rifler', orgOf(base.orgId).level);
      const state = playN(base, 3, decent + 0.02);
      expect(midSeasonCheck(state)).toBe(state);
    }
  });

  it('aceitar refaz só os campeonatos que faltam e registra a troca', () => {
    let state: PlayerCareerState | null = null;
    for (let index = 0; index < 20 && !state; index += 1) {
      const base = seasonAt(`move-${index}`);
      const moved = midSeasonCheck({ ...playN(base, 3, 0.6), morale: 30 }, 30);
      if (moved.pendingMove?.kind === 'cut' && moved.pendingMove.offers.length) state = moved;
    }
    expect(state).not.toBeNull();
    const move = state!.pendingMove!;
    const accepted = acceptMove(state!, move.offers[0].orgId);
    expect(accepted.orgId).toBe(move.offers[0].orgId);
    expect(accepted.pendingMove).toBeNull();
    expect(accepted.calendar!.slice(0, 3)).toEqual(state!.calendar!.slice(0, 3));
    expect(accepted.calendar!.slice(3).every((entry) => entry.status === 'UPCOMING')).toBe(true);
    expect(accepted.calendar!.map((entry) => entry.index)).toEqual(accepted.calendar!.map((_, index) => index));
    expect(accepted.seasonMoves?.[0]).toContain('Cortado do');
    expect(declineMove(state!)).toBe(state);
    const lan = acceptMove(state!, 'lan-house');
    expect(lan.orgId).toBe('lan-house');
  });
});

describe('proposta de um time de cima', () => {
  it('fase de estrela: em algum seed chega uma oferta do nível acima; recusar dá moral', () => {
    let seen = 0;
    for (let index = 0; index < 24; index += 1) {
      const base = seasonAt(`poach-${index}`);
      const level = orgOf(base.orgId).level;
      const state = midSeasonCheck(playN(base, 3, starRatingFor('rifler', level - 1) + 0.05));
      if (state.pendingMove?.kind !== 'poach') continue;
      seen += 1;
      const offer = state.pendingMove.offers[0];
      expect(sceneOrgs.find((org) => org.id === offer.orgId)?.level).toBe(level - 1);
      expect(declineMove(state).morale).toBe((state.morale ?? 60) + 4);
      expect(acceptMove(state, offer.orgId).seasonMoves?.[0]).toContain('Saiu do');
    }
    expect(seen).toBeGreaterThan(1);
  });
});

describe('fim de temporada', () => {
  it('temporada ruim sem título: dispensado, sem renovar; trocas vão para o log', () => {
    let state = seasonAt('released-1');
    const count = state.calendar!.length;
    state = { ...playN(state, count, 0.6), seasonMoves: ['teste → outro'] };
    const done = finishSeason(state);
    expect(done.released).toBe(true);
    expect(done.pendingOffers).not.toBeNull();
    expect(stayAtOrg(done)).toBe(done);
    expect(done.history.at(-1)?.moves).toEqual(['teste → outro']);
    expect(goToLanHouse(done).orgId).toBe('lan-house');
  });

  it('temporada boa renova normalmente', () => {
    let state = seasonAt('released-2');
    state = playN(state, state.calendar!.length, 1.1);
    const done = finishSeason(state);
    expect(done.released).toBe(false);
  });
});
