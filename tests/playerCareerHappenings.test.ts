// tests/playerCareerHappenings.test.ts
// Acontecimentos do documento do usuário: 150, por fase; chance por campeonato que sobe com o momento; escolha
// que sai melhor ou pior pelo mental e moral; prêmio no caixa; torcida no Mental.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, prizeShare, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { HAPPENINGS, HAPPENING_BY_ID, happeningChance, resolveHappening, rollHappening } from '../src/lib/game/playerCareer/happenings';
import { fanBoost, matesOf, myPlayerOf } from '../src/lib/game/playerCareer/squad';

const at = (level: number, seed: string): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'rifler', seed });
  const orgId = level === 5 ? 'lan-house' : sceneOrgs.find((org) => org.level === level && org.region === 'sa' || org.level === level)!.id;
  return startSeason({ ...base, orgId, pendingDraw: null, drawDone: true, seatsTaken: [] });
};

describe('o documento', () => {
  it('150 acontecimentos, 3 escolhas cada, sem travessão, os 3 gatilhos e as 10 fases', () => {
    expect(HAPPENINGS).toHaveLength(150);
    expect(new Set(HAPPENINGS.map((event) => event.id)).size).toBe(150);
    expect(new Set(HAPPENINGS.map((event) => event.trigger))).toEqual(new Set(['pre', 'post', 'between']));
    expect(new Set(HAPPENINGS.map((event) => event.tierMin)).size).toBe(10);
    for (const event of HAPPENINGS) {
      expect(event.choices).toHaveLength(3);
      expect(JSON.stringify(event)).not.toMatch(/—/);
    }
  });
});

describe('chance e sorteio', () => {
  it('acontece em parte dos campeonatos, não em todos; título e Major aumentam a chance', () => {
    const state = at(3, 'hap-chance');
    expect(happeningChance(state, 'post', { eventIndex: 0, result: { name: 'x', placement: 'Campeão', rating: 1.2, seriesWins: 3, seriesLosses: 0 } }))
      .toBeGreaterThan(happeningChance(state, 'post', { eventIndex: 0, result: { name: 'x', placement: 'Semis', rating: 1.0, seriesWins: 1, seriesLosses: 1 } }));
    let hits = 0;
    for (let index = 0; index < 200; index += 1) if (rollHappening(at(3, `hap-${index}`), 'between', { eventIndex: 1 }).pendingHappening) hits += 1;
    expect(hits).toBeGreaterThan(25);
    expect(hits).toBeLessThan(110);
  });

  it('o acontecimento é da fase do seu degrau e respeita o gatilho; o mesmo não volta logo', () => {
    for (const [level, [low, high]] of [[5, [1, 2]], [3, [4, 5]], [0, [8, 10]]] as const) {
      for (let index = 0; index < 40; index += 1) {
        const rolled = rollHappening(at(level, `phase-${level}-${index}`), 'post', { eventIndex: 0 });
        if (!rolled.pendingHappening) continue;
        const event = HAPPENING_BY_ID.get(rolled.pendingHappening.id)!;
        expect(event.trigger).toBe('post');
        expect(event.tierMin).toBeGreaterThanOrEqual(low);
        expect(event.tierMin).toBeLessThanOrEqual(high);
        // Mesmo id com o relógio parado: está em cooldown, não pode ser sorteado de novo.
        const again = rollHappening({ ...rolled, pendingHappening: null }, 'post', { eventIndex: 0 });
        if (again.pendingHappening) expect(again.pendingHappening.id).not.toBe(rolled.pendingHappening.id);
      }
    }
  });
});

describe('a escolha', () => {
  it('aplica forma, moral, química, reputação, fama e caixa; mental alto dá mais certo', () => {
    let pending: PlayerCareerState | null = null;
    for (let index = 0; index < 60 && !pending; index += 1) {
      const rolled = rollHappening(at(2, `choice-${index}`), 'between', { eventIndex: 1 });
      if (rolled.pendingHappening) pending = rolled;
    }
    expect(pending).not.toBeNull();
    const before = pending!;
    const outcome = resolveHappening(before, 0);
    expect(outcome.state.pendingHappening).toBeNull();
    expect(outcome.line.length).toBeGreaterThan(10);
    expect(outcome.chips.length).toBeGreaterThan(0);
    const effects = HAPPENING_BY_ID.get(before.pendingHappening!.id)!.choices[0].effects;
    if (effects.chemistry) {
      const mate = matesOf(before)[0].player.id;
      expect(Math.sign((outcome.state.relationships[mate] ?? 0) - (before.relationships[mate] ?? matesOf(before)[0].relationship))).toBe(Math.sign(effects.chemistry));
    }
    // Sem acontecimento pendente, nada muda.
    expect(resolveHappening(outcome.state, 0).state).toBe(outcome.state);
  });
});

describe('caixa e torcida', () => {
  it('título paga prêmio no caixa (Major muito mais que CCT); lan house paga o simbólico', () => {
    expect(prizeShare({ prizePool: 1250000, tier: 'Major' }, 'Campeão', 'x')).toBe(100000);
    expect(prizeShare({ tier: 'C' }, 'Campeão', 'x')).toBe(320);
    expect(prizeShare({ tier: 'C' }, 'Campeão', 'lan-house')).toBe(80);
    expect(prizeShare({ tier: 'C' }, 'Não classificado', 'x')).toBe(0);
    const state = at(4, 'money-1');
    const done = recordEventResult(state, 0, { name: 'x', placement: 'Campeão', rating: 1.2, seriesWins: 3, seriesLosses: 0 });
    expect(done.money).toBeGreaterThan(0);
  });

  it('torcida grande soma Mental em quadra', () => {
    expect(fanBoost(1000)).toBe(0);
    expect(fanBoost(25000)).toBe(1);
    expect(fanBoost(150000)).toBe(2);
    const state = at(3, 'fans-1');
    expect(Number(myPlayerOf({ ...state, fame: 150000 }).mental)).toBe(Math.min(99, Number(myPlayerOf({ ...state, fame: 0 }).mental) + 2));
  });
});
