// src/lib/game/playerCareer/calendar.ts
// O calendário da temporada com campeonatos REAIS: o guia de campeonatos CS2 por tier e região (base de estudo
// do usuário, 2026: Tier S, Tier A internacional e as tabelas regionais A/B/C de SA, EU, NA e Ásia/Oceania) e o
// catálogo de eventos (circuit-events.game.json: organizador, premiação, local). Cada nível joga o seu circuito,
// com mês, tier do evento e formato (mata-mata de 8, suíça de 16 ou Major com stages).
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

interface EventExtra { location?: string; prizePool?: number; organizer?: string }

/** Um evento: o que o guia de campeonatos traz (local, premiação) vence o catálogo. */
const E = (name: string, tier: EventTier, month: number, format: EventFormat = 'bracket8', finalBestOf: 3 | 5 = 3, extra: EventExtra = {}): EventTemplate =>
  ({ name, tier, month, format, finalBestOf, ...catalog(name), ...extra });

/**
 * Os dois Majors do ano (Stage 1, 2 e 3 pelo VRS, final MD5). Datas reais: 2026 IEM Cologne (junho) e PGL
 * Singapore (24/11 a 13/12); 2027 FiReSPORTS Buenos Aires (31/05 a 20/06, o primeiro Major na Argentina) e
 * Perfect World Xangai (22/11 a 12/12). Daí em diante, sedes sorteadas por ano entre as que já receberam Major e
 * algumas novas (dá para repetir cidade).
 */
const MAJOR_HOSTS: Array<[string, string]> = [
  ['IEM Katowice Major', 'Katowice, Polônia'],
  ['BLAST Paris Major', 'Paris, França'],
  ['PGL Major Copenhagen', 'Copenhague, Dinamarca'],
  ['StarLadder Budapest Major', 'Budapeste, Hungria'],
  ['IEM Rio Major', 'Rio de Janeiro, Brasil'],
  ['BLAST.tv Austin Major', 'Austin, Estados Unidos'],
  ['IEM Cologne Major', 'Colônia, Alemanha'],
  ['PGL Major Antwerp', 'Antuérpia, Bélgica'],
  ['Perfect World Shanghai Major', 'Xangai, China'],
  ['FiReSPORTS Major Buenos Aires', 'Buenos Aires, Argentina'],
  ['ESL Major Sydney', 'Sydney, Austrália'],
  ['BLAST Major Londres', 'Londres, Reino Unido'],
  ['PGL Major Bucareste', 'Bucareste, Romênia'],
  ['IEM Major São Paulo', 'São Paulo, Brasil'],
  ['StarLadder Major Kyiv', 'Kyiv, Ucrânia'],
  ['Perfect World Major Pequim', 'Pequim, China']
];

export function majorsOf(year: number): EventTemplate[] {
  const major = (name: string, month: number, location: string) => E(name, 'Major', month, 'major', 5, { location, prizePool: 1250000 });
  if (year <= 2026) return [E('IEM Cologne Major', 'Major', 6, 'major', 5), major('PGL Major Singapore', 11, 'Singapura')];
  if (year === 2027) return [major('FiReSPORTS Major Buenos Aires', 6, 'Buenos Aires, Argentina'), major('Perfect World Shanghai Major', 11, 'Xangai, China')];
  const rng = createSeededRng(`majors:${year}`);
  const first = Math.floor(rng() * MAJOR_HOSTS.length);
  let second = Math.floor(rng() * MAJOR_HOSTS.length);
  if (second === first) second = (second + 1) % MAJOR_HOSTS.length;
  return [major(MAJOR_HOSTS[first][0], 6, MAJOR_HOSTS[first][1]), major(MAJOR_HOSTS[second][0], 11, MAJOR_HOSTS[second][1])];
}

