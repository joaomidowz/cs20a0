// tests/onlinePartyVariance.test.ts
// Menos underdog na FESTA (2+ humanos): as séries COM time de jogador jogam com variância achatada (mapa, ruído,
// pistola) sem tocar no nível de ninguém — skill converte mais. Solo e bot-vs-bot ficam com o dado cheio.
import { describe, expect, it } from 'vitest';
import { PARTY_VARIANCE_SCALE } from '../src/lib/game/balance';
import { withPlayerBand } from '../src/lib/game/courtPower';
import { createMapState } from '../src/lib/game/rounds';
import { createSeededRng } from '../src/lib/game/simulation';
import { createLiveSeries, runSeriesToEnd, toSeriesResult } from '../src/lib/game/online/live-series';
import { createTournamentEngine, runTournamentToEnd, startNextRound, toResult } from '../src/lib/game/online/tournament-engine';
import type { CombatTeam } from '../src/lib/game/types';
import { LAB, LAB_BOTS, labBot, labLineup, type LabSide } from './helpers/balanceLab';
import type { TournamentOrganization } from '../src/lib/game/online/tournament';


const team = (side: LabSide, id: string): CombatTeam => ({ ...side.team, id, name: id });

describe('escala de variância da série', () => {
  it('escala ausente e escala 1 são o MESMO jogo, seed a seed (determinismo preservado)', () => {
    const a = labLineup(LAB.goatsBuilt);
    const b = labBot(LAB_BOTS.campeao);
    const play = (varianceScale?: number) => {
      const state = createLiveSeries({
        id: 'det', phase: 'final', bestOf: 3, teamA: team(a, 'a'), teamB: team(b, 'b'),
        seed: 'party-det:1', mode: 'premier', strategies: { a: a.strategy, b: b.strategy },
        rosters: { a: a.roster, b: b.roster }, controllers: { a: 'bot', b: 'bot' },
        interactiveVeto: false, powerScale: 'court', ...(varianceScale !== undefined ? { varianceScale } : {})
      });
      runSeriesToEnd(state);
      const result = toSeriesResult(state);
      return { winnerId: result.winnerId, scores: result.maps.map((map) => `${map.scoreA}-${map.scoreB}`).join(',') };
    };
    expect(play()).toEqual(play(1));
    expect(play()).toEqual(play());
  });

  it('a escala achata o swing de mapa na METADE exata (mesma semente, metade do desvio)', () => {
    const base = { id: 'a', name: 'a', power: 120, mental: 85, clutch: 85, experience: 85, consistency: 0 } as unknown as CombatTeam;
    const delta = (varianceScale: number, seed: string) => {
      const state = createMapState(base, { ...base, id: 'b' }, {
        rng: createSeededRng(`party-swing:${seed}`),
        varianceScale,
        controllers: { a: 'bot', b: 'bot' }
      });
      return state.teams.a.team.power - base.power;
    };
    let measured = 0;
    for (let seed = 0; seed < 20; seed += 1) {
      const full = delta(1, String(seed));
      const half = delta(0.5, String(seed));
      expect(half, `seed ${seed}`).toBeCloseTo(full / 2, 10);
      if (Math.abs(full) > 1) measured += 1;
    }
    expect(measured).toBeGreaterThan(5); // o desvio existe de verdade para medir
  });
});

describe('fiação da festa no motor de torneio', () => {
  it('varianceFor marca as séries com humano; bot-vs-bot fica em 1', () => {
    const a = labLineup(LAB.goatsBuilt);
    const bot = labBot(LAB_BOTS.semifinal);
    const humans: TournamentOrganization[] = [
      { id: 'h1', name: 'H1', seed: 1, team: team(a, 'h1'), human: true },
      { id: 'h2', name: 'H2', seed: 2, team: team({ ...a, team: { ...a.team, power: withPlayerBand(a.team.power - 20) } }, 'h2'), human: true }
    ];
    const bots: TournamentOrganization[] = Object.values(LAB_BOTS).map((teamId, index) => {
      const side = labBot(teamId);
      return { id: `bt${index}`, name: side.team.name, seed: 3 + index, team: team(side, `bt${index}`), human: false };
    });
    const engine = createTournamentEngine({
      organizations: humans,
      botPool: bots,
      entryStage: 'playoffs',
      seed: 'party-wire',
      powerScale: 'court',
      controllerFor: (organization) => organization.human ? 'human' : 'bot',
      interactiveVeto: (left, right) => left.human && right.human,
      varianceFor: (left, right) => left.human || right.human ? PARTY_VARIANCE_SCALE : 1
    });
    const round = startNextRound(engine);
    for (const series of round.series) {
      const withHuman = [series.config.teamA.id, series.config.teamB.id].some((id) => id === 'h1' || id === 'h2');
      expect(series.config.varianceScale, `${series.config.teamA.id} × ${series.config.teamB.id}`).toBe(withHuman ? PARTY_VARIANCE_SCALE : 1);
    }
  });
});
