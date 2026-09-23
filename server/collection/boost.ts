import { courtPower, withPlayerBand } from '../../src/lib/game/courtPower';
import { applyCoachToTeam, coachAffinity } from '../../src/lib/game/dynasty/coach';
import { createBotMapStrategy, createUserMapStrategy, type MapSimulationContext } from '../../src/lib/game/map-veto';
import { botFieldPower, planBotField, soloFieldRelief } from '../../src/lib/game/online/bot-field';
import { CHAMPION_TEAM_IDS } from '../../src/lib/game/online/major-champions';
import { collectionCoachById, collectionPlayerById, collectionTeams } from '../../src/lib/game/online/collection-pool';
import { applyCollectionLineup, collectionBaseTeam, collectionRoleOf } from '../../src/lib/game/online/collection-lineup';
import { runOnlineTournament } from '../../src/lib/game/online/tournament';
import { drawHumanSeeds, type TournamentOrganization } from '../../src/lib/game/online/tournament-engine';
import { computeMajorAwards } from '../../src/lib/game/majorAwards';
import { createRunStats } from '../../src/lib/game/runStats';
import { calculateHistoricalTeamPower, createSeededRng } from '../../src/lib/game/simulation';
import { BOOST_BASE_RUNS, BOOST_EXTRA_PRICE, BOOST_EXTRA_RUNS, matchReward } from '../../src/lib/game/online/collection-rules';
import type { CombatTeam, MajorRun, MapId, Player, Roster } from '../../src/lib/game/types';
import type { Db } from '../db/client';
import { playerById, players, teams } from '../data';
import type { PreparedLineup, RoomField, RunCompletedEntry, RunCompletedEvent } from '../room-manager';
import { CollectionError, applyLedger } from './service';
import { recordMajor } from './seasons';
import { dayKeyUtcMinus3 } from './time';

/**
 * Boost de farm (2026-09-22): one activation per day resolves 10–20 whole solo Majors in memory — the saved lineup
 * against the same bot field the live solo button builds — and credits each run through `recordMajor` as a
 * non-competitive run: halved match coins, award coins, solo missions, ZERO season points, no crates. It removes the
 * clicking of twenty solo runs, not the ladder's integrity. FIELD NOTE: the field assembly below mirrors
 * `RoomManager.beginTournament` for the one-human case — keep the two in sync (the solo difficulty pins in
 * `tests/soloDifficulty.test.ts` would catch a drift in the shared balance math, not in this copy).
 */

const PARTICIPANT_ID = 'boost-player';
const PLACEMENT_ORDER = ['placementChampion', 'placementRunnerUp', 'placement3to4', 'placement5to8', 'placementStage3', 'placementStage2', 'placementStage1'];
/** Boost runs play the queue field: single Swiss of 16. */
const FIELD_SIZE = 16;

const lineupPlayer = (id: string): Player | undefined => playerById.get(id) ?? collectionPlayerById.get(id);

/** The human side, built like `RoomManager.toTournamentOrganization` for a prepared lineup (base → synergy → coach → band). */
function humanOrganization(prepared: PreparedLineup): TournamentOrganization {
  const selected = prepared.lineup.map((pick) => lineupPlayer(pick.playerId)).filter((player): player is Player => Boolean(player));
  const built: CombatTeam = collectionBaseTeam(selected, prepared.style, prepared.lineup, PARTICIPANT_ID);
  const synergized = applyCollectionLineup(built, { players: selected, roles: prepared.lineup.map(collectionRoleOf), starPlayerId: prepared.starPlayerId, style: prepared.style, coachId: prepared.coachId });
  const coach = prepared.coachId ? collectionCoachById.get(prepared.coachId) : undefined;
  const withCoach = coach ? { ...applyCoachToTeam(synergized, coach, coachAffinity(coach, selected, collectionTeams)), coachId: coach.id } : synergized;
  const base = { ...withCoach, power: withPlayerBand(withCoach.power) };
  return {
    id: PARTICIPANT_ID,
    name: 'Boost',
    seed: 1,
    human: true,
    team: { ...base, id: PARTICIPANT_ID, name: 'Boost', organizationId: PARTICIPANT_ID, isUser: false, lineup: prepared.lineup }
  };
}

