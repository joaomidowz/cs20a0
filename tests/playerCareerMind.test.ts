// tests/playerCareerMind.test.ts
// Cabeça: anda para o patamar do Mental da carta (forte segura mais alto), sobe com vitória, descanso e semana
// tranquila, cai com cansaço alto, pressão e saudade. Nada só piora, nada só melhora.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState, type TournamentResult } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { advanceLife, DEFAULT_LIFE, mindHome } from '../src/lib/game/playerCareer/life';
import { tickLife } from '../src/lib/game/playerCareer/tick';
import { applyAgenda } from '../src/lib/game/playerCareer/agenda';

const at = (seed: string): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'igl', seed });
  const org = sceneOrgs.find((candidate) => candidate.name === 'MIBR')!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
};
const result = (placement: string): TournamentResult => ({ name: 'E', placement, rating: 1, seriesWins: 1, seriesLosses: 1 });
const ctx = { abroad: false, teamFluency: 100, avgRelationship: 60, level: 2, fame: 0 };

describe('Cabeça', () => {
  it('Mental de carta forte segura a Cabeça mais alta', () => {
    expect(mindHome(96)).toBeGreaterThan(mindHome(80));
    expect(mindHome(80)).toBe(60);
    expect(mindHome(60)).toBeLessThan(60);
  });

  it('descansado sobe, esgotado cai; ganhar sobe mais que chegar na semi', () => {
    const state = { ...at('mind-1'), life: { ...DEFAULT_LIFE, mind: 60 } };
    const rested = advanceLife({ ...state, fatigue: 10 }, { ...ctx, mentalSkill: 80 }).life.mind;
    const tired = advanceLife({ ...state, fatigue: 85 }, { ...ctx, mentalSkill: 80 }).life.mind;
    expect(rested).toBeGreaterThan(60);
    expect(tired).toBeLessThan(60);
    const title = advanceLife({ ...state, fatigue: 40 }, { ...ctx, mentalSkill: 80, result: result('Campeão') }).life.mind;
    const semi = advanceLife({ ...state, fatigue: 40 }, { ...ctx, mentalSkill: 80, result: result('Semis') }).life.mind;
    expect(title).toBeGreaterThan(semi);
  });

  it('com o tempo e semanas tranquilas, quem está abaixo do patamar sobe sozinho', () => {
    let state: PlayerCareerState = { ...at('mind-2'), fatigue: 20, life: { ...DEFAULT_LIFE, mind: 40, pressure: 30 } };
    for (let index = 0; index < 6; index += 1) state = tickLife(state, null).state;
    expect(state.life!.mind).toBeGreaterThan(50);
  });

  it('pressão: psicólogo e sair das redes aliviam na semana; final alivia, cair cedo pesa menos que antes', () => {
    const state = { ...at('mind-3'), life: { ...DEFAULT_LIFE, pressure: 90 } };
    const after = applyAgenda(state, 'psicologo');
    expect(after.state.life!.pressure).toBe(80);
    expect(after.chips.find((chip) => chip.label === 'Pressão')?.value).toBe(-10);
    const vice = advanceLife({ ...state, fatigue: 40 }, { ...ctx, level: 0, result: result('Vice') }).life.pressure;
    const out = advanceLife({ ...state, fatigue: 40 }, { ...ctx, level: 0, result: result('Quartas') }).life.pressure;
    expect(vice).toBeLessThan(out);
    expect(out - vice).toBe(7);
  });
});
