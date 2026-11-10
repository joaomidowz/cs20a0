// src/lib/game/playerCareer/playerRanking.ts
// Ranking de jogadores da Carreira (D7b). No começo da carreira é o ranking real: o Top 20 HLTV mais recente do
// catálogo, só de quem está na ativa num elenco do mundo. Ele anda no fechamento de cada bloco de campeonatos (D1,
// form.ts) com os resultados dos últimos 12 meses, como o da HLTV: o peso maior é o rating de cada um (ajustado pelo
// tier do campeonato), depois MVP e EVP, e a colocação do time entra menor. Fechado no fim do ano, vira o Top 20 HLTV. A temporada passada e o ranking real perdem peso bloco a bloco; o real some no começo da segunda
// temporada. Cada linha guarda o motivo dos pontos. O mundo vem da fonte do circuito (só cache, sem spoiler): o que
// ainda calcula fica pendente e entra quando chegar.
import rawPlayers from '$lib/data/cs/players.game.json';
import { MIN_EVENTS_RANKED } from './awards';
import type { EventTier } from './calendar';
import type { WorldEventResult } from './circuit';
import { memberBirthYear, memberNick, sceneOrgs } from './data';
import { evpNicksOf, orgOf, type PlayerCareerState, type RankedPlayer, type RankingReasons, type TournamentResult } from './engine';
import { formBlockOf } from './form';
import { fiveOf } from './honors';
import { seatedNicks } from './squad';
import { worldRosters, yearOfSeason } from './world';
import { careerClock, circuitSource, coveredEventKeys, eventKey, orgIdOfName, type WorldSource } from './worldView';

export interface RealRank { key: string; nick: string; rank: number; year: number }

/** Os anos do catálogo que valem como ranking de partida (vale o mais novo deles que tiver Top 20). */
export const REAL_RANKING_YEARS: readonly number[] = [2025, 2026];

/** O ranking real de partida: o Top 20 HLTV do ano mais novo do catálogo, pela posição. */
export const REAL_PLAYER_RANKING: RealRank[] = (() => {
  const entries = (rawPlayers as Array<{ baseId?: string; nickname?: string; hltvTop20?: { year?: number; rank?: number } | null }>).flatMap((player) => {
    const year = player.hltvTop20?.year;
    const rank = player.hltvTop20?.rank;
    const key = (player.baseId ?? player.nickname ?? '').toLowerCase();
    return year && rank && key && REAL_RANKING_YEARS.includes(year) ? [{ key, nick: player.nickname ?? key, rank, year }] : [];
  });
  const latest = Math.max(0, ...entries.map((entry) => entry.year));
  const best = new Map<string, RealRank>();
  for (const entry of entries) {
    if (entry.year !== latest) continue;
    const current = best.get(entry.key);
    if (!current || entry.rank < current.rank) best.set(entry.key, entry);
  }
  return [...best.values()].sort((a, b) => a.rank - b.rank);
})();
const REAL_BY_KEY = new Map(REAL_PLAYER_RANKING.map((entry) => [entry.key, entry] as const));

/** Degrau da base real: o 1º vale 6.300 e cada posição abaixo 300 a menos (o 20º, 600). No começo da carreira ninguém
 *  jogou nada, então a ordem é exatamente a do ranking real; ela some bloco a bloco. */
export const BASE_STEP = 300;
export const basePointsOf = (rank: number): number => BASE_STEP * Math.max(0, 22 - rank);

/** Rating: cada campeonato pesa pelos rounds jogados e pelo tier; o rating ganha um ajuste do tier (fazer 1.20 num Major
 *  vale mais que num Tier C). Os pontos são o que passa do piso, vezes a escala; com menos de FULL_EVENTS campeonatos
 *  (contando o peso do tempo) o rating vale proporcionalmente menos. */