/** Elite mundial (Tier S e Tier A internacional) do guia, com local e premiação. */
function elitePool(year: number): EventTemplate[] {
  return [
    E('BLAST Bounty Winter', 'A', 1),
    E('Intel Extreme Masters Kraków', 'S', 2, 'swiss16', 5),
    E('BLAST Open Spring', 'S', 3, 'swiss16', 5),
    E('ESL Pro League', 'S', 3, 'swiss16', 5, { location: 'Katowice, Polônia', prizePool: 1000000, organizer: 'ESL' }),
    E('PGL Bucharest', 'A', 4),
    E('Intel Extreme Masters Rio', 'A', 4),
    E('Stake Ranked', 'A', 5, 'bracket8', 5, { location: 'Barcelona, Espanha (online)', prizePool: 100000, organizer: 'Stake' }),
    E('Intel Extreme Masters Atlanta', 'A', 5),
    E('XSE Pro League', 'A', 7, 'bracket8', 5, { location: 'Guangzhou, China', prizePool: 1000000 }),
    E('Esports World Cup', 'S', 8, 'swiss16', 5, { location: 'Paris, França', prizePool: 2000000 }),
    // Colônia é o Major de 2026; dali em diante volta a ser IEM Tier S em agosto (guia).
    ...(year >= 2027 ? [E('Intel Extreme Masters Cologne', 'S', 8, 'swiss16', 5, { location: 'Colônia, Alemanha', prizePool: 1000000, organizer: 'ESL' })] : []),
    E('CS Asia Championships', 'S', 9, 'bracket8', 5, { location: 'Xangai, China', prizePool: 1000000 }),
    E('FISSURE Playground', 'A', 9, 'bracket8', 5, { location: 'Suzhou, China', prizePool: 1000000 }),
    E('StarLadder StarSeries Fall', 'S', 10, 'bracket8', 5, { location: 'Barcelona, Espanha', prizePool: 500000 }),
    E('Intel Extreme Masters Beijing', 'S', 10, 'swiss16', 5, { location: 'Pequim, China', prizePool: 1250000 }),
    E('Thunderpick World Championship', 'A', 11, 'bracket8', 5, { location: 'Malta (híbrido)', prizePool: 1000000, organizer: 'Thunderpick' }),
    E('BLAST Rivals Fall', 'S', 11, 'bracket8', 5, { location: 'Chek Lap Kok, Hong Kong', prizePool: 350000, organizer: 'BLAST' }),
    E('BLAST Bounty Fall', 'A', 11)
  ];
}

export type Region = 'sa' | 'na' | 'eu' | 'asia' | 'oce';
const REGION_OF: Record<string, Region> = {
  Brazil: 'sa', Argentina: 'sa', Chile: 'sa', Uruguay: 'sa', Peru: 'sa', Colombia: 'sa', Paraguay: 'sa', Bolivia: 'sa', Venezuela: 'sa', Ecuador: 'sa',
  'United States': 'na', USA: 'na', Canada: 'na', Mexico: 'na', Guatemala: 'na',
  China: 'asia', Mongolia: 'asia', Japan: 'asia', 'South Korea': 'asia', Korea: 'asia', India: 'asia', Indonesia: 'asia', Philippines: 'asia', Thailand: 'asia', Vietnam: 'asia', Malaysia: 'asia', Singapore: 'asia', Kazakhstan: 'asia', Uzbekistan: 'asia', 'Hong Kong': 'asia', Taiwan: 'asia',
  Australia: 'oce', 'New Zealand': 'oce'
};
export const regionOf = (country: string | null | undefined): Region => (country ? REGION_OF[country] ?? 'eu' : 'eu');

/** Nome da região no guia (Ásia e Oceania são uma macrorregião só). */
type GuideRegion = 'sa' | 'eu' | 'na' | 'apac';
const guideRegion = (region: Region): GuideRegion => (region === 'asia' || region === 'oce' ? 'apac' : region);
const REGION_PLACE: Record<GuideRegion, string> = { sa: 'América do Sul', eu: 'Europa', na: 'América do Norte', apac: 'Ásia e Oceania' };

/** Espalha uma tabela do guia pelo ano (jan a nov), na ordem em que o guia lista. */
const spread = (names: string[], tier: EventTier, region: GuideRegion, finals: string[] = []): EventTemplate[] =>
  names.map((name, index) => E(name, tier, 1 + Math.round((index * 10) / Math.max(1, names.length - 1)), 'bracket8', finals.includes(name) ? 5 : 3, { location: REGION_PLACE[region] }));

