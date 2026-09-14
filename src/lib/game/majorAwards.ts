import { adrOf, analyzeRound, contributionKey, impactOf, kastPercent, rating3, ratingBaseline, rawRating3, swingPerRound, type RoundContribution } from './rating';
import { STAGE_PLACEMENT, type MajorAwards, type MajorPlayerAward, type MajorStage, type MajorTeamAward, type MapResult, type RatingModel, type RoundDetail, type SeriesResult, type TeamSide } from './types';

/**
 * Tournament-wide awards derived from the kill feed of every map that carried one.
 *
 * Player rating follows HLTV Rating 1.0, which only needs kills and deaths per round:
 *   kill rating      = KPR / 0.679
 *   survival rating  = (rounds − deaths) / rounds / 0.317
 *   multi-kill       = (1K + 4·2K + 9·3K + 16·4K + 25·5K) / rounds / 1.277
 *   rating           = (kill + 0.7·survival + multi-kill) / 2.7
 * The simulated field is more lopsided than a real Major (stomps and superstars are common), so the raw value is
 * squeezed towards the average: an average player lands around 1.00, a star between 1.10 and 1.20, an MVP around 1.30
 * and only a generational run reaches 1.40.
 */
export const RATING_SPREAD = 0.7;

interface PlayerLine {
  playerId: string;
  name: string;
  teamId: string;
  teamName: string;
  kills: number;
  deaths: number;
  headshots: number;
  rounds: number;
  maps: Set<string>;
  clutches: number;
  openingKills: number;
  multi: { one: number; two: number; triple: number; quad: number; ace: number };
  assists: number;
  flashAssists: number;
  kastRounds: number;
  damage: number;
  utilityDamage: number;
  swing: number;
  openingDeaths: number;
  tradeKills: number;
  tradedDeaths: number;
}

interface TeamLine {
  teamId: string;
  name: string;
  mapsWon: number;
  mapsLost: number;
  roundsWon: number;
  roundsLost: number;
  players: Set<string>;
}

export interface AwardsRound {
  series: SeriesResult[];
}

const round2 = (value: number) => Number(value.toFixed(2));
const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const playerKey = (teamId: string, playerId: string) => `${teamId}\u0000${playerId}`;

export const ratingOf = (line: Pick<PlayerLine, 'kills' | 'deaths' | 'rounds' | 'multi'>): number => {
  if (line.rounds <= 0) return 0;
  const killRating = line.kills / line.rounds / 0.679;
  const survivalRating = (line.rounds - line.deaths) / line.rounds / 0.317;
  const multi = (line.multi.one + 4 * line.multi.two + 9 * line.multi.triple + 16 * line.multi.quad + 25 * line.multi.ace) / line.rounds / 1.277;
  const raw = (killRating + 0.7 * survivalRating + multi) / 2.7;
  return round2(1 + (raw - 1) * RATING_SPREAD);
};

/** Placement of every team in the tournament (key form: placementChampion, placementRunnerUp, ...). */
export function placementsOf(rounds: AwardsRound[], championId: string | null): Map<string, string> {
  const placements = new Map<string, string>();
  for (const round of rounds) {
    for (const series of round.series) {
      if (!series.winnerId) continue;
      // Rounds come in order, so a team that climbs from Stage 1 to Stage 2 ends up with the later stage.
      const stagePlacement = series.phase in STAGE_PLACEMENT ? STAGE_PLACEMENT[series.phase as MajorStage] : null;
      for (const team of [series.teamA, series.teamB]) {
        if (stagePlacement) placements.set(team.id, stagePlacement);
        else if (!placements.has(team.id)) placements.set(team.id, 'placementStage3');
      }
      const loserId = series.winnerId === series.teamA.id ? series.teamB.id : series.teamA.id;
      if (series.phase === 'quarterfinal') placements.set(loserId, 'placement5to8');
      else if (series.phase === 'semifinal') placements.set(loserId, 'placement3to4');
      else if (series.phase === 'final') placements.set(loserId, 'placementRunnerUp');
    }
  }
  if (championId) placements.set(championId, 'placementChampion');
  return placements;
}

/** Round analyses reused across calls: the same RoundDetail objects come back on every step of a live Major. */
const analysisCache = new WeakMap<RoundDetail, { key: string; value: Map<string, RoundContribution> }>();

const PLACEMENT_BONUS: Record<string, number> = {
  placementChampion: 0.12,
  placementRunnerUp: 0.07,
  placement3to4: 0.04,
  placement5to8: 0.02
};

