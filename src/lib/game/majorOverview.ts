import type { MajorRound, MajorStanding, MajorTournament, SeriesResult } from './types';

export type OverviewStatus = 'completed' | 'live' | 'pending';

export interface OverviewSeries {
  series: SeriesResult;
  status: OverviewStatus;
}

export interface OverviewRound {
  number: number;
  phase: MajorRound['phase'];
  series: OverviewSeries[];
}

export interface RevealCursor {
  /** Series currently being played, if any. */
  liveSeriesId: string | null;
  /** Every series playing simultaneously (online rounds run all matches at once). */
  liveSeriesIds?: Iterable<string>;
  /** Optional per-series resolution; defaults to "everything before the live round is done". */
  isResolved?: (seriesId: string) => boolean;
  /** Reveal the whole tournament (results screen). */
  complete?: boolean;
}

/**
 * Returns only the rounds a viewer is allowed to see: every round up to the one containing the live series.
 * Later rounds are omitted entirely so future pairings never leak.
 */
export function revealRounds(rounds: MajorRound[], cursor: RevealCursor): OverviewRound[] {
  if (cursor.complete) return rounds.map((round) => ({ number: round.number, phase: round.phase, series: round.series.map((series) => ({ series, status: 'completed' as const })) }));
  const liveIds = new Set<string>(cursor.liveSeriesIds ?? []);
  if (cursor.liveSeriesId) liveIds.add(cursor.liveSeriesId);
  const liveRoundIndex = liveIds.size ? rounds.findIndex((round) => round.series.some((series) => liveIds.has(series.id))) : -1;
  const revealed: OverviewRound[] = [];
  for (const [index, round] of rounds.entries()) {
    if (liveRoundIndex >= 0 && index > liveRoundIndex) break;
    const isLiveRound = index === liveRoundIndex;
    if (liveRoundIndex < 0 && cursor.isResolved && !round.series.some((series) => cursor.isResolved!(series.id))) break;
    const series = round.series.map((item): OverviewSeries => {
      if (liveIds.has(item.id)) return { series: item, status: 'live' };
      if (cursor.isResolved) return { series: item, status: cursor.isResolved(item.id) ? 'completed' : 'pending' };
      return { series: item, status: isLiveRound ? 'pending' : 'completed' };
    });
    revealed.push({ number: round.number, phase: round.phase, series });
    if (liveRoundIndex < 0 && !cursor.isResolved) break;
  }
  return revealed;
}

export interface SwissTeamRef {
  id: string;
  name: string;
}

export interface SwissGroup {
  wins: number;
  losses: number;
  record: string;
  series: OverviewSeries[];
}

export interface SwissColumn {
  roundNumber: number;
  groups: SwissGroup[];
}

export interface SwissOutcome {
  record: string;
  wins: number;
  losses: number;
  teams: SwissTeamRef[];
}

export interface SwissGraph {
  columns: SwissColumn[];
  qualified: SwissOutcome[];
  eliminated: SwissOutcome[];
  done: boolean;
}

const recordLabel = (wins: number, losses: number) => `${wins}–${losses}`;

/** Builds the Swiss "record flow": one column per round, matches grouped by the record both teams carry into the round. */
export function buildSwissGraph(rounds: OverviewRound[]): SwissGraph {
  const records = new Map<string, { wins: number; losses: number; name: string; done: 'qualified' | 'eliminated' | null }>();
  const ensure = (id: string, name: string) => {
    if (!records.has(id)) records.set(id, { wins: 0, losses: 0, name, done: null });
    return records.get(id)!;
  };
  const columns: SwissColumn[] = [];
  for (const round of rounds.filter((item) => item.phase === 'swiss')) {
    const groups = new Map<string, SwissGroup>();
    for (const entry of round.series) {
      const left = ensure(entry.series.teamA.id, entry.series.teamA.name);
      const right = ensure(entry.series.teamB.id, entry.series.teamB.name);
      const lead = left.wins > right.wins || (left.wins === right.wins && left.losses <= right.losses) ? left : right;
      const key = recordLabel(lead.wins, lead.losses);
      if (!groups.has(key)) groups.set(key, { wins: lead.wins, losses: lead.losses, record: key, series: [] });
      groups.get(key)!.series.push(entry);
    }
    for (const entry of round.series) {
      if (entry.status !== 'completed') continue;
      const winner = ensure(entry.series.winnerId, entry.series.winnerId === entry.series.teamA.id ? entry.series.teamA.name : entry.series.teamB.name);
      const loserId = entry.series.winnerId === entry.series.teamA.id ? entry.series.teamB.id : entry.series.teamA.id;
      const loser = ensure(loserId, loserId === entry.series.teamA.id ? entry.series.teamA.name : entry.series.teamB.name);
      winner.wins += 1;
      loser.losses += 1;
      if (winner.wins === 3) winner.done = 'qualified';
      if (loser.losses === 3) loser.done = 'eliminated';
    }
    columns.push({
      roundNumber: round.number,
      groups: [...groups.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses)
    });
  }
  const outcome = (kind: 'qualified' | 'eliminated'): SwissOutcome[] => {
    const byRecord = new Map<string, SwissOutcome>();
    for (const [id, record] of records) {
      if (record.done !== kind) continue;
      const key = recordLabel(record.wins, record.losses);
      if (!byRecord.has(key)) byRecord.set(key, { record: key, wins: record.wins, losses: record.losses, teams: [] });
      byRecord.get(key)!.teams.push({ id, name: record.name });
    }
    return [...byRecord.values()].sort((a, b) => kind === 'qualified' ? a.losses - b.losses : b.wins - a.wins);
  };
  const qualified = outcome('qualified');
  const eliminated = outcome('eliminated');
  return { columns, qualified, eliminated, done: qualified.reduce((sum, item) => sum + item.teams.length, 0) === 8 };
}