/** As tabelas regionais do guia: Tier A (Tier 2 do jogo), Tier B (Challenger) e Tier C (CCT/GC). */
const REGIONAL: Record<GuideRegion, Record<'A' | 'B' | 'C', string[]>> = {
  sa: {
    A: ['CBCS Masters', 'FiReLEAGUE Global Finals · qualificatória SA', 'ESL Challenger · qualificatória SA', 'Thunderpick SA Series', 'CCT South America Series · playoffs', 'BetBoom Dacha · qualificatória SA', 'EPL World Series SA', 'TG Talent Cup Masters', 'KaBuM! Legends Open', 'CBCS Invitational'],
    B: ['CBCS Season 4', 'Circuito Gamers Club Masters', 'CCT South America · fase suíça', 'Liga Gamers Club Série S', 'Desafio dos Gigantes SA', 'BGS Esports · qualificatória SA', 'EPL SA Season · fase de grupos', 'RedZone PRO League', 'CBCS Retake Series', 'Gamergy Argentina Cup', 'CBCS Season 5'],
    C: ['Liga Gamers Club Série B', 'Seletiva aberta do CBCS', 'Seletiva aberta CCT SA', 'Liga Gamers Club Série A', 'Liga TyC Sports SA', 'RedZone Academy Cup', 'Gamers Club Academy League', 'Qualificatória aberta do Major · SA', 'Copa Sul-Americana de CS', 'Qualificatória aberta ESL Challenger SA', 'Liga Gamers Club Série A · Copa', 'Seletiva aberta CCT SA · 2']
  },
  eu: {
    A: ['ESL Challenger Europe', 'BLAST Bounty · qualificatória', '1win Private Club Cup', 'BetBoom Dacha Europe', 'Roobet Cup Europe', 'Thunderpick World Championship · qualificatória Europa', 'FISSURE Playground · qualificatória', 'StarLadder StarSeries Fall · qualificatória', 'CCT European Finals', 'Stake Ranked · qualificatória'],
    B: ['CCT Europe Series', 'European Pro League (EPL)', 'RES Regional Series Europe', 'YaLLa Compass', 'BLAST Risings Europe', 'Exemplar European League', 'United21 League Europe', 'ESEA Advanced Europe', 'Thunderpick · seletiva Europa', 'Gamegune European Open', 'CCT Europe Series · finais'],
    C: ['WePlay Academy League', 'ESL Meisterschaft', 'ESEA Main Europe', 'Mistgames Heroes League', 'Seletiva aberta CCT Europe', 'Svenska Elitserien', 'Mistrzostwa Polski', 'Liga Portuguesa de CS (LPCS)', 'UKIC Beyond League', 'Qualificatória aberta do Major · Europa', 'ESEA Intermediate Europe', 'Seletiva aberta CCT Europe · 2']
  },
  na: {
    A: ['ESL Challenger NA', 'ACE North American Masters', 'CCT North America Finals', 'FiReLEAGUE · qualificatória NA', 'Thunderpick NA Series', 'BetBoom Dacha · qualificatória NA', 'EPL World Series NA', 'ECL NA Finals', 'fragster League NA', 'NACS Cup Series'],
    B: ['ESL Challenger League NA', 'CCT North America Series', 'EPL NA · fase de grupos', 'Fragadelphia Main Event', 'BLAST Risings NA', 'NCT Season NA', 'EAGLE NA Cup', 'Mythic Cup', 'Cash Cup NA', 'EAGLE Masters NA', 'CCT North America Series · finais'],
    C: ['ESEA Advanced NA', 'Fragadelphia · qualificatórias LAN', 'NACE Starleague', 'Qualificatória aberta do Major · NA', 'Seletiva aberta CCT NA', 'ESEA Main NA', 'College CS Open', 'LANXperience Open', 'GamerzArena NA Cup', "Bally's Esports Open", 'ESEA Intermediate NA', 'Seletiva aberta CCT NA · 2']
  },
  apac: {
    A: ['Asian Champions League', 'eXTREMESLAND Asia', 'ESL Challenger Asia-Pacific', 'PGL Major · qualificatória Ásia', 'CS Asia Championships · qualificatória', 'BetBoom Dacha · qualificatória Ásia', 'FiReLEAGUE Asia Series', 'XSE Pro League · etapa asiática', 'Perfect World Asia League', 'Skyesports Masters Asia'],
    B: ['ESL Challenger League Asia', 'LPL Pro Oceania', 'Perfect World Arena Premier', 'MESA Pro Series', 'BLAST Risings Asia', 'Skyesports Souvenir Asia', 'EPL Asia Series', '5E Arena Asia Cup', 'OCE Cash Cup Series', 'LPL Challenger Oceania', 'ESL Challenger League Asia · finais'],
    C: ['Qualificatória aberta do Major · Ásia', '5E Play · qualificatórias abertas', 'MESA National Championship', 'LPL Open League Oceania', 'Skyesports Open India', 'Oriente Médio · qualificatórias abertas', 'Sudeste Asiático · qualificatórias abertas', '5E Arena Beginner Series', 'eXTREMESLAND · seletivas abertas', 'ESEA Open Asia-Pacific', 'MESA National Championship · finais', '5E Play · qualificatórias abertas 2']
  }
};

