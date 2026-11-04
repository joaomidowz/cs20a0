// tests/playerCareerRivals.test.ts
// Provocação de rival: um IGL/entry da sua chave fala de você; a resposta mexe em forma, fãs e reputação, e o
// confronto pesa: ganhar dele dá moral e fãs, perder tira moral.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { sceneEventField } from '../src/lib/game/playerCareer/live';
import { answerRival, rollRival, settleRival } from '../src/lib/game/playerCareer/rivals';

const at = (seed: string): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed });
  return startSeason({ ...base, orgId: sceneOrgs.find((org) => org.level === 1)!.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
};

function provoked(): PlayerCareerState {
  for (let index = 0; index < 60; index += 1) {
    const rolled = rollRival(at(`rival-${index}`), 0);
    if (rolled.pendingRival) return rolled;
  }
  throw new Error('nenhuma provocação em 60 seeds');
}

describe('provocação', () => {
  it('vem de um time da sua chave, com nome real e fala com o seu nick', () => {
    const state = provoked();
    const rival = state.pendingRival!;
    expect(sceneEventField(state, 0).some((team) => team.orgId === rival.orgId && !team.isUser)).toBe(true);
    expect(rival.nick.length).toBeGreaterThan(1);
    expect(rival.line).toContain('tester');
    expect(rival.line).not.toMatch(/—/);
  });

  it('acontece só em parte dos campeonatos', () => {
    let hits = 0;
    for (let index = 0; index < 100; index += 1) if (rollRival(at(`rate-${index}`), 0).pendingRival) hits += 1;
    expect(hits).toBeGreaterThan(8);
    expect(hits).toBeLessThan(45);
  });

  it('respostas: foco dá forma, redes dão fãs e tiram reputação, classe dá reputação', () => {
    const state = { ...provoked(), form: 0, fame: 0, reputation: 50 };
    expect(answerRival(state, 'focus').state.form).toBe(2);
    const social = answerRival(state, 'social').state;
    expect(social.fame!).toBeGreaterThan(0);
    expect(social.reputation).toBe(46);
    expect(answerRival(state, 'class').state.reputation).toBe(54);
    expect(answerRival(state, 'focus').state.pendingRival).toBeNull();
  });

  it('ganhar do rival dá moral e fãs; perder tira moral; não cruzar, nada', () => {
    const base = answerRival({ ...provoked(), morale: 60, fame: 0 }, 'focus').state;
    const rival = base.rival!;
    const result = (won: boolean) => ({ name: 'x', placement: 'Semis', rating: 1, seriesWins: 1, seriesLosses: 1, opponents: [{ team: rival.orgName, won }] });
    expect(settleRival(base, rival.eventIndex, result(true)).state.morale!).toBeGreaterThan(base.morale!);
    expect(settleRival(base, rival.eventIndex, result(false)).state.morale!).toBeLessThan(base.morale!);
    const none = settleRival(base, rival.eventIndex, { name: 'x', placement: 'Quartas', rating: 1, seriesWins: 0, seriesLosses: 1, opponents: [] });
    expect(none.state.morale).toBe(base.morale);
    expect(none.state.rival).toBeNull();
  });
});
