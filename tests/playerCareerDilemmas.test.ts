// tests/playerCareerDilemmas.test.ts
// Dilemas da semana: só com conflito real (condições conferidas), no máximo 3 por temporada, cooldown que não zera,
// efeito com contexto (saudade alta faz a volta render mais), marcas na vida e mudanças de verdade (folga, proposta).
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { DILEMMAS, DILEMMAS_PER_SEASON, DILEMMA_BY_ID, UNSUPPORTED_DILEMMAS, dilemmasNow, resolveDilemma, rollDilemma } from '../src/lib/game/playerCareer/dilemmas';
import { DEFAULT_LIFE } from '../src/lib/game/playerCareer/life';

const at = (orgName: string, seed: string): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'awper', seed });
  const org = sceneOrgs.find((candidate) => candidate.name === orgName)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
};

describe('dilemas', () => {
  it('24 na planilha, 3 opções cada; o título não afirma placar que o jogo não guarda', () => {
    expect(DILEMMAS.length + UNSUPPORTED_DILEMMAS.length).toBe(24);
    for (const dilemma of DILEMMAS) expect(dilemma.options).toHaveLength(3);
    expect(DILEMMA_BY_ID.get('dilema-008')?.title).not.toMatch(/13 a 0/);
  });

  it('só aparece com conflito real: saudade de quem não mora fora não existe', () => {
    const home = { ...at('MIBR', 'dil-home'), life: { ...DEFAULT_LIFE, homesick: 90, abroadWeeks: 0 } };
    expect(dilemmasNow(home).map((dilemma) => dilemma.id)).not.toContain('dilema-005');
    const away = { ...at('Vitality', 'dil-away'), life: { ...DEFAULT_LIFE, homesick: 75, abroadWeeks: 20, weeksSinceVisit: 20 } };
    expect(dilemmasNow(away).map((dilemma) => dilemma.id)).toContain('dilema-005');
  });

  it('no máximo 3 por temporada', () => {
    let state: PlayerCareerState = { ...at('Vitality', 'dil-cap'), life: { ...DEFAULT_LIFE, homesick: 75, abroadWeeks: 20, weeksSinceVisit: 20 }, fatigue: 55 };
    for (let index = 0; index < 200; index += 1) {
      state = rollDilemma(state, index % 10);
      if (state.pendingDilemma) state = resolveDilemma(state, (['A', 'B', 'C'] as const)[index % 3]).state;
      state = { ...state, pendingMove: null };
    }
    const mine = (state.happeningHistory ?? []).filter((record) => record.id.startsWith('dilema-') && record.season === state.seasonNumber);
    expect(mine.length).toBeLessThanOrEqual(DILEMMAS_PER_SEASON);
    expect(mine.length).toBeGreaterThan(0);
  });

  it('voltar para casa com saudade alta rende mais e zera a saudade da viagem; a escolha marca a vida', () => {
    const away = (homesick: number): PlayerCareerState => ({ ...at('Vitality', 'dil-visit'), life: { ...DEFAULT_LIFE, homesick, abroadWeeks: 30, weeksSinceVisit: 30 }, pendingDilemma: { id: 'dilema-002', eventIndex: 3 } });
    const high = resolveDilemma(away(80), 'A').state;
    const low = resolveDilemma(away(20), 'A').state;
    expect(high.life!.homesick).toBe(55);
    expect(high.life!.weeksSinceVisit).toBe(0);
    expect((high.morale ?? 60) - 60).toBeGreaterThan((low.morale ?? 60) - 60);
    expect(high.life!.flags).toContain('dilema-002:A');
  });

  it('pedir dispensa do torneio tira um campeonato de verdade', () => {
    const state = { ...at('MIBR', 'dil-skip'), pendingDilemma: { id: 'dilema-021', eventIndex: 2 } };
    const before = state.calendar!.filter((entry) => entry.status === 'UPCOMING').length;
    const after = resolveDilemma(state, 'B').state;
    expect(after.calendar!.filter((entry) => entry.status === 'UPCOMING').length).toBe(before - 1);
  });
});
