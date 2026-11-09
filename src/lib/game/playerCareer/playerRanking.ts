// src/lib/game/playerCareer/playerRanking.ts
// Ranking de jogadores da Carreira (D7b). No começo da carreira é o ranking real: o Top 20 HLTV mais recente do
// catálogo, só de quem está na ativa num elenco do mundo. Ele anda no fechamento de cada bloco de campeonatos (D1,
// form.ts) com os resultados dos últimos 12 meses: a colocação do time pelo tier do campeonato, MVP e EVP, e a força de
// quem joga. A temporada passada e o ranking real perdem peso bloco a bloco; o real some no começo da segunda
// temporada. Cada linha guarda o motivo dos pontos. O mundo vem da fonte do circuito (só cache, sem spoiler): o que
// ainda calcula fica pendente e entra quando chegar.
import rawPlayers from '$lib/data/cs/players.game.json';
import { MIN_EVENTS_RANKED } from './awards';
import type { EventTier } from './calendar';
import type { WorldEventResult } from './circuit';
import { memberBirthYear, memberCatalogOverall, memberNick, sceneOrgs } from './data';
import { orgOf, type PlayerCareerState, type RankedPlayer, type RankingReasons, type TournamentResult } from './engine';
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

/** Degrau da base real: o 1º vale 6.300 e cada posição abaixo 300 a menos (o 20º, 600). O degrau é maior que toda a
 *  faixa da força (0 a 290), então no começo da carreira a ordem é exatamente a do ranking real. */
export const BASE_STEP = 300;
export const basePointsOf = (rank: number): number => BASE_STEP * Math.max(0, 22 - rank);
/** Força de quem joga: 10 pontos por ponto de overall acima de 70 (o 99 vale 290). */
export const strengthPointsOf = (overall: number): number => Math.max(0, Math.round(overall) - 70) * 10;

/** Pontos do time por colocação (campeão, vice, semifinal, quartas), pelo tier do campeonato. */
export const PLACE_POINTS: Record<EventTier, readonly [number, number, number, number]> = {
  Major: [1000, 600, 350, 200],
  S: [700, 420, 250, 140],
  A: [350, 210, 120, 70],
  B: [120, 70, 40, 20],
  C: [50, 30, 15, 8]
};
/** MVP do campeonato, pelo tier. */
export const MVP_POINTS: Record<EventTier, number> = { Major: 300, S: 200, A: 100, B: 40, C: 15 };
/** EVP: os 4 melhores do campeonato depois do MVP (pelo rating de quadra), com 40% dos pontos do MVP. */
export const EVPS_PER_EVENT = 4;
export const EVP_SHARE = 0.4;

const SLOT_OF_PLACEMENT: Record<string, number> = { 'Campeão': 0, Vice: 1, Semis: 2, Quartas: 3 };
/** Colocação no resultado do mundo (1 = campeão) na faixa de pontos: campeão, vice, semifinal (3-4) e quartas (5-8). */
const slotOfPlace = (place: number): number | null => (place === 1 ? 0 : place === 2 ? 1 : place <= 4 ? 2 : place <= 8 ? 3 : null);

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const thousands = (value: number) => value.toLocaleString('pt-BR');

/** "campeonatos 1.840 (2 títulos) · 1 MVP · 3 EVPs · força 230 · ranking real 4.200": o motivo, só com o que vale. */
export function reasonsLabel(reasons: RankingReasons): string {
  return [
    reasons.placements > 0 ? `campeonatos ${thousands(reasons.placements)}${reasons.titles > 0 ? ` (${plural(reasons.titles, 'título', 'títulos')})` : ''}` : '',
    reasons.mvps > 0 ? plural(reasons.mvps, 'MVP', 'MVPs') : '',
    reasons.evps > 0 ? plural(reasons.evps, 'EVP', 'EVPs') : '',
    reasons.strength > 0 ? `força ${thousands(reasons.strength)}` : '',
    reasons.base > 0 ? `ranking real ${thousands(reasons.base)}` : ''
  ].filter(Boolean).join(' · ');
}

/** Os pontos são a soma das partes do motivo. */
export const pointsOf = (reasons: RankingReasons): number =>
  reasons.placements + reasons.mvpPoints + reasons.evpPoints + reasons.strength + reasons.base;

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
  const month = calendar.find((entry) => entry.index === lastIndex)?.month ?? 0;
  return { season: state.seasonNumber, lastIndex, month, blocksClosed, blocksTotal: blocks.size, carry: blocks.size ? 1 - blocksClosed / blocks.size : 1 };
}

interface Row { key: string; nick: string; team: string; teamId: string; age: number | null; you: boolean; events: number; reasons: RankingReasons }

const emptyReasons = (): RankingReasons => ({ titles: 0, mvps: 0, evps: 0, placements: 0, mvpPoints: 0, evpPoints: 0, strength: 0, base: 0 });
/** Ordem de código (a mesma em qualquer aparelho), para o desempate ser determinístico. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Quem está na ativa num elenco do mundo na temporada (sem os nicks gerados e sem quem ficou no banco por causa da
 *  sua vaga): a força pelo overall de hoje e a base real com o peso que ela ainda tem. */
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
      reasons.strength = strengthPointsOf(member.overall ?? memberCatalogOverall(member) ?? org.power ?? 70);
      const real = REAL_BY_KEY.get((member.catalogBaseId ?? nick).toLowerCase()) ?? REAL_BY_KEY.get(key);
      if (real) reasons.base = basePointsOf(real.rank) * baseWeight;
      const born = memberBirthYear(member);
      rows.set(key, { key, nick, team: org.name, teamId: org.id, age: born === null ? null : year - born, you: false, events: 0, reasons });
    }
  }
  return rows;
}

