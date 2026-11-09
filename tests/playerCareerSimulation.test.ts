// tests/playerCareerSimulation.test.ts
// Simulação de desfechos por arquétipo de criação — o contrato de balanceamento do modo Jogador: médias como
// alvo e gaps honestos. O harness usa a PROGRESSÃO REAL (growth.ts via finishSeason) e o MERCADO REAL
// (buildOffers via finishSeason); os resultados por campeonato são AMOSTRADOS da mesma âncora overall×nível do
// motor (rodar o motor de Major vivo para ~1200 carreiras é inviável em teste — gap declarado, não escondido).
// Duas rotinas: sem treino e com treino toda semana (a sessão real de growth.ts, com o cansaço da semana e um
// descanso quando passa de 40). As asserções são de ORDEM e de LIMITE, não de ponto; a tabela sai no output.
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES, ROLE_META, acceptOffer, createPlayerCareer, chooseStartingOrg, finishSeason, orgOf, recordEventResult,
  retire, startSeason, type PlayerArchetype, type PlayerCareerState
} from '../src/lib/game/playerCareer/engine';
import { ORG_BASE_POWER } from '../src/lib/game/playerCareer/data';
import { CEILING_BONUS_CAP, countTrainingSession } from '../src/lib/game/playerCareer/growth';
import { TIRED_AT } from '../src/lib/game/playerCareer/agenda';
import { EVENT_FATIGUE, WEEK_RECOVERY } from '../src/lib/game/playerCareer/squad';
import { createSeededRng } from '../src/lib/game/simulation';

const N = 150;
const PLACEMENTS = ['Quartas', 'Semis', 'Vice', 'Campeão'] as const;
/** Cansaço do treino livre de 1 habilidade (agenda.ts: 12 + 2 por habilidade) e de uma carta de descanso. */
const TRAIN_FATIGUE = 14;
const REST = 25;

type Routine = 'none' | 'weekly';

/** Resultado de um campeonato amostrado da âncora overall×nível (mesma forma do motor vivo).
 *  Âncora calibrada p/ o Rating do jogo: overall 60 ≈ 0.95 · 76 ≈ 1.05 · 92 ≈ 1.21 (com viés de função). */
function sampleResult(career: PlayerCareerState, eventIndex: number) {
  const rng = createSeededRng(`${career.seed}:simres:${career.seasonNumber}:${eventIndex}`);
  const level = orgOf(career.orgId).level;
  const role = ROLE_META[career.role];
  const myPower = (ORG_BASE_POWER[level] ?? 60) + (career.overall - 70) * 0.45 + role.teamImpact;
  const oppPower = ORG_BASE_POWER[level] ?? 60;
  const winProb = 1 / (1 + Math.exp(-(myPower - oppPower) / 7));
  let wins = 0;
  for (let round = 0; round < 3; round += 1) {
    if (rng() < winProb) wins += 1;
    else break;
  }
  const rating = Math.min(1.7, Math.max(0.5, 0.95 + (career.overall - 60) * 0.006 + role.ratingBias + (rng() - 0.5) * 2 * role.variance + wins * 0.015));
  return { name: `Evento ${eventIndex + 1}`, placement: PLACEMENTS[wins], rating: Number(rating.toFixed(2)), seriesWins: wins, seriesLosses: 3 - wins };
}

interface CareerOutcome {
  peakOverall: number;
  topLevel: number; // 1 = tier 1 · ≥3 = nunca passou do challenger
  flop: boolean; // nunca saiu do Tier C/B (não alcançou nem o tier 2)
  tier1: boolean;
  goat: boolean; // pico na zona GOAT (≥94) alcançando tier 1
  /** Overall ao fechar a temporada que leva o jogador a cada idade (a idade nova). */
  byAge: Record<number, number>;
}

