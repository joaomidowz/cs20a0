// src/lib/game/playerCareer/retrospective.ts
// A retrospectiva da carreira (ao pendurar o mouse): as eras em cada time, os números de tudo, a melhor temporada,
// os Majors, as melhores jogadas e a curva de overall. Puro: lê o histórico salvo e devolve o que a tela anima.
import type { EventTier } from './calendar';
import type { PlayerCareerState, PlayHighlight, TournamentResult } from './engine';
import { seasonLevelOf } from './tiers';

export interface RetroEra {
  orgId: string;
  orgName: string;
  /** O nível em que a maioria das temporadas da era foi jogada (empate: o mais recente), na régua de hoje. */
  level: number;
  from: number;
  to: number;
  seasons: number;
  titles: number;
  majors: string[];
  mvps: number;
  bestRating: number;
  bestHltv: number | null;
}

export interface RetroSeason { year: number; orgId: string; orgName: string; level: number; rating: number; titles: number; majors: number; mvps: number; hltvRank: number | null; overall: number; rookie: boolean }

export interface RetroTitle { name: string; tier: EventTier | null; mvp: boolean }

export interface Retrospective {
  nick: string;
  from: number;
  to: number;
  seasons: number;
  startAge: number;
  endAge: number;
  line: string;
  becameCoach: boolean;
  first: { orgId: string; orgName: string; level: number } | null;
  totals: {
    events: number; titles: number; majors: number; sTier: number; mvps: number; majorMvps: number;
    finals: number; finalsWon: number; hltvTop1: number; hltvTop20: number; bestHltv: number | null; rookie: boolean;
    aces: number; quads: number; clutches: number; bestOverall: number; peakYear: number; bestRating: number; bestRatingYear: number;
  };
  eras: RetroEra[];
  seasonsList: RetroSeason[];
  bestSeason: RetroSeason | null;
  majorTitles: Array<{ name: string; year: number; mvp: boolean }>;
  topPlays: Array<PlayHighlight & { event: string; year: number }>;
  titlesByYear: Array<{ year: number; orgName: string; titles: RetroTitle[] }>;
  /** Overall no começo e no fim de cada temporada. */
  curve: Array<{ year: number; overall: number }>;
}

const isTitle = (result: TournamentResult) => result.placement === 'Campeão';
const playWeight = (play: PlayHighlight) => (play.kind === 'ace' ? 100 : play.kind === 'clutch' ? 40 + (play.against ?? 1) * 12 : play.kind === 'quad' ? 50 : 30);

/** Nível de uma era: o nível em que a maioria das temporadas dela foi jogada; empate fica com o mais recente. */
export function eraLevel(levels: number[]): number {
  const counts = new Map<number, number>();
  for (const level of levels) counts.set(level, (counts.get(level) ?? 0) + 1);
  let best = levels[levels.length - 1];
  for (let index = levels.length - 1; index >= 0; index -= 1) {
    if ((counts.get(levels[index]) ?? 0) > (counts.get(best) ?? 0)) best = levels[index];
  }
  return best;
}

