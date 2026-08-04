import { getEligibleSlotRoles } from './roleRules';
import { createSeededRng } from './simulation';
import type { LineupSlotRole, MajorRun, Player, PlayerRunStats, SelectedPlayer } from './types';

type ResultProfile = 'dominant-win' | 'close-win' | 'close-loss' | 'heavy-loss';

export interface RunSummary {
  seriesPlayed: number;
  seriesWon: number;
  seriesLost: number;
  mapsPlayed: number;
  mapsWon: number;
  mapsLost: number;
  roundsWon: number;
  roundsLost: number;
  averageOpponentPower: number;
  resultProfile: ResultProfile;
}

export interface RunAggregate extends RunSummary {
  kills: number;
  deaths: number;
  kdRatio: number;
  adr: number;
  impact: number;
  clutches: number;
  openingKills: number;
  rating: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const number = (value: number | null | undefined, fallback = 70) =>
  Number.isFinite(value) ? Number(value) : fallback;

const ROLE_RATING_ADJUSTMENT: Record<LineupSlotRole, number> = {
  awper: 0.025,
  igl: -0.035,
  entry: 0.015,
  lurker: 0.005,
  rifler: 0.01,
  support: -0.04
};

const RATING_RANGES: Record<ResultProfile, Array<[number, number]>> = {
  'dominant-win': [[1.32, 1.55], [1.16, 1.38], [0.98, 1.22], [0.88, 1.1], [0.82, 1.04]],
  'close-win': [[1.17, 1.35], [1.06, 1.25], [0.92, 1.12], [0.82, 1.04], [0.74, 0.98]],
  'close-loss': [[1.05, 1.3], [0.9, 1.04], [0.8, 1.02], [0.68, 0.91], [0.55, 0.81]],
  'heavy-loss': [[0.94, 1.1], [0.8, 1.04], [0.69, 0.91], [0.59, 0.8], [0.5, 0.7]]
};

function roleSkill(player: Player, role: LineupSlotRole) {
  if (role === 'awper') return number(player.awp) * 0.62 + number(player.firepower) * 0.38;
  if (role === 'igl') return number(player.igl) * 0.62 + number(player.experience) * 0.23 + number(player.mental) * 0.15;
  if (role === 'entry') return number(player.entry) * 0.64 + number(player.firepower) * 0.36;
  if (role === 'lurker') return number(player.clutch) * 0.42 + number(player.consistency) * 0.35 + number(player.firepower) * 0.23;
  if (role === 'support') return number(player.support) * 0.6 + number(player.mental) * 0.22 + number(player.experience) * 0.18;
  return number(player.firepower) * 0.56 + number(player.consistency) * 0.26 + number(player.entry) * 0.18;
}

function rarityBonus(player: Player) {
  const rarity = (player.rarity ?? '').toLowerCase();
  return rarity === 'goat' ? 2.5 : rarity === 'legend' ? 1.7 : rarity === 'superstar' ? 1.1 : 0;
}

export function getRunSummary(run: MajorRun, userTeamId = 'user'): RunSummary {
  let mapsWon = 0;
  let mapsLost = 0;
  let roundsWon = 0;
  let roundsLost = 0;
  let opponentPower = 0;

  for (const match of run.matches) {
    const userIsA = match.teamA.id === userTeamId;
    const opponent = userIsA ? match.teamB : match.teamA;
    opponentPower += opponent.power;
    for (const map of match.maps) {
      const userRounds = userIsA ? map.scoreA : map.scoreB;
      const opponentRounds = userIsA ? map.scoreB : map.scoreA;
      roundsWon += userRounds;
      roundsLost += opponentRounds;
      if (map.winnerId === userTeamId) mapsWon += 1;
      else mapsLost += 1;
    }
  }

  const finalMatch = run.matches.at(-1);
  const finalUserIsA = finalMatch?.teamA.id === userTeamId;
  const finalMapsWon = finalMatch
    ? finalMatch.maps.filter((map) => map.winnerId === userTeamId).length
    : 0;
  const finalMapsLost = finalMatch ? finalMatch.maps.length - finalMapsWon : 0;
  const finalRoundDiff = finalMatch
    ? finalMatch.maps.reduce((sum, map) => {
        const userRounds = finalUserIsA ? map.scoreA : map.scoreB;
        const enemyRounds = finalUserIsA ? map.scoreB : map.scoreA;
        return sum + userRounds - enemyRounds;
      }, 0) / Math.max(1, finalMatch.maps.length)
    : 0;

  const heavyFinalLoss = !run.champion && (finalMapsWon === 0 || finalRoundDiff <= -4.5);
  const dominantFinalWin = run.champion && (finalMapsLost === 0 || finalRoundDiff >= 4);
  const resultProfile: ResultProfile = run.champion
    ? dominantFinalWin ? 'dominant-win' : 'close-win'
    : heavyFinalLoss ? 'heavy-loss' : 'close-loss';

  const seriesWon = run.matches.filter((match) => match.winnerId === userTeamId).length;
  return {
    seriesPlayed: run.matches.length,
    seriesWon,
    seriesLost: run.matches.length - seriesWon,
    mapsPlayed: mapsWon + mapsLost,
    mapsWon,
    mapsLost,
    roundsWon,
    roundsLost,
    averageOpponentPower: opponentPower / Math.max(1, run.matches.length),
    resultProfile
  };
}

export function createRunStats(
  players: Player[],
  run: MajorRun,
  seed: string,
  lineup: SelectedPlayer[] = [],
  userTeamId = 'user'
): PlayerRunStats[] {
  const summary = getRunSummary(run, userTeamId);
  const roleByPlayer = new Map(lineup.map((selected) => [selected.playerId, selected.selectedSlotRole]));
  const ranked = players
    .map((player) => {
      const role = roleByPlayer.get(player.id) ?? getEligibleSlotRoles(player)[0] ?? 'rifler';
      const rng = createSeededRng(`${seed}:stats-rank:${player.id}:${run.placement}`);
      const score = number(player.overall) * 0.55
        + roleSkill(player, role) * 0.27
        + number(player.consistency) * 0.1
        + number(player.mental) * 0.05
        + rarityBonus(player)
        + rng() * 5;
      return { player, role, score };
    })
    .sort((a, b) => b.score - a.score);

  const ratings = new Map<string, number>();
  ranked.forEach(({ player, role }, rank) => {
    const rng = createSeededRng(`${seed}:stats-rating:${player.id}:${run.placement}`);
    const [minimum, maximum] = RATING_RANGES[summary.resultProfile][rank] ?? [0.72, 1.02];
    const utilityCeiling = summary.resultProfile === 'dominant-win'
      ? 1.12
      : summary.resultProfile === 'close-win'
        ? 1.08
        : summary.resultProfile === 'close-loss' ? 1.04 : 0.96;
    const roleMaximum = role === 'igl' || role === 'support' ? Math.min(maximum, utilityCeiling) : maximum;
    const roleMinimum = Math.min(minimum, roleMaximum - 0.18);
    const skillAdjustment = clamp((number(player.overall) - 85) * 0.0025, -0.04, 0.04);
    const opponentAdjustment = clamp((summary.averageOpponentPower - 82) * 0.0015, -0.015, 0.025);
    const sampled = roleMinimum + (roleMaximum - roleMinimum) * (0.28 + rng() * 0.72);
    ratings.set(player.id, Number(clamp(sampled + ROLE_RATING_ADJUSTMENT[role] + skillAdjustment + opponentAdjustment, roleMinimum, roleMaximum).toFixed(2)));
  });

  return players.map((player) => {
    const role = roleByPlayer.get(player.id) ?? getEligibleSlotRoles(player)[0] ?? 'rifler';
    const rng = createSeededRng(`${seed}:stats-line:${player.id}:${run.placement}`);
    const runRating = ratings.get(player.id) ?? 0.9;
    const lossRate = summary.mapsLost / Math.max(1, summary.mapsPlayed);
    const deathRoleAdjustment = role === 'entry' ? 0.6 : role === 'awper' ? -0.8 : role === 'support' ? 0.25 : 0;
    const deathsPerMap = 12.4 + lossRate * 2.4 + deathRoleAdjustment + (rng() - 0.5) * 1.4;
    const deaths = Math.max(summary.mapsPlayed * 8, Math.round(summary.mapsPlayed * deathsPerMap));
    const kdRoleAdjustment = role === 'awper' ? 0.035 : role === 'support' || role === 'igl' ? -0.035 : 0;
    const kdRatio = clamp(0.34 + runRating * 0.63 + kdRoleAdjustment + (rng() - 0.5) * 0.035, 0.58, 1.38);
    let kills = Math.round(deaths * kdRatio);
    if (runRating < 0.9) kills = Math.min(kills, deaths - 1);
    const adrRoleAdjustment = role === 'support' || role === 'igl' ? -3 : role === 'entry' ? 2 : role === 'awper' ? 1 : 0;
    const adr = Math.round(clamp(38 + runRating * 32 + number(player.firepower) * 0.1 + adrRoleAdjustment + (rng() - 0.5) * 4, 48, 108));
    const impactRoleAdjustment = role === 'entry' ? 0.08 : role === 'awper' ? 0.05 : role === 'support' || role === 'igl' ? -0.08 : 0;
    const impact = Number(clamp(0.34 + runRating * 0.7 + impactRoleAdjustment + (rng() - 0.5) * 0.08, 0.5, 1.55).toFixed(2));
    const clutches = Math.max(0, Math.round(summary.mapsPlayed * number(player.clutch) / 100 * runRating * (0.18 + rng() * 0.16)));
    const openingMultiplier = role === 'entry' ? 1.55 : role === 'awper' ? 1.25 : role === 'support' || role === 'igl' ? 0.55 : 0.9;
    const openingKills = Math.max(0, Math.round(summary.mapsPlayed * number(player.entry) / 100 * runRating * openingMultiplier * (0.7 + rng() * 0.35)));
    const mvpCount = Math.max(0, Math.round(summary.mapsWon * clamp((runRating - 0.72) * 0.85, 0, 0.7) * (0.65 + rng() * 0.5)));
    const consistency = Math.round(clamp(number(player.consistency) * 0.62 + runRating * 24 + (rng() - 0.5) * 8, 45, 99));

    return {
      playerId: player.id,
      assignedRole: role,
      runRating,
      kills,
      deaths,
      kdRatio: Number((kills / Math.max(1, deaths)).toFixed(2)),
      adr,
      impact,
      clutches,
      openingKills,
      mvpCount,
      consistency,
      mapsPlayed: summary.mapsPlayed,
      mapsWon: summary.mapsWon,
      mapsLost: summary.mapsLost,
      roundsWon: summary.roundsWon,
      roundsLost: summary.roundsLost
    };
  });
}

export function getRunMvpScore(stat: PlayerRunStats) {
  const mapWinRate = stat.mapsWon / Math.max(1, stat.mapsPlayed);
  return stat.runRating * 45
    + mapWinRate * 9
    + stat.impact * 12
    + stat.clutches * 1.8
    + stat.openingKills * 0.45
    + stat.mvpCount * 2.5
    + stat.consistency * 0.08;
}

export function aggregateRunStats(run: MajorRun, stats: PlayerRunStats[]): RunAggregate {
  const summary = getRunSummary(run);
  const kills = stats.reduce((sum, stat) => sum + stat.kills, 0);
  const deaths = stats.reduce((sum, stat) => sum + stat.deaths, 0);
  const average = (key: 'adr' | 'impact' | 'runRating') =>
    stats.reduce((sum, stat) => sum + stat[key], 0) / Math.max(1, stats.length);
  return {
    ...summary,
    kills,
    deaths,
    kdRatio: Number((kills / Math.max(1, deaths)).toFixed(2)),
    adr: Math.round(average('adr')),
    impact: Number(average('impact').toFixed(2)),
    clutches: stats.reduce((sum, stat) => sum + stat.clutches, 0),
    openingKills: stats.reduce((sum, stat) => sum + stat.openingKills, 0),
    rating: Number(average('runRating').toFixed(2))
  };
}