export const TIER_RATING_WEIGHT: Record<EventTier, number> = { Major: 1.6, S: 1.3, A: 1, B: 0.6, C: 0.4 };
export const TIER_RATING_EDGE: Record<EventTier, number> = { Major: 0.06, S: 0.04, A: 0, B: -0.08, C: -0.15 };
export const RATING_FLOOR = 0.85;
export const RATING_SCALE = 10_000;
export const FULL_EVENTS = 6;
/** Colocação, MVP e EVP contam só nos melhores BEST_EVENTS campeonatos de cada um (como no ranking do tênis): quem joga
 *  o circuito inteiro não passa na frente só por jogar mais (o seu calendário tem 8 a 12). */
export const BEST_EVENTS = 8;
/** Linha sem rounds (campeonato salvo antes das linhas de todos): conta como um campeonato médio. */
const NOMINAL_ROUNDS = 40;

/** Pontos do time por colocação (campeão, vice, semifinal, quartas), pelo tier do campeonato. Menores que o rating: o
 *  título conta, mas não decide sozinho quem é o melhor jogador. */
export const PLACE_POINTS: Record<EventTier, readonly [number, number, number, number]> = {
  Major: [400, 240, 140, 80],
  S: [280, 170, 100, 55],
  A: [140, 85, 50, 28],
  B: [50, 30, 16, 8],
  C: [20, 12, 6, 3]
};
/** MVP do campeonato, pelo tier. */
export const MVP_POINTS: Record<EventTier, number> = { Major: 300, S: 200, A: 100, B: 40, C: 15 };
/** EVP (os 4 melhores do campeonato depois do MVP, pelo rating de quadra) vale 40% dos pontos do MVP. */
export { EVPS_PER_EVENT } from './engine';
export const EVP_SHARE = 0.4;

const SLOT_OF_PLACEMENT: Record<string, number> = { 'Campeão': 0, Vice: 1, Semis: 2, Quartas: 3 };
/** Colocação no resultado do mundo (1 = campeão) na faixa de pontos: campeão, vice, semifinal (3-4) e quartas (5-8). */
const slotOfPlace = (place: number): number | null => (place === 1 ? 0 : place === 2 ? 1 : place <= 4 ? 2 : place <= 8 ? 3 : null);

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const thousands = (value: number) => value.toLocaleString('pt-BR');

/** "rating 1,18 em 12 campeonatos 3.300 · colocações 840 (2 títulos) · 1 MVP · 3 EVPs · ranking real 4.200": o motivo,
 *  só com o que vale. */
export function reasonsLabel(reasons: RankingReasons): string {
  return [
    reasons.rating !== undefined && reasons.events ? `rating ${reasons.rating.toFixed(2).replace('.', ',')} em ${plural(reasons.events, 'campeonato', 'campeonatos')} ${thousands(reasons.ratingPoints ?? 0)}` : '',
    reasons.placements > 0 ? `colocações ${thousands(reasons.placements)}${reasons.titles > 0 ? ` (${plural(reasons.titles, 'título', 'títulos')})` : ''}` : '',
    reasons.mvps > 0 ? plural(reasons.mvps, 'MVP', 'MVPs') : '',
    reasons.evps > 0 ? plural(reasons.evps, 'EVP', 'EVPs') : '',
    reasons.strength > 0 ? `força ${thousands(reasons.strength)}` : '',
    reasons.base > 0 ? `ranking real ${thousands(reasons.base)}` : ''
  ].filter(Boolean).join(' · ');
}

/** Os pontos são a soma das partes do motivo. */
export const pointsOf = (reasons: RankingReasons): number =>
  (reasons.ratingPoints ?? 0) + reasons.placements + reasons.mvpPoints + reasons.evpPoints + reasons.strength + reasons.base;

/** Um ponto da temporada: depois do campeonato `eventIndex` da temporada `season`. */
export interface RankingPoint { season: number; eventIndex: number }

export interface RankingSnapshot {
  season: number;
  /** O último campeonato que entra (o fim do último bloco fechado); -1 sem bloco fechado. */
  lastIndex: number;
  /** O mês dele (0 sem bloco fechado): o mundo da temporada entra até este mês. */
  month: number;
  blocksClosed: number;
  blocksTotal: number;
  /** Quanto a temporada passada (e, na primeira, o ranking real) ainda pesa: 1 no começo, 0 com todos os blocos fechados. */
  carry: number;
}

