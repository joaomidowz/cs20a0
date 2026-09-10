import { computeMajorAwards } from './majorAwards';
import { runOnlineTournament } from './online/tournament';
import type { OnlineTournamentResult } from './online/tournament-engine';
import type {
  CombatTeam,
  GameMode,
  OnlineGameMode,
  HistoricalTeam,
  MajorRun,
  MapId,
  MapResult,
  OrgStyle,
  Player,
  SelectedPlayer,
  PlayoffsResult,
  Roster,
  SeriesDecision,
  SeriesResult,
  Stage3Result
} from './types';
import { createMapState, flipMapResult, playMapToEnd } from './rounds';
import {
  createBotMapStrategy,
  createUserMapStrategy,
  getStrategyMapBonus,
  resolveMapVeto,
  type MapSimulationContext
} from './map-veto';
import { isValidLineupMapSelection } from './maps';
import { getSelectedRoles } from './roleRules';

export type SeededRng = () => number;

const number = (value: number | null | undefined, fallback = 70) =>
  Number.isFinite(value) ? Number(value) : fallback;

const hashSeed = (seed: string) => {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export function createSeededRng(seed: string): SeededRng {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickRandomTeam(
  teams: HistoricalTeam[],
  rng: SeededRng,
  excludedIds: string[] = []
): HistoricalTeam | null {
  const available = teams.filter((team) => !excludedIds.includes(team.id));
  if (!available.length) return null;
  return available[Math.floor(rng() * available.length)] ?? available[0];
}

export function calculatePlayerPower(
  player: Player,
  style: OrgStyle,
  _mode: GameMode = 'premier'
): number {
  const stats = {
    overall: number(player.overall),
    firepower: number(player.firepower),
    clutch: number(player.clutch),
    entry: number(player.entry),
    awp: number(player.awp, 20),
    support: number(player.support),
    igl: number(player.igl, 20),
    experience: number(player.experience),
    consistency: number(player.consistency),
    mental: number(player.mental)
  };
  let power =
    stats.overall * 0.35 +
    stats.firepower * 0.13 +
    stats.clutch * 0.1 +
    stats.entry * 0.07 +
    stats.awp * 0.05 +
    stats.support * 0.06 +
    stats.igl * 0.05 +
    stats.experience * 0.06 +
    stats.consistency * 0.07 +
    stats.mental * 0.06;

  if (style === 'aggressive') power += stats.entry * 0.04 + stats.firepower * 0.02 - stats.consistency * 0.012;
  if (style === 'balanced') power += (stats.consistency + stats.firepower) * 0.015;
  if (style === 'tactical') power += stats.support * 0.03 + (stats.igl + stats.mental) * 0.01 - stats.entry * 0.015;
  if (player.rarity === 'goat') power += 1.5;
  if (player.rarity === 'legend') power += 0.8;
  return power;
}

const hasRole = (player: Player, role: string) => (player.role ?? '').toLowerCase().includes(role);

export function calculateUserTeamPower(players: Player[], style: OrgStyle, lineup: SelectedPlayer[] = [], seed = ''): CombatTeam {
  if (!players.length) return { id: 'user', name: 'yourOrg', power: 50, mental: 50, clutch: 50, experience: 50, isUser: true };
  const average = players.reduce((sum, player) => sum + calculatePlayerPower(player, style), 0) / players.length;
  const avg = (key: keyof Player) => players.reduce((sum, player) => sum + number(player[key] as number, 65), 0) / players.length;
  const assignedRoles = lineup.flatMap((selected) => getSelectedRoles(selected));
  const awpers = assignedRoles.length ? assignedRoles.filter((role) => role === 'awper').length : players.filter((player) => hasRole(player, 'awp')).length;
  const igls = assignedRoles.length ? assignedRoles.filter((role) => role === 'igl').length : players.filter((player) => hasRole(player, 'igl')).length;
  const supports = assignedRoles.length ? assignedRoles.filter((role) => role === 'support').length : players.filter((player) => hasRole(player, 'support') || number(player.support) >= 88).length;
  let composition = 0;
  composition += awpers ? 2.2 : -4.5;
  composition += igls ? 2.4 : -4;
  composition += supports ? 1.2 : -1.5;
  if (!awpers) {
    const bestAwp = Math.max(...players.map((player) => number(player.awp, 20)));
    if (bestAwp >= 85) composition += 1.5;
  }
  if (players.every((player) => number(player.firepower) >= 90) && (!igls || !supports)) composition -= 2;
  const studyRng = createSeededRng(`${seed}:tactical-study:${players.map((player) => player.id).join('|')}`);
  const studyPercentage = 60 + Math.floor(studyRng() * 41);
  const aggressionPercentage = Math.round((avg('firepower') + avg('entry')) / 2);
  const elitePlayers = players.filter((player) => number(player.overall) >= 98).length;
  const eliteCoreBonus = Math.min(4.5, elitePlayers * 0.9 + Math.max(0, avg('overall') - 92) * 0.35);
  const highFirepowerPlayers = players.filter((player) => number(player.firepower) >= 90).length;
  const aggressiveBoost = style === 'aggressive' && highFirepowerPlayers >= 3 ? 1.08 : 1;
  const styleMultiplier = (style === 'tactical' ? 1.1 : style === 'balanced' ? 1.05 : 1) * aggressiveBoost;
  return {
    id: 'user',
    name: 'yourOrg',
    power: Math.max(45, Math.min(MAX_TEAM_POWER, (average + composition) * styleMultiplier + eliteCoreBonus + getStarCarry(players))),
    mental: avg('mental'),
    clutch: avg('clutch'),
    experience: avg('experience'),
    consistency: avg('consistency'),
    style,
    studyPercentage,
    aggressionPercentage,
    isUser: true
  };
}

/** Upper bound of a lineup's power: stars are allowed to push a team past the old 99 ceiling. */
export const MAX_TEAM_POWER = 106;

/** Superstars carry: every point of overall above 92 adds up, capped so one lineup cannot run away. */
export function getStarCarry(players: Player[]): number {
  return Math.min(6, players.reduce((sum, player) => sum + Math.max(0, number(player.overall) - 92) * 0.45, 0));
}

const stabilityOf = (team: Pick<CombatTeam, 'consistency'>) => Math.max(0, Math.min(1, (number(team.consistency, 80) - 70) / 30));

export function getMatchDayPower(team: CombatTeam, rng: SeededRng): number {
  const roll = rng();
  const intensity = rng();
  // Steady lineups barely fluctuate (±1% at consistency 100); shaky ones keep the old ±1.5% swing.
  const stability = stabilityOf(team);
  let multiplier = 1 - (0.015 - 0.005 * stability) + intensity * (0.03 - 0.01 * stability);

  if (team.style === 'aggressive') {
    const goodDayChance = 0.2 + Math.max(0, (team.aggressionPercentage ?? 75) - 75) / 200;
    if (roll < Math.min(0.38, goodDayChance)) multiplier = 1.04 + intensity * 0.045;
  } else if (team.style === 'tactical') {
    const preparation = team.studyPercentage ?? 60;
    const goodDayChance = 0.16 + Math.max(0, preparation - 60) / 250;
    if (roll < Math.min(0.32, goodDayChance)) multiplier = 1.025 + intensity * 0.035;
  } else if (roll < 0.18) {
    multiplier = 1.02 + intensity * 0.025;
  }

  return Math.max(45, Math.min(MAX_TEAM_POWER + 4, team.power * multiplier));
}

export function calculateHistoricalTeamPower(team: HistoricalTeam, allPlayers: Player[]): CombatTeam {
  const roster = allPlayers.filter((player) => (team.players ?? []).includes(player.id));
  const playerAverage = roster.length
    ? roster.reduce((sum, player) => sum + calculatePlayerPower(player, 'balanced'), 0) / roster.length
    : number(team.teamPowerPreview ?? team.power, 82);
  const rank = number(team.sourceRank ?? team.rank, 10);
  const rankBonus = Math.max(0, 4 - rank * 0.55);
  const chemistry = number(team.teamStats?.chemistry, roster.length === 5 ? 88 : 75);
  const completeRosterBonus = roster.length >= 5 ? 2.8 : 0.5;
  const power = playerAverage * 0.72 + number(team.teamPowerPreview ?? team.power, playerAverage) * 0.2 + chemistry * 0.08 + rankBonus + completeRosterBonus + getStarCarry(roster);
  const rosterConsistency = roster.length ? roster.reduce((sum, player) => sum + number(player.consistency, 80), 0) / roster.length : 80;
  return {
    id: team.id,
    name: `${team.name ?? 'Time'} ${team.year ?? ''}`.trim(),
    power: Math.max(50, Math.min(MAX_TEAM_POWER, power)),
    mental: number(team.teamStats?.mental, 82),
    clutch: number(team.teamStats?.clutch, 82),
    experience: number(team.teamStats?.experience, 82),
    consistency: number(team.teamStats?.consistency, rosterConsistency),
    style: (team.style === 'aggressive' || team.style === 'tactical' || team.style === 'balanced') ? team.style : undefined
  };
}

export function getWinProbability(teamA: CombatTeam, teamB: CombatTeam): number {
  const diff = teamA.power - teamB.power;
  // Flat on purpose: economy, sides and momentum add their own edges round by round on top of this base.
  let probability = 1 / (1 + Math.exp(-diff / 16));
  const tacticalStudyBonus = (team: CombatTeam) => {
    if (team.style !== 'tactical') return 0;
    const studyAdvantage = (team.studyPercentage ?? 0) - (team.aggressionPercentage ?? 0);
    return studyAdvantage > 0 ? Math.min(0.08, studyAdvantage / 500) : 0;
  };
  probability += tacticalStudyBonus(teamA) - tacticalStudyBonus(teamB);
  return Math.max(0.06, Math.min(0.94, probability));
}

export interface MapOptions {
  mapId?: MapId;
  powerBonusA?: number;
  powerBonusB?: number;
  rosterA?: Roster;
  rosterB?: Roster;
  /** Team that chooses its starting side (the opponent of whoever picked the map). Omit for a coin flip. */
  sidePickerTeamId?: string | null;
  pickedBy?: string | null;
  mode?: OnlineGameMode;
}

/** Plays a full MR12 map (with MR3 overtime) through the round engine, letting bot policies take every decision. */
export function simulateMap(
  teamA: CombatTeam,
  teamB: CombatTeam,
  rng: SeededRng,
  map = 1,
  options: MapOptions = {}
): MapResult {
  return playMapToEnd(createMapState(teamA, teamB, { ...options, rng, mapNumber: map }));
}

export interface SeriesOptions {
  rosters?: Map<string, Roster>;
}

const seriesRosters = (options: SeriesOptions | undefined, teamA: CombatTeam, teamB: CombatTeam) => ({
  rosterA: options?.rosters?.get(teamA.id),
  rosterB: options?.rosters?.get(teamB.id)
});

const collectDecisions = (maps: MapResult[]): SeriesDecision[] => maps.flatMap((map) => map.decisions ?? []);

export function simulateSeries(
  teamA: CombatTeam,
  teamB: CombatTeam,
  bestOf: 1 | 3 | 5,
  rng: SeededRng,
  phase: SeriesResult['phase'] = 'stage3',
  seriesId = `${phase}-${teamA.id}-${teamB.id}`,
  options?: SeriesOptions
): SeriesResult {
  const needed = Math.ceil(bestOf / 2);
  const maps: MapResult[] = [];
  let scoreA = 0;
  let scoreB = 0;
  const pressureA = phase === 'final' ? (teamA.experience + teamA.mental) / 180 : 1;
  const pressureB = phase === 'final' ? (teamB.experience + teamB.mental) / 180 : 1;
  const adjustedA = { ...teamA, power: getMatchDayPower(teamA, rng) + pressureA };
  const adjustedB = { ...teamB, power: getMatchDayPower(teamB, rng) + pressureB };
  const rosters = seriesRosters(options, teamA, teamB);
  while (scoreA < needed && scoreB < needed) {
    const result = simulateMap(adjustedA, adjustedB, rng, maps.length + 1, rosters);
    maps.push(result);
    if (result.winnerId === teamA.id) scoreA += 1;
    else scoreB += 1;
  }
  return {
    id: seriesId,
    phase,
    bestOf,
    teamA,
    teamB,
    scoreA,
    scoreB,
    winnerId: scoreA > scoreB ? teamA.id : teamB.id,
    maps,
    decisions: collectDecisions(maps),
    userMatch: Boolean(teamA.isUser || teamB.isUser)
  };
}

export function simulateMappedSeries(
  teamA: CombatTeam,
  teamB: CombatTeam,
  bestOf: 1 | 3 | 5,
  rng: SeededRng,
  phase: SeriesResult['phase'],
  seriesId: string,
  mapContext: MapSimulationContext
): SeriesResult {
  const strategyA = mapContext.strategies.get(teamA.id);
  const strategyB = mapContext.strategies.get(teamB.id);
  if (!strategyA || !strategyB) return simulateSeries(teamA, teamB, bestOf, rng, phase, seriesId, { rosters: mapContext.rosters });

  const veto = resolveMapVeto({
    bestOf,
    teamA: strategyA,
    teamB: strategyB,
    seed: `${mapContext.seed}:${seriesId}:veto`
  });
  const needed = Math.ceil(bestOf / 2);
  const maps: MapResult[] = [];
  let scoreA = 0;
  let scoreB = 0;
  const pressureA = phase === 'final' ? (teamA.experience + teamA.mental) / 180 : 1;
  const pressureB = phase === 'final' ? (teamB.experience + teamB.mental) / 180 : 1;
  const adjustedA = { ...teamA, power: getMatchDayPower(teamA, rng) + pressureA };
  const adjustedB = { ...teamB, power: getMatchDayPower(teamB, rng) + pressureB };
  const rosters = seriesRosters({ rosters: mapContext.rosters }, teamA, teamB);
  const playedSteps = veto.steps.filter((step) => step.action !== 'ban');

  for (const step of playedSteps) {
    if (scoreA >= needed || scoreB >= needed) break;
    const pickedBy = step.action === 'pick' ? step.teamId : null;
    // Whoever did not pick the map chooses the side; the decider goes to a knife round (coin flip inside the engine).
    const sidePickerTeamId = pickedBy === teamA.id ? teamB.id : pickedBy === teamB.id ? teamA.id : null;
    const result = simulateMap(adjustedA, adjustedB, rng, maps.length + 1, {
      ...rosters,
      mapId: step.mapId,
      mode: mapContext.mode,
      pickedBy,
      sidePickerTeamId,
      powerBonusA: getStrategyMapBonus(strategyA, step.mapId, mapContext.mode),
      powerBonusB: getStrategyMapBonus(strategyB, step.mapId, mapContext.mode)
    });
    maps.push(result);
    if (result.winnerId === teamA.id) scoreA += 1;
    else scoreB += 1;
  }

  return {
    id: seriesId,
    phase,
    bestOf,
    teamA,
    teamB,
    scoreA,
    scoreB,
    winnerId: scoreA > scoreB ? teamA.id : teamB.id,
    maps,
    veto: veto.steps,
    decisions: collectDecisions(maps),
    userMatch: Boolean(teamA.isUser || teamB.isUser)
  };
}

const weightedOpponent = (teams: CombatTeam[], progress: number, rng: SeededRng) => {
  const sorted = [...teams].sort((a, b) => a.power - b.power);
  const exponent = 0.75 + progress * 0.55;
  const index = Math.min(sorted.length - 1, Math.floor(Math.pow(rng(), exponent) * sorted.length));
  return sorted[index];
};

export function simulateStage3(
  user: CombatTeam,
  opponents: CombatTeam[],
  rng: SeededRng,
  mapContext?: MapSimulationContext
): Stage3Result {
  let wins = 0;
  let losses = 0;
  const matches: SeriesResult[] = [];
  const unused = [...opponents];
  while (wins < 3 && losses < 3 && unused.length) {
    const opponent = weightedOpponent(unused, matches.length / 5, rng);
    unused.splice(unused.findIndex((team) => team.id === opponent.id), 1);
    const seriesId = `stage3-${matches.length + 1}-${user.id}-${opponent.id}`;
    const series = mapContext
      ? simulateMappedSeries(user, opponent, 3, rng, 'stage3', seriesId, mapContext)
      : simulateSeries(user, opponent, 3, rng, 'stage3');
    matches.push(series);
    if (series.winnerId === user.id) wins += 1;
    else losses += 1;
  }
  return { wins, losses, qualified: wins === 3, matches };
}

export function simulatePlayoffs(
  user: CombatTeam,
  opponents: CombatTeam[],
  rng: SeededRng,
  mapContext?: MapSimulationContext
): PlayoffsResult {
  const field = [...opponents]
    .sort((a, b) => b.power + rng() * 14 - (a.power + rng() * 14))
    .slice(0, 7);
  const userSlot = Math.floor(rng() * 8);
  field.splice(userSlot, 0, user);
  const allMatches: SeriesResult[] = [];
  let current = field;
  const rounds: Array<{ phase: SeriesResult['phase']; bestOf: 3 | 5 }> = [
    { phase: 'quarterfinal', bestOf: 3 },
    { phase: 'semifinal', bestOf: 3 },
    { phase: 'final', bestOf: 5 }
  ];
  let placement = 'placementChampion';
  for (const round of rounds) {
    const winners: CombatTeam[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1];
      const teamA = left.id === user.id ? user : right.id === user.id ? user : left;
      const teamB = left.id === user.id ? right : right.id === user.id ? left : right;
      const seriesId = `${round.phase}-${index / 2 + 1}-${teamA.id}-${teamB.id}`;
      const match = mapContext
        ? simulateMappedSeries(teamA, teamB, round.bestOf, rng, round.phase, seriesId, mapContext)
        : simulateSeries(teamA, teamB, round.bestOf, rng, round.phase);
      allMatches.push(match);
      winners.push(match.winnerId === match.teamA.id ? match.teamA : match.teamB);
      if (match.userMatch && match.winnerId !== user.id) {
        placement = round.phase === 'quarterfinal' ? 'placement5to8' : round.phase === 'semifinal' ? 'placement3to4' : 'placementRunnerUp';
      }
    }
    current = winners;
  }
  return {
    championId: current[0]?.id ?? '',
    placement,
    userMatches: allMatches.filter((match) => match.userMatch),
    allMatches
  };
}

/** Puts `focusId` on the A side of a series, swapping scores and round data consistently. */
export function orientSeriesToTeam(series: SeriesResult, focusId: string): SeriesResult {
  if (series.teamA.id === focusId || series.teamB.id !== focusId) return series;
  return {
    ...series,
    teamA: series.teamB,
    teamB: series.teamA,
    scoreA: series.scoreB,
    scoreB: series.scoreA,
    maps: series.maps.map(flipMapResult)
  };
}

/** Drops the per-round kill feed of a series (kept only for the matches worth replaying, to keep saved runs small). */
export const stripSeriesDetails = (series: SeriesResult): SeriesResult => ({
  ...series,
  maps: series.maps.map(({ details: _details, ...map }) => map)
});

/**
 * Builds the offline Major with the same engine as the online mode: the user plus fifteen seeded historical teams play
 * a full Swiss stage and an eight-team bracket, so the overview can show what happened to every other team.
 */
/** The user's organization, the shuffled historical field and the map context every offline Major runs on. */
export function createMajorField(
  players: Player[],
  style: OrgStyle,
  teams: HistoricalTeam[],
  allPlayers: Player[],
  seed: string,
  lineup: SelectedPlayer[] = [],
  options: { selectedMaps?: MapId[]; mode?: GameMode } = {}
) {
  const lineupKey = players.map((player) => player.id).join('|');
  const user = calculateUserTeamPower(players, style, lineup, seed);
  let mapContext: MapSimulationContext | undefined;
  const selectedMaps = options.selectedMaps ?? [];
  if (isValidLineupMapSelection(selectedMaps, players, teams)) {
    const strategies: MapSimulationContext['strategies'] = new Map();
    strategies.set(user.id, createUserMapStrategy(user.id, selectedMaps, players, teams));
    for (const team of teams) strategies.set(team.id, createBotMapStrategy(team));
    mapContext = { mode: options.mode ?? 'premier', seed: `${seed}:offline-maps`, strategies };
  }
  const rosters = new Map<string, Roster>();
  rosters.set(user.id, { players, roles: new Map(lineup.map((selected) => [selected.playerId, selected.selectedSlotRole])) });
  for (const team of teams) rosters.set(team.id, { players: allPlayers.filter((player) => (team.players ?? []).includes(player.id)) });
  if (mapContext) mapContext.rosters = rosters;
  const fieldRng = createSeededRng(`${seed}:major-field:${lineupKey}:${style}`);
  const field = teams.map((team) => {
    const combat = calculateHistoricalTeamPower(team, allPlayers);
    return { id: team.id, name: combat.name, seed: 0, team: combat, human: false, sourceTeamId: team.id };
  });
  for (let index = field.length - 1; index > 0; index -= 1) {
    const target = Math.floor(fieldRng() * (index + 1));
    [field[index], field[target]] = [field[target], field[index]];
  }
  return { user, field, mapContext, tournamentSeed: `${seed}:major:${lineupKey}:${style}` };
}

/** Turns a finished tournament into the campaign run the offline screens read. */
export function toMajorRun(tournament: OnlineTournamentResult, userId: string): MajorRun {
  const userSeries = tournament.rounds.flatMap((round) => round.series).filter((series) => series.userMatch).map((series) => orientSeriesToTeam(series, userId));
  const stage3Matches = userSeries.filter((series) => series.phase === 'stage3');
  const wins = stage3Matches.filter((series) => series.winnerId === userId).length;
  const losses = stage3Matches.length - wins;
  const qualified = wins === 3;
  const champion = tournament.championId === userId;
  const placement = tournament.campaigns.find((campaign) => campaign.organizationId === userId)?.placement ?? 'placementStage3';
  // Awards look at the whole field, so they are computed before the non-user kill feeds are stripped below.
  const awards = computeMajorAwards(tournament.rounds, tournament.championId);
  const playoffs: PlayoffsResult | undefined = qualified
    ? {
      championId: tournament.championId ?? '',
      placement,
      userMatches: userSeries.filter((series) => series.phase !== 'stage3'),
      allMatches: tournament.rounds.filter((round) => round.phase !== 'swiss').flatMap((round) => round.series.map((series) => series.userMatch ? series : stripSeriesDetails(series)))
    }
    : undefined;
  return {
    stage3: { wins, losses, qualified, matches: stage3Matches },
    playoffs,
    matches: userSeries,
    champion,
    placement,
    tournament: {
      // Only the user's matches keep their kill feeds: the whole field would not fit comfortably in localStorage.
      rounds: tournament.rounds.map((round) => ({ number: round.number, phase: round.phase, series: round.series.map((series) => series.userMatch ? series : stripSeriesDetails(series)) })),
      standings: tournament.standings,
      championId: tournament.championId,
      awards
    }
  };
}

export function buildMajorRun(
  players: Player[],
  style: OrgStyle,
  teams: HistoricalTeam[],
  allPlayers: Player[],
  seed: string,
  lineup: SelectedPlayer[] = [],
  options: { selectedMaps?: MapId[]; mode?: GameMode } = {}
): MajorRun {
  const { user, field, mapContext, tournamentSeed } = createMajorField(players, style, teams, allPlayers, seed, lineup, options);
  const tournament = runOnlineTournament({
    organizations: [{ id: user.id, name: user.name, seed: 1, team: user, human: true }],
    botPool: field,
    entryStage: 'stage3',
    seed: tournamentSeed,
    mapContext,
    // 13a0: every offline series is BO3 except the BO5 final.
    swissBestOf: 3
  });
  return toMajorRun(tournament, user.id);
}
