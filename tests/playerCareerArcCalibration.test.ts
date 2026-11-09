// tests/playerCareerArcCalibration.test.ts
// Calibração do embalo das calls e do arco da carreira com o motor de verdade. As tabelas só rodam com CAREER_UNDERDOG=1
// ou CAREER_ARC=1 (levam minutos); os testes rápidos garantem que medir é determinístico.
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { measureUnderdog } from '../src/lib/game/playerCareer/calibration';
import type { CallPolicy } from '../src/lib/game/playerCareer/live';

/** Times de Tier S com você abaixo do resto da elite: a chave tem muito rival 3 a 6 pontos acima. */
const UNDERDOG_SCENARIOS = [
  { orgName: 'FURIA', overall: 84 },
  { orgName: 'MOUZ', overall: 84 },
  { orgName: 'The MongolZ', overall: 83 },
  { orgName: 'Spirit', overall: 84 },
  { orgName: 'Falcons', overall: 85 },
  { orgName: 'Natus Vincere', overall: 84 }
];

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const report = (rows: string[]) => {
  console.log(`\n${rows.join('\n')}\n`);
  if (process.env.CAREER_OUT) appendFileSync(process.env.CAREER_OUT, `${rows.join('\n')}\n`);
};

describe('medição do embalo e do arco', () => {
  it('o azarão medido duas vezes dá o mesmo número', () => {
    const input = { scenarios: [UNDERDOG_SCENARIOS[0]], seeds: 1, seasons: 1, policy: 'best' as const };
    const first = measureUnderdog(input);
    expect(first).toEqual(measureUnderdog(input));
  }, 120000);
});

describe.skipIf(!process.env.CAREER_UNDERDOG)('azarão com calls (CAREER_UNDERDOG=1)', () => {
  it('séries com o rival 3 a 6 pontos acima, por política', () => {
    const seeds = Number(process.env.CAREER_SEEDS ?? 20);
    const seasons = Number(process.env.CAREER_SEASONS ?? 2);
    const rows = (process.env.CAREER_POLICIES ?? 'none,random,best,worst').split(',').map((policy) => {
      const measure = measureUnderdog({ scenarios: UNDERDOG_SCENARIOS, seeds, seasons, policy: policy as CallPolicy });
      return `azarão 3-6 | ${policy.padEnd(6)} | séries ${measure.series} | vitória ${pct(measure.winRate)} | com 2+ calls ganhas ${pct(measure.winRateTwoCalls)} (n=${measure.seriesTwoCalls})`;
    });
    report(rows);
    expect(rows.length).toBeGreaterThan(0);
  }, 7200000);
});