/**
 * Onde o ranking está: no fim do último bloco de campeonatos fechado até o ponto pedido (sem ponto, agora). Só a
 * temporada do estado tem calendário; um ponto de outra temporada vale como "agora".
 */
export function rankingSnapshot(state: PlayerCareerState, at?: RankingPoint): RankingSnapshot {
  const calendar = state.calendar ?? [];
  const played = new Set(calendar.filter((entry) => entry.status === 'PLAYED').map((entry) => entry.index));
  const upTo = at && at.season === state.seasonNumber ? at.eventIndex : Math.max(-1, ...played);
  const blocks = new Map<number, number[]>();
  for (const entry of calendar) {
    const block = formBlockOf(state, entry.index);
    blocks.set(block, [...(blocks.get(block) ?? []), entry.index]);
  }
  let blocksClosed = 0;
  let lastIndex = -1;
  for (const block of [...blocks.keys()].sort((a, b) => a - b)) {
    const indexes = blocks.get(block)!;
    if (!indexes.every((index) => played.has(index) && index <= upTo)) break;
    blocksClosed += 1;
    lastIndex = Math.max(lastIndex, ...indexes);
  }
  // Temporada toda fechada: o ano inteiro do mundo entra (o ranking final, que vira o Top 20 HLTV).
  const month = blocks.size && blocksClosed === blocks.size ? 12 : calendar.find((entry) => entry.index === lastIndex)?.month ?? 0;
  return { season: state.seasonNumber, lastIndex, month, blocksClosed, blocksTotal: blocks.size, carry: blocks.size ? 1 - blocksClosed / blocks.size : 1 };
}

interface Row {
  key: string; nick: string; team: string; teamId: string; age: number | null; you: boolean;
  /** Campeonatos jogados na janela e a soma dos pesos do tempo deles. */
  events: number; load: number;
  /** Somas ponderadas (rounds × tier × tempo) do rating cru e do ajustado pelo tier. */
  ratingSum: number; edgeSum: number; ratingWeight: number;
  /** Pontos de colocação, MVP e EVP por campeonato (os melhores BEST_EVENTS entram no motivo). */
  byEvent: Map<string, EventPoints>;
  reasons: RankingReasons;
}
interface EventPoints { placements: number; mvpPoints: number; evpPoints: number }
const eventTotal = (points: EventPoints) => points.placements + points.mvpPoints + points.evpPoints;

const emptyReasons = (): RankingReasons => ({ titles: 0, mvps: 0, evps: 0, placements: 0, mvpPoints: 0, evpPoints: 0, strength: 0, base: 0 });
/** Ordem de código (a mesma em qualquer aparelho), para o desempate ser determinístico. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const newRow = (base: Omit<Row, 'events' | 'load' | 'ratingSum' | 'edgeSum' | 'ratingWeight' | 'byEvent' | 'reasons'>, reasons = emptyReasons()): Row =>
  ({ ...base, events: 0, load: 0, ratingSum: 0, edgeSum: 0, ratingWeight: 0, byEvent: new Map(), reasons });

/** Colocação, MVP e EVP dos melhores BEST_EVENTS campeonatos (empate: a ordem de chave, determinística). */
function bestEvents(row: Row): Row {
  const best = [...row.byEvent].sort((a, b) => eventTotal(b[1]) - eventTotal(a[1]) || byText(a[0], b[0])).slice(0, BEST_EVENTS);
  const sum = (part: keyof EventPoints) => best.reduce((total, [, points]) => total + points[part], 0);
  return { ...row, reasons: { ...row.reasons, placements: sum('placements'), mvpPoints: sum('mvpPoints'), evpPoints: sum('evpPoints') } };
}

/** Quem está na ativa num elenco do mundo na temporada (sem os nicks gerados e sem quem ficou no banco por causa da
 *  sua vaga), com a base real no peso que ela ainda tem. */
