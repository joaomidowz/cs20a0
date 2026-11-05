// tests/playerCareerCalibration.test.ts
// Calibração da Carreira com o motor de verdade. A tabela completa só roda com CAREER_CALIBRATION=1 (leva
// minutos); o teste rápido garante que medir não muda nada: sem política é o mesmo campeonato de sempre.
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dynastyChance, measureTitles, scenarioState, type TitleScenario } from '../src/lib/game/playerCareer/calibration';
import { simulateSceneEvent } from '../src/lib/game/playerCareer/live';

describe('medição da carreira', () => {
  it('sem política de calls, simular é exatamente o campeonato de sempre; com política, é determinístico', () => {
    const state = scenarioState({ orgName: 'MOUZ', overall: 88, relationship: 70, tier: 'S', seeds: 1, policy: 'none' }, 0)!;
    const index = state.calendar!.findIndex((entry) => entry.format !== 'major');
    const plain = simulateSceneEvent(state, index);
    const none = simulateSceneEvent(state, index, undefined, null, { wins: 0, losses: 0 }, { policy: 'none', role: state.role, seed: 'x', playerOverall: 88, matesOverall: 88, chemistry: 70 });
    expect(none.result).toEqual(plain.result);
    const calls = { policy: 'best' as const, role: state.role, seed: 'x', playerOverall: 88, matesOverall: 88, chemistry: 70 };
    expect(simulateSceneEvent(state, index, undefined, null, { wins: 0, losses: 0 }, calls).result).toEqual(simulateSceneEvent(state, index, undefined, null, { wins: 0, losses: 0 }, calls).result);
  }, 60000);

  it('chance de ano dinastia (5+ títulos em 10) pela taxa', () => {
    expect(dynastyChance(0.27)).toBeGreaterThan(0.05);
    expect(dynastyChance(0.27)).toBeLessThan(0.15);
    expect(dynastyChance(0.4)).toBeGreaterThan(dynastyChance(0.27));
  });
});

describe.skipIf(!process.env.CAREER_CALIBRATION)('tabela de calibração (CAREER_CALIBRATION=1)', () => {
  it('títulos por política e cenário', () => {
    const seeds = Number(process.env.CAREER_SEEDS ?? 40);
    const scenarios: Array<Omit<TitleScenario, 'policy' | 'seeds'> & { label: string }> = [
      { label: 'Vitality · você 97 · relação 100', orgName: 'Vitality', overall: 97, relationship: 100, tier: 'S' },
      { label: 'FURIA · você 92 · relação 100', orgName: 'FURIA', overall: 92, relationship: 100, tier: 'S' },
      { label: 'MOUZ · você 90 · relação 80', orgName: 'MOUZ', overall: 90, relationship: 80, tier: 'S' }
    ];
    const rows: string[] = [];
    for (const scenario of scenarios) {
      for (const policy of (process.env.CAREER_POLICIES ?? 'none,worst,random,best').split(',') as Array<'none' | 'worst' | 'random' | 'best'>) {
        const measure = measureTitles({ ...scenario, policy, seeds });
        rows.push(`${scenario.label} | ${policy.padEnd(6)} | títulos ${(measure.titleRate * 100).toFixed(0)}% | finais ${(measure.finalRate * 100).toFixed(0)}% | ano 5+ ${(measure.dynastyChance * 100).toFixed(0)}% | força nº ${measure.powerRank.toFixed(1)} | n=${measure.events}`);
      }
    }
    console.log(`\n${rows.join('\n')}\n`);
    if (process.env.CAREER_OUT) writeFileSync(process.env.CAREER_OUT, `${rows.join('\n')}\n`);
    expect(rows.length).toBeGreaterThan(0);
  }, 3600000);
});