export interface BracketSlot {
  id: string | null;
  name: string | null;
  score: number | null;
  winner: boolean;
}

export interface BracketMatch {
  id: string | null;
  status: OverviewStatus | 'tbd';
  a: BracketSlot;
  b: BracketSlot;
}

export interface BracketColumn {
  phase: 'quarterfinal' | 'semifinal' | 'final';
  matches: BracketMatch[];
}

const emptySlot = (): BracketSlot => ({ id: null, name: null, score: null, winner: false });

/** Builds the eight-team single-elimination bracket. Unrevealed rounds show slots derived from earlier winners or "TBD". */
export function buildBracket(rounds: OverviewRound[], options: { liveScores?: boolean } = {}): BracketColumn[] {
  const phases: BracketColumn['phase'][] = ['quarterfinal', 'semifinal', 'final'];
  const sizes = { quarterfinal: 4, semifinal: 2, final: 1 };
  const columns: BracketColumn[] = [];
  let previous: BracketMatch[] = [];
  for (const phase of phases) {
    const round = rounds.find((item) => item.phase === phase);
    const matches: BracketMatch[] = [];
    for (let index = 0; index < sizes[phase]; index += 1) {
      const entry = round?.series[index];
      if (entry) {
        const showScore = entry.status === 'completed' || (Boolean(options.liveScores) && entry.status === 'live');
        matches.push({
          id: entry.series.id,
          status: entry.status,
          a: { id: entry.series.teamA.id, name: entry.series.teamA.name, score: showScore ? entry.series.scoreA : null, winner: showScore && entry.series.winnerId === entry.series.teamA.id },
          b: { id: entry.series.teamB.id, name: entry.series.teamB.name, score: showScore ? entry.series.scoreB : null, winner: showScore && entry.series.winnerId === entry.series.teamB.id }
        });
        continue;
      }
      const feederA = previous[index * 2];
      const feederB = previous[index * 2 + 1];
      const winnerOf = (feeder?: BracketMatch): BracketSlot => {
        if (!feeder || feeder.status !== 'completed') return emptySlot();
        const winner = feeder.a.winner ? feeder.a : feeder.b.winner ? feeder.b : null;
        return winner ? { id: winner.id, name: winner.name, score: null, winner: false } : emptySlot();
      };
      matches.push({ id: null, status: 'tbd', a: winnerOf(feederA), b: winnerOf(feederB) });
    }
    columns.push({ phase, matches });
    previous = matches;
  }
  return columns;
}

/** Standings after the given number of fully revealed rounds (never leaks later results). */
export function computeStandings(tournament: MajorTournament, revealedRounds: number): MajorStanding[] {
  const standings = tournament.standings.map((standing): MajorStanding & { opponents: string[] } => ({
    ...standing,
    wins: 0,
    losses: 0,
    buchholz: 0,
    status: tournament.rounds[0]?.phase === 'swiss' ? 'active' : 'qualified',
    placement: null,
    opponents: []
  }));
  const byId = new Map(standings.map((standing) => [standing.organizationId, standing]));
  for (const round of tournament.rounds.slice(0, Math.max(0, revealedRounds))) {
    for (const series of round.series) {
      const left = byId.get(series.teamA.id);
      const right = byId.get(series.teamB.id);
      if (!left || !right) continue;
      const winner = series.winnerId === left.organizationId ? left : right;
      const loser = winner === left ? right : left;
      if (round.phase === 'swiss') {
        left.opponents.push(right.organizationId);
        right.opponents.push(left.organizationId);
        winner.wins += 1;
        loser.losses += 1;
        if (winner.wins === 3) winner.status = 'qualified';
        if (loser.losses === 3) loser.status = 'eliminated';
      } else {
        loser.status = 'eliminated';
        loser.placement = round.phase === 'quarterfinal' ? '5to8' : round.phase === 'semifinal' ? '3to4' : 'runnerUp';
        winner.status = round.phase === 'final' ? 'champion' : 'qualified';
        if (round.phase === 'final') winner.placement = 'champion';
      }
    }
    const wins = new Map(standings.map((standing) => [standing.organizationId, standing.wins]));
    for (const standing of standings) standing.buchholz = standing.opponents.reduce((sum, id) => sum + (wins.get(id) ?? 0), 0);
  }
  // Podium first (champion, runner-up, semifinalists), then whoever is still alive in the bracket, then the quarterfinal
  // losers, the teams still fighting in Stage 3 and finally the Stage 3 eliminations.
  const rank = (standing: MajorStanding) => {
    if (standing.placement === 'champion') return 0;
    if (standing.placement === 'runnerUp') return 1;
    if (standing.placement === '3to4') return 2;
    if (standing.status === 'qualified') return 3;
    if (standing.placement === '5to8') return 4;
    return standing.status === 'active' ? 5 : 6;
  };
  return standings
    .map(({ opponents: _opponents, ...standing }) => standing)
    .sort((left, right) => rank(left) - rank(right) || right.wins - left.wins || right.buchholz - left.buchholz || left.losses - right.losses || left.seed - right.seed);
}

/** Number of rounds whose every series is completed, counted from the start. */
export const countCompletedRounds = (rounds: OverviewRound[]) => {
  let count = 0;
  for (const round of rounds) {
    if (!round.series.every((entry) => entry.status === 'completed')) break;
    count += 1;
  }
  return count;
};