function accountMap(map: MapResult, series: SeriesResult, players: Map<string, PlayerLine>, teams: Map<string, TeamLine>, model: RatingModel) {
  const details = map.details ?? [];
  if (!details.length) return;
  const teamOf = (side: TeamSide) => (side === 'a' ? series.teamA : series.teamB);
  const mapKey = `${series.id}:${map.map}`;
  const ensurePlayer = (id: string, name: string, side: TeamSide) => {
    const team = teamOf(side);
    const key = playerKey(team.id, id);
    let line = players.get(key);
    if (!line) {
      line = { playerId: id, name, teamId: team.id, teamName: team.name, kills: 0, deaths: 0, headshots: 0, rounds: 0, maps: new Set(), clutches: 0, openingKills: 0, multi: { one: 0, two: 0, triple: 0, quad: 0, ace: 0 }, assists: 0, flashAssists: 0, kastRounds: 0, damage: 0, utilityDamage: 0, swing: 0, openingDeaths: 0, tradeKills: 0, tradedDeaths: 0 };
      players.set(key, line);
    }
    return line;
  };
  const seen = new Set<string>();
  // Rating 3.0 only: who played the map, their names and how much they set teammates up (assists weigh utility credit).
  const roster: Record<TeamSide, Set<string>> = { a: new Set(), b: new Set() };
  const names = new Map<string, string>();
  const setUp = new Map<string, number>();
  if (model === 'v3') {
    for (const detail of details) {
      for (const kill of detail.kills) {
        const victimSide: TeamSide = kill.killerSide === 'a' ? 'b' : 'a';
        roster[kill.killerSide].add(kill.killerId);
        roster[victimSide].add(kill.victimId);
        names.set(contributionKey(kill.killerSide, kill.killerId), kill.killerName);
        names.set(contributionKey(victimSide, kill.victimId), kill.victimName);
        if (kill.assistId) {
          roster[kill.killerSide].add(kill.assistId);
          names.set(contributionKey(kill.killerSide, kill.assistId), kill.assistName ?? kill.assistId);
          setUp.set(contributionKey(kill.killerSide, kill.assistId), (setUp.get(contributionKey(kill.killerSide, kill.assistId)) ?? 0) + 1);
        }
        if (kill.flashAssistId) {
          roster[kill.killerSide].add(kill.flashAssistId);
          names.set(contributionKey(kill.killerSide, kill.flashAssistId), kill.flashAssistName ?? kill.flashAssistId);
          setUp.set(contributionKey(kill.killerSide, kill.flashAssistId), (setUp.get(contributionKey(kill.killerSide, kill.flashAssistId)) ?? 0) + 2);
        }
      }
    }
  }
  // While a map is live its roster and utility weights still change; the signature makes the cache recompute then.
  const mapSignature = model === 'v3'
    ? [
      [...roster.a].sort().join(','),
      [...roster.b].sort().join(','),
      [...setUp].map(([key, weight]) => `${key}=${weight}`).sort().join(',')
    ].join('|')
    : '';
  for (const detail of details) {
    const roundKills = new Map<string, number>();
    detail.kills.forEach((kill, index) => {
      const killer = ensurePlayer(kill.killerId, kill.killerName, kill.killerSide);
      const victim = ensurePlayer(kill.victimId, kill.victimName, kill.killerSide === 'a' ? 'b' : 'a');
      killer.kills += 1;
      if (kill.headshot) killer.headshots += 1;
      if (index === 0) killer.openingKills += 1;
      victim.deaths += 1;
      const killerKey = playerKey(teamOf(kill.killerSide).id, kill.killerId);
      const victimSide = kill.killerSide === 'a' ? 'b' : 'a';
      const victimKey = playerKey(teamOf(victimSide).id, kill.victimId);
      roundKills.set(killerKey, (roundKills.get(killerKey) ?? 0) + 1);
      seen.add(killerKey);
      seen.add(victimKey);
    });
    for (const [key, kills] of roundKills) {
      const line = players.get(key)!;
      if (kills === 1) line.multi.one += 1;
      else if (kills === 2) line.multi.two += 1;
      else if (kills === 3) line.multi.triple += 1;
      else if (kills === 4) line.multi.quad += 1;
      else if (kills >= 5) line.multi.ace += 1;
    }
    if (detail.highlight?.kind === 'clutch') {
      const line = ensurePlayer(detail.highlight.playerId, detail.highlight.playerName, detail.highlight.side);
      line.clutches += 1;
      seen.add(playerKey(teamOf(detail.highlight.side).id, detail.highlight.playerId));
    } else if (!detail.highlight && detail.tags.includes('clutch')) {
      // Older details without a highlight: credit the winner's last killer.
      const last = [...detail.kills].reverse().find((kill) => kill.killerSide === detail.winner);
      if (last) ensurePlayer(last.killerId, last.killerName, last.killerSide).clutches += 1;
    }
    if (model === 'v3') {
      const seed = `${series.id}:${map.map}:${detail.number}`;
      const cacheKey = `${seed}|${mapSignature}`;
      const cached = analysisCache.get(detail);
      let contributions: Map<string, RoundContribution>;
      if (cached?.key === cacheKey) {
        contributions = cached.value;
      } else {
        contributions = analyzeRound(detail, {
          roster: { a: [...roster.a], b: [...roster.b] },
          mapId: map.mapId,
          seed,
          utilityWeight: (side, playerId) => 1 + (setUp.get(contributionKey(side, playerId)) ?? 0)
        });
        analysisCache.set(detail, { key: cacheKey, value: contributions });
      }
      for (const [key, contribution] of contributions) {
        const playerId = key.slice(2);
        const line = ensurePlayer(playerId, names.get(key) ?? playerId, contribution.side);
        line.assists += contribution.assists;
        line.flashAssists += contribution.flashAssists;
        if (contribution.kast) line.kastRounds += 1;
        line.damage += contribution.damage;
        line.utilityDamage += contribution.utilityDamage;
        line.swing += contribution.swing;
        if (contribution.openingDeath) line.openingDeaths += 1;
        line.tradeKills += contribution.tradeKills;
        if (contribution.tradedDeath) line.tradedDeaths += 1;
        seen.add(playerKey(teamOf(contribution.side).id, playerId));
      }
    }
  }
  // Every player that appeared on the map played all of its rounds.
  for (const playerId of seen) {
    const line = players.get(playerId)!;
    line.rounds += details.length;
    line.maps.add(mapKey);
  }
  for (const side of ['a', 'b'] as TeamSide[]) {
    const team = teamOf(side);
    let line = teams.get(team.id);
    if (!line) {
      line = { teamId: team.id, name: team.name, mapsWon: 0, mapsLost: 0, roundsWon: 0, roundsLost: 0, players: new Set() };
      teams.set(team.id, line);
    }
    const own = side === 'a' ? map.scoreA : map.scoreB;
    const enemy = side === 'a' ? map.scoreB : map.scoreA;
    line.roundsWon += own;
    line.roundsLost += enemy;
    if (map.winnerId === team.id) line.mapsWon += 1;
    else if (map.winnerId) line.mapsLost += 1;
    for (const key of seen) if (players.get(key)!.teamId === team.id) line.players.add(key);
  }
}

