// src/lib/game/playerCareer/ranking.ts
// O ranking de times (D7): os resultados dos últimos 12 meses (temporada atual e a anterior, com peso caindo mês a mês),
// ponderados pelo tier do campeonato e pela colocação, mais uma base pequena pela força do elenco. Na primeira temporada
// do circuito, uma base de partida pelos pontos do ranking real da HLTV (novembro de 2026) some ao longo do ano. O tier de
// cada time sai daqui (tiers.ts levelFromRank): 1 a 16 Tier S (1 a 8 com o selo Elite), abaixo o nível de casa. Tudo é leitura:
// nada daqui volta para a evolução do mundo (sceneWorld), e nada daqui pergunta currentLevelOf, orgOf ou levelIn
// (eles leem este ranking: seria recursão).
import type { EventTier, Region } from './calendar';
import { ORG_BASE_POWER, sceneOrgById, sceneOrgs } from './data';
import type { PlayerCareerState, TournamentResult } from './engine';
import { TEAM_TIER_BY_LEVEL, homeLevelOf, levelFromRank, type TeamTier } from './tiers';
import { canonicalOrgId, circuitClock, circuitFromOf, circuitGeneration, clockValue, placementsOf, worldEventByName, worldResultsUntil, type CircuitClock } from './circuit';
import { worldOrgIn } from './world';

/** `level`: o nível do time agora (0 = Tier S com o selo Elite; tiers.ts), de onde sai `tier`. */
export interface RankedTeam { orgId: string; name: string; rank: number; points: number; delta: number; tier: TeamTier; level: number; region: Region }

/** Pontos do campeão por tier de campeonato; as outras colocações levam uma fração (PLACE_SHARE). */
export const TIER_POINTS: Record<EventTier, number> = { Major: 1000, S: 600, A: 300, B: 100, C: 30 };
/** Fração dos pontos pela colocação: 1º, 2º, 3º-4º, 5º-8º, 9º-16º, 17º-24º e 25º-32º. */
export const PLACE_SHARE: ReadonlyArray<readonly [number, number]> = [[1, 1], [2, 0.6], [3, 0.4], [5, 0.2], [9, 0.1], [17, 0.05], [25, 0.03]];
export function placeShare(place: number): number {
  let share = 0;
  for (const [from, value] of PLACE_SHARE) if (place >= from) share = value;
  return share;
}
/** Peso do resultado pela idade em meses: cheio no mês, some em 12 meses. */
export const resultWeight = (age: number): number => (age < 0 || age >= 12 ? 0 : (12 - age) / 12);
/** Base de partida (o ranking real antes da carreira): forte no topo, nada abaixo do Tier B. */
export const priorPoints = (power: number): number => Math.round(Math.max(0, power - 76) ** 2 * 9);
/** Base de partida do ranking real (HLTV de novembro de 2026, D12) na escala de `priorPoints`: os 944 pontos da FURIA
 *  valem o mesmo que um time de força 92. Quem não está entre os 250 da HLTV não tem base real. */
export const REAL_PRIOR_SCALE = 2.5;
export const realPriorPoints = (points: number | null | undefined): number => Math.round((points ?? 0) * REAL_PRIOR_SCALE);
/** Base pequena pela força do elenco: ordena quem não tem resultado. */
export const basePoints = (power: number): number => Math.max(0, Math.round((power - 60) * 4));

interface RankedResult { season: number; month: number; tier: EventTier; placements: Array<{ orgId: string; place: number }> }
interface Computed { order: string[]; points: Map<string, number>; index: Map<string, number> }

/** Os seus campeonatos fora do circuito do mundo (regionais, lan house), com as colocações gravadas. */
function ownResultsOf(state: PlayerCareerState, season: number): RankedResult[] {
  const log = season === state.seasonNumber ? undefined : state.history.find((entry) => entry.seasonNumber === season);
  const source: Array<{ result: TournamentResult; month?: number }> = season === state.seasonNumber
    ? (state.calendar ?? []).flatMap((entry) => (entry.status === 'PLAYED' && entry.result ? [{ result: entry.result, month: entry.month }] : []))
    : (log?.tournaments ?? []).map((result) => ({ result }));
  const fallbackOrg = canonicalOrgId(log?.orgId ?? state.orgId);
  return source.flatMap(({ result, month }) => {
    if ((result.skipped && !result.benched) || !result.tier || worldEventByName(state, season, result.name)) return [];
    return [{ season, month: result.month ?? month ?? 6, tier: result.tier, placements: placementsOf(result, canonicalOrgId(result.orgId ?? fallbackOrg)) }];
  });
}

