// src/lib/game/playerCareer/calibration.ts
// Medição da Carreira com o motor de verdade: quantos títulos e finais o seu time ganha num nível de campeonato,
// com você numa força, a química do elenco e um jeito de decidir as calls (nenhuma, ao acaso, sempre a certa, sempre
// a errada, sempre o mesmo estilo). Serve para calibrar "nº 1 do mundo com você ganha 25% a 40%". Só leitura: não
// muda nenhum estado salvo.
import type { ClutchProfile } from './decisions';
import type { EventTier } from './calendar';
import { sceneOrgs } from './data';
import { createPlayerCareer, startSeason, type PlayerCareerState, type PlayerRole } from './engine';
import { simulateSceneEvent, type CallPolicy } from './live';
import { matesOf, myPlayerOf } from './squad';

export interface TitleScenario {
  orgName: string;
  overall: number;
  /** Relação com todos os parceiros (0-100). */
  relationship: number;
  tier: EventTier;
  seeds: number;
  policy: CallPolicy;
  style?: ClutchProfile;
  role?: PlayerRole;
  seedPrefix?: string;
}

export interface TitleMeasure { events: number; titles: number; finals: number; titleRate: number; finalRate: number; dynastyChance: number; /** Posição média da força do seu time no campeonato (1 = o mais forte). */ powerRank: number }

/** Chance de 5+ títulos numa temporada de `events` campeonatos com a taxa medida (binomial). */
export function dynastyChance(titleRate: number, events = 10, needed = 5): number {
  let total = 0;
  for (let wins = needed; wins <= events; wins += 1) {
    let combinations = 1;
    for (let index = 0; index < wins; index += 1) combinations = (combinations * (events - index)) / (index + 1);
    total += combinations * titleRate ** wins * (1 - titleRate) ** (events - wins);
  }
  return total;
}

/** A carreira de teste: você no time, com a força e a química pedidas, no começo da temporada. */
export function scenarioState(scenario: TitleScenario, index: number): PlayerCareerState | null {
  const org = sceneOrgs.find((candidate) => candidate.name === scenario.orgName);
  if (!org) return null;
  const seed = `${scenario.seedPrefix ?? 'calib'}-${index}`;
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: scenario.role ?? 'awper', seed });
  let state = startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [], overall: scenario.overall, truePotential: scenario.overall, age: 24 });
  const relationships: Record<string, number> = {};
  for (const mate of matesOf(state)) relationships[mate.player.id] = scenario.relationship;
  state = { ...state, relationships, languages: { en: 95 } };
  return state;
}

export function measureTitles(scenario: TitleScenario): TitleMeasure {
  let events = 0;
  let titles = 0;
  let finals = 0;
  let rankSum = 0;
  for (let index = 0; index < scenario.seeds; index += 1) {
    const state = scenarioState(scenario, index);
    if (!state?.calendar) continue;
    const eventIndex = state.calendar.findIndex((entry) => (scenario.tier === 'Major' ? entry.format === 'major' : entry.format !== 'major' && entry.tier === scenario.tier));
    if (eventIndex < 0) continue;
    const mates = matesOf(state);
    const calls = {
      policy: scenario.policy,
      role: state.role,
      seed: `${state.seed}:calls`,
      playerOverall: myPlayerOf(state).overall ?? scenario.overall,
      matesOverall: mates.reduce((sum, mate) => sum + (mate.player.overall ?? 70), 0) / Math.max(1, mates.length),
      chemistry: scenario.relationship,
      ...(scenario.style ? { style: scenario.style } : {})
    };
    const outcome = simulateSceneEvent(state, eventIndex, undefined, null, { wins: 0, losses: 0 }, calls);
    const campaign = outcome.campaign;
    if (campaign) {
      const powers = [...campaign.engine.byId.values()].map((org) => ({ id: org.id, power: org.team.power })).sort((a, b) => b.power - a.power);
      rankSum += powers.findIndex((entry) => entry.id === campaign.userTeamId) + 1;
    }
    events += 1;
    if (outcome.result.placement === 'Campeão') titles += 1;
    if (outcome.result.placement === 'Campeão' || outcome.result.placement === 'Vice') finals += 1;
  }
  const titleRate = events ? titles / events : 0;
  return { events, titles, finals, titleRate, finalRate: events ? finals / events : 0, dynastyChance: dynastyChance(titleRate), powerRank: events ? rankSum / events : 0 };
}