function activeRows(state: PlayerCareerState, baseWeight: number): Map<string, Row> {
  const season = state.seasonNumber;
  const year = yearOfSeason(season);
  const rosters = worldRosters(state.seed, season);
  const benched = new Set(state.seatsTaken.filter((seat) => seat.orgId === state.orgId).flatMap((seat) => seatedNicks(state, seat)));
  const rows = new Map<string, Row>();
  for (const org of [...sceneOrgs].sort((a, b) => a.level - b.level || byText(a.id, b.id))) {
    for (const member of rosters.get(org.id) ?? []) {
      const nick = memberNick(member);
      const key = nick.toLowerCase();
      if (member.generated || rows.has(key) || (org.id === state.orgId && benched.has(key))) continue;
      const reasons = emptyReasons();
      const real = REAL_BY_KEY.get((member.catalogBaseId ?? nick).toLowerCase()) ?? REAL_BY_KEY.get(key);
      if (real) reasons.base = basePointsOf(real.rank) * baseWeight;
      const born = memberBirthYear(member);
      rows.set(key, newRow({ key, nick, team: org.name, teamId: org.id, age: born === null ? null : year - born, you: false }, reasons));
    }
  }
  return rows;
}

/** O rating da temporada em pontos: o ajustado acima do piso, proporcional aos campeonatos até FULL_EVENTS. */
function withRating(row: Row): Row {
  if (!row.ratingWeight) return row;
  const rating = row.ratingSum / row.ratingWeight;
  const edged = row.edgeSum / row.ratingWeight;
  const ratingPoints = Math.max(0, edged - RATING_FLOOR) * RATING_SCALE * Math.min(1, row.load / FULL_EVENTS);
  return { ...row, reasons: { ...row.reasons, rating: Number(rating.toFixed(2)), events: row.events, ratingPoints } };
}

/** Entra na lista quem jogou o mínimo de campeonatos na janela; no começo da carreira, também quem ainda tem base real. */
const eligible = (row: Row) => row.events >= MIN_EVENTS_RANKED || (!row.you && row.reasons.base >= 1);

/** A lista em ordem: pontos (as partes do motivo arredondadas, então a soma bate), depois a base real, depois o nick. */
function ranked(rows: Iterable<Row>): RankedPlayer[] {
  return [...rows]
    .filter(eligible)
    .map(bestEvents)
    .map(withRating)
    .map((row) => {
      const reasons: RankingReasons = {
        ...row.reasons,
        ratingPoints: Math.round(row.reasons.ratingPoints ?? 0),
        placements: Math.round(row.reasons.placements),
        mvpPoints: Math.round(row.reasons.mvpPoints),
        evpPoints: Math.round(row.reasons.evpPoints),
        strength: Math.round(row.reasons.strength),
        base: Math.round(row.reasons.base)
      };
      return { row, reasons, points: pointsOf(reasons) };
    })
    .sort((a, b) => b.points - a.points || b.reasons.base - a.reasons.base || byText(a.row.nick, b.row.nick))
    .map(({ row, reasons, points }) => ({
      nick: row.nick, team: row.team, teamId: row.teamId, score: points, points, reasons, age: row.age,
      ...(reasons.rating !== undefined ? { rating: reasons.rating } : {}),
      ...(row.you ? { you: true } : {})
    }));
}

interface Ranking { rows: RankedPlayer[]; pending: number; snapshot: RankingSnapshot }

