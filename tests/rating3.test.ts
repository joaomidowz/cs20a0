// tests/rating3.test.ts
import { describe, expect, it } from 'vitest';
import {
  aliveWinProbability,
  analyzeRound,
  contributionKey,
  impactOf,
  rating3,
  ratingBaseline,
  rawRating3,
  sideAdjustedProbability,
  statRng,
  type RatingLine
} from '../src/lib/game/rating';
import type { RoundDetail } from '../src/lib/game/types';

const roster = { a: ['a1', 'a2', 'a3', 'a4', 'a5'], b: ['b1', 'b2', 'b3', 'b4', 'b5'] };
const detail: RoundDetail = {
  number: 3,
  winner: 'a',
  sideA: 'ct',
  overtime: false,
  economy: { a: { buy: 'full', awp: false, money: 5000 }, b: { buy: 'full', awp: false, money: 5000 } },
  kills: [
    { killerId: 'a1', killerName: 'A1', killerSide: 'a', victimId: 'b1', victimName: 'B1', weapon: 'm4a1', headshot: true, second: 20, assistId: 'a2', assistName: 'A2', flashAssistId: 'a3', flashAssistName: 'A3' },
    { killerId: 'b2', killerName: 'B2', killerSide: 'b', victimId: 'a1', victimName: 'A1', weapon: 'ak47', headshot: false, second: 23 },
    { killerId: 'a3', killerName: 'A3', killerSide: 'a', victimId: 'b2', victimName: 'B2', weapon: 'm4a1', headshot: false, second: 40 }
  ],
  ending: 'elimination',
  tags: []
};
const at = (lines: ReturnType<typeof analyzeRound>, side: 'a' | 'b', id: string) => lines.get(contributionKey(side, id))!;

describe('probabilidade de vencer o round', () => {
  it('segue a tabela por vivos e é simétrica', () => {
    expect(aliveWinProbability(5, 5)).toBe(0.5);
    expect(aliveWinProbability(5, 4)).toBe(0.71);
    expect(aliveWinProbability(4, 5)).toBeCloseTo(0.29, 10);
    expect(aliveWinProbability(2, 1)).toBe(0.78);
    expect(aliveWinProbability(1, 3)).toBeCloseTo(0.08, 10);
    expect(aliveWinProbability(3, 0)).toBe(1);
    expect(aliveWinProbability(0, 2)).toBe(0);
  });

  it('ajusta pelo lado do mapa sem sair de 1% a 99%', () => {
    expect(sideAdjustedProbability(0.5, 'ct', 'nuke')).toBeCloseTo(0.56, 10);
    expect(sideAdjustedProbability(0.5, 't', 'nuke')).toBeCloseTo(0.44, 10);
    expect(sideAdjustedProbability(0.99, 'ct', 'nuke')).toBe(0.99);
    expect(sideAdjustedProbability(1, 't', 'nuke')).toBe(1);
    expect(sideAdjustedProbability(0.5, 'ct')).toBe(0.5);
  });
});