/** The bot half of the field: same shuffle, champions-first order, zebra plan and solo relief as `beginTournament`. */
function boostBots(human: TournamentOrganization, field: RoomField, seed: string): TournamentOrganization[] {
  const shuffledTeams = [...teams].sort((left, right) => {
    const leftRoll = createSeededRng(`${seed}:bot:${left.id}`)();
    const rightRoll = createSeededRng(`${seed}:bot:${right.id}`)();
    const championOrder = field === 'champions' ? Number(!CHAMPION_TEAM_IDS.has(left.id)) - Number(!CHAMPION_TEAM_IDS.has(right.id)) : 0;
    return championOrder || leftRoll - rightRoll || left.id.localeCompare(right.id);
  });
  const plan = field === 'champions'
    ? { order: shuffledTeams, zebraIds: new Set<string>() }
    : planBotField({ shuffled: shuffledTeams, playerById, seed, slots: FIELD_SIZE - 1 });
  const relief = soloFieldRelief(courtPower(human.team.power), field);
  return plan.order.map((team, index) => {
    const combat = calculateHistoricalTeamPower(team, players);
    const id = `bot-${team.id}`;
    return {
      id,
      name: combat.name,
      seed: 2 + index,
      team: { ...combat, power: botFieldPower(combat.power, team, plan.zebraIds.has(team.id), relief, playerById, 1), id },
      human: false,
      sourceTeamId: team.id
    };
  }).filter((organization) => organization.id !== human.id);
}

function boostMapContext(prepared: PreparedLineup, botPool: TournamentOrganization[], seed: string): MapSimulationContext {
  const strategies: MapSimulationContext['strategies'] = new Map();
  const rosters = new Map<string, Roster>();
  const selected = prepared.lineup.map((pick) => lineupPlayer(pick.playerId)).filter((player): player is Player => Boolean(player));
  strategies.set(PARTICIPANT_ID, createUserMapStrategy(PARTICIPANT_ID, prepared.mapPreferences as [MapId, MapId, MapId], selected, teams));
  rosters.set(PARTICIPANT_ID, { players: selected, roles: new Map(prepared.lineup.map((pick) => [pick.playerId, pick.selectedSlotRole])) });
  for (const organization of botPool) {
    const historicalTeam = teams.find((team) => team.id === organization.sourceTeamId);
    if (!historicalTeam) continue;
    strategies.set(organization.id, { ...createBotMapStrategy(historicalTeam), teamId: organization.id });
    rosters.set(organization.id, { players: players.filter((player) => (historicalTeam.players ?? []).includes(player.id)) });
  }
  return { mode: 'premier', seed: `${seed}:online-maps`, strategies, rosters };
}

export interface BoostRunOutcome { entry: RunCompletedEntry; awards: ReturnType<typeof computeMajorAwards>; placement: string; champion: boolean }

/** One whole solo Major, resolved synchronously — no room, no sockets, deterministic by seed. */
export function simulateBoostRun(prepared: PreparedLineup, field: RoomField, seed: string): BoostRunOutcome {
  const human = humanOrganization(prepared);
  const botPool = boostBots(human, field, seed);
  const seedOrder: string[] = Array.from({ length: FIELD_SIZE }, () => '');
  const [humanSeed] = drawHumanSeeds(seed, 1, FIELD_SIZE);
  seedOrder[humanSeed - 1] = PARTICIPANT_ID;
  for (let index = 0, bot = 0; index < seedOrder.length; index += 1) if (!seedOrder[index]) seedOrder[index] = botPool[bot++]?.id ?? '';
  const result = runOnlineTournament({
    organizations: [human],
    botPool,
    entryStage: 'stage3',
    seed,
    mapContext: boostMapContext(prepared, botPool, seed),
    seedOrder,
    powerScale: 'court',
    swissBestOf: 3
  });
  const campaign = result.campaigns.find((candidate) => candidate.organizationId === PARTICIPANT_ID)!;
  const matches = result.rounds.flatMap((round) => round.series)
    .filter((series) => series.teamA.id === PARTICIPANT_ID || series.teamB.id === PARTICIPANT_ID);
  const stageMatches = matches.filter((series) => series.phase === 'stage3');
  const stageWins = stageMatches.filter((series) => series.winnerId === PARTICIPANT_ID).length;
  const champion = result.championId === PARTICIPANT_ID;
  const run: MajorRun = {
    stage3: { wins: stageWins, losses: stageMatches.length - stageWins, qualified: matches.some((series) => series.phase !== 'stage3'), matches: stageMatches },
    matches,
    champion,
    placement: campaign.placement
  };
  const selected = prepared.lineup.map((pick) => lineupPlayer(pick.playerId)).filter((player): player is Player => Boolean(player));
  const powerOf = new Map([human, ...botPool].map((organization) => [organization.id, organization.team.power]));
  const entry: RunCompletedEntry = {
    userId: prepared.userId,
    participantId: PARTICIPANT_ID,
    organizationName: 'Boost',
    placement: campaign.placement,
    champion,
    lineup: prepared.lineup,
    starPlayerId: prepared.starPlayerId,
    matches,
    stats: createRunStats(selected, run, `${seed}:participant-result:${PARTICIPANT_ID}`, prepared.lineup, PARTICIPANT_ID, { model: 'hltv1' }),
    opponents: matches.map((series) => {
      const opponent = series.teamA.id === PARTICIPANT_ID ? series.teamB : series.teamA;
      return { id: opponent.id, power: powerOf.get(opponent.id) ?? opponent.power, won: series.winnerId === PARTICIPANT_ID };
    }),
    ownPower: human.team.power,
    seriesLost: matches.filter((series) => series.winnerId && series.winnerId !== PARTICIPANT_ID).length,
    stage3Wins: stageWins,
    lineupIds: prepared.lineup.map((pick) => pick.playerId)
  };
  return { entry, awards: computeMajorAwards(result.rounds, result.championId, { model: 'hltv1' }), placement: campaign.placement, champion };
}

