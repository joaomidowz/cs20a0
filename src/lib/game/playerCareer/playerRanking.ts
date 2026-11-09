// src/lib/game/playerCareer/playerRanking.ts
// Ranking de jogadores da Carreira (D7b). No começo da carreira é o ranking real: o Top 20 HLTV mais recente do
// catálogo, só de quem está na ativa num elenco do mundo. Cada jogador tem pontos com motivo (a força de quem joga e o
// que vale o ranking real), e o ranking real vale na primeira temporada e some da segunda em diante.
import rawPlayers from '$lib/data/cs/players.game.json';
import { memberBirthYear, memberCatalogOverall, memberNick, sceneOrgs } from './data';
import type { PlayerCareerState, RankedPlayer, RankingReasons } from './engine';
import { seatedNicks } from './squad';
import { worldRosters, yearOfSeason } from './world';

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

/** O ranking de jogadores de agora: o ranking real pesa inteiro na temporada 1 e some da temporada 2 em diante. */
export function playerRanking(state: PlayerCareerState): RankedPlayer[] {
  return ranked(activeRows(state, state.seasonNumber <= 1 ? 1 : 0).values());
}

export const PLAYER_RANKING_TOP = 20;

export interface PlayerRankingView {
  year: number;
  /** O top 20 (a sua posição fora dele vai em `myRank`). */
  rows: RankedPlayer[];
  myRank: number | null;
  total: number;
  /** Quanto o ranking real ainda pesa (1 na primeira temporada, 0 da segunda em diante). */
  baseWeight: number;
}

/** O que a aba Top jogadores da tela Mundo mostra. */
export function playerRankingView(state: PlayerCareerState): PlayerRankingView {
  const all = playerRanking(state);
  const mine = all.findIndex((row) => row.you);
  return { year: yearOfSeason(state.seasonNumber), rows: all.slice(0, PLAYER_RANKING_TOP), myRank: mine >= 0 ? mine + 1 : null, total: all.length, baseWeight: state.seasonNumber <= 1 ? 1 : 0 };
}