describe('gerador de stats', () => {
  it('é determinístico e fica em [0, 1)', () => {
    const left = statRng('serie:1:3');
    const right = statRng('serie:1:3');
    const values = Array.from({ length: 50 }, () => left());
    expect(values).toEqual(Array.from({ length: 50 }, () => right()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(statRng('outra')()).not.toBe(values[0]);
  });
});

describe('análise de um round', () => {
  const lines = analyzeRound(detail, { roster, seed: 'serie:1:3' });

  it('conta abates, mortes, assistências, abertura e troca', () => {
    expect(at(lines, 'a', 'a1')).toMatchObject({ kills: 1, deaths: 1, openingKill: true, kast: true });
    expect(at(lines, 'a', 'a2')).toMatchObject({ assists: 1, kills: 0, kast: true });
    expect(at(lines, 'a', 'a3')).toMatchObject({ flashAssists: 1, kills: 1, kast: true });
    expect(at(lines, 'b', 'b1')).toMatchObject({ deaths: 1, openingDeath: true, tradedDeath: true, kast: true });
    expect(at(lines, 'b', 'b2')).toMatchObject({ kills: 1, deaths: 1, tradeKills: 1, kast: true });
    expect(at(lines, 'a', 'a1').tradedDeath).toBe(false);
    expect(at(lines, 'a', 'a4').kast).toBe(true);
    expect(at(lines, 'b', 'b5').kast).toBe(true);
  });

  it('divide o dano do abate com a assistência', () => {
    const killer = at(lines, 'a', 'a1').damage;
    const helper = at(lines, 'a', 'a2').damage;
    expect(killer + helper).toBe(100);
    expect(helper).toBeGreaterThanOrEqual(30);
    expect(helper).toBeLessThanOrEqual(70);
    expect(at(lines, 'b', 'b2').damage).toBe(100);
    expect(at(lines, 'a', 'a3').damage).toBe(100);
  });

  it('dá o swing ao autor e à assistência, tira da vítima e soma zero entre os times', () => {
    expect(at(lines, 'a', 'a1').swing).toBeCloseTo(0.21 * 0.7 - 0.21, 10);
    expect(at(lines, 'a', 'a2').swing).toBeCloseTo(0.21 * 0.3, 10);
    expect(at(lines, 'b', 'b1').swing).toBeCloseTo(-0.21, 10);
    expect(at(lines, 'b', 'b2').swing).toBeCloseTo(0.21 - 0.2, 10);
    expect(at(lines, 'a', 'a3').swing).toBeCloseTo(0.2, 10);
    const total = (side: 'a' | 'b') => [...lines.values()].filter((line) => line.side === side).reduce((sum, line) => sum + line.swing, 0);
    expect(total('a') + total('b')).toBeCloseTo(0, 10);
  });

  it('gera de 0 a 2 eventos de utilitário por lado, de 8 a 45 de dano, sempre igual para a mesma seed', () => {
    const utility = (side: 'a' | 'b', source = lines) => [...source.values()].filter((line) => line.side === side).reduce((sum, line) => sum + line.utilityDamage, 0);
    for (const side of ['a', 'b'] as const) {
      expect(utility(side)).toBeGreaterThanOrEqual(0);
      expect(utility(side)).toBeLessThanOrEqual(90);
    }
    const again = analyzeRound(detail, { roster, seed: 'serie:1:3' });
    expect([...again.entries()]).toEqual([...lines.entries()]);
  });

  it('dá o utilitário a quem tem mais peso', () => {
    const sums = { a4: 0, others: 0 };
    for (let index = 0; index < 200; index += 1) {
      const result = analyzeRound(detail, { roster, seed: `peso:${index}`, utilityWeight: (side, id) => (side === 'a' && id === 'a4' ? 50 : 1) });
      for (const [key, line] of result) {
        if (line.side !== 'a') continue;
        if (key === contributionKey('a', 'a4')) sums.a4 += line.utilityDamage;
        else sums.others += line.utilityDamage;
      }
    }
    expect(sums.a4).toBeGreaterThan(sums.others * 5);
  });
});

describe('fórmulas do Rating 3.0', () => {
  const line: RatingLine = { rounds: 20, kills: 14, deaths: 10, assists: 4, kastRounds: 15, damage: 1700, utilityDamage: 0, swing: 0.6 };

  it('calcula impacto e rating bruto com os pesos da spec', () => {
    expect(impactOf(line)).toBeCloseTo(1.165, 10);
    expect(rawRating3(line)).toBeCloseTo(1.170758, 6);
    expect(rawRating3({ ...line, rounds: 0 })).toBe(0);
  });

  it('divide pela média do campo e arredonda em duas casas', () => {
    expect(rating3(1.170758, 0.9)).toBe(1.3);
    expect(rating3(1, 0)).toBe(0);
    const weaker: RatingLine = { ...line, kills: 6, deaths: 16, kastRounds: 9, damage: 1100, swing: -0.4 };
    const baseline = ratingBaseline([line, weaker, { ...line, rounds: 0 }]);
    expect(baseline).toBeCloseTo((rawRating3(line) + rawRating3(weaker)) / 2, 10);
    expect((rating3(rawRating3(line), baseline) + rating3(rawRating3(weaker), baseline)) / 2).toBeCloseTo(1, 1);
  });
});
