// src/lib/game/playerCareer/calendar.ts
// O calendário da temporada com campeonatos REAIS: o catálogo de eventos da Dinastia (circuit-events.game.json:
// organizador, premiação, local) e os campeonatos que a coleta da cena 2026 registrou por time (IEM, BLAST
// Bounty, Thunderpick, CCT por região, Gamers Club Série A, ESL Challenger League). Cada nível joga o seu
// circuito, com mês, tier do evento e formato (mata-mata de 8, suíça de 16 ou Major com stages).
import circuitEventsJson from '$lib/data/cs/circuit-events.game.json';
import { createSeededRng } from '../simulation';

export type EventTier = 'Major' | 'S' | 'A' | 'B' | 'C';
export type EventFormat = 'bracket8' | 'swiss16' | 'major';

export interface EventTemplate {
  name: string;
  tier: EventTier;
  month: number;
  format: EventFormat;
  finalBestOf: 3 | 5;
  organizer?: string;
  location?: string;
  prizePool?: number;
}

interface RealCircuitEvent { year: number; name: string; organizer: string; tier: 'elite' | 'open'; teams: number; prizePool: number; location: string }
const REAL = circuitEventsJson as RealCircuitEvent[];

/** Os eventos reais mais recentes do catálogo (2025-2026), sem o ano no nome: o ano entra pela temporada. */
const catalog = (name: string): Partial<EventTemplate> => {
  const found = [...REAL].reverse().find((event) => event.name.replace(/\s*20\d\d\s*/, ' ').trim().startsWith(name));
  return found ? { organizer: found.organizer, location: found.location, prizePool: found.prizePool } : {};
};

const E = (name: string, tier: EventTier, month: number, format: EventFormat = 'bracket8', finalBestOf: 3 | 5 = 3): EventTemplate =>
  ({ name, tier, month, format, finalBestOf, ...catalog(name) });

/** Os dois Majors do ano (o de Colônia está na coleta da cena 2026). */
export const MAJORS: EventTemplate[] = [
  E('IEM Cologne Major', 'Major', 6, 'major', 5),
  E('Major de Dezembro', 'Major', 12, 'major', 5)
];

/** Elite: tier S e tier 1. */
const ELITE: EventTemplate[] = [
  E('BLAST Bounty Winter', 'A', 1),
  E('Intel Extreme Masters Kraków', 'S', 2, 'swiss16', 5),
  E('BLAST Open Spring', 'S', 3, 'swiss16', 5),
  E('Intel Extreme Masters Rio', 'A', 4),
  E('PGL Bucharest', 'A', 4),
  E('Intel Extreme Masters Atlanta', 'A', 5),
  E('Esports World Cup', 'S', 8, 'swiss16', 5),
  E('FISSURE Playground', 'A', 9),
  E('CS Asia Championships', 'A', 9),
  E('Intel Extreme Masters Beijing', 'A', 10),
  E('StarLadder StarSeries Fall', 'A', 10),
  E('BLAST Bounty Fall', 'A', 11)
];

/** Tier 2: eventos B e abertos. */
const TIER2: EventTemplate[] = [
  E('BLAST Bounty Winter · qualificatória', 'B', 1),
  E('Thunderpick World Championship', 'B', 2),
  E('PGL Bucharest · qualificatória', 'B', 3),
  E('Asian Champions League', 'B', 4),
  E('ESL Challenger League · finais', 'B', 5),
  E('Thunderpick World Championship · Europa', 'B', 7),
  E('CCT Global Finals', 'B', 8),
  E('StarLadder StarSeries Fall · qualificatória', 'B', 9),
  E('FISSURE Playground · qualificatória', 'B', 10),
  E('BLAST Bounty Fall · qualificatória', 'B', 11)
];