export function buildRetrospective(state: PlayerCareerState): Retrospective {
  const logs = state.history;
  const eras: RetroEra[] = [];
  /** Os níveis de cada temporada de cada era (mesma ordem de `eras`). */
  const eraLevels: number[][] = [];
  const seasonsList: RetroSeason[] = [];
  const titlesByYear: Retrospective['titlesByYear'] = [];
  const majorTitles: Retrospective['majorTitles'] = [];
  const plays: Retrospective['topPlays'] = [];
  const totals = {
    events: 0, titles: 0, majors: 0, sTier: 0, mvps: 0, majorMvps: 0, finals: 0, finalsWon: 0, hltvTop1: 0, hltvTop20: 0,
    bestHltv: null as number | null, rookie: false, aces: 0, quads: 0, clutches: 0,
    bestOverall: 0, peakYear: logs[0]?.year ?? state.year, bestRating: 0, bestRatingYear: logs[0]?.year ?? state.year
  };
  for (const log of logs) {
    const level = seasonLevelOf(log);
    const played = log.tournaments.filter((result) => !result.skipped);
    const titles = played.filter(isTitle);
    const majors = titles.filter((result) => result.tier === 'Major');
    const mvps = played.filter((result) => result.mvp?.you);
    totals.events += played.length;
    totals.titles += titles.length;
    totals.majors += majors.length;
    totals.sTier += titles.filter((result) => result.tier === 'S').length;
    totals.mvps += mvps.length;
    totals.majorMvps += mvps.filter((result) => result.tier === 'Major').length;
    totals.finals += played.filter((result) => result.placement === 'Campeão' || result.placement === 'Vice').length;
    totals.finalsWon += titles.length;
    for (const result of played) {
      totals.aces += result.plays?.aces ?? 0;
      totals.quads += result.plays?.quads ?? 0;
      totals.clutches += result.plays?.clutches ?? 0;
      for (const play of result.highlights ?? []) plays.push({ ...play, event: result.name, year: log.year });
    }
    if (log.hltvRank) {
      if (log.hltvRank === 1) totals.hltvTop1 += 1;
      if (log.hltvRank <= 20) totals.hltvTop20 += 1;
      totals.bestHltv = totals.bestHltv === null ? log.hltvRank : Math.min(totals.bestHltv, log.hltvRank);
    }
    if (log.rookie?.you) totals.rookie = true;
    if (log.overallAfter > totals.bestOverall) { totals.bestOverall = log.overallAfter; totals.peakYear = log.year; }
    if (log.seasonRating > totals.bestRating) { totals.bestRating = log.seasonRating; totals.bestRatingYear = log.year; }
    for (const result of majors) majorTitles.push({ name: result.name, year: log.year, mvp: Boolean(result.mvp?.you) });
    if (titles.length) titlesByYear.push({ year: log.year, orgName: log.orgName, titles: titles.map((result) => ({ name: result.name, tier: result.tier ?? null, mvp: Boolean(result.mvp?.you) })) });
    seasonsList.push({
      year: log.year, orgId: log.orgId, orgName: log.orgName, level, rating: log.seasonRating, titles: titles.length,
      majors: majors.length, mvps: mvps.length, hltvRank: log.hltvRank ?? null, overall: log.overallAfter, rookie: Boolean(log.rookie?.you)
    });
    const last = eras.at(-1);
    if (last && last.orgId === log.orgId) {
      last.to = log.year;
      last.seasons += 1;
      last.titles += titles.length;
      last.majors.push(...majors.map((result) => result.name));
      last.mvps += mvps.length;
      last.bestRating = Math.max(last.bestRating, log.seasonRating);
      eraLevels[eraLevels.length - 1].push(level);
      if (log.hltvRank) last.bestHltv = last.bestHltv === null ? log.hltvRank : Math.min(last.bestHltv, log.hltvRank);
    } else {
      eras.push({
        orgId: log.orgId, orgName: log.orgName, level, from: log.year, to: log.year, seasons: 1, titles: titles.length,
        majors: majors.map((result) => result.name), mvps: mvps.length, bestRating: log.seasonRating, bestHltv: log.hltvRank ?? null
      });
      eraLevels.push([level]);
    }
  }
  eras.forEach((era, index) => { era.level = eraLevel(eraLevels[index]); });
  // A melhor temporada: mais títulos, depois Major, depois o rating.
  const bestSeason = [...seasonsList].sort((a, b) => b.titles - a.titles || b.majors - a.majors || b.rating - a.rating)[0] ?? null;
  const curve = logs.length ? [{ year: logs[0].year, overall: logs[0].overallBefore }, ...logs.map((log) => ({ year: log.year + 1, overall: log.overallAfter }))] : [];
  return {
    nick: state.nick,
    from: logs[0]?.year ?? state.year,
    to: logs.at(-1)?.year ?? state.year,
    seasons: logs.length,
    startAge: Math.max(14, state.age - logs.length),
    endAge: state.age,
    line: state.verdict?.line ?? '',
    becameCoach: Boolean(state.verdict?.becameCoach),
    first: logs[0] ? { orgId: logs[0].orgId, orgName: logs[0].orgName, level: seasonLevelOf(logs[0]) } : null,
    totals,
    eras,
    seasonsList,
    bestSeason,
    majorTitles,
    topPlays: plays.sort((a, b) => playWeight(b) - playWeight(a) || b.year - a.year).slice(0, 6),
    titlesByYear,
    curve
  };
}
