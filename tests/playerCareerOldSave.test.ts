// tests/playerCareerOldSave.test.ts
// Save de antes da integração (sem vida, memória de conversa, semana em blocos, histórico de acontecimentos):
// tudo abre, roda e salva. Semana já decidida no esquema antigo continua decidida; semana aberta ganha 3 blocos.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { blocksLeft, drawAgenda } from '../src/lib/game/playerCareer/agenda';
import { rollHappening } from '../src/lib/game/playerCareer/happenings';
import { rollDilemma } from '../src/lib/game/playerCareer/dilemmas';
import { momentTalk, seasonTalk } from '../src/lib/game/playerCareer/talks';
import { tickLife } from '../src/lib/game/playerCareer/tick';
import { careerLog } from '../src/lib/game/playerCareer/careerLog';
import { lifeOf, DEFAULT_LIFE } from '../src/lib/game/playerCareer/life';
import { trainingWindowOf, myPlayerOf } from '../src/lib/game/playerCareer/squad';

const NEW_FIELDS = ['life', 'talkMemory', 'pendingTalk', 'pendingDilemma', 'happeningHistory', 'week', 'weekLog', 'agendaUsed'] as const;

function oldSave(seed: string): PlayerCareerState {
  const career = createPlayerCareer({ nick: 'antigo', country: 'Brazil', role: 'entry', seed });
  const org = sceneOrgs.find((candidate) => candidate.name === 'MIBR')!;
  let state = startSeason({ ...career, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
  state = recordEventResult(state, 0, { name: 'E', placement: 'Semis', rating: 1.05, seriesWins: 2, seriesLosses: 1 });
  const parsed = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  for (const field of NEW_FIELDS) delete parsed[field];
  return parsed as unknown as PlayerCareerState;
}

describe('save antigo', () => {
  it('abre com os padrões e roda todos os sistemas novos', () => {
    const state = oldSave('old-1');
    expect(lifeOf(state)).toEqual({ ...DEFAULT_LIFE });
    expect(blocksLeft(state)).toBe(3);
    expect(drawAgenda(state).length).toBeGreaterThan(0);
    expect(() => rollHappening(state, 'between', { eventIndex: 1 })).not.toThrow();
    expect(() => rollDilemma(state, 1)).not.toThrow();
    expect(() => momentTalk(state, 'post', 0)).not.toThrow();
    expect(seasonTalk(state)).toBeNull(); // meio da temporada: o coach não "abre o ano" de novo
    expect(careerLog(state).decisions).toEqual([]);
    expect(myPlayerOf(state).mental).toBeGreaterThan(0);
    const ticked = tickLife(state, { name: 'E', placement: 'Campeão', rating: 1.1, seriesWins: 3, seriesLosses: 0 }).state;
    expect(ticked.life!.mind).toBeGreaterThan(DEFAULT_LIFE.mind);
    expect(JSON.parse(JSON.stringify(ticked))).toEqual(ticked);
  });

  it('semana já decidida no esquema antigo (uma escolha) continua decidida', () => {
    const state = oldSave('old-2');
    const decided = { ...state, trainedWindow: trainingWindowOf(state)! };
    expect(blocksLeft(decided)).toBe(0);
  });
});