function simulateCareer(archetype: PlayerArchetype, index: number, routine: Routine): CareerOutcome {
  let career = createPlayerCareer({ nick: 'sim', country: 'Brazil', role: 'awper', archetype, seed: `sim-${archetype}-${index}` });
  const real = career.pendingDraw!.find((option) => option.kind === 'real');
  if (real) career = chooseStartingOrg(career, real.orgId);
  let peak = career.overall;
  let topLevel = orgOf(career.orgId).level;
  let fatigue = 0;
  const byAge: Record<number, number> = {};
  while (career.status === 'ACTIVE' && career.age < 32) {
    career = startSeason(career);
    for (const entry of career.calendar ?? []) {
      if (routine === 'weekly') {
        // Treino livre toda semana: conta para o overall se não está cansado; descansa quando passa de 40.
        if (fatigue < TIRED_AT) career = countTrainingSession(career).state;
        fatigue = Math.min(100, fatigue + TRAIN_FATIGUE);
        if (fatigue >= 40) fatigue = Math.max(0, fatigue - REST);
      }
      career = recordEventResult(career, entry.index, sampleResult(career, entry.index));
      fatigue = Math.max(0, Math.min(100, fatigue + EVENT_FATIGUE - WEEK_RECOVERY));
    }
    career = finishSeason({ ...career, fatigue });
    fatigue = career.fatigue ?? 0;
    peak = Math.max(peak, career.overall);
    byAge[career.age] = career.overall;
    topLevel = Math.min(topLevel, orgOf(career.orgId).level);
    if (career.pendingOffers?.length) {
      const best = [...career.pendingOffers].sort((a, b) => a.orgLevel - b.orgLevel)[0];
      career = acceptOffer(career, best.orgId);
    }
    if (career.age >= 32 || (career.age >= 29 && career.overall < 58)) career = retire(career);
  }
  return { peakOverall: peak, topLevel, flop: topLevel >= 3, tier1: topLevel <= 1, goat: peak >= 94 && topLevel <= 1, byAge };
}

const pct = (part: number, total: number) => `${Math.round((part / total) * 100)}%`;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const p90 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.9)];
const flopRate = (list: CareerOutcome[]) => list.filter((o) => o.flop).length / list.length;
const tier1Rate = (list: CareerOutcome[]) => list.filter((o) => o.tier1).length / list.length;
const goatRate = (list: CareerOutcome[]) => list.filter((o) => o.goat).length / list.length;
const maxedRate = (list: CareerOutcome[]) => list.filter((o) => o.peakOverall >= 99).length / list.length;
const peaks = (list: CareerOutcome[]) => list.map((o) => o.peakOverall);
/** Overall mediano aos `age` anos de quem ainda jogava nessa idade. */
const atAge = (list: CareerOutcome[], age: number) => {
  const values = list.flatMap((o) => (o.byAge[age] === undefined ? [] : [o.byAge[age]]));
  return values.length ? median(values) : '-';
};

