import type {
  CombatTeam,
  GameMode,
  HistoricalTeam,
  MajorRun,
  MapResult,
  OrgStyle,
  Player,
  SelectedPlayer,
  PlayoffsResult,
  RoundScore,
  SeriesResult,
  Stage3Result
} from './types';

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

  if (style === 'aggressive') power += (stats.firepower + stats.entry) * 0.025 - stats.consistency * 0.012;
  if (style === 'balanced') power += (stats.consistency + stats.mental) * 0.014;
  if (style === 'tactical') power += (stats.igl + stats.support + stats.mental) * 0.02 - (stats.entry + stats.firepower) * 0.012;
  if (player.rarity === 'goat') power += 1.5;
  if (player.rarity === 'legend') power += 0.8;
  return power;
}

const hasRole = (player: Player, role: string) => (player.role ?? '').toLowerCase().includes(role);

export function calculateUserTeamPower(players: Player[], style: OrgStyle, lineup: SelectedPlayer[] = [], seed = ''): CombatTeam {
  if (!players.length) return { id: 'user', name: 'Sua Org', power: 50, mental: 50, clutch: 50, experience: 50, isUser: true };
  const average = players.reduce((sum, player) => sum + calculatePlayerPower(player, style), 0) / players.length;
  const avg = (key: keyof Player) => players.reduce((sum, player) => sum + number(player[key] as number, 65), 0) / players.length;
  const assignedRoles = lineup.map((selected) => selected.selectedSlotRole);
  const awpers = assignedRoles.length ? assignedRoles.filter((role) => role === 'awper').length : players.filter((player) => hasRole(player, 'awp')).length;
  const igls = assignedRoles.length ? assignedRoles.filter((role) => role === 'igl').length : players.filter((player) => hasRole(player, 'igl')).length;
  const supports = assignedRoles.length ? assignedRoles.filter((role) => role === 'support').length : players.filter((player) => hasRole(player, 'support') || number(player.support) >= 88).length;
  let composition = 0;
  composition += awpers ? 2.2 : -4.5;
  composition += igls ? 2.4 : -4;
  composition += supports ? 1.2 : -1.5;
  if (players.every((player) => number(player.firepower) >= 90) && (!igls || !supports)) composition -= 2;
  const studyRng = createSeededRng(`${seed}:tactical-study:${players.map((player) => player.id).join('|')}`);
  const studyPercentage = 60 + Math.floor(studyRng() * 41);
  const aggressionPercentage = Math.round((avg('firepower') + avg('entry')) / 2);
  const elitePlayers = players.filter((player) => number(player.overall) >= 98).length;
  const eliteCoreBonus = Math.min(4.5, elitePlayers * 0.9 + Math.max(0, avg('overall') - 92) * 0.35);
  const styleMultiplier = style === 'tactical' ? 1.1 : 1;
  return {
    id: 'user',
    name: 'Sua Org',
    power: Math.max(45, Math.min(99, (average + composition) * styleMultiplier + eliteCoreBonus)),
    mental: avg('mental'),
    clutch: avg('clutch'),
    experience: avg('experience'),
    style,
    studyPercentage,
    aggressionPercentage,
    isUser: true
  };
}

export function getMatchDayPower(team: CombatTeam, rng: SeededRng): number {
  const roll = rng();
  const intensity = rng();
  let multiplier = 0.985 + intensity * 0.03;

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

  return Math.max(45, Math.min(103, team.power * multiplier));
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
  const power = playerAverage * 0.72 + number(team.teamPowerPreview ?? team.power, playerAverage) * 0.2 + chemistry * 0.08 + rankBonus + completeRosterBonus;
  return {
    id: team.id,
    name: `${team.name ?? 'Time'} ${team.year ?? ''}`.trim(),
    power: Math.max(50, Math.min(99, power)),
    mental: number(team.teamStats?.mental, 82),
    clutch: number(team.teamStats?.clutch, 82),
    experience: number(team.teamStats?.experience, 82)
  };
}

export function getWinProbability(teamA: CombatTeam, teamB: CombatTeam): number {
  const diff = teamA.power - teamB.power;
  let probability = 1 / (1 + Math.exp(-diff / 9));
  const tacticalStudyBonus = (team: CombatTeam) => {
    if (team.style !== 'tactical') return 0;
    const studyAdvantage = (team.studyPercentage ?? 0) - (team.aggressionPercentage ?? 0);
    return studyAdvantage > 0 ? Math.min(0.08, studyAdvantage / 500) : 0;
  };
  probability += tacticalStudyBonus(teamA) - tacticalStudyBonus(teamB);
  return Math.max(0.18, Math.min(0.82, probability));
}

export function simulateRound(
  context: { teamA: CombatTeam; teamB: CombatTeam; scoreA: number; scoreB: number; overtime?: boolean },
  rng: SeededRng
): 'a' | 'b' {
  let probability = getWinProbability(context.teamA, context.teamB);
  const scoreDiff = context.scoreA - context.scoreB;
  probability -= Math.max(-0.035, Math.min(0.035, scoreDiff * 0.004));
  if (context.overtime) {
    const mentalA = (context.teamA.mental + context.teamA.clutch) / 2;
    const mentalB = (context.teamB.mental + context.teamB.clutch) / 2;
    probability += (mentalA - mentalB) / 550;
  }
  const noise = (rng() - 0.5) * 0.09;
  return rng() < Math.max(0.12, Math.min(0.88, probability + noise)) ? 'a' : 'b';
}

