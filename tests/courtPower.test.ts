// tests/courtPower.test.ts
// Poder de quadra: a escala real do online, que nunca passa de 100 e é a mesma na tela e na partida.
import { describe, expect, it } from 'vitest';
import { COURT_KNEE, COURT_SLOPE, COURT_SPREAD, COURT_TOP, addCourtPoints, courtMatchDay, courtPower, rawFromCourt } from '../src/lib/game/courtPower';
import { RAW_TOP } from '../src/lib/game/balance';

describe('poder de quadra', () => {
  it('até o joelho tudo conta; acima dele cada ponto conta pouco, mas conta', () => {
    expect(courtPower(90) - courtPower(80)).toBeCloseTo(10 * COURT_SPREAD, 10);
        expect(courtPower(COURT_KNEE + 10) - courtPower(COURT_KNEE)).toBeCloseTo(10 * COURT_SLOPE * COURT_SPREAD, 10);
    // O bug que isto conserta: 112 e 134 jogavam idênticos.
    expect(courtPower(134)).toBeGreaterThan(courtPower(112));
  });

  it('é contínua no joelho e sempre crescente', () => {
    expect(courtPower(COURT_KNEE + 1e-9) - courtPower(COURT_KNEE - 1e-9)).toBeLessThan(1e-6);
    let last = -Infinity;
    for (let raw = 40; raw <= 160; raw += 0.25) { const court = courtPower(raw); expect(court).toBeGreaterThan(last); last = court; }
  });

  it('a inversa volta ao mesmo lugar, dos dois lados do joelho', () => {
    for (const raw of [45, 74, 98, COURT_KNEE, 104.5, 112.2, 133.5, 151]) expect(rawFromCourt(courtPower(raw))).toBeCloseTo(raw, 9);
  });

  it('pontos de quadra doem igual em time fraco e em time forte', () => {
    for (const raw of [92, 98, 110, 125, 139]) expect(courtPower(addCourtPoints(raw, -2)) - courtPower(raw)).toBeCloseTo(-2, 9);
    // Em poder cru a mesma dor custa muito mais no topo: é por isso que penalidade em % não serve com a curva.
    expect(125 - addCourtPoints(125, -2)).toBeGreaterThan((98 - addCourtPoints(98, -2)) * 5);
    expect(addCourtPoints(110, 0)).toBeCloseTo(110, 10);
  });

  it('o topo da escala é a melhor line montável, e ela não chega a 100', () => {
    // É o nível que aparece na tela: a melhor line possível marca COURT_TOP, e ninguém passa dela.
    expect(courtPower(RAW_TOP)).toBeCloseTo(COURT_TOP, 10);
    expect(COURT_TOP).toBeLessThan(100);
    // O poder DO DIA pode passar do topo (um dia excelente de quem já está no topo). Ninguém vê esse número: ele só
    // existe dentro da partida, onde só a diferença entre os dois times conta.
    expect(courtMatchDay(RAW_TOP, 1.085)).toBeGreaterThan(COURT_TOP);
  });

  it('o dia de jogo aplica a curva sobre poder × multiplicador, com o piso de sempre', () => {
    expect(courtMatchDay(100, 1.05)).toBeCloseTo(courtPower(105), 10);
    expect(courtMatchDay(10, 1)).toBeCloseTo(courtPower(45), 10);
  });
});