interface Scoring {
  model: RatingModel;
  /** Field baseline for Rating 3.0. */
  baseline: number;
}

const ratingFor = (line: PlayerLine, scoring: Scoring) =>
  scoring.model === 'v3' ? rating3(rawRating3(line), scoring.baseline) : ratingOf(line);

const rating3Fields = (line: PlayerLine) => ({
  assists: line.assists,
  flashAssists: line.flashAssists,
  kast: Number(kastPercent(line).toFixed(1)),
  adr: Math.round(adrOf(line)),
  utilityDamage: Number((line.utilityDamage / Math.max(1, line.rounds)).toFixed(1)),
  swing: Number(swingPerRound(line).toFixed(2)),
  impact: Number(impactOf(line).toFixed(2)),
  openingDeaths: line.openingDeaths,
  tradeKills: line.tradeKills,
  tradedDeaths: line.tradedDeaths
});

const toPlayerAward = (line: PlayerLine, placement: string, scoring: Scoring): MajorPlayerAward => ({
  playerId: line.playerId,
  name: line.name,
  teamId: line.teamId,
  teamName: line.teamName,
  rating: ratingFor(line, scoring),
  kills: line.kills,
  deaths: line.deaths,
  kdRatio: round2(line.kills / Math.max(1, line.deaths)),
  headshots: line.headshots,
  rounds: line.rounds,
  mapsPlayed: line.maps.size,
  clutches: line.clutches,
  openingKills: line.openingKills,
  multiKills: { triple: line.multi.triple, quad: line.multi.quad, ace: line.multi.ace },
  placement,
  ...(scoring.model === 'v3' ? rating3Fields(line) : {})
});

/**
 * Computes the awards of a tournament from its rounds. Series without kill feeds are ignored, so the result reflects
 * whatever the caller kept (the whole field on the server and in the incremental engines, only the user's series in a
 * stripped saved run). Returns null when no series carried a kill feed.
 */