export function simulateMap(teamA: CombatTeam, teamB: CombatTeam, rng: SeededRng, map = 1): MapResult {
  const variationA = (rng() - 0.5) * 7;
  const variationB = (rng() - 0.5) * 7;
  const mapA = { ...teamA, power: teamA.power + variationA };
  const mapB = { ...teamB, power: teamB.power + variationB };
  let scoreA = 0;
  let scoreB = 0;
  const rounds: RoundScore[] = [];
  const playRound = (overtime: boolean) => {
    const winner = simulateRound({ teamA: mapA, teamB: mapB, scoreA, scoreB, overtime }, rng);
    if (winner === 'a') scoreA += 1;
    else scoreB += 1;
    rounds.push({ a: scoreA, b: scoreB, overtime });
  };

  while (scoreA < 13 && scoreB < 13 && scoreA + scoreB < 24) playRound(false);
  let overtime = scoreA === 12 && scoreB === 12;
  while (overtime) {
    const startA = scoreA;
    const startB = scoreB;
    while (scoreA - startA < 4 && scoreB - startB < 4 && scoreA + scoreB - startA - startB < 6) playRound(true);
    if (scoreA - startA === 3 && scoreB - startB === 3) continue;
    break;
  }

  return {
    map,
    scoreA,
    scoreB,
    winnerId: scoreA > scoreB ? teamA.id : teamB.id,
    rounds,
    overtime
  };
}

let seriesCounter = 0;

export function simulateSeries(
  teamA: CombatTeam,
  teamB: CombatTeam,
  bestOf: 3 | 5,
  rng: SeededRng,
  phase: SeriesResult['phase'] = 'stage3'
): SeriesResult {
  const needed = Math.ceil(bestOf / 2);
  const maps: MapResult[] = [];
  let scoreA = 0;
  let scoreB = 0;
  const pressureA = phase === 'final' ? (teamA.experience + teamA.mental) / 180 : 1;
  const pressureB = phase === 'final' ? (teamB.experience + teamB.mental) / 180 : 1;
  const adjustedA = { ...teamA, power: getMatchDayPower(teamA, rng) + pressureA };
  const adjustedB = { ...teamB, power: getMatchDayPower(teamB, rng) + pressureB };
  while (scoreA < needed && scoreB < needed) {
    const result = simulateMap(adjustedA, adjustedB, rng, maps.length + 1);
    maps.push(result);
    if (result.winnerId === teamA.id) scoreA += 1;
    else scoreB += 1;
  }
  seriesCounter += 1;
  return {
    id: `series-${seriesCounter}-${teamA.id}-${teamB.id}`,
    phase,
    bestOf,
    teamA,
    teamB,
    scoreA,
    scoreB,
    winnerId: scoreA > scoreB ? teamA.id : teamB.id,
    maps,
    userMatch: Boolean(teamA.isUser || teamB.isUser)
  };
}

const weightedOpponent = (teams: CombatTeam[], progress: number, rng: SeededRng) => {
  const sorted = [...teams].sort((a, b) => a.power - b.power);
  const exponent = 0.75 + progress * 0.55;
  const index = Math.min(sorted.length - 1, Math.floor(Math.pow(rng(), exponent) * sorted.length));
  return sorted[index];
};

export function simulateStage3(user: CombatTeam, opponents: CombatTeam[], rng: SeededRng): Stage3Result {
  let wins = 0;
  let losses = 0;
  const matches: SeriesResult[] = [];
  const unused = [...opponents];
  while (wins < 3 && losses < 3 && unused.length) {
    const opponent = weightedOpponent(unused, matches.length / 5, rng);
    unused.splice(unused.findIndex((team) => team.id === opponent.id), 1);
    const series = simulateSeries(user, opponent, 3, rng, 'stage3');
    matches.push(series);
    if (series.winnerId === user.id) wins += 1;
    else losses += 1;
  }
  return { wins, losses, qualified: wins === 3, matches };
}

export function simulatePlayoffs(user: CombatTeam, opponents: CombatTeam[], rng: SeededRng): PlayoffsResult {
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
  let placement = 'Campeão';
  for (const round of rounds) {
    const winners: CombatTeam[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const match = simulateSeries(current[index], current[index + 1], round.bestOf, rng, round.phase);
      allMatches.push(match);
      winners.push(match.winnerId === match.teamA.id ? match.teamA : match.teamB);
      if (match.userMatch && match.winnerId !== user.id) {
        placement = round.phase === 'quarterfinal' ? '5º–8º' : round.phase === 'semifinal' ? '3º–4º' : 'Vice-campeão';
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

export function buildMajorRun(
  players: Player[],
  style: OrgStyle,
  teams: HistoricalTeam[],
  allPlayers: Player[],
  seed: string,
  lineup: SelectedPlayer[] = []
): MajorRun {
  seriesCounter = 0;
  const rng = createSeededRng(`${seed}:major:${players.map((player) => player.id).join('|')}:${style}`);
  const user = calculateUserTeamPower(players, style, lineup, seed);
  const opponents = teams.map((team) => calculateHistoricalTeamPower(team, allPlayers));
  const stage3 = simulateStage3(user, opponents, rng);
  if (!stage3.qualified) {
    return { stage3, matches: stage3.matches, champion: false, placement: 'Eliminado no Stage 3' };
  }
  const used = new Set(stage3.matches.flatMap((match) => [match.teamA.id, match.teamB.id]));
  const playoffPool = opponents.filter((team) => !used.has(team.id));
  const playoffs = simulatePlayoffs(user, playoffPool.length >= 7 ? playoffPool : opponents, rng);
  const champion = playoffs.championId === user.id;
  return {
    stage3,
    playoffs,
    matches: [...stage3.matches, ...playoffs.userMatches],
    champion,
    placement: champion ? 'Campeão' : playoffs.placement
  };
}
