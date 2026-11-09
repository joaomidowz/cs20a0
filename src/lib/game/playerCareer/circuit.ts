// src/lib/game/playerCareer/circuit.ts
// O circuito do mundo (D6): os Majors e os campeonatos de Tier S e Tier A acontecem com ou sem você. Cada um é jogado no
// motor completo (série a série, mapa a mapa, round a round), com a chave montada pelo ranking do mês anterior
// (convites) e as vagas de qualificatória. Determinístico pela seed: a mesma carreira sempre dá o mesmo campeão. O
// resultado fica num cache próprio (memória + localStorage, versionado por WORLD_SIM_VERSION) que pode ser apagado: é
// refeito igual. Nada daqui alimenta a evolução dos elencos (sceneWorld continua no nível base).
import { completeRound, createTournamentEngine, currentRound, startNextRound, toResult, type TournamentEngineState, type TournamentOrganization } from '../online/tournament-engine';
import { autoDecide, pendingSeriesDecision, stepSeries } from '../online/live-series';
import { calculateHistoricalTeamPower, createSeededRng } from '../simulation';
import { createNeutralMapStrategy, type MapSimulationContext } from '../map-veto';
import { computeMajorAwards } from '../majorAwards';
import { dynastySwissBestOf } from '../dynasty/format';
import type { HistoricalTeam, Player } from '../types';
import { worldCircuitOf, type EventFormat, type EventTemplate, type EventTier } from './calendar';
import { mapProfile } from './careerMaps';
import { sceneOrgById, sceneOrgs } from './data';
import type { CalendarEntry, PlayerCareerState, TournamentResult } from './engine';
import { careerMapPool, ENGINE_PLACE, EVENT_FORM_SWING, pickEventMvp, SCENE_EVENT_FORMAT, sceneOrgEnginePlayers, sceneOrgToEngineTeam, SUPERTEAM_DAMPING, SUPERTEAM_EDGE } from './live';
import { rankOrderAt } from './ranking';
import { homeLevelOf, levelFromRank } from './tiers';
import { qualifierWinners } from './qualifiers';
import { worldOrgIn, yearOfSeason } from './world';

/** Sobe quando a simulação do circuito muda: o cache antigo deixa de valer e o circuito é jogado de novo. */
export const WORLD_SIM_VERSION = 1;

export interface WorldEventSlot { orgId: string; via: 'invite' | 'qualifier' | 'user' }
export interface WorldEvent {
  key: string;          // `${season}:${index}`
  season: number;
  index: number;
  name: string;
  tier: EventTier;      // de calendar.ts
  format: EventFormat;  // de calendar.ts
  month: number;        // 1-12
  invites: number;
  qualifierSlots: number;
}
export interface WorldEventResult {
  key: string;
  season: number;
  name: string;
  tier: EventTier;
  month: number;
  field: WorldEventSlot[];
  placements: Array<{ orgId: string; place: number }>; // 1 = campeão
  champion: string;     // orgId
  runnerUp: string;     // orgId
  mvp: { nick: string; orgId: string; rating: number } | null;
  topPlayers: Array<{ nick: string; orgId: string; rating: number }>;
  userPlayed: boolean;
}

/** Um instante da carreira: temporada e mês (0 = antes de janeiro, 12 = fim do ano). */
export interface CircuitClock { season: number; month: number }
/** Ordem dos instantes (o fim de uma temporada vem antes do mês 0 da seguinte). */
export const clockValue = (clock: CircuitClock): number => clock.season * 13 + clock.month;

/** Tamanho da chave por formato e quantas vagas são de qualificatória (o resto é convite pelo ranking). */
const FIELD_SIZE: Record<EventFormat, number> = { bracket8: 8, swiss16: 16, major: 32 };
export const QUALIFIER_SLOTS: Record<EventFormat, number> = { bracket8: 2, swiss16: 4, major: 8 };

/** O id do time como a cena guarda (saves antigos podem ter o id de um time duplicado que foi unificado). */
export const canonicalOrgId = (orgId: string): string => sceneOrgById.get(orgId)?.id ?? orgId;

