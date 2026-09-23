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
import { BOOST_DAILY_RUN_CAP, BOOST_ITEM_PRICE, BOOST_RUNS_PER_ITEM, matchReward } from '../../src/lib/game/online/collection-rules';
import type { CombatTeam, MajorRun, MapId, Player, Roster } from '../../src/lib/game/types';
import type { Db } from '../db/client';
import { playerById, players, teams } from '../data';
import type { PreparedLineup, RoomField, RunCompletedEntry, RunCompletedEvent } from '../room-manager';
import { CollectionError, applyLedger } from './service';
import { recordMajor } from './seasons';
import { dayKeyUtcMinus3 } from './time';

/**
 * Boost de farm (2026-09-22): a STORE consumable — each 4.5k item resolves 10 whole solo Majors in memory (the saved
 * lineup against the same bot field the live solo button builds) and credits each run through `recordMajor` as a
 * non-competitive run: halved match coins, award coins, solo missions, ZERO season points, no crates. Stock is free to
 * buy; USAGE is capped per Brasília day so a top-tier team cannot mint coins unbounded. It removes the clicking of
 * twenty solo runs, not the ladder's integrity. FIELD NOTE: the field assembly below mirrors
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

export interface BoostSummary { runs: number; coins: number; titles: number; best: string; activated: boolean; stock: number }

/**
 * Buys consumable Boost items (4.5k each, stock free — the daily cap is on USAGE, not on buying). The stock upsert
 * commits before the ledger inside the same transaction, so a race can never pay without stock.
 */
export async function buyBoost(db: Db, userId: string, quantity: number, now: number): Promise<{ stock: number; wallet: number }> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw new CollectionError(400, 'BAD_QUANTITY', 'Compre de 1 a 50 itens por vez');
  return db.tx(async (tx) => {
    await tx.query('INSERT INTO boost_stock (user_id, items) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET items = boost_stock.items + $2, updated_at = now()', [userId, quantity]);
    const wallet = await applyLedger(tx, userId, -BOOST_ITEM_PRICE * quantity, 'purchase', `boost-item:${quantity}:${dayKeyUtcMinus3(now)}`);
    const [row] = await tx.query<{ items: number }>('SELECT items FROM boost_stock WHERE user_id = $1', [userId]);
    return { stock: row.items, wallet };
  });
}

/**
 * Consumes ONE stock item and resolves its batch of instant solo majors. The daily usage cap (30 runs) is checked and
 * bumped in the same transaction that consumes the item, so a race can never pass the cap; the slow simulations run
 * after the gate commits. Each run goes through `recordMajor` like any solo run (zero points by competitive=false).
 */
export async function runBoost(db: Db, userId: string, prepared: PreparedLineup, field: RoomField, now: number): Promise<BoostSummary> {
  const day = dayKeyUtcMinus3(now);
  await db.tx(async (tx) => {
    const [usage] = await tx.query<{ runs: number }>(
      `INSERT INTO boost_usage (user_id, day, runs) VALUES ($1, $2, 0)
       ON CONFLICT (user_id, day) DO UPDATE SET runs = boost_usage.runs RETURNING runs`, [userId, day]);
    if (usage.runs + BOOST_RUNS_PER_ITEM > BOOST_DAILY_RUN_CAP) throw new CollectionError(409, 'BOOST_DAILY_CAP', `Teto diário do boost atingido (${BOOST_DAILY_RUN_CAP} runs)`);
    const [stock] = await tx.query('UPDATE boost_stock SET items = items - 1, updated_at = now() WHERE user_id = $1 AND items > 0 RETURNING items', [userId]);
    if (!stock) throw new CollectionError(409, 'NO_BOOST_STOCK', 'Você não tem Boost de Farm no estoque — compre na loja');
    await tx.query('UPDATE boost_usage SET runs = runs + $3 WHERE user_id = $1 AND day = $2', [userId, day, BOOST_RUNS_PER_ITEM]);
  });
  let coins = 0;
  let titles = 0;
  let best = PLACEMENT_ORDER[PLACEMENT_ORDER.length - 1];
  const roomCode = `BOOST-${day}-${field === 'champions' ? 'C' : 'R'}`;
  for (let index = 0; index < BOOST_RUNS_PER_ITEM; index += 1) {
    const seed = `${userId}:boost:${day}:${field}:${index}`;
    const outcome = simulateBoostRun(prepared, field, seed);
    const event: RunCompletedEvent = {
      roomCode, seed, runNumber: index + 1, lobbySize: 1, competitive: false, field, awards: outcome.awards, entries: [outcome.entry]
    };
    await recordMajor(db, event, now);
    coins += matchReward(outcome.placement, false);
    if (outcome.champion) titles += 1;
    if (PLACEMENT_ORDER.indexOf(outcome.placement) < PLACEMENT_ORDER.indexOf(best)) best = outcome.placement;
  }
  const [stockRow] = await db.query<{ items: number }>('SELECT items FROM boost_stock WHERE user_id = $1', [userId]);
  return { runs: BOOST_RUNS_PER_ITEM, coins, titles, best, activated: true, stock: stockRow?.items ?? 0 };
}

/** The boost state for the switch on the solo card and the store item. */
export async function boostState(db: Db, userId: string, now: number): Promise<{ stock: number; runsToday: number; dailyCap: number; price: number; runsPerItem: number }> {
  const day = dayKeyUtcMinus3(now);
  const [stock] = await db.query<{ items: number }>('SELECT items FROM boost_stock WHERE user_id = $1', [userId]);
  const [usage] = await db.query<{ runs: number }>('SELECT runs FROM boost_usage WHERE user_id = $1 AND day = $2', [userId, day]);
  return { stock: stock?.items ?? 0, runsToday: usage?.runs ?? 0, dailyCap: BOOST_DAILY_RUN_CAP, price: BOOST_ITEM_PRICE, runsPerItem: BOOST_RUNS_PER_ITEM };
}
