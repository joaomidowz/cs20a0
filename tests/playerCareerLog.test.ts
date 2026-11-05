// tests/playerCareerLog.test.ts
// Aba "Histórico": decisões com a escolha e como saiu, conversas guardadas, marcas com acento e quem está
// atravessado. Save antigo (sem nada disso) abre vazio, sem quebrar.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { careerLog } from '../src/lib/game/playerCareer/careerLog';
import { DEFAULT_LIFE } from '../src/lib/game/playerCareer/life';

const base = (): PlayerCareerState => {
  const career = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'awper', seed: 'log-1' });
  const org = sceneOrgs.find((candidate) => candidate.name === 'MIBR')!;
  return startSeason({ ...career, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
};

describe('histórico da carreira', () => {
  it('save antigo abre vazio', () => {
    const log = careerLog(base());
    expect(log.decisions).toEqual([]);
    expect(log.talks).toEqual([]);
    expect(log.marks).toEqual([]);
  });

  it('mostra a escolha, como saiu, as conversas e as marcas com acento (mais novo primeiro)', () => {
    const state: PlayerCareerState = {
      ...base(),
      happeningHistory: [
        { id: 'EV010', season: 1, year: 2026, month: 1, severity: 'comum', choice: 1, success: true },
        { id: 'dilema-001', season: 1, year: 2026, month: 2, severity: 'moderado', choice: 0, success: true, line: 'Voltar ao país de origem' }
      ],
      talkMemory: { n: 1, used: {}, log: [{ season: 1, who: 'x', name: 'apEX', situation: 'conflito', answer: 'firme', delta: -4 }], grudges: { x: 1 } },
      life: { ...DEFAULT_LIFE, flags: ['pressao_publica:risco', 'dilema-001:A', 'visita_familia_planejada'] }
    };
    const log = careerLog(state);
    expect(log.decisions[0].kind).toBe('Dilema');
    expect(log.decisions[1].success).toBe(true);
    expect(log.talks[0].answer).toBe('Bater de frente');
    expect(log.marks).toContain('pressão pública (risco)');
    expect(log.marks).toContain('visita à família planejada');
    expect(log.marks.some((mark) => /dilema/.test(mark))).toBe(false);
    expect(log.grudges).toEqual(['apEX']);
  });
});