export type Region = 'sa' | 'na' | 'eu' | 'asia' | 'oce';
const REGION_OF: Record<string, Region> = {
  Brazil: 'sa', Argentina: 'sa', Chile: 'sa', Uruguay: 'sa', Peru: 'sa', Colombia: 'sa', Paraguay: 'sa', Bolivia: 'sa', Venezuela: 'sa', Ecuador: 'sa',
  'United States': 'na', USA: 'na', Canada: 'na', Mexico: 'na', Guatemala: 'na',
  China: 'asia', Mongolia: 'asia', Japan: 'asia', 'South Korea': 'asia', Korea: 'asia', India: 'asia', Indonesia: 'asia', Philippines: 'asia', Thailand: 'asia', Vietnam: 'asia', Malaysia: 'asia', Singapore: 'asia', Kazakhstan: 'asia', Uzbekistan: 'asia', 'Hong Kong': 'asia', Taiwan: 'asia',
  Australia: 'oce', 'New Zealand': 'oce'
};
export const regionOf = (country: string | null | undefined): Region => (country ? REGION_OF[country] ?? 'eu' : 'eu');
const CCT_REGION: Record<Region, string> = { sa: 'CCT South America', na: 'CCT North America', eu: 'CCT Europe', asia: 'CS Asia · circuito', oce: 'CCT Oceania' };
const ECL_REGION: Record<Region, string> = { sa: 'ESL Challenger League South America', na: 'ESL Challenger League North America', eu: 'ESL Challenger League Europe', asia: 'ESL Challenger League Asia-Pacific', oce: 'ESL Challenger League Asia-Pacific' };

/** Challenger: liga regional, qualificatórias e os eventos C mais fortes. */
function challengerPool(region: Region): EventTemplate[] {
  return [
    E(`${ECL_REGION[region]} · Temporada 1`, 'C', 2),
    E(`${CCT_REGION[region]} · Series 3`, 'C', 3),
    E('FISSURE Playground · fase aberta', 'C', 4),
    E(`${ECL_REGION[region]} · Temporada 2`, 'C', 5),
    E(`${CCT_REGION[region]} · Series 7`, 'C', 6),
    E('CS Asia Championships · qualificatória', 'C', 7),
    E(`${ECL_REGION[region]} · Temporada 3`, 'C', 8),
    E('Thunderpick World Championship · qualificatória', 'C', 9),
    E(`${CCT_REGION[region]} · Series 12`, 'C', 10),
    E('CCT Global Finals · qualificatória', 'C', 11),
    E(`${ECL_REGION[region]} · finais regionais`, 'C', 12)
  ];
}

const MONTH_GC = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** CCT/GC: séries do CCT da região e, no Brasil, a Liga Série A da Gamers Club. */
function circuitPool(region: Region): EventTemplate[] {
  const series = Array.from({ length: 12 }, (_, index) => E(`${CCT_REGION[region]} · Series ${index + 1}`, 'C', index + 1));
  if (region !== 'sa') return series;
  const gc = MONTH_GC.map((month, index) => E(`Gamers Club Liga Série A · ${month}`, 'C', index + 1));
  return series.flatMap((event, index) => [event, gc[index]]);
}

const lanPool = (): EventTemplate[] => Array.from({ length: 12 }, (_, index) => E(`Circuito amador da lan house · Etapa ${index + 1}`, 'C', index + 1));

/** Quantos campeonatos cada nível joga por temporada (sorteado pela seed): Tier S e 1 8-12, Tier 2 8-10,
 *  Challenger 8-11, CCT/GC 9-12, lan house 6. */
export const EVENT_RANGE: Record<number, [number, number]> = { 0: [8, 12], 1: [8, 12], 2: [8, 10], 3: [8, 11], 4: [9, 12], 5: [6, 6] };

export function eventCount(level: number, seed: string): number {
  const [min, max] = EVENT_RANGE[level] ?? [8, 10];
  return min + Math.floor(createSeededRng(`${seed}:count`)() * (max - min + 1));
}

/** Sorteia `count` campeonatos do circuito do nível (sem repetir), em ordem de mês. Tier S e 1 sempre têm os 2 Majors. */
export function seasonEvents(level: number, region: Region, count: number, seed: string): EventTemplate[] {
  const rng = createSeededRng(`${seed}:events`);
  const pick = (pool: EventTemplate[], amount: number) => {
    const copy = [...pool];
    const chosen: EventTemplate[] = [];
    while (chosen.length < amount && copy.length) chosen.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
    return chosen;
  };
  let events: EventTemplate[];
  if (level <= 1) events = [...MAJORS, ...pick(ELITE, count - 2)];
  else if (level === 2) events = [...pick(TIER2, count - 1), MAJORS[0]];
  // Challenger também pode pegar o Major (Stage 1) se o ranking da temporada deixar.
  else if (level === 3) events = [...pick(challengerPool(region), count - 1), MAJORS[0]];
  else if (level === 4) events = pick(circuitPool(region), count);
  else events = lanPool().slice(0, count);
  return events.sort((a, b) => a.month - b.month);
}

export const MONTH_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const TIER_LABEL: Record<EventTier, string> = { Major: 'Major', S: 'Tier S', A: 'Tier A', B: 'Tier B', C: 'Tier C' };