/** Finais MD5 dos regionais grandes (os que o guia mostra decididos em 3-x). */
const REGIONAL_BO5 = ['CBCS Masters', 'Asian Champions League', 'ESL Challenger Europe', 'ESL Challenger NA', 'ESL Challenger Asia-Pacific'];

const lanPool = (): EventTemplate[] => Array.from({ length: 12 }, (_, index) => E(`Circuito amador da lan house · Etapa ${index + 1}`, 'C', index + 1));

/** Quantos campeonatos cada nível joga por temporada (sorteado pela seed): Tier S e 1 8-12, Tier 2 8-10,
 *  Challenger 8-11, CCT/GC 9-12, lan house 6. */
export const EVENT_RANGE: Record<number, [number, number]> = { 0: [8, 12], 1: [8, 12], 2: [8, 10], 3: [8, 11], 4: [9, 12], 5: [6, 6] };

export function eventCount(level: number, seed: string): number {
  const [min, max] = EVENT_RANGE[level] ?? [8, 10];
  return min + Math.floor(createSeededRng(`${seed}:count`)() * (max - min + 1));
}

/**
 * Sorteia `count` campeonatos do circuito do nível (sem repetir), em ordem de mês. Tier S e 1 jogam a elite
 * mundial e os 2 Majors; Tier 2 joga o topo regional do guia (tier B); Challenger e CCT/GC as ligas regionais
 * (tier C). Tier 2 e Challenger ainda podem pegar o Major do meio do ano pelo ranking (VRS).
 */
export function seasonEvents(level: number, region: Region, count: number, seed: string, year = 2026): EventTemplate[] {
  const rng = createSeededRng(`${seed}:events`);
  const pick = (pool: EventTemplate[], amount: number) => {
    const copy = [...pool];
    const chosen: EventTemplate[] = [];
    while (chosen.length < amount && copy.length) chosen.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
    return chosen;
  };
  const guide = guideRegion(region);
  const majors = majorsOf(year);
  let events: EventTemplate[];
  // Pedido de poucos eventos (troca no fim do ano): nunca enfia os 2 Majors à força.
  if (level <= 1) events = count >= 3 ? [...majors, ...pick(elitePool(year), count - 2)] : pick(elitePool(year), count);
  // Regional não é tier A do mundo: o topo regional (CBCS Masters, ESL Challenger SA…) é tier B, e as ligas e
  // temporadas regionais (CBCS Season, Gamers Club Série S…) são tier C, como no guia (CBCS = Tier 3/B/C).
  else if (level === 2) events = [...pick(spread(REGIONAL[guide].A, 'B', guide, REGIONAL_BO5), count - 1), majors[0]];
  else if (level === 3) events = [...pick(spread(REGIONAL[guide].B, 'C', guide), count - 1), majors[0]];
  else if (level === 4) events = pick(spread(REGIONAL[guide].C, 'C', guide), count);
  else events = lanPool().slice(0, count);
  return events.sort((a, b) => a.month - b.month);
}

export const MONTH_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const TIER_LABEL: Record<EventTier, string> = { Major: 'Major', S: 'Tier S', A: 'Tier A', B: 'Tier B', C: 'Tier C' };