describe('distribuição de desfechos por arquétipo (simulação N=' + N + ')', () => {
  const results: Record<Routine, Map<PlayerArchetype, CareerOutcome[]>> = { none: new Map(), weekly: new Map() };

  const run = (routine: Routine) => {
    const lines: string[] = [];
    for (const archetype of Object.keys(ARCHETYPES) as PlayerArchetype[]) {
      const outcomes = Array.from({ length: N }, (_, index) => simulateCareer(archetype, index, routine));
      results[routine].set(archetype, outcomes);
      lines.push(
        `${archetype.padEnd(14)} · pico mediano ${median(peaks(outcomes))} · p90 ${p90(peaks(outcomes))} · 99 ${pct(outcomes.filter((o) => o.peakOverall >= 99).length, N)}` +
        ` · flop C/B ${pct(outcomes.filter((o) => o.flop).length, N)}` +
        ` · tier1 ${pct(outcomes.filter((o) => o.tier1).length, N)}` +
        ` · GOAT ${pct(outcomes.filter((o) => o.goat).length, N)}` +
        ` · aos 19/21/25 ${[19, 21, 25].map((age) => atAge(outcomes, age)).join('/')}`
      );
    }
    console.log(`\n=== Desfechos por arquétipo, treino ${routine === 'none' ? 'nenhum' : 'toda semana'} (progressão + mercado reais; resultados amostrados) ===\n` + lines.join('\n'));
  };

  it('gera a tabela honesta sem treino', () => run('none'), 240000);
  it('gera a tabela honesta com treino toda semana', () => run('weekly'), 240000);

  it('a ORDEM prometida pelos arquétipos se cumpre nas médias, com e sem treino', () => {
    for (const routine of ['none', 'weekly'] as Routine[]) {
      const prodigio = results[routine].get('prodigio')!;
      const bruto = results[routine].get('talento-bruto')!;
      const solido = results[routine].get('solido')!;
      // Sem treino, Sólido trava no C/B mais que Prodígio (o Talento bruto, cru e sem crescimento automático, trava mais
      // ainda: 62% medido; com treino toda semana ninguém dele trava).
      if (routine === 'none') expect(flopRate(solido)).toBeGreaterThan(flopRate(prodigio));
      // Prodígio alcança tier 1 mais que Sólido; o GOAT praticamente só existe para teto alto.
      expect(tier1Rate(prodigio)).toBeGreaterThan(tier1Rate(solido));
      expect(goatRate(solido)).toBe(0);
      expect(goatRate(prodigio)).toBeGreaterThan(goatRate(bruto) - 0.05); // bruto pode chegar perto, mas não acima em média
      // Prodígio continua o arquétipo de pico mais alto.
      for (const other of ['talento-bruto', 'solido', 'tardio'] as PlayerArchetype[]) {
        expect(median(peaks(prodigio))).toBeGreaterThan(median(peaks(results[routine].get(other)!)));
      }
    }
  });

  it('sem treino ninguém passa do próprio teto oculto; com treino, no máximo o teto + o teto conquistado', () => {
    for (const [archetype, outcomes] of results.none) {
      for (const outcome of outcomes) expect(outcome.peakOverall).toBeLessThanOrEqual(ARCHETYPES[archetype].potential[1]);
    }
    for (const [archetype, outcomes] of results.weekly) {
      for (const outcome of outcomes) expect(outcome.peakOverall).toBeLessThanOrEqual(Math.min(99, ARCHETYPES[archetype].potential[1] + CEILING_BONUS_CAP));
    }
  });

  it('treinar toda semana vale (pico mediano +2 ou mais em todo arquétipo) e o 99 continua raro', () => {
    for (const archetype of Object.keys(ARCHETYPES) as PlayerArchetype[]) {
      expect(median(peaks(results.weekly.get(archetype)!))).toBeGreaterThanOrEqual(median(peaks(results.none.get(archetype)!)) + 2);
      expect(maxedRate(results.none.get(archetype)!)).toBe(0);
    }
    expect(maxedRate(results.weekly.get('prodigio')!)).toBeLessThanOrEqual(0.3);
    for (const archetype of ['talento-bruto', 'solido', 'tardio'] as PlayerArchetype[]) {
      expect(maxedRate(results.weekly.get(archetype)!)).toBeLessThanOrEqual(0.05);
    }
  });

  it('sem crescimento automático: sem treino o prodígio sobe só pelo rating, devagar; o treino é o que acelera', () => {
    const none = results.none.get('prodigio')!;
    const weekly = results.weekly.get('prodigio')!;
    // Medido (regra só treino + rating): sem treino 73 aos 19, 79 aos 21; com treino toda semana 90 aos 19, 94 aos 21.
    // Na regra antiga (crescimento pela distância até o teto) eram 86 e 92 aos 19.
    expect(atAge(none, 19)).toBeLessThanOrEqual(ARCHETYPES.prodigio.startOverall[1] + 6);
    expect(atAge(weekly, 19)).toBeGreaterThanOrEqual(Number(atAge(none, 19)) + 10);
    expect(atAge(weekly, 19)).toBeLessThanOrEqual(91);
    // A carreira inteira ainda leva o prodígio longe com rating bom: pico mediano bem acima do começo (65-70).
    expect(median(peaks(none))).toBeGreaterThanOrEqual(ARCHETYPES.prodigio.startOverall[0] + 10);
  });
});
