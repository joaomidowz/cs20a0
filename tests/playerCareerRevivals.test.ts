// tests/playerCareerRevivals.test.ts
// Campeonatos históricos que voltam: a cada N anos (não todo ano), um por grupo de rotação, no circuito e na região
// certos, com o formato original dito na tela; teto de Tier S e no máximo 2 campeonatos no mesmo mês.
import { describe, expect, it } from 'vitest';
import { revivalsOf, S_TIER_CAP, seasonEvents } from '../src/lib/game/playerCareer/calendar';

describe('retornos', () => {
  it('não é todo ano: cada retorno aparece a cada período dele', () => {
    const years = Array.from({ length: 12 }, (_, index) => 2027 + index);
    const seen = new Map<string, number>();
    for (const year of years) for (const event of revivalsOf(year, 1, 'eu')) seen.set(event.name, (seen.get(event.name) ?? 0) + 1);
    expect(seen.size).toBeGreaterThan(3);
    for (const [, count] of seen) expect(count).toBeLessThan(years.length);
  });

  it('regional só na região dele; elite só para Tier S e 1', () => {
    for (let year = 2027; year < 2040; year += 1) {
      for (const event of revivalsOf(year, 2, 'sa')) expect(event.name).not.toMatch(/North America|Europe|Asia-Pacific/);
      for (const event of revivalsOf(year, 4, 'eu')) expect(event).toBeUndefined();
    }
  });

  it('diz o formato original quando o jogo usa outro', () => {
    const all = Array.from({ length: 10 }, (_, index) => revivalsOf(2027 + index, 1, 'eu')).flat();
    const gsl = all.find((event) => /GSL/.test(event.note ?? ''));
    expect(gsl?.note).toMatch(/Formato original: .*; aqui: /);
    expect(all.every((event) => /Retorno fictício/.test(event.note ?? ''))).toBe(true);
  });

  it('teto: no máximo 6 Tier S fora os Majors e 2 campeonatos por mês', () => {
    for (let index = 0; index < 40; index += 1) {
      const events = seasonEvents(1, 'eu', 12, `cap-${index}`, 2027 + (index % 8));
      expect(events.filter((event) => event.tier === 'S').length).toBeLessThanOrEqual(S_TIER_CAP);
      const months = new Map<number, number>();
      for (const event of events) months.set(event.month, (months.get(event.month) ?? 0) + 1);
      for (const [, count] of months) expect(count).toBeLessThanOrEqual(2);
    }
  });
});
