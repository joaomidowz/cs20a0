// tests/playerCareerContext.test.ts
// O que a tela afirma tem que ser verdade: a situação do round bate com o placar, a sequência e o dinheiro, e o
// acontecimento bate com o resultado real do campeonato (quem foi campeão não "perde a final após abrir 12 a 4").
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { drawClutchSituation, situationFits, situationsFor, type RoundContext } from '../src/lib/game/playerCareer/decisions';
import { HAPPENING_BY_ID, rollHappening } from '../src/lib/game/playerCareer/happenings';

const winning: RoundContext = { round: 7, us: 5, them: 1, winStreak: 3, lossStreak: 0, lastWon: true, money: 5370, theirMoney: 1500 };

describe('situação do round com o placar real', () => {
  it('ganhando de 5 a 1 com dinheiro, nunca cai "perderam três rounds", eco nosso, pistol ou último round do half', () => {
    const banned = /perde(ram|u) (três|3) rounds|perdeu o pistol|pistol round|último round do half|cinco rounds atrás|eco round|está no eco|dinheiro curto|sem dinheiro|12 a 12|prorrogação/i;
    for (const role of ['awper', 'igl', 'entry', 'lurker', 'support'] as const) {
      for (let index = 0; index < 120; index += 1) {
        expect(drawClutchSituation(role, `ctx-${role}-${index}`, [], null, winning).text).not.toMatch(banned);
      }
    }
  });

  it('as regras liberam quando o momento é verdade', () => {
    const lossStreak = situationsFor('igl').find((situation) => /Perderam três rounds/.test(situation.text))!;
    expect(situationFits(lossStreak, winning)).toBe(false);
    expect(situationFits(lossStreak, { ...winning, us: 2, them: 5, winStreak: 0, lossStreak: 3, lastWon: false })).toBe(true);
    const half = situationsFor('igl').find((situation) => /Último round do half/.test(situation.text))!;
    expect(situationFits(half, { ...winning, round: 12 })).toBe(true);
    expect(situationFits(half, winning)).toBe(false);
    // Sem contexto (save antigo), situação com regra não cai; a neutra sempre pode.
    expect(situationFits(lossStreak, null)).toBe(false);
    expect(situationFits({ text: 'Time conseguiu primeira kill' }, null)).toBe(true);
  });
});

const at = (seed: string): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find((candidate) => candidate.level === 0)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [], fame: 200000 });
};

const result = (placement: string, tier: TournamentResult['tier'] = 'S'): TournamentResult => ({
  name: 'Teste', placement, tier, rating: 1.2, wins: 5, losses: placement === 'Campeão' ? 0 : 1, seriesWins: 3, seriesLosses: placement === 'Campeão' ? 0 : 1,
  opponents: [{ team: 'A', won: true, phase: 'quarterfinal' }, { team: 'B', won: true, phase: 'semifinal' }, { team: 'C', won: placement === 'Campeão', phase: 'final' }]
} as TournamentResult);

describe('acontecimento com o resultado real', () => {
  const rolled = (placement: string, tier: TournamentResult['tier'] = 'S') => {
    const ids = new Set<string>();
    for (let index = 0; index < 400; index += 1) {
      const state = rollHappening(at(`hap-${index}`), 'post', { eventIndex: 0, result: result(placement, tier) });
      if (state.pendingHappening) ids.add(state.pendingHappening.id);
    }
    return ids;
  };

  it('campeão nunca recebe "perde a final", "0 a 2 no suíço" ou "eliminação em semifinal"', () => {
    const ids = rolled('Campeão');
    for (const id of ['EV140', 'EV108', 'EV116', 'EV107', 'EV014']) expect(ids.has(id), HAPPENING_BY_ID.get(id)?.situation).toBe(false);
  });

  it('antes do jogo nunca afirma final, semifinal ou 0 a 2 do campeonato que nem começou', () => {
    for (let index = 0; index < 400; index += 1) {
      const state = rollHappening(at(`pre-${index}`), 'pre', { eventIndex: 0 });
      expect(['EV015', 'EV054', 'EV060', 'EV108', 'EV120', 'EV129', 'EV141', 'EV150']).not.toContain(state.pendingHappening?.id);
    }
  });
});