export function computeMajorAwards(rounds: AwardsRound[], championId: string | null, options: { model?: RatingModel } = {}): MajorAwards | null {
  const model = options.model ?? 'v3';
  const players = new Map<string, PlayerLine>();
  const teams = new Map<string, TeamLine>();
  for (const round of rounds) {
    for (const series of round.series) {
      for (const map of series.maps) accountMap(map, series, players, teams, model);
    }
  }
  if (!players.size) return null;
  const scoring: Scoring = { model, baseline: model === 'v3' ? ratingBaseline([...players.values()]) : 0 };
  const placements = placementsOf(rounds, championId);
  const placementOf = (teamId: string) => placements.get(teamId) ?? 'placementStage3';
  const maxRounds = Math.max(...[...players.values()].map((line) => line.rounds));
  // A player who left early cannot be MVP on a hot map: at least a third of the deepest run is required.
  const eligible = [...players.values()].filter((line) => line.rounds >= Math.max(24, maxRounds / 3));
  const awards = (eligible.length ? eligible : [...players.values()]).map((line) => toPlayerAward(line, placementOf(line.teamId), scoring));
  // Rating 3.0 also rewards the rounds a player swung: one percentage point per round is worth 0.01 of MVP score.
  const mvpScore = (award: MajorPlayerAward) => award.rating + (PLACEMENT_BONUS[award.placement] ?? 0) + (model === 'v3' ? (award.swing ?? 0) / 100 : 0);
  const comparePlayers = (left: MajorPlayerAward, right: MajorPlayerAward) =>
    mvpScore(right) - mvpScore(left)
    || right.kills - left.kills
    || left.deaths - right.deaths
    || compareText(left.name, right.name)
    || compareText(left.teamId, right.teamId)
    || compareText(left.playerId, right.playerId);
  const topPlayers = [...awards].sort(comparePlayers).slice(0, 8);
  const teamAwards: MajorTeamAward[] = [...teams.values()].map((line) => {
    const lineup = [...line.players].map((id) => players.get(id)!);
    const weight = lineup.reduce((sum, player) => sum + player.rounds, 0);
    const rating = weight ? lineup.reduce((sum, player) => sum + ratingFor(player, scoring) * player.rounds, 0) / weight : 0;
    return { teamId: line.teamId, name: line.name, rating: round2(rating), mapsWon: line.mapsWon, mapsLost: line.mapsLost, roundsWon: line.roundsWon, roundsLost: line.roundsLost, placement: placementOf(line.teamId) };
  }).sort((left, right) =>
    right.rating - left.rating
    || right.mapsWon - left.mapsWon
    || (right.roundsWon - right.roundsLost) - (left.roundsWon - left.roundsLost)
    || compareText(left.name, right.name)
    || compareText(left.teamId, right.teamId));
  const all = [...players.values()].map((line) => toPlayerAward(line, placementOf(line.teamId), scoring));
  const clutchKing = [...all].sort((left, right) =>
    right.clutches - left.clutches
    || right.rating - left.rating
    || right.kills - left.kills
    || compareText(left.teamId, right.teamId)
    || compareText(left.playerId, right.playerId))[0] ?? null;
  const reel = [...all].filter((award) => award.multiKills.ace + award.multiKills.quad > 0)
    .sort((left, right) =>
      right.multiKills.ace - left.multiKills.ace
      || right.multiKills.quad - left.multiKills.quad
      || right.multiKills.triple - left.multiKills.triple
      || right.rating - left.rating
      || compareText(left.teamId, right.teamId)
      || compareText(left.playerId, right.playerId))[0] ?? null;
  return {
    mvp: topPlayers[0] ?? null,
    topPlayers,
    topTeam: teamAwards[0] ?? null,
    teams: teamAwards,
    clutchKing: clutchKing && clutchKing.clutches > 0 ? clutchKing : null,
    highlightReel: reel,
    ...(model === 'v3' ? { ratingModel: 'v3' as const, ratingBaseline: scoring.baseline } : {})
  };
}

const collectLines = (series: SeriesResult[], model: RatingModel) => {
  const players = new Map<string, PlayerLine>();
  const teams = new Map<string, TeamLine>();
  for (const item of series) for (const map of item.maps) accountMap(map, item, players, teams, model);
  return [...players.values()];
};

/** Mean raw Rating 3.0 of every player in the given series. */
export const fieldRatingBaseline = (series: SeriesResult[]): number => ratingBaseline(collectLines(series, 'v3'));

/**
 * Per-player line of one team across the given series (for run statistics based on the real kill feed). With Rating 3.0,
 * pass the Major's `ratingBaseline` so a single map or a single team is rated against the whole field.
 */
export function aggregatePlayerLines(series: SeriesResult[], options: { model?: RatingModel; baseline?: number } = {}): MajorPlayerAward[] {
  const model = options.model ?? 'v3';
  const lines = collectLines(series, model);
  const scoring: Scoring = { model, baseline: model === 'v3' ? options.baseline ?? ratingBaseline(lines) : 0 };
  return lines.map((line) => toPlayerAward(line, 'placementStage3', scoring));
}

export type { RoundDetail as AwardsRoundDetail };