function rankingOf(state: PlayerCareerState, at: RankingPoint | undefined, source: WorldSource): Ranking {
  const snapshot = rankingSnapshot(state, at);
  const season = state.seasonNumber;
  const rows = activeRows(state, season <= 1 ? snapshot.carry : 0);
  const you = newRow({ key: state.nick.toLowerCase(), nick: state.nick, team: orgOf(state.orgId).name, teamId: state.orgId, age: state.age, you: true });
  const rowOf = (nick: string): Row | null => (nick.toLowerCase() === you.key ? you : rows.get(nick.toLowerCase()) ?? null);
  const fives = new Map<string, string[]>();
  const credit = (row: Row, event: string, part: keyof EventPoints, points: number) => {
    const entry = row.byEvent.get(event) ?? { placements: 0, mvpPoints: 0, evpPoints: 0 };
    entry[part] += points;
    row.byEvent.set(event, entry);
  };
  const place = (event: string, eventSeason: number, orgId: string, slot: number, tier: EventTier, weight: number) => {
    const key = `${eventSeason}:${orgId}`;
    if (!fives.has(key)) fives.set(key, fiveOf(state, eventSeason, orgId));
    for (const nick of fives.get(key)!) {
      const row = rowOf(nick);
      if (!row) continue;
      credit(row, event, 'placements', PLACE_POINTS[tier][slot] * weight);
      if (slot === 0) row.reasons.titles += 1;
    }
  };
  /** Um campeonato no rating de quem jogou: pesa pelos rounds, pelo tier e pelo tempo. */
  const sample = (row: Row | null, rating: number, rounds: number, tier: EventTier, weight: number) => {
    if (!row || weight <= 0) return;
    const share = Math.max(1, rounds) * TIER_RATING_WEIGHT[tier] * weight;
    row.events += 1;
    row.load += weight;
    row.ratingSum += rating * share;
    row.edgeSum += (rating + TIER_RATING_EDGE[tier]) * share;
    row.ratingWeight += share;
  };
  /** Todos que jogaram o campeonato (sem as linhas, num resultado antigo: só os melhores dele). */
  const sampleAll = (lines: TournamentResult['lines'], top: TournamentResult['topPlayers'], tier: EventTier, weight: number, skip?: string) => {
    for (const line of lines ?? (top ?? []).map((player) => ({ ...player, rounds: NOMINAL_ROUNDS }))) {
      if (skip && line.nick.toLowerCase() === skip) continue;
      sample(rowOf(line.nick), line.rating, line.rounds, tier, weight);
    }
  };
  const award = (event: string, nick: string, tier: EventTier, weight: number, evp: boolean) => {
    const row = rowOf(nick);
    if (!row) return;
    const points = MVP_POINTS[tier] * weight * (evp ? EVP_SHARE : 1);
    if (evp) row.reasons.evps += 1;
    else row.reasons.mvps += 1;
    credit(row, event, evp ? 'evpPoints' : 'mvpPoints', points);
  };

  // 1) Os seus campeonatos: a colocação do seu time, os outros times do chaveamento e o MVP. A temporada passada entra
  //    com o peso que ainda tem; a atual, até o fim do último bloco fechado.
  const previous = season > 1 && snapshot.carry > 0 ? state.history.find((log) => log.seasonNumber === season - 1) ?? null : null;
  const yours: Array<{ season: number; orgId: string; result: TournamentResult; weight: number }> = [
    ...(previous ? previous.tournaments.map((result) => ({ season: season - 1, orgId: previous.orgId, result, weight: snapshot.carry })) : []),
    ...(state.calendar ?? []).flatMap((entry) => (entry.result && entry.index <= snapshot.lastIndex ? [{ season, orgId: state.orgId, result: entry.result, weight: 1 }] : []))
  ];
  for (const item of yours) {
    const { result, weight } = item;
    if (result.skipped) continue;
    const tier = result.tier ?? 'C';
    // O seu rating é o do campeonato (o que a tela mostra); no banco, o time jogou sem você e ele não conta.
    if (!result.benched) {
      const mine = result.lines?.find((line) => line.nick.toLowerCase() === you.key);
      sample(you, result.rating, mine?.rounds ?? NOMINAL_ROUNDS, tier, weight);
    }
    sampleAll(result.lines, result.topPlayers, tier, weight, you.key);
    const slot = SLOT_OF_PLACEMENT[result.placement];
    const event = eventKey(item.season, result.name);
    if (slot !== undefined) place(event, item.season, item.orgId, slot, tier, weight);
    for (const line of result.bracket ?? []) {
      const other = (side: 'a' | 'b', lineSlot: number) => {
        if (line.you === side) return;
        const orgId = orgIdOfName(side === 'a' ? line.a : line.b);
        if (orgId) place(event, item.season, orgId, lineSlot, tier, weight);
      };
      const winner = line.aWon ? 'a' : 'b';
      const loser = line.aWon ? 'b' : 'a';
      if (line.phase === 'final') {
        other(winner, 0);
        other(loser, 1);
      } else other(loser, line.phase === 'semifinal' ? 2 : 3);
    }
    if (result.mvp) award(event, result.mvp.you ? state.nick : result.mvp.nick, tier, weight, false);
    // Os EVPs saem do mesmo topPlayers do circuito do mundo (você com o nick da carreira).
    for (const nick of evpNicksOf(result.topPlayers, result.mvp?.you ? state.nick : result.mvp?.nick)) award(event, nick, tier, weight, true);
  }

  // 2) O circuito do mundo: a temporada passada inteira (com o peso dela) e a atual até o mês do bloco fechado. O que
  //    você jogou com campeão conhecido já contou acima; o que ainda não tem resultado no cache fica pendente.
  const covered = coveredEventKeys(state);
  let pending = 0;
  const scoreWorld = (result: WorldEventResult, weight: number) => {
    sampleAll(result.lines, result.topPlayers, result.tier, weight, you.key);
    for (const placement of result.placements) {
      const slot = slotOfPlace(placement.place);
      if (slot !== null) place(result.key, result.season, placement.orgId, slot, result.tier, weight);
    }
    if (result.mvp) award(result.key, result.mvp.nick, result.tier, weight, false);
    for (const nick of evpNicksOf(result.topPlayers, result.mvp?.nick)) award(result.key, nick, result.tier, weight, true);
  };
  // Nunca depois do relógio do circuito (sem spoiler): o mês do bloco fechado pode ser o mesmo do seu próximo
  // campeonato, e o mundo desse mês ainda não aconteceu.
  const clock = careerClock(state);
  const spans = [
    ...(season > 1 && snapshot.carry > 0 ? [{ season: season - 1, month: 12, weight: snapshot.carry }] : []),
    { season, month: clock.season === season ? Math.min(snapshot.month, clock.month) : snapshot.month, weight: 1 }
  ];
  for (const span of spans) {
    for (const event of source.events(span.season)) {
      if (event.month > span.month || covered.has(eventKey(span.season, event.name))) continue;
      const result = source.result(event);
      if (result) scoreWorld(result, span.weight);
      else pending += 1;
    }
  }

  return { rows: ranked([...rows.values(), you]), pending, snapshot };
}

