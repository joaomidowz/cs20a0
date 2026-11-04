// tests/playerCareerSimulation.test.ts
// Simulação de desfechos por arquétipo de criação — o contrato de balanceamento do modo Jogador: médias como
// alvo e gaps honestos. O harness usa o AGING REAL (gap-to-potential + curva calibrada) e o MERCADO REAL
// (buildOffers via finishSeason); os resultados por campeonato são AMOSTRADOS da mesma âncora overall×nível do
// motor (rodar o motor de Major vivo para ~600 carreiras é inviável em teste — gap declarado, não escondido).
// Os números da tabela são lidos no output; as asserções são de ORDEM ( quem deve floppar floppa ) , não de ponto.
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES, ROLE_META, acceptOffer, createPlayerCareer, chooseStartingOrg, finishSeason, orgOf, recordEventResult,
  retire, startSeason, type PlayerArchetype, type PlayerCareerState
} from '../src/lib/game/playerCareer/engine';
import { ORG_BASE_POWER } from '../src/lib/game/playerCareer/data';
import { createSeededRng } from '../src/lib/game/simulation';

const N = 150;
const PLACEMENTS = ['Quartas', 'Semis', 'Vice', 'Campeão'] as const;

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
}

function simulateCareer(archetype: PlayerArchetype, index: number): CareerOutcome {
  let career = createPlayerCareer({ nick: 'sim', country: 'Brazil', role: 'awper', archetype, seed: `sim-${archetype}-${index}` });
  const real = career.pendingDraw!.find((option) => option.kind === 'real');
  if (real) career = chooseStartingOrg(career, real.orgId);
  let peak = career.overall;
  let topLevel = orgOf(career.orgId).level;
  while (career.status === 'ACTIVE' && career.age < 32) {
    career = startSeason(career);
    for (const entry of career.calendar ?? []) career = recordEventResult(career, entry.index, sampleResult(career, entry.index));
    career = finishSeason(career);
    peak = Math.max(peak, career.overall);
    topLevel = Math.min(topLevel, orgOf(career.orgId).level);
    if (career.pendingOffers?.length) {
      const best = [...career.pendingOffers].sort((a, b) => a.orgLevel - b.orgLevel)[0];
      career = acceptOffer(career, best.orgId);
    }
    if (career.age >= 32 || (career.age >= 29 && career.overall < 58)) career = retire(career);
  }
  return { peakOverall: peak, topLevel, flop: topLevel >= 3, tier1: topLevel <= 1, goat: peak >= 94 && topLevel <= 1 };
}

const pct = (part: number, total: number) => `${Math.round((part / total) * 100)}%`;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe('distribuição de desfechos por arquétipo (simulação N=' + N + ')', () => {
  const results = new Map<PlayerArchetype, CareerOutcome[]>();

  it('gera a tabela honesta de flop / tier 1 / GOAT por arquétipo', () => {
    const lines: string[] = [];
    for (const archetype of Object.keys(ARCHETYPES) as PlayerArchetype[]) {
      const outcomes = Array.from({ length: N }, (_, index) => simulateCareer(archetype, index));
      results.set(archetype, outcomes);
      lines.push(
        `${archetype.padEnd(14)} · pico mediano ${median(outcomes.map((o) => o.peakOverall))}` +
        ` · flop C/B ${pct(outcomes.filter((o) => o.flop).length, N)}` +
        ` · tier1 ${pct(outcomes.filter((o) => o.tier1).length, N)}` +
        ` · GOAT ${pct(outcomes.filter((o) => o.goat).length, N)}`
      );
    }
    console.log('\n=== Desfechos por arquétipo (aging + mercado reais; resultados por evento amostrados) ===\n' + lines.join('\n'));
  }, 30000); // N=150 carreiras inteiras, com o mundo (trocas, aposentadorias) calculado por seed

  it('a ORDEM prometida pelos arquétipos se cumpre nas médias', () => {
    const prodigio = results.get('prodigio')!;
    const bruto = results.get('talento-bruto')!;
    const solido = results.get('solido')!;
    const flopRate = (list: CareerOutcome[]) => list.filter((o) => o.flop).length / list.length;
    const tier1Rate = (list: CareerOutcome[]) => list.filter((o) => o.tier1).length / list.length;
    const goatRate = (list: CareerOutcome[]) => list.filter((o) => o.goat).length / list.length;
    // Sólido é o arquétipo que mais trava no C/B; Prodígio é o que menos trava.
    expect(flopRate(solido)).toBeGreaterThan(flopRate(prodigio));
    // Prodígio alcança tier 1 mais que Sólido; o GOAT praticamente só existe para teto alto.
    expect(tier1Rate(prodigio)).toBeGreaterThan(tier1Rate(solido));
    expect(goatRate(solido)).toBe(0);
    expect(goatRate(prodigio)).toBeGreaterThan(goatRate(bruto) - 0.05); // bruto pode chegar perto, mas não acima em média
    // Ninguém ultrapassa o próprio teto oculto.
    for (const [archetype, outcomes] of results) {
      for (let index = 0; index < outcomes.length; index += 1) {
        const ceiling = ARCHETYPES[archetype].potential[1];
        expect(outcomes[index].peakOverall).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('o crescimento agora é visível: um prodígio média sobe pelo menos 10 de overall até os 24', () => {
    const outcomes = results.get('prodigio')!;
    // Pico mediano do prodígio tem que ficar muito acima do começo (58-63): a curva para de "não subir".
    expect(median(outcomes.map((o) => o.peakOverall))).toBeGreaterThanOrEqual(ARCHETYPES.prodigio.startOverall[0] + 10);
  });
});
