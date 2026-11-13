// tests/playerCareerRecruit.test.ts
// Regras v2 do mundo (estrela não fica sem renovação; free agent forte é disputado) e chamar um jogador sem time para o
// seu time (vai para o banco; você escolhe quem ele substitui; o mundo tira ele do mercado na temporada seguinte).
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { memberCatalogOverall, sceneOrgById } from '../src/lib/game/playerCareer/data';
import { canRecruit, ensureSquad, isWorldFreeAgent, matesOf, planOf, promoteReserve, recruitFreeAgent, registerCareerWorld } from '../src/lib/game/playerCareer/squad';
import { scoutPlayers } from '../src/lib/game/playerCareer/scout';
import { freeAgentsIn, registerBenchStart, registerCareerTaken, registerContractStart, registerWorldRules, worldHistory, worldRosters } from '../src/lib/game/playerCareer/world';

const FAZE = 'faze-clan-2026';
const overallOf = (member: { overall?: number } & Parameters<typeof memberCatalogOverall>[0]) => member.overall ?? memberCatalogOverall(member) ?? 0;

/** Liga banco, contratos e (se pedir) as regras v2 para a seed, roda e desliga. */
function withRules<T>(seed: string, v2: boolean, run: () => T): T {
  registerBenchStart(seed, 2);
  registerContractStart(seed, 2);
  if (v2) registerWorldRules(seed, 2);
  try {
    return run();
  } finally {
    registerBenchStart(seed, undefined);
    registerContractStart(seed, undefined);
    registerWorldRules(seed, undefined);
  }
}

describe('regras v2 do mundo', () => {
  it('estrela (90+) não sai por fim de contrato com as regras v2; nas regras antigas saía', () => {
    const starsLeaving = (v2: boolean) => {
      let count = 0;
      for (let index = 0; index < 20; index += 1) {
        const seed = `v2-estrela-${index}`;
        withRules(seed, v2, () => {
          for (let season = 2; season <= 6; season += 1) {
            const leaving = worldHistory(seed, season).benchMoves.filter((move) => move.kind === 'contractEnd');
            const free = freeAgentsIn(seed, season);
            for (const move of leaving) {
              const entry = free.find((candidate) => candidate.member.nick.toLowerCase() === move.nick.toLowerCase());
              if (entry && overallOf(entry.member) >= 90) count += 1;
            }
          }
        });
      }
      return count;
    };
    expect(starsLeaving(true)).toBe(0);
    expect(starsLeaving(false)).toBeGreaterThan(0);
  }, 300000);

  it('free agent forte (85+) quase sempre acha time na virada seguinte com as regras v2', () => {
    let strong = 0;
    let stillFree = 0;
    for (let index = 0; index < 10; index += 1) {
      const seed = `v2-fa-${index}`;
      withRules(seed, true, () => {
        for (let season = 2; season <= 5; season += 1) {
          const next = new Set(freeAgentsIn(seed, season + 1).map((entry) => entry.member.nick.toLowerCase()));
          for (const entry of freeAgentsIn(seed, season).filter((candidate) => overallOf(candidate.member) >= 85)) {
            strong += 1;
            if (next.has(entry.member.nick.toLowerCase())) stillFree += 1;
          }
        }
      });
    }
    expect(strong).toBeGreaterThan(0);
    expect(stillFree / strong).toBeLessThan(0.35);
  }, 300000);

  it('save de antes das regras v2: elas só valem a partir da próxima temporada', () => {
    const career = createPlayerCareer({ nick: 'v2', country: 'Brazil', role: 'awper', seed: 'v2-save' });
    expect(career.worldRulesFrom).toBe(2);
    const { worldRulesFrom: _drop, ...old } = { ...career, seasonNumber: 5 };
    expect(ensureSquad(old as PlayerCareerState).worldRulesFrom).toBe(6);
  });
});

describe('chamar um jogador sem time', () => {
  const atFaze = (seed: string, extra: Partial<PlayerCareerState> = {}): PlayerCareerState => {
    const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
    return startSeason({ ...base, orgId: FAZE, pendingDraw: null, drawDone: true, seatsTaken: [], ...extra });
  };

  it('topou: vai para o seu banco, a busca mostra no seu banco, e dá para pôr no lugar de um parceiro', () => {
    let signed = 0;
    for (let index = 0; index < 20 && !signed; index += 1) {
      const state = ensureSquad(atFaze(`recruta-${index}`, { overall: 95, reputation: 95, fame: 80000 }));
      registerCareerWorld(state);
      const target = freeAgentsIn(state.seed, state.seasonNumber).sort((left, right) => overallOf(right.member) - overallOf(left.member))[0];
      const nick = target.member.nick;
      expect(isWorldFreeAgent(state, nick)).toBe(true);
      const result = recruitFreeAgent(state, nick);
      expect(canRecruit(result.state)).toBe(false); // uma vez por temporada
      if (!result.accepted) continue;
      signed += 1;
      const reserve = planOf(result.state).reserve!;
      expect(reserve.nick.toLowerCase()).toBe(nick.toLowerCase());
      expect(reserve.fromWorld).toBe(state.seasonNumber);
      registerCareerWorld(result.state);
      const [hit] = scoutPlayers(result.state, nick).filter((entry) => entry.nick.toLowerCase() === nick.toLowerCase());
      expect(hit).toMatchObject({ status: 'reserva', orgId: FAZE });
      // Escolho quem ele substitui: entra no time, e o mundo tira ele do mercado a partir da temporada seguinte.
      const mate = matesOf(result.state)[0];
      const { state: promoted } = promoteReserve(result.state, mate.player.id);
      expect(promoted.careerMembers?.some((member) => member.nick.toLowerCase() === nick.toLowerCase() && member.fromWorld === state.seasonNumber)).toBe(true);
      expect(matesOf(promoted).some((other) => other.player.nickname?.toLowerCase() === nick.toLowerCase())).toBe(true);
    }
    expect(signed).toBe(1);
  });

  it('o mundo não oferece a mais ninguém quem a sua carreira contratou (a partir da temporada seguinte)', () => {
    const seed = 'recruta-mundo';
    const nick = freeAgentsIn(seed, 1)[0].member.nick;
    withRules(seed, true, () => {
      registerCareerTaken(seed, [{ nick, since: 1 }]);
      try {
        expect(freeAgentsIn(seed, 1).some((entry) => entry.member.nick === nick)).toBe(true); // a temporada dele não muda
        for (let season = 2; season <= 4; season += 1) {
          expect(freeAgentsIn(seed, season).some((entry) => entry.member.nick === nick)).toBe(false);
          const starters = [...worldRosters(seed, season).values()].flat();
          expect(starters.some((member) => member.nick === nick)).toBe(false);
        }
      } finally {
        registerCareerTaken(seed, []);
      }
    });
    expect(sceneOrgById.has(FAZE)).toBe(true);
  });

  it('na lan house não dá para chamar ninguém', () => {
    const career = createPlayerCareer({ nick: 'lan', country: 'Brazil', role: 'rifler', seed: 'recruta-lan' });
    expect(canRecruit(career)).toBe(false);
  });
});