/** Temporada em que o circuito começou nesta carreira (estado sem o campo: a temporada atual). */
export const circuitFromOf = (state: PlayerCareerState): number => state.circuitFrom ?? state.seasonNumber;

/**
 * O "agora" do mundo: o mês anterior ao seu próximo campeonato (tudo antes dele já aconteceu). Com o calendário todo
 * jogado, o fim do ano; entre temporadas, o fim da anterior; antes da primeira, o mês 0. Enquanto um campeonato seu
 * está em andamento o relógio não anda: ele só passa quando o resultado é gravado.
 */
export function circuitClock(state: PlayerCareerState): CircuitClock {
  const upcoming = (state.calendar ?? []).filter((entry) => entry.status === 'UPCOMING');
  if (upcoming.length) return { season: state.seasonNumber, month: Math.max(0, Math.min(...upcoming.map((entry) => entry.month ?? 12)) - 1) };
  if (state.calendar?.length) return { season: state.seasonNumber, month: 12 };
  return state.history.length ? { season: state.seasonNumber - 1, month: 12 } : { season: state.seasonNumber, month: 0 };
}

const eventsBySeason = new Map<number, WorldEvent[]>();
/** Os campeonatos do circuito mundial da temporada (Majors, Tier S e Tier A), em ordem de mês. */
export function worldEventsOf(_state: PlayerCareerState, season: number): WorldEvent[] {
  const cached = eventsBySeason.get(season);
  if (cached) return cached;
  const events = worldCircuitOf(yearOfSeason(season)).map((template, index): WorldEvent => ({
    key: `${season}:${index}`, season, index, name: template.name, tier: template.tier, format: template.format, month: template.month,
    invites: FIELD_SIZE[template.format] - QUALIFIER_SLOTS[template.format], qualifierSlots: QUALIFIER_SLOTS[template.format]
  }));
  eventsBySeason.set(season, events);
  return events;
}

const templateOf = (event: WorldEvent): EventTemplate => worldCircuitOf(yearOfSeason(event.season))[event.index];

/** O campeonato do mundo com esse nome na temporada ("ESL Pro League 2027" na temporada 2), ou null (regionais, lan). */
export function worldEventByName(state: PlayerCareerState, season: number, name: string): WorldEvent | null {
  const year = yearOfSeason(season);
  return worldEventsOf(state, season).find((event) => `${event.name} ${year}` === name) ?? null;
}

/** O campeonato do mundo pela chave `${season}:${index}`, ou null. */
export function worldEventByKey(state: PlayerCareerState, key: string): WorldEvent | null {
  const [season, index] = key.split(':').map(Number);
  return Number.isInteger(season) && Number.isInteger(index) ? worldEventsOf(state, season)[index] ?? null : null;
}

/** O campeonato do mundo de uma entrada do seu calendário (mesmo nome), ou null. */
export const worldEventOfEntry = (state: PlayerCareerState, entry: Pick<CalendarEntry, 'name'>): WorldEvent | null =>
  worldEventByName(state, state.seasonNumber, entry.name);

/**
 * O time em que você jogava naquele mês: os campeonatos do mundo que você não joga deixam ele de fora. Até o seu
 * próximo campeonato vale o time do último jogado (uma troca entre campeonatos não muda o passado); dali em diante, o
 * time atual.
 */
export function userOrgAt(state: PlayerCareerState, season: number, month: number): string {
  if (season > state.seasonNumber) return canonicalOrgId(state.orgId);
  const log = season < state.seasonNumber ? state.history.find((entry) => entry.seasonNumber === season) : undefined;
  if (season < state.seasonNumber && !log) return canonicalOrgId(state.orgId);
  if (season === state.seasonNumber && month > circuitClock(state).month) return canonicalOrgId(state.orgId);
  const results: Array<{ orgId?: string; month?: number }> = log
    ? log.tournaments
    : (state.calendar ?? []).flatMap((entry) => (entry.status === 'PLAYED' && entry.result ? [{ orgId: entry.result.orgId, month: entry.result.month ?? entry.month }] : []));
  const known = results.filter((result) => result.orgId);
  const before = known.filter((result) => (result.month ?? 13) <= month);
  return canonicalOrgId(before.at(-1)?.orgId ?? known[0]?.orgId ?? log?.orgId ?? state.orgId);
}