/** Tudo que conta no ranking até `at`: o circuito do mundo (com os seus campeonatos de lá) e os seus regionais. */
function rankingInputs(state: PlayerCareerState, at: CircuitClock): RankedResult[] {
  const list: RankedResult[] = [];
  for (const season of [at.season - 1, at.season]) {
    if (season < 1) continue;
    list.push(...worldResultsUntil(state, season, season === at.season ? at.month : 12));
    for (const result of ownResultsOf(state, season)) if (season < at.season || result.month <= at.month) list.push(result);
  }
  return list;
}

const FNV_OFFSET = 2166136261;
function hash(text: string): string {
  let value = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
}

const digests = new WeakMap<object, string>();
/** A assinatura do que o ranking lê do save (resultados, time, temporada): estados iguais reaproveitam a conta. */
function digest(state: PlayerCareerState): string {
  const cached = digests.get(state);
  if (cached) return cached;
  const result = (entry: TournamentResult | undefined) => (entry ? `${entry.name}=${entry.placement}/${entry.tier ?? ''}/${entry.skipped ? 1 : 0}${entry.benched ? 1 : 0}/${entry.orgId ?? ''}/${entry.month ?? ''}/${(entry.placements ?? []).map((place) => `${place.orgId}@${place.place}`).join('.')}` : '');
  const parts = [state.seed, String(circuitFromOf(state)), String(state.seasonNumber), state.orgId];
  for (const log of state.history) parts.push(`${log.seasonNumber}:${log.orgId}:${log.tournaments.map(result).join(',')}`);
  for (const entry of state.calendar ?? []) parts.push(`${entry.index}:${entry.name}:${entry.month ?? ''}:${entry.status}:${result(entry.result)}`);
  const value = hash(parts.join('|'));
  digests.set(state, value);
  return value;
}

const powers = new Map<string, Map<string, number>>();
/** A força de cada time na temporada (elenco da seed, sem as suas vagas). */
function powerOf(seed: string, season: number): Map<string, number> {
  const key = `${seed}:${season}`;
  const cached = powers.get(key);
  if (cached) return cached;
  const map = new Map(sceneOrgs.map((org) => [org.id, worldOrgIn(seed, season, org.id)?.power ?? ORG_BASE_POWER[org.level] ?? 60]));
  powers.set(key, map);
  if (powers.size > 16) powers.delete(powers.keys().next().value!);
  return map;
}

const computedCache = new Map<string, Computed>();
const COMPUTED_LIMIT = 64;

function computed(state: PlayerCareerState, at: CircuitClock): Computed {
  const key = `${digest(state)}|${at.season}:${at.month}|${circuitGeneration()}`;
  const hit = computedCache.get(key);
  if (hit) return hit;
  const points = new Map<string, number>();
  const add = (orgId: string, value: number) => { if (value) points.set(orgId, (points.get(orgId) ?? 0) + value); };
  for (const result of rankingInputs(state, at)) {
    const weight = resultWeight((at.season - result.season) * 12 + (at.month - result.month));
    if (!weight) continue;
    for (const entry of result.placements) add(canonicalOrgId(entry.orgId), TIER_POINTS[result.tier] * placeShare(entry.place) * weight);
  }
  const from = circuitFromOf(state);
  const priorWeight = at.season < from ? 1 : at.season === from ? (12 - at.month) / 12 : 0;
  const now = powerOf(state.seed, Math.max(1, at.season));
  const start = priorWeight && from > 1 ? powerOf(state.seed, from) : null;
  for (const org of sceneOrgs) {
    add(org.id, basePoints(now.get(org.id) ?? 60));
    if (!priorWeight) continue;
    // Circuito desde a 1ª temporada: a base é o ranking real. Começou depois (save antigo): a força do mundo naquela temporada.
    add(org.id, (from <= 1 ? realPriorPoints(org.worldPoints) : priorPoints(start!.get(org.id) ?? 60)) * priorWeight);
  }
  const order = sceneOrgs.map((org) => org.id).sort((a, b) =>
    (points.get(b) ?? 0) - (points.get(a) ?? 0) || (now.get(b) ?? 0) - (now.get(a) ?? 0) || (sceneOrgById.get(a)?.name ?? a).localeCompare(sceneOrgById.get(b)?.name ?? b));
  const value: Computed = { order, points, index: new Map(order.map((orgId, position) => [orgId, position])) };
  computedCache.set(key, value);
  if (computedCache.size > COMPUTED_LIMIT) computedCache.delete(computedCache.keys().next().value!);
  return value;
}

