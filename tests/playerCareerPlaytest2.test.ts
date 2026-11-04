// tests/playerCareerPlaytest2.test.ts
// Bugs da revisão de design (playtest 2): carreira que trava ao virar o ano, vaga tomada de quem continua em
// quadra e história do clutch que conta kills do time como suas.
import { describe, expect, it } from 'vitest';
import { chooseStartingOrg, createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { careerMapPool, runSceneEvent, startSceneEvent } from '../src/lib/game/playerCareer/live';
import { clutchStory, DECISION_MATRIX, SHARED_SITUATIONS } from '../src/lib/game/playerCareer/decisions';
import { matesOf } from '../src/lib/game/playerCareer/squad';

function careerAtRealOrg(seed: string): PlayerCareerState {
  const career = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed });
  const option = career.pendingDraw!.find((candidate) => candidate.kind === 'real')!;
  return chooseStartingOrg(career, option.orgId);
}

describe('pool de mapas da carreira', () => {
  it('um ano depois da tabela de active duty ainda tem 7+ mapas (o último pool conhecido)', () => {
    expect(careerMapPool(2026).length).toBeGreaterThanOrEqual(7);
    expect(careerMapPool(2031)).toEqual(careerMapPool(2026));
  });

  it('o campeonato da temporada de 2031 abre sem quebrar o veto', () => {
    const career = { ...startSeason(careerAtRealOrg('ano-novo')), year: 2031 };
    const field = startSceneEvent(career, 0);
    const ctx = { role: career.role, seed: career.seed, usedSituationIds: [] as string[] };
    expect(() => runSceneEvent(field.campaign, ctx)).not.toThrow();
  });
});

describe('a vaga tomada', () => {
  it('quem cedeu a vaga não aparece entre os parceiros', () => {
    for (const seed of ['vaga1', 'vaga2', 'vaga3', 'vaga4', 'vaga5']) {
      const career = careerAtRealOrg(seed);
      const seat = career.seatsTaken.at(-1);
      if (!seat) continue;
      const nicks = matesOf(career).map((mate) => mate.player.nickname);
      expect(nicks).not.toContain(seat.nick);
      expect(nicks).toHaveLength(4);
    }
  });
});

describe('história do round decisivo', () => {
  it('conjuga a call: nunca "você" + infinitivo', () => {
    for (const situation of [...Object.values(DECISION_MATRIX).flat(), ...SHARED_SITUATIONS]) {
      for (const alternative of situation.alternatives) {
        for (const won of [true, false]) {
          const story = clutchStory(alternative.profile, alternative.text, won, 1);
          expect(story).not.toMatch(/[Vv]ocê [a-zà-ú]+(ar|er|ir)\b/);
        }
      }
    }
  });

  it('kills do time não viram "suas"', () => {
    const story = clutchStory('solid', 'Segurar o retake', true, 0);
    expect(story).not.toMatch(/eliminaç/);
  });
});

describe('detalhe do campeonato no calendário', () => {
  it('a chave mostrada antes de jogar é a mesma que entra no motor', async () => {
    const { sceneEventField } = await import('../src/lib/game/playerCareer/live');
    const career = startSeason(careerAtRealOrg('chave1'));
    const field = sceneEventField(career, 2);
    expect(field).toHaveLength(8);
    expect(field.filter((team) => team.isUser)).toHaveLength(1);
    expect(sceneEventField(career, 2)).toEqual(field);
    const engineTeams = startSceneEvent(career, 2).campaign.engine.byId;
    for (const team of field.filter((entry) => !entry.isUser)) expect(engineTeams.has(team.orgId)).toBe(true);
    expect(field.map((team) => team.overall)).toEqual([...field.map((team) => team.overall)].sort((a, b) => b - a));
  });
});