/** O ranking de jogadores no ponto pedido (sem ponto, agora), com o mundo da fonte (padrão: o cache do circuito). */
export function playerRanking(state: PlayerCareerState, at?: RankingPoint, source: WorldSource = circuitSource(state)): RankedPlayer[] {
  return rankingOf(state, at, source).rows;
}

export const PLAYER_RANKING_TOP = 20;

export interface PlayerRankingView {
  year: number;
  /** O top 20 (a sua posição fora dele vai em `myRank`). */
  rows: RankedPlayer[];
  myRank: number | null;
  total: number;
  /** Quanto o ranking real ainda pesa (1 no começo da carreira, 0 da segunda temporada em diante). */
  baseWeight: number;
  /** Campeonatos do mundo que já contam e ainda não têm resultado no cache. */
  pending: number;
  blocksClosed: number;
  blocksTotal: number;
}

/** O que a aba Top jogadores da tela Mundo mostra. */
export function playerRankingView(state: PlayerCareerState, source: WorldSource = circuitSource(state)): PlayerRankingView {
  const { rows, pending, snapshot } = rankingOf(state, undefined, source);
  const mine = rows.findIndex((row) => row.you);
  return {
    year: yearOfSeason(state.seasonNumber),
    rows: rows.slice(0, PLAYER_RANKING_TOP),
    myRank: mine >= 0 ? mine + 1 : null,
    total: rows.length,
    baseWeight: state.seasonNumber <= 1 ? snapshot.carry : 0,
    pending,
    blocksClosed: snapshot.blocksClosed,
    blocksTotal: snapshot.blocksTotal
  };
}