/** O seu campeonato que É este campeonato do mundo: o que você vai jogar ou jogou (folga e "não classificado" não contam). */
export function userEntryOf(state: PlayerCareerState, event: WorldEvent): { entry?: CalendarEntry; result?: TournamentResult } | null {
  const name = `${event.name} ${yearOfSeason(event.season)}`;
  if (event.season === state.seasonNumber) {
    const entry = (state.calendar ?? []).find((candidate) => candidate.name === name);
    if (!entry) return null;
    if (entry.status === 'UPCOMING') return { entry };
    return entry.result && (!entry.result.skipped || entry.result.benched) ? { entry, result: entry.result } : null;
  }
  const result = state.history.find((log) => log.seasonNumber === event.season)?.tournaments.find((candidate) => candidate.name === name);
  return result ? { result } : null;
}

const PLACE_OF_LABEL: Record<string, number> = { 'Campeão': 1, Vice: 2, Semis: 3, Quartas: 5, 'Fase suíça': 9, 'Stage 2': 17, 'Stage 1': 25 };
const orgIdByName = new Map(sceneOrgs.map((org) => [org.name, org.id]));

/** As colocações de um resultado seu: as gravadas ou, em save antigo, o que dá para tirar do relatório (você, o campeão e a chave). */
export function placementsOf(result: TournamentResult, userOrgId: string): Array<{ orgId: string; place: number }> {
  if (result.placements?.length) return result.placements;
  const places = new Map<string, number>();
  const mine = PLACE_OF_LABEL[result.placement];
  if (mine) places.set(userOrgId, mine);
  for (const line of result.bracket ?? []) {
    const loser = orgIdByName.get(line.aWon ? line.b : line.a);
    if (loser && !places.has(loser)) places.set(loser, line.phase === 'final' ? 2 : line.phase === 'semifinal' ? 3 : 5);
  }
  const champion = result.champion ? orgIdByName.get(result.champion) : undefined;
  if (champion && !places.has(champion)) places.set(champion, 1);
  return [...places].map(([orgId, place]) => ({ orgId, place }));
}