/** A lista em ordem: pontos (as partes do motivo arredondadas, então a soma bate), depois a base real, depois o nick. */
function ranked(rows: Iterable<Row>): RankedPlayer[] {
  return [...rows]
    .map((row) => {
      const reasons: RankingReasons = {
        ...row.reasons,
        placements: Math.round(row.reasons.placements),
        mvpPoints: Math.round(row.reasons.mvpPoints),
        evpPoints: Math.round(row.reasons.evpPoints),
        strength: Math.round(row.reasons.strength),
        base: Math.round(row.reasons.base)
      };
      return { row, reasons, points: pointsOf(reasons) };
    })
    .sort((a, b) => b.points - a.points || b.reasons.base - a.reasons.base || byText(a.row.nick, b.row.nick))
    .map(({ row, reasons, points }) => ({ nick: row.nick, team: row.team, teamId: row.teamId, score: points, points, reasons, age: row.age, ...(row.you ? { you: true } : {}) }));
}

interface Ranking { rows: RankedPlayer[]; pending: number; snapshot: RankingSnapshot }

function rankingOf(state: PlayerCareerState, at: RankingPoint | undefined, source: WorldSource): Ranking {
  const snapshot = rankingSnapshot(state, at);
  const season = state.seasonNumber;
  const rows = activeRows(state, season <= 1 ? snapshot.carry : 0);
  const you: Row = {
    key: state.nick.toLowerCase(), nick: state.nick, team: orgOf(state.orgId).name, teamId: state.orgId, age: state.age, you: true, events: 0,
    reasons: { ...emptyReasons(), strength: strengthPointsOf(state.overall) }
  };
  const rowOf = (nick: string): Row | null => (nick.toLowerCase() === you.key ? you : rows.get(nick.toLowerCase()) ?? null);
  const fives = new Map<string, string[]>();
  const place = (eventSeason: number, orgId: string, slot: number, tier: EventTier, weight: number) => {
    const key = `${eventSeason}:${orgId}`;
    if (!fives.has(key)) fives.set(key, fiveOf(state, eventSeason, orgId));
    for (const nick of fives.get(key)!) {
      const row = rowOf(nick);
      if (!row) continue;
      row.reasons.placements += PLACE_POINTS[tier][slot] * weight;
      if (slot === 0) row.reasons.titles += 1;
    }
  };
  const award = (nick: string, tier: EventTier, weight: number, evp: boolean) => {
    const row = rowOf(nick);
    if (!row) return;
    const points = MVP_POINTS[tier] * weight * (evp ? EVP_SHARE : 1);
    if (evp) {
      row.reasons.evps += 1;
      row.reasons.evpPoints += points;
    } else {
      row.reasons.mvps += 1;
      row.reasons.mvpPoints += points;
    }
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
    you.events += 1;
    const tier = result.tier ?? 'C';
    const slot = SLOT_OF_PLACEMENT[result.placement];
    if (slot !== undefined) place(item.season, item.orgId, slot, tier, weight);
    for (const line of result.bracket ?? []) {
      const other = (side: 'a' | 'b', lineSlot: number) => {
        if (line.you === side) return;
        const orgId = orgIdOfName(side === 'a' ? line.a : line.b);
        if (orgId) place(item.season, orgId, lineSlot, tier, weight);
      };
      const winner = line.aWon ? 'a' : 'b';
      const loser = line.aWon ? 'b' : 'a';
      if (line.phase === 'final') {
        other(winner, 0);
        other(loser, 1);
      } else other(loser, line.phase === 'semifinal' ? 2 : 3);
    }
    if (result.mvp) award(result.mvp.you ? state.nick : result.mvp.nick, tier, weight, false);
  }

  // 2) O circuito do mundo: a temporada passada inteira (com o peso dela) e a atual até o mês do bloco fechado. O que
  //    você jogou com campeão conhecido já contou acima; o que ainda não tem resultado no cache fica pendente.
  const covered = coveredEventKeys(state);
  let pending = 0;
  const scoreWorld = (result: WorldEventResult, weight: number) => {
    for (const placement of result.placements) {
      const slot = slotOfPlace(placement.place);
      if (slot !== null) place(result.season, placement.orgId, slot, result.tier, weight);
    }
    if (result.mvp) award(result.mvp.nick, result.tier, weight, false);
    const mvp = result.mvp?.nick.toLowerCase();
    [...result.topPlayers]
      .filter((player) => player.nick.toLowerCase() !== mvp)
      .sort((a, b) => b.rating - a.rating || byText(a.nick, b.nick))
      .slice(0, EVPS_PER_EVENT)
      .forEach((player) => award(player.nick, result.tier, weight, true));
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

  return { rows: ranked([...rows.values(), ...(you.events >= MIN_EVENTS_RANKED ? [you] : [])]), pending, snapshot };
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