export interface BoostSummary { runs: number; coins: number; titles: number; best: string; activated: boolean }

/**
 * The daily activation: one row per (user, Brasília day) is the gate; the optional extra pack is charged on the same
 * transaction; then each run goes through `recordMajor` like any solo run (halved coins, solo missions, zero points),
 * idempotent by its own seed. The slow part (simulations) runs AFTER the gate commits, so a timeout never re-charges.
 */
export async function runBoost(db: Db, userId: string, prepared: PreparedLineup, field: RoomField, withExtra: boolean, now: number): Promise<BoostSummary> {
  const day = dayKeyUtcMinus3(now);
  const runs = BOOST_BASE_RUNS + (withExtra ? BOOST_EXTRA_RUNS : 0);
  await db.tx(async (tx) => {
    const [activation] = await tx.query('INSERT INTO boost_activations (user_id, day, extra) VALUES ($1, $2, $3) ON CONFLICT (user_id, day) DO NOTHING RETURNING user_id', [userId, day, withExtra]);
    if (!activation) throw new CollectionError(409, 'BOOST_ALREADY_USED', 'O boost de hoje já foi usado — volte amanhã');
    if (withExtra) await applyLedger(tx, userId, -BOOST_EXTRA_PRICE, 'purchase', `boost-extra:${day}`);
  });
  let coins = 0;
  let titles = 0;
  let best = PLACEMENT_ORDER[PLACEMENT_ORDER.length - 1];
  const roomCode = `BOOST-${day}-${field === 'champions' ? 'C' : 'R'}`;
  for (let index = 0; index < runs; index += 1) {
    const seed = `${userId}:boost:${day}:${index}`;
    const outcome = simulateBoostRun(prepared, field, seed);
    const event: RunCompletedEvent = {
      roomCode, seed, runNumber: index + 1, lobbySize: 1, competitive: false, field, awards: outcome.awards, entries: [outcome.entry]
    };
    await recordMajor(db, event, now);
    coins += matchReward(outcome.placement, false);
    if (outcome.champion) titles += 1;
    if (PLACEMENT_ORDER.indexOf(outcome.placement) < PLACEMENT_ORDER.indexOf(best)) best = outcome.placement;
  }
  await db.tx(async (tx) => {
    await tx.query('UPDATE boost_activations SET runs = $3, coins = $4, titles = $5 WHERE user_id = $1 AND day = $2', [userId, day, runs, coins, titles]);
  });
  return { runs, coins, titles, best, activated: true };
}

/** The day's boost state for the hub card. */
export async function boostState(db: Db, userId: string, now: number): Promise<BoostSummary & { baseRuns: number; extraRuns: number; extraPrice: number }> {
  const day = dayKeyUtcMinus3(now);
  const [row] = await db.query<{ runs: number; coins: number; titles: number }>('SELECT runs, coins, titles FROM boost_activations WHERE user_id = $1 AND day = $2', [userId, day]);
  return { activated: Boolean(row), runs: row?.runs ?? 0, coins: row?.coins ?? 0, titles: row?.titles ?? 0, best: '', baseRuns: BOOST_BASE_RUNS, extraRuns: BOOST_EXTRA_RUNS, extraPrice: BOOST_EXTRA_PRICE };
}