/** Nunca depois do relógio: o ranking de um mês que ainda não aconteceu é o de hoje. */
function upToNow(state: PlayerCareerState, at: CircuitClock): CircuitClock {
  const now = circuitClock(state);
  return clockValue(at) > clockValue(now) ? now : at;
}

/** O mês anterior ao último mês com resultado: o ranking contra o qual o delta é medido. */
function previousClock(state: PlayerCareerState, at: CircuitClock): CircuitClock | null {
  let latest: CircuitClock | null = null;
  for (const result of rankingInputs(state, at)) {
    const clock = { season: result.season, month: result.month };
    if (clockValue(clock) <= clockValue(at) && (!latest || clockValue(clock) > clockValue(latest))) latest = clock;
  }
  return latest ? { season: latest.season, month: latest.month - 1 } : null;
}

/** O ranking de times no instante (padrão: agora). O seu time aparece com o tier da temporada (acesso no fim do ano). */
export function teamRanking(state: PlayerCareerState, at?: { season: number; month: number }): RankedTeam[] {
  const now = upToNow(state, at ?? circuitClock(state));
  const current = computed(state, now);
  const previous = previousClock(state, now);
  const before = previous ? computed(state, previous) : null;
  const userOrg = canonicalOrgId(state.orgId);
  return current.order.map((orgId, position) => {
    const org = sceneOrgById.get(orgId)!;
    const rank = position + 1;
    // Nunca currentLevelOf aqui: ele pergunta ao ranking (recursão). O seu time mostra o nível de temporada.
    const level = orgId === userOrg ? homeLevelOf(state, state.orgId) : levelFromRank(rank, homeLevelOf(state, orgId));
    return {
      orgId, name: org.name, rank, points: Math.round(current.points.get(orgId) ?? 0),
      delta: before ? (before.index.get(orgId) ?? position) - position : 0,
      tier: TEAM_TIER_BY_LEVEL[level] ?? 'LAN', level, region: org.region ?? 'eu'
    };
  });
}

/** A ordem do ranking (ids) no instante. Com um campeonato seu em andamento, a de agora é a congelada no começo dele. */
export function rankOrderAt(state: PlayerCareerState, at: CircuitClock): string[] {
  const frozen = state.liveEvent?.ranking;
  if (frozen?.length && clockValue(at) >= clockValue(circuitClock(state))) return frozen;
  return computed(state, upToNow(state, at)).order;
}

const positions = new WeakMap<string[], Map<string, number>>();
/** A posição de um time no ranking de agora (null para a lan house e times fora da cena). */
export function teamRankOf(state: PlayerCareerState, orgId: string): number | null {
  const id = sceneOrgById.get(orgId)?.id;
  if (!id) return null;
  const order = rankOrderAt(state, circuitClock(state));
  let index = positions.get(order);
  if (!index) {
    index = new Map(order.map((entry, position) => [entry, position]));
    positions.set(order, index);
  }
  const position = index.get(id);
  return position === undefined ? null : position + 1;
}

/** Congela o ranking no começo do seu campeonato: a chave, os convites e os tiers ficam iguais até o resultado ser
 *  gravado (o save refaz o campeonato a partir das séries já jogadas e precisa da mesma chave). */
export function freezeRanking(state: PlayerCareerState, eventIndex: number): PlayerCareerState {
  if (state.liveEvent?.eventIndex === eventIndex && state.liveEvent.ranking?.length) return state;
  const ranking = [...computed(state, circuitClock(state)).order];
  const base = state.liveEvent?.eventIndex === eventIndex ? state.liveEvent : { eventIndex, played: {} };
  return { ...state, liveEvent: { ...base, ranking } };
}