/** O seu campeonato visto pelo circuito: a mesma chave, campeão e MVP que você jogou (vem do save, nunca do cache). */
function userWorldResult(state: PlayerCareerState, event: WorldEvent, result: TournamentResult): WorldEventResult {
  const userOrg = canonicalOrgId(result.orgId ?? userOrgAt(state, event.season, event.month));
  const placements = [...placementsOf(result, userOrg)].sort((a, b) => a.place - b.place || a.orgId.localeCompare(b.orgId));
  const at = (place: number) => placements.find((entry) => entry.place === place)?.orgId ?? '';
  return {
    key: event.key, season: event.season, name: event.name, tier: event.tier, month: event.month,
    field: placements.map((entry): WorldEventSlot => ({ orgId: entry.orgId, via: entry.orgId === userOrg ? 'user' : 'invite' })),
    placements, champion: at(1), runnerUp: at(2),
    mvp: result.mvp ? { nick: result.mvp.nick, orgId: result.mvp.you ? userOrg : orgIdByName.get(result.mvp.team) ?? '', rating: result.mvp.rating } : null,
    topPlayers: result.topPlayers ?? [],
    userPlayed: true
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Cache: memória por seed + localStorage (só na página; o Worker e os testes não têm localStorage).
const CACHE_PREFIX = 'cs13a0-player-career-world';
export const worldCacheKey = (seed: string): string => `${CACHE_PREFIX}:v${WORLD_SIM_VERSION}:${seed}`;
const memory = new Map<string, Map<string, WorldEventResult>>();
const loaded = new Set<string>();
let generation = 0;
/** Muda a cada resultado guardado: o ranking em memória sabe quando recalcular. */
export const circuitGeneration = (): number => generation;

const storage = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

export function storeWorldResult(seed: string, result: WorldEventResult): void {
  const bySeed = memory.get(seed) ?? new Map<string, WorldEventResult>();
  memory.set(seed, bySeed);
  bySeed.set(result.key, result);
  generation += 1;
}

/** Lê o cache salvo da carreira uma vez (versão e seed conferidas; cache estragado é ignorado e o circuito joga de novo). */
export function loadWorldCache(seed: string): void {
  if (loaded.has(seed)) return;
  loaded.add(seed);
  const store = storage();
  if (!store) return;
  try {
    const raw = store.getItem(worldCacheKey(seed));
    if (!raw) return;
    const parsed = JSON.parse(raw) as { version?: number; seed?: string; results?: WorldEventResult[] };
    if (parsed.version !== WORLD_SIM_VERSION || parsed.seed !== seed || !Array.isArray(parsed.results)) return;
    const bySeed = memory.get(seed) ?? new Map<string, WorldEventResult>();
    memory.set(seed, bySeed);
    for (const result of parsed.results) if (result?.key && !bySeed.has(result.key)) bySeed.set(result.key, result);
    generation += 1;
  } catch { /* cache estragado: o circuito joga de novo */ }
}

/** Os resultados do circuito em memória da carreira (o que a página manda para o Worker). */
export const cachedWorldResults = (seed: string): WorldEventResult[] => {
  loadWorldCache(seed);
  return [...(memory.get(seed)?.values() ?? [])];
};

/** Grava o cache da carreira: só a temporada atual e a anterior (o ranking olha 12 meses). Apaga o cache de outras
 *  carreiras e de outras versões. Sem espaço, fica só na memória. */
export function persistWorldCache(seed: string, currentSeason: number): void {
  const bySeed = memory.get(seed);
  if (bySeed) for (const [key, result] of bySeed) if (result.season < currentSeason - 1) bySeed.delete(key);
  const store = storage();
  if (!store) return;
  try {
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const key = store.key(index);
      if (key?.startsWith(`${CACHE_PREFIX}:`) && key !== worldCacheKey(seed)) store.removeItem(key);
    }
    store.setItem(worldCacheKey(seed), JSON.stringify({ version: WORLD_SIM_VERSION, seed, results: [...(bySeed?.values() ?? [])] }));
  } catch { /* sem espaço: fica só na memória */ }
}

/** Esquece o cache em memória (de uma carreira ou de todas). O localStorage não muda. */
export function clearWorldCache(seed?: string): void {
  if (seed) { memory.delete(seed); loaded.delete(seed); } else { memory.clear(); loaded.clear(); }
  generation += 1;
}

/** Só do cache: o resultado de um campeonato do mundo já jogado pelo circuito, ou null. */
export function worldResult(state: PlayerCareerState, event: WorldEvent): WorldEventResult | null {
  loadWorldCache(state.seed);
  return memory.get(state.seed)?.get(event.key) ?? null;
}

/** Os resultados do circuito da temporada até o mês: o seu campeonato vem do save; os outros, do cache. Nunca passa do
 *  relógio da carreira: o que ainda não aconteceu não aparece. */
export function worldResultsUntil(state: PlayerCareerState, season: number, month: number): WorldEventResult[] {
  const clock = circuitClock(state);
  if (season > clock.season) return [];
  const limit = season === clock.season ? Math.min(month, clock.month) : month;
  return worldEventsOf(state, season).flatMap((event) => {
    if (event.month > limit) return [];
    const own = userEntryOf(state, event);
    if (own?.result) return [userWorldResult(state, event, own.result)];
    if (own?.entry) return [];
    const cached = worldResult(state, event);
    return cached ? [cached] : [];
  });
}

// ---------------------------------------------------------------------------------------------------------------
// A chave: convites pelo ranking do mês anterior e as vagas de qualificatória.

/** O ranking que monta a chave: o do mês anterior ao campeonato (ou o de hoje, para um campeonato que ainda vem). */
export function fieldClock(state: PlayerCareerState, event: WorldEvent): CircuitClock {
  const own = { season: event.season, month: event.month - 1 };
  const now = circuitClock(state);
  return clockValue(now) < clockValue(own) ? now : own;
}

/** Chance de um time pular o campeonato (calendário cheio): no Major ninguém pula; no Tier S quase todos vão; no
 *  Tier A o top 8 escolhe onde jogar. */
const skipChance = (event: WorldEvent, rank: number): number => (event.format === 'major' ? 0 : event.tier === 'S' ? 0.15 : rank < 8 ? 0.45 : 0.1);

/** O time pula este campeonato? Sorteio fixo por campeonato e time (`rank`: posição no ranking, 0 = primeiro). */
export const skipsEvent = (state: PlayerCareerState, event: WorldEvent, orgId: string, rank: number): boolean =>
  createSeededRng(`${state.seed}:world:${event.key}:skip:${orgId}`)() < skipChance(event, rank);

/** Os convites do campeonato: o ranking do mês anterior (`order`, sem o seu time quando ele não joga), quem foi
 *  convidado e o seu time naquele mês. O seu time, quando joga, nunca pula. */
export interface WorldInvites { order: string[]; invited: string[]; userOrg: string }
export function worldInvites(state: PlayerCareerState, event: WorldEvent, withUser: boolean): WorldInvites {
  const userOrg = userOrgAt(state, event.season, event.month);
  const order = rankOrderAt(state, fieldClock(state, event)).filter((orgId) => orgId !== userOrg || withUser);
  const invited: string[] = [];
  for (const [rank, orgId] of order.entries()) {
    if (invited.length >= event.invites) break;
    if (orgId === userOrg || !skipsEvent(state, event, orgId, rank)) invited.push(orgId);
  }
  return { order, invited, userOrg };
}

/** A chave do campeonato, na ordem do ranking: os convidados e quem passou nas qualificatórias regionais
 *  (qualifiers.ts). O seu time entra se o campeonato está no seu calendário: convidado, pela qualificatória ou, no
 *  campeonato que o seu nível joga direto, pela vaga do calendário ('user'). No Major, só por convite ou qualificatória. */
export function worldFieldOf(state: PlayerCareerState, event: WorldEvent): WorldEventSlot[] {
  return buildField(state, event, Boolean(userEntryOf(state, event)));
}

function buildField(state: PlayerCareerState, event: WorldEvent, withUser: boolean): WorldEventSlot[] {
  const invites = worldInvites(state, event, withUser);
  const slots: WorldEventSlot[] = [
    ...invites.invited.map((orgId) => ({ orgId, via: 'invite' as const })),
    ...qualifierWinners(state, event, invites).map((orgId) => ({ orgId, via: 'qualifier' as const }))
  ];
  // Fora do Major, o campeonato do seu calendário sem qualificatória tem vaga garantida: ela fica com o último convite.
  if (withUser && event.format !== 'major' && !slots.some((slot) => slot.orgId === invites.userOrg)) {
    slots.splice(slots.map((slot) => slot.via).lastIndexOf('invite'), 1, { orgId: invites.userOrg, via: 'user' });
  }
  const position = new Map(invites.order.map((orgId, index) => [orgId, index]));
  return slots.sort((a, b) => (position.get(a.orgId) ?? invites.order.length) - (position.get(b.orgId) ?? invites.order.length));
}

// ---------------------------------------------------------------------------------------------------------------
// O campeonato no motor completo, sem o seu time.

export interface WorldRun { event: WorldEvent; field: WorldEventSlot[]; engine: TournamentEngineState }

/** Monta o campeonato do mundo no motor: elencos da temporada, forma do campeonato, supertime contido e perfil de
 *  mapas, a mesma régua dos seus campeonatos (live.ts startSceneEvent). */
export function startWorldRun(state: PlayerCareerState, event: WorldEvent): WorldRun {
  const field = buildField(state, event, false);
  const seed = `${state.seed}:world:${event.season}:${event.index}`;
  const year = yearOfSeason(event.season);
  const pool = careerMapPool(year);
  const orgs = field.map((slot) => worldOrgIn(state.seed, event.season, slot.orgId) ?? sceneOrgById.get(slot.orgId)!);
  const rosters = new Map<string, Player[]>(orgs.map((org) => [org.id, sceneOrgEnginePlayers(org, seed)]));
  const allPlayers = orgs.flatMap((org) => rosters.get(org.id) ?? []);
  // A faixa do motor pelo nível do mês do campeonato (tiers.ts levelFromRank), nunca pelo currentLevelOf de hoje.
  const order = rankOrderAt(state, fieldClock(state, event));
  const rankOf = new Map(order.map((orgId, index) => [orgId, index + 1]));
  const teams: HistoricalTeam[] = orgs.map((org) => sceneOrgToEngineTeam(org, rosters.get(org.id) ?? [], levelFromRank(rankOf.get(org.id) ?? null, homeLevelOf(state, org.id))));
  const formOf = (orgId: string) => (createSeededRng(`${seed}:form:${orgId}`)() - 0.5) * 2 * EVENT_FORM_SWING;
  const organizations: TournamentOrganization[] = teams.map((team, index) => {
    const combat = calculateHistoricalTeamPower(team, allPlayers);
    return { id: team.id, name: combat.name, seed: index + 1, team: { ...combat, power: combat.power + formOf(team.id) }, human: false, sourceTeamId: team.id };
  });
  // Supertime não ganha tudo: o que o mais forte abre acima do segundo conta só em parte.
  const ranked = [...organizations].sort((a, b) => b.team.power - a.team.power);
  const ceiling = (ranked[1]?.team.power ?? 0) + SUPERTEAM_EDGE;
  if (ranked[0] && ranked[1] && ranked[0].team.power > ceiling) ranked[0].team = { ...ranked[0].team, power: ceiling + (ranked[0].team.power - ceiling) * SUPERTEAM_DAMPING };
  const strategies: MapSimulationContext['strategies'] = new Map();
  for (const org of organizations) {
    const strategy = createNeutralMapStrategy(org.id, pool, true);
    const profile = mapProfile(org.id, year, pool);
    strategy.selectedMaps = [profile[0].mapId, profile[1].mapId, profile[2].mapId];
    for (const rating of profile) strategy.affinities[rating.mapId] = rating.affinity;
    strategies.set(org.id, strategy);
  }
  const mapContext: MapSimulationContext = { mode: 'premier', seed: `${seed}:offline-maps`, strategies, rosters: new Map(organizations.map((org) => [org.id, { players: rosters.get(org.id) ?? [] }])) };
  const common = { seed: `${seed}:engine`, mapContext, swissBestOf: 3 as const, swissBestOfFor: dynastySwissBestOf };
  // Major: os 3 stages pelo ranking (1º ao 8º no Stage 3, 9º ao 16º no Stage 2, o resto abre no Stage 1).
  const engine = event.format === 'major'
    ? createTournamentEngine({ ...common, organizations: [], botPool: [], entryStage: 'stage1', stageFields: { stage3: organizations.slice(0, 8), stage2: organizations.slice(8, 16), stage1: organizations.slice(16, 32) } })
    : createTournamentEngine({
        ...common, organizations: organizations.slice(0, 1), botPool: organizations.slice(1), entryStage: event.format === 'bracket8' ? 'playoffs' : 'stage3',
        ...(event.format === 'bracket8' ? { playoffBestOf: { ...SCENE_EVENT_FORMAT, final: templateOf(event).finalBestOf } } : {})
      });
  return { event, field, engine };
}

/**
 * Anda o campeonato série a série, na mesma ordem do runTournamentToEnd, até o fim ou até estourar o tempo (para rodar
 * em pedaços sem travar a tela). O relógio só decide onde pausar, nunca o resultado. Devolve o resultado no fim.
 */
export function stepWorldRun(run: WorldRun, budgetMs = Number.POSITIVE_INFINITY, now: () => number = () => performance.now()): WorldEventResult | null {
  const { engine } = run;
  const deadline = budgetMs === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : now() + budgetMs;
  while (!engine.finished) {
    const round = currentRound(engine) ?? startNextRound(engine);
    const open = round.series.find((series) => series.phase !== 'finished');
    if (!open) completeRound(engine);
    else if (pendingSeriesDecision(open)) autoDecide(open);
    else stepSeries(open);
    if (deadline !== Number.POSITIVE_INFINITY && !engine.finished && now() >= deadline) return null;
  }
  return finishWorldRun(run);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function finishWorldRun(run: WorldRun): WorldEventResult {
  const { event, field, engine } = run;
  const result = toResult(engine);
  const champion = result.championId ?? '';
  const final = result.rounds.flatMap((round) => round.series).find((series) => series.phase === 'final');
  const runnerUp = final ? (final.winnerId === final.teamA.id ? final.teamB.id : final.teamA.id) : '';
  const awards = computeMajorAwards(result.rounds, result.championId);
  const ranked = awards?.topPlayers ?? [];
  const pick = pickEventMvp(ranked, champion, runnerUp) ?? awards?.mvp ?? null;
  return {
    key: event.key, season: event.season, name: event.name, tier: event.tier, month: event.month, field,
    placements: result.campaigns.map((entry) => ({ orgId: entry.organizationId, place: ENGINE_PLACE[entry.placement] ?? 25 })).sort((a, b) => a.place - b.place || a.orgId.localeCompare(b.orgId)),
    champion, runnerUp,
    mvp: pick ? { nick: pick.name, orgId: pick.teamId, rating: round2(pick.rating) } : null,
    topPlayers: ranked.map((award) => ({ nick: award.name, orgId: award.teamId, rating: round2(award.rating) })),
    userPlayed: false
  };
}

/** O campeonato do mundo inteiro no motor completo (sem o seu time), determinístico pela seed. */
export function computeWorldResult(state: PlayerCareerState, event: WorldEvent): WorldEventResult {
  return stepWorldRun(startWorldRun(state, event)) as WorldEventResult;
}

// ---------------------------------------------------------------------------------------------------------------
// O que falta jogar.

/**
 * Os campeonatos do mundo que já aconteceram (mês até o relógio, e a temporada anterior inteira) e ainda não têm
 * resultado, do mais antigo para o mais novo. O ranking de um campeonato precisa da temporada anterior: se ela também
 * falta (cache apagado), volta até onde precisar, no máximo até o começo do circuito.
 */
export function pendingWorldEvents(state: PlayerCareerState): WorldEvent[] {
  const from = circuitFromOf(state);
  const clock = circuitClock(state);
  const missing = (season: number) => worldEventsOf(state, season)
    .filter((event) => (season < clock.season || event.month <= clock.month) && !userEntryOf(state, event) && !worldResult(state, event));
  let start = Math.max(from, clock.season - 1);
  while (start > from && missing(start).length && missing(start - 1).length) start -= 1;
  const list: WorldEvent[] = [];
  for (let season = Math.max(1, start); season <= clock.season; season += 1) list.push(...missing(season));
  return list;
}

/** O circuito já tem tudo que o relógio pede? (a página só abre o próximo campeonato com ele pronto) */
export const circuitReady = (state: PlayerCareerState): boolean => pendingWorldEvents(state).length === 0;

/** Joga já, na mesma thread, o que falta do circuito (testes e simulações sem tela). */
export function ensureWorldResults(state: PlayerCareerState): WorldEventResult[] {
  const computed: WorldEventResult[] = [];
  for (const event of pendingWorldEvents(state)) {
    const result = computeWorldResult(state, event);
    storeWorldResult(state.seed, result);
    computed.push(result);
  }
  return computed;
}
