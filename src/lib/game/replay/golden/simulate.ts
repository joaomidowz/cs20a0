import { createSeededRng } from '../../simulation';
import type { OrgStyle } from '../../types';
import type {
  ReplayPlanV1,
  ReplayRoundPlanV1,
  ReplaySide
} from '../types';
import {
  collectGoldenGroundItems,
  consumeGoldenGrenade,
  dropGoldenInventory,
  prepareGoldenRoundEconomy,
  settleGoldenRoundEconomy,
  type GoldenBuyPlan
} from './economy';
import { MIRAGE_POINTS } from './mirage-data';
import {
  createMirageNavigation,
  type GoldenNavigation
} from './navigation';
import {
  assignGoldenSquadResponsibilities,
  GOLDEN_STYLE_PROFILES,
  selectGoldenStrategy
} from './tactics';
import type {
  GoldenGroundItem,
  GoldenInventory,
  GoldenMatchReplayV1,
  GoldenPlayerState,
  GoldenPoint,
  GoldenReplayEvent,
  GoldenRoundReplayV1,
  GoldenSquadAssignment,
  GoldenStrategy,
  GoldenTacticalPlan,
  GoldenWeapon
} from './types';

export const GOLDEN_TICK_RATE = 32 as const;
export const GOLDEN_FRAME_STRIDE_TICKS = 2 as const;
export const GOLDEN_FREEZE_SECONDS = 5 as const;
export const GOLDEN_ROUND_SECONDS = 115 as const;
export const GOLDEN_BOMB_SECONDS = 40 as const;
export const GOLDEN_PLANT_SECONDS = 3.2 as const;
export const GOLDEN_DEFUSE_SECONDS = 10 as const;
export const GOLDEN_KIT_DEFUSE_SECONDS = 4 as const;

const SNAPSHOT_FLOATS_PER_PLAYER = 7;
const SHOT_FLOATS = 6;
const TICK_SECONDS = 1 / GOLDEN_TICK_RATE;
const FREEZE_TICKS = GOLDEN_FREEZE_SECONDS * GOLDEN_TICK_RATE;
const BOMB_TICKS = GOLDEN_BOMB_SECONDS * GOLDEN_TICK_RATE;
const PLANT_TICKS = Math.round(GOLDEN_PLANT_SECONDS * GOLDEN_TICK_RATE);

const GOLDEN_WEAPONS: readonly GoldenWeapon[] = [
  'knife',
  'glock',
  'usp',
  'p2000',
  'duals',
  'p250',
  'deagle',
  'mp9',
  'mac10',
  'ump',
  'nova',
  'galil',
  'famas',
  'ak47',
  'm4a1',
  'awp'
];

const T_SPAWNS: readonly GoldenPoint[] = [
  { x: 669.3, y: 941.3 },
  { x: 722.7, y: 989.3 },
  { x: 690.7, y: 930.7 },
  { x: 621.3, y: 968 },
  { x: 642.7, y: 957.3 }
];

const CT_SPAWNS: readonly GoldenPoint[] = [
  { x: 285.3, y: 306.7 },
  { x: 242.7, y: 253.3 },
  { x: 306.7, y: 296 },
  { x: 248, y: 328 },
  { x: 328, y: 285.3 }
];

const SITE_OFFSETS: Record<'A' | 'B', readonly GoldenPoint[]> = {
  A: [
    { x: 768.5, y: 193.6 },
    { x: 738.7, y: 162.7 },
    { x: 733.3, y: 221.3 },
    { x: 696, y: 307 },
    { x: 670, y: 220 }
  ],
  B: [
    { x: 200.2, y: 563.1 },
    { x: 232, y: 594.7 },
    { x: 168, y: 594.7 },
    { x: 285, y: 540 },
    { x: 245, y: 585 }
  ]
};

export interface GoldenRoundStartPlayerState {
  playerId: string;
  organizationId: string;
  side: ReplaySide;
  money: number;
  inventory: GoldenInventory;
}

export type GoldenSimulatedRoundReplayV1 = GoldenRoundReplayV1 & {
  startState: GoldenRoundStartPlayerState[];
  strategy: GoldenStrategy;
  ctFormation: string;
};

export type GoldenSimulatedMatchReplayV1 = Omit<GoldenMatchReplayV1, 'rounds'> & {
  rounds: GoldenSimulatedRoundReplayV1[];
};

export interface GoldenRoundSimulationContext {
  plan: ReplayPlanV1;
  roundPlan: ReplayRoundPlanV1;
  players: GoldenPlayerState[];
  navigation?: GoldenNavigation;
  groundItems?: GoldenGroundItem[];
}

interface GoldenRuntimePlayer {
  player: GoldenPlayerState;
  responsibility: GoldenSquadAssignment['responsibility'] | null;
  path: GoldenPoint[];
  pathIndex: number;
  startTick: number;
  firingUntilTick: number;
  hasBomb: boolean;
  action: 'plant' | 'defuse' | null;
  actionStartTick: number;
  actionEndTick: number;
}

interface GoldenSimulationState {
  players: GoldenPlayerState[];
  officialWinnerOrganizationId: string;
  liveTimeSeconds: number;
  ended: boolean;
  bomb: {
    state: 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';
    x: number;
    y: number;
  };
  events: GoldenReplayEvent[];
  shots: number[];
  groundItems: GoldenGroundItem[];
}

interface ScheduledKill {
  tick: number;
  victimPlayerId: string;
  killerOrganizationId: string;
}

interface ScheduledUtility {
  throwTick: number;
  impactTick: number;
  playerId: string;
  grenade: 'flash' | 'smoke' | 'molotov' | 'he';
  target: GoldenPoint;
  thrown: boolean;
}

const cloneInventory = (inventory: GoldenInventory): GoldenInventory => ({
  primary: inventory.primary,
  secondary: inventory.secondary,
  armor: inventory.armor,
  helmet: inventory.helmet,
  kit: inventory.kit,
  grenades: { ...inventory.grenades }
});

const weaponIndex = (weapon: GoldenWeapon): number => {
  const index = GOLDEN_WEAPONS.indexOf(weapon);
  return index >= 0 ? index : 0;
};

const styleForOrganization = (plan: ReplayPlanV1, organizationId: string): OrgStyle =>
  plan.organizations.find((organization) => organization.id === organizationId)?.style ?? 'balanced';

const shuffle = <Value>(values: readonly Value[], rng: () => number): Value[] => {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[selected]] = [shuffled[selected], shuffled[index]];
  }
  return shuffled;
};

const roundBuyPlan = (
  players: GoldenPlayerState[],
  side: ReplaySide,
  roundNumber: number
): GoldenBuyPlan => {
  if (roundNumber === 1 || roundNumber === 13) return 'pistol';
  const team = players.filter((player) => player.side === side);
  const averageMoney = team.reduce((sum, player) => sum + player.money, 0) / Math.max(1, team.length);
  return averageMoney >= 4_000 ? 'full' : averageMoney >= 2_300 ? 'force' : 'eco';
};

function createEconomyPlayers(plan: ReplayPlanV1): GoldenPlayerState[] {
  const firstRound = plan.rounds[0];
  return plan.players.map((player) => {
    const side: ReplaySide = player.organizationId === firstRound?.tOrganizationId ? 'T' : 'CT';
    const secondary: GoldenWeapon = side === 'T' ? 'glock' : 'usp';
    return {
      id: player.id,
      organizationId: player.organizationId,
      side,
      selectedRole: player.role,
      style: styleForOrganization(plan, player.organizationId),
      money: 800,
      inventory: {
        primary: secondary,
        secondary,
        armor: 0,
        helmet: false,
        kit: false,
        grenades: {
          he: 0,
          flash: 0,
          smoke: 0,
          molotov: 0
        }
      },
      x: MIRAGE_POINTS.tSpawn.x,
      y: MIRAGE_POINTS.tSpawn.y,
      angle: -Math.PI * 0.75,
      hp: 100,
      alive: true
    };
  });
}

function resetRoundPlayers(
  plan: ReplayPlanV1,
  roundPlan: ReplayRoundPlanV1,
  players: GoldenPlayerState[],
  navigation: GoldenNavigation,
  rng: () => number
) {
  const tSpawns = shuffle(T_SPAWNS, rng);
  const ctSpawns = shuffle(CT_SPAWNS, rng);
  let tIndex = 0;
  let ctIndex = 0;
  for (const player of players) {
    player.side = player.organizationId === roundPlan.tOrganizationId ? 'T' : 'CT';
    player.style = styleForOrganization(plan, player.organizationId);
    player.inventory.secondary = player.side === 'T' ? 'glock' : 'usp';
    if (roundPlan.number === 13) {
      player.money = 800;
      player.inventory.primary = player.inventory.secondary;
      player.inventory.armor = 0;
      player.inventory.helmet = false;
      player.inventory.kit = false;
      player.inventory.grenades = { he: 0, flash: 0, smoke: 0, molotov: 0 };
    }
    player.hp = 100;
    player.alive = true;
    const spawn = player.side === 'T' ? tSpawns[tIndex++] : ctSpawns[ctIndex++];
    const freeSpawn = navigation.nearestFree(spawn?.x ?? MIRAGE_POINTS.tSpawn.x, spawn?.y ?? MIRAGE_POINTS.tSpawn.y);
    player.x = freeSpawn.x;
    player.y = freeSpawn.y;
    player.angle = player.side === 'T' ? -Math.PI * 0.75 : Math.PI;
  }
}

function prepareRoundEconomy(
  players: GoldenPlayerState[],
  roundPlan: ReplayRoundPlanV1,
  rng: () => number,
  events: GoldenReplayEvent[]
) {
  for (const side of ['T', 'CT'] as const) {
    const plan = roundBuyPlan(players, side, roundPlan.number);
    const summary = prepareGoldenRoundEconomy(players, {
      side,
      plan,
      pistolRound: roundPlan.number === 1 || roundPlan.number === 13
    }, rng);
    for (const delivery of summary.deliveries) {
      const receiver = players.find((player) => player.id === delivery.toPlayerId);
      events.push({
        tick: 0,
        type: 'delivery',
        playerId: delivery.fromPlayerId,
        targetPlayerId: delivery.toPlayerId,
        weapon: delivery.weapon,
        x: receiver?.x,
        y: receiver?.y
      });
    }
  }
}

function ctFormation(style: OrgStyle, strategy: GoldenTacticalPlan, rng: () => number): string {
  if (style === 'aggressive') {
    return rng() < 0.5 ? 'BATIDA CT · DOMÍNIO DE MEIO' : `BATIDA CT · RAMP ${strategy.site}`;
  }
  if (style === 'tactical') {
    return rng() < 0.5 ? 'DOMÍNIO CT · DUPLA SINCRONIZADA' : 'DOMÍNIO CT · TRIO DE UTILITÁRIAS';
  }
  return rng() < 0.5 ? 'DEFAULT CT · 2-1-2' : 'DEFAULT CT · FLEX DE MEIO';
}

function targetForT(
  assignment: GoldenSquadAssignment,
  strategy: GoldenTacticalPlan,
  index: number
): GoldenPoint {
  if (assignment.responsibility === 'SECOND') return MIRAGE_POINTS.mid;
  if (assignment.responsibility === 'LURK') {
    if (strategy.kind.includes('rush')) return SITE_OFFSETS[strategy.site][4];
    return strategy.site === 'A' ? MIRAGE_POINTS.siteB : MIRAGE_POINTS.mid;
  }
  return SITE_OFFSETS[strategy.site][index % 3];
}

function targetForCt(strategy: GoldenTacticalPlan, index: number, style: OrgStyle): GoldenPoint {
  if (style === 'aggressive' && index >= 2 && index <= 3) return MIRAGE_POINTS.mid;
  if (index < 2) return SITE_OFFSETS.A[index];
  if (index < 4) return SITE_OFFSETS.B[index - 2];
  return strategy.site === 'A' ? SITE_OFFSETS.A[3] : SITE_OFFSETS.B[3];
}

function createRuntimePlayers(
  plan: ReplayPlanV1,
  roundPlan: ReplayRoundPlanV1,
  players: GoldenPlayerState[],
  navigation: GoldenNavigation,
  strategy: GoldenTacticalPlan,
  rng: () => number
): GoldenRuntimePlayer[] {
  const tPlayers = players.filter((player) => player.side === 'T');
  const assignments = assignGoldenSquadResponsibilities(
    tPlayers.map((player) => ({ id: player.id, selectedRole: player.selectedRole })),
    strategy
  );
  const assignmentByPlayer = new Map(assignments.map((assignment) => [assignment.playerId, assignment]));
  const ctStyle = styleForOrganization(plan, roundPlan.ctOrganizationId);

  return players.map((player) => {
    const assignment = assignmentByPlayer.get(player.id) ?? null;
    const sidePlayers = players.filter((candidate) => candidate.side === player.side);
    const sideIndex = sidePlayers.findIndex((candidate) => candidate.id === player.id);
    const target = player.side === 'T' && assignment
      ? targetForT(assignment, strategy, sideIndex)
      : targetForCt(strategy, sideIndex, ctStyle);
    const destination = navigation.nearestFree(target.x, target.y);
    const path = navigation.findPath(player, destination);
    const executeTick = FREEZE_TICKS + Math.round(strategy.executeAtSeconds * GOLDEN_TICK_RATE);
    const responsibilityDelay = assignment?.responsibility === 'ENTRY' ? 0
      : assignment?.responsibility === 'BANGER' ? Math.round(1.8 * GOLDEN_TICK_RATE)
        : assignment?.responsibility === 'TRADER' ? Math.round(3.1 * GOLDEN_TICK_RATE)
          : assignment?.responsibility === 'SECOND' ? Math.round(1.1 * GOLDEN_TICK_RATE)
            : assignment?.responsibility === 'LURK'
              ? Math.round((strategy.kind.includes('rush') ? 9 : 3 + rng() * 4) * GOLDEN_TICK_RATE)
              : 0;
    return {
      player,
      responsibility: assignment?.responsibility ?? null,
      path: path.length > 1 ? path : [navigation.nearestFree(player.x, player.y), destination],
      pathIndex: 1,
      startTick: player.side === 'T' ? executeTick + responsibilityDelay : FREEZE_TICKS,
      firingUntilTick: -1,
      hasBomb: false,
      action: null,
      actionStartTick: 0,
      actionEndTick: 0
    };
  });
}

function scheduleUtility(
  strategy: GoldenTacticalPlan,
  runtime: GoldenRuntimePlayer[],
  ctStyle: OrgStyle,
  rng: () => number
): ScheduledUtility[] {
  const throwers = runtime.filter((candidate) =>
    candidate.player.side === 'T'
    && ['BANGER', 'TRADER', 'ENTRY'].includes(candidate.responsibility ?? ''));
  const executeTick = FREEZE_TICKS + Math.round(strategy.executeAtSeconds * GOLDEN_TICK_RATE);
  const utility: ScheduledUtility[] = [];

  strategy.smokeTargets.forEach((target, index) => {
    const thrower = throwers[index % Math.max(1, throwers.length)] ?? runtime.find((candidate) => candidate.player.side === 'T');
    if (!thrower) return;
    const impactTick = Math.max(FREEZE_TICKS + 1, executeTick - Math.round((2.2 + rng() * 1.8) * GOLDEN_TICK_RATE));
    utility.push({
      throwTick: Math.max(FREEZE_TICKS, impactTick - 18),
      impactTick,
      playerId: thrower.player.id,
      grenade: 'smoke',
      target,
      thrown: false
    });
  });

  strategy.flashTargets.forEach((target, index) => {
    const thrower = throwers[(index + 1) % Math.max(1, throwers.length)] ?? runtime.find((candidate) => candidate.player.side === 'T');
    if (!thrower) return;
    const impactTick = executeTick + Math.round((index * 0.25 - 0.8) * GOLDEN_TICK_RATE);
    utility.push({
      throwTick: Math.max(FREEZE_TICKS, impactTick - 14),
      impactTick,
      playerId: thrower.player.id,
      grenade: 'flash',
      target,
      thrown: false
    });
  });

  strategy.molotovTargets.forEach((target, index) => {
    const thrower = throwers[(index + 2) % Math.max(1, throwers.length)] ?? runtime.find((candidate) => candidate.player.side === 'T');
    if (!thrower) return;
    const impactTick = executeTick + Math.round((index * 0.35 - 1.1) * GOLDEN_TICK_RATE);
    utility.push({
      throwTick: Math.max(FREEZE_TICKS, impactTick - 16),
      impactTick,
      playerId: thrower.player.id,
      grenade: 'molotov',
      target,
      thrown: false
    });
  });

  const ctThrowers = runtime.filter((candidate) => candidate.player.side === 'CT');
  const ctUtilityCount = ctStyle === 'tactical' ? 3 : ctStyle === 'aggressive' ? 2 : 1;
  for (let index = 0; index < ctUtilityCount; index += 1) {
    const ctThrower = ctThrowers[index % Math.max(1, ctThrowers.length)];
    if (ctThrower) {
      const impactTick = FREEZE_TICKS + Math.round((4.2 + index * 0.32 + rng() * 1.1) * GOLDEN_TICK_RATE);
      const grenade = ctStyle === 'tactical'
        ? (['smoke', 'flash', 'he'] as const)[index]
        : (['flash', 'he'] as const)[index % 2];
      utility.push({
        throwTick: impactTick - 14,
        impactTick,
        playerId: ctThrower.player.id,
        grenade,
        target: index === 2 ? SITE_OFFSETS[strategy.site][3] : MIRAGE_POINTS.mid,
        thrown: false
      });
    }
  }

  return utility.sort((left, right) => left.throwTick - right.throwTick || left.playerId.localeCompare(right.playerId));
}

function scheduleKills(
  players: GoldenPlayerState[],
  officialWinnerOrganizationId: string,
  bombCarrierId: string | undefined,
  liveStartTick: number,
  endTick: number,
  roundNumber: number
): ScheduledKill[] {
  const liveTicks = Math.max(1, endTick - liveStartTick);
  const losingPlayers = players
    .filter((player) => player.organizationId !== officialWinnerOrganizationId)
    .sort((left, right) => Number(left.id === bombCarrierId) - Number(right.id === bombCarrierId) || left.id.localeCompare(right.id));
  const winningPlayers = players
    .filter((player) => player.organizationId === officialWinnerOrganizationId && player.id !== bombCarrierId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const winnerDeaths = Math.min(2, roundNumber % 3);
  const scheduled: ScheduledKill[] = [];

  winningPlayers.slice(0, winnerDeaths).forEach((victim, index) => {
    scheduled.push({
      tick: liveStartTick + Math.round(liveTicks * (0.28 + index * 0.09)),
      victimPlayerId: victim.id,
      killerOrganizationId: losingPlayers[0]?.organizationId ?? ''
    });
  });
  losingPlayers.forEach((victim, index) => {
    const progress = losingPlayers.length === 1 ? 0.7 : 0.42 + (index / (losingPlayers.length - 1)) * 0.38;
    scheduled.push({
      tick: liveStartTick + Math.round(liveTicks * progress),
      victimPlayerId: victim.id,
      killerOrganizationId: officialWinnerOrganizationId
    });
  });

  return scheduled.sort((left, right) => left.tick - right.tick || left.victimPlayerId.localeCompare(right.victimPlayerId));
}

function officialOutcomeMultiplier(state: GoldenSimulationState, player: GoldenPlayerState): number {
  const liveSeconds = Math.max(0, state.liveTimeSeconds);
  if (liveSeconds < 35) return 1;
  const progress = Math.min(1, (liveSeconds - 35) / 70);
  const favored = player.organizationId === state.officialWinnerOrganizationId;
  return favored ? 1 + progress * 0.18 : 1 - progress * 0.12;
}

function tryMove(
  runtime: GoldenRuntimePlayer,
  state: GoldenSimulationState,
  navigation: GoldenNavigation,
  tick: number
) {
  const player = runtime.player;
  if (!player.alive || tick < runtime.startTick || runtime.pathIndex >= runtime.path.length) return;
  const target = runtime.path[runtime.pathIndex];
  const deltaX = target.x - player.x;
  const deltaY = target.y - player.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 0.2) {
    runtime.pathIndex += 1;
    return;
  }

  const styleSpeed = player.style === 'aggressive' ? 98 : player.style === 'tactical' ? 78 : 88;
  const step = Math.min(distance, styleSpeed * officialOutcomeMultiplier(state, player) * TICK_SECONDS);
  const nextX = player.x + (deltaX / distance) * step;
  const nextY = player.y + (deltaY / distance) * step;
  player.angle = Math.atan2(deltaY, deltaX);
  if (navigation.isFree(nextX, nextY)) {
    player.x = nextX;
    player.y = nextY;
  } else {
    const free = navigation.nearestFree(nextX, nextY);
    if (navigation.isFree(free.x, free.y)) {
      player.x = free.x;
      player.y = free.y;
    }
  }
  if (distance <= step + 0.2) runtime.pathIndex += 1;

  const team = state.players.filter((candidate) => candidate.organizationId === player.organizationId);
  for (const pickup of collectGoldenGroundItems(player, team, state.groundItems)) {
    state.events.push({
      tick,
      type: 'pickup',
      playerId: pickup.playerId,
      itemId: pickup.itemId,
      x: player.x,
      y: player.y
    });
  }
}

function killPlayer(
  state: GoldenSimulationState,
  runtime: GoldenRuntimePlayer[],
  scheduled: ScheduledKill,
  tick: number
) {
  const victim = runtime.find((candidate) => candidate.player.id === scheduled.victimPlayerId);
  if (!victim?.player.alive) return;
  const killer = runtime.find((candidate) =>
    candidate.player.organizationId === scheduled.killerOrganizationId && candidate.player.alive);
  if (!killer) return;

  const weapon = killer.player.inventory.primary;
  killer.player.angle = Math.atan2(victim.player.y - killer.player.y, victim.player.x - killer.player.x);
  killer.firingUntilTick = tick + 2;
  state.shots.push(
    tick,
    killer.player.x,
    killer.player.y,
    victim.player.x,
    victim.player.y,
    (killer.player.side === 'CT' ? 1 : 0) + 2
  );
  state.events.push({
    tick,
    type: 'shot',
    playerId: killer.player.id,
    targetPlayerId: victim.player.id,
    weapon,
    x: killer.player.x,
    y: killer.player.y
  });

  victim.player.hp = 0;
  victim.player.alive = false;
  if (victim.hasBomb) {
    victim.hasBomb = false;
    state.bomb = { state: 'dropped', x: victim.player.x, y: victim.player.y };
    state.events.push({
      tick,
      type: 'bomb-drop',
      playerId: victim.player.id,
      x: victim.player.x,
      y: victim.player.y
    });
  }
  state.events.push({
    tick,
    type: 'kill',
    playerId: killer.player.id,
    targetPlayerId: victim.player.id,
    weapon,
    x: victim.player.x,
    y: victim.player.y
  });

  const dropped = dropGoldenInventory(victim.player, victim.player);
  for (const item of dropped) {
    state.groundItems.push(item);
    state.events.push({
      tick,
      type: item.kind === 'weapon' ? 'weapon-drop' : 'grenade-drop',
      playerId: victim.player.id,
      itemId: item.id,
      weapon: item.weapon,
      grenade: item.grenade,
      x: item.x,
      y: item.y
    });
  }
}

function emitUtility(
  state: GoldenSimulationState,
  scheduled: ScheduledUtility,
  tick: number
) {
  if (tick === scheduled.throwTick) {
    const thrower = state.players.find((player) => player.id === scheduled.playerId);
    if (!thrower?.alive || !consumeGoldenGrenade(thrower, scheduled.grenade)) return;
    scheduled.thrown = true;
    state.events.push({
      tick,
      type: 'grenade',
      playerId: scheduled.playerId,
      grenade: scheduled.grenade,
      x: scheduled.target.x,
      y: scheduled.target.y
    });
  }
  if (tick !== scheduled.impactTick || !scheduled.thrown) return;
  const type = scheduled.grenade === 'molotov' ? 'fire' : scheduled.grenade;
  state.events.push({
    tick,
    type,
    playerId: scheduled.playerId,
    grenade: scheduled.grenade,
    x: scheduled.target.x,
    y: scheduled.target.y
  });
}

function snapshotFlags(runtime: GoldenRuntimePlayer, tick: number): number {
  let flags = runtime.player.alive ? 1 : 0;
  if (runtime.action === 'plant') flags |= 2;
  if (runtime.action === 'defuse') flags |= 4;
  if (runtime.hasBomb) flags |= 16;
  if (runtime.firingUntilTick >= tick) flags |= 32;
  return flags;
}

function actionProgress(runtime: GoldenRuntimePlayer, tick: number): number {
  if (!runtime.action || runtime.actionEndTick <= runtime.actionStartTick) return 0;
  return Math.max(0, Math.min(1,
    (tick - runtime.actionStartTick) / (runtime.actionEndTick - runtime.actionStartTick)));
}

function recordSnapshot(
  snapshots: number[],
  grenadeSnapshots: number[],
  runtime: GoldenRuntimePlayer[],
  navigation: GoldenNavigation,
  tick: number
) {
  for (const runtimePlayer of runtime) {
    const player = runtimePlayer.player;
    if (player.alive && !navigation.isFree(player.x, player.y)) {
      const free = navigation.nearestFree(player.x, player.y);
      player.x = free.x;
      player.y = free.y;
    }
    snapshots.push(
      player.x,
      player.y,
      player.angle,
      player.hp,
      snapshotFlags(runtimePlayer, tick),
      weaponIndex(player.inventory.primary),
      actionProgress(runtimePlayer, tick)
    );
    grenadeSnapshots.push(
      player.inventory.grenades.he,
      player.inventory.grenades.flash,
      player.inventory.grenades.smoke,
      player.inventory.grenades.molotov
    );
  }
}

function resolveGoldenFinalContact(
  state: GoldenSimulationState,
  runtime: GoldenRuntimePlayer[],
  tick: number
) {
  const remainingLosers = runtime.filter((candidate) =>
    candidate.player.alive
    && candidate.player.organizationId !== state.officialWinnerOrganizationId);
  for (const loser of remainingLosers) {
    killPlayer(state, runtime, {
      tick,
      victimPlayerId: loser.player.id,
      killerOrganizationId: state.officialWinnerOrganizationId
    }, tick);
  }
}

function finishAtOfficialBoundary(
  state: GoldenSimulationState,
  runtime: GoldenRuntimePlayer[],
  tick: number,
  endTick: number,
  winnerSide: ReplaySide,
  site: 'A' | 'B'
) {
  if (state.ended || tick < endTick) return;
  resolveGoldenFinalContact(state, runtime, tick);
  if (winnerSide === 'T' && state.bomb.state === 'planted') {
    state.bomb.state = 'exploded';
    state.events.push({
      tick,
      type: 'explode',
      site,
      x: state.bomb.x,
      y: state.bomb.y
    });
  } else if (state.bomb.state === 'planted') {
    state.bomb.state = 'defused';
    state.events.push({
      tick,
      type: 'defuse',
      playerId: runtime.find((candidate) => candidate.action === 'defuse')?.player.id,
      site,
      x: state.bomb.x,
      y: state.bomb.y
    });
  }
  state.events.push({
    tick,
    type: 'round-end',
    winnerOrganizationId: state.officialWinnerOrganizationId,
    site,
    x: state.bomb.x,
    y: state.bomb.y
  });
  state.ended = true;
}

function countBlockedSnapshots(round: GoldenRoundReplayV1, navigation: GoldenNavigation): number {
  let blocked = 0;
  const playerCount = round.playerIds.length;
  const frameStride = playerCount * SNAPSHOT_FLOATS_PER_PLAYER;
  for (let frame = 0; frame < round.frames; frame += 1) {
    for (let player = 0; player < playerCount; player += 1) {
      const offset = frame * frameStride + player * SNAPSHOT_FLOATS_PER_PLAYER;
      if ((round.snapshots[offset + 4] & 1) === 0) continue;
      if (!navigation.isFree(round.snapshots[offset], round.snapshots[offset + 1])) blocked += 1;
    }
  }
  return blocked;
}

export function simulateGoldenMirageRound(
  context: GoldenRoundSimulationContext
): GoldenSimulatedRoundReplayV1 {
  const { plan, roundPlan, players } = context;
  if (plan.mapId !== 'mirage') {
    throw new Error(`Golden simulator only supports Mirage, received ${plan.mapId}`);
  }
  const navigation = context.navigation ?? createMirageNavigation();
  const groundItems = context.groundItems ?? [];
  groundItems.length = 0;
  const rng = createSeededRng(`${plan.id}:golden:${roundPlan.number}`);
  resetRoundPlayers(plan, roundPlan, players, navigation, rng);
  const events: GoldenReplayEvent[] = [];
  prepareRoundEconomy(players, roundPlan, rng, events);
  const startState = players.map((player) => ({
    playerId: player.id,
    organizationId: player.organizationId,
    side: player.side,
    money: player.money,
    inventory: cloneInventory(player.inventory)
  }));
  const strategy = selectGoldenStrategy(
    styleForOrganization(plan, roundPlan.tOrganizationId),
    `${plan.id}:golden:${roundPlan.number}:strategy`
  );
  const formation = ctFormation(styleForOrganization(plan, roundPlan.ctOrganizationId), strategy, rng);
  const runtime = createRuntimePlayers(plan, roundPlan, players, navigation, strategy, rng);
  const bombCarrier = runtime.find((candidate) =>
    candidate.player.side === 'T' && candidate.player.selectedRole === 'igl')
    ?? runtime.find((candidate) =>
      candidate.player.side === 'T' && candidate.player.selectedRole === 'support')
    ?? runtime.find((candidate) => candidate.player.side === 'T');
  if (bombCarrier) bombCarrier.hasBomb = true;

  const durationSeconds = Math.min(
    GOLDEN_FREEZE_SECONDS + GOLDEN_ROUND_SECONDS + GOLDEN_BOMB_SECONDS,
    Math.max(GOLDEN_FREEZE_SECONDS + 1, roundPlan.durationMs / 1_000)
  );
  const endTick = Math.max(FREEZE_TICKS + 1, Math.round(durationSeconds * GOLDEN_TICK_RATE));
  const winnerSide: ReplaySide = roundPlan.winnerOrganizationId === roundPlan.tOrganizationId ? 'T' : 'CT';
  const plantCompleteTick = winnerSide === 'T'
    ? Math.max(FREEZE_TICKS + PLANT_TICKS, endTick - BOMB_TICKS)
    : Math.max(FREEZE_TICKS + PLANT_TICKS, endTick - Math.round(14 * GOLDEN_TICK_RATE));
  const plantStartTick = plantCompleteTick - PLANT_TICKS;
  const defuser = winnerSide === 'CT'
    ? runtime.find((candidate) => candidate.player.organizationId === roundPlan.winnerOrganizationId && candidate.player.selectedRole === 'support')
      ?? runtime.find((candidate) => candidate.player.organizationId === roundPlan.winnerOrganizationId)
    : undefined;
  const defuseSeconds = defuser?.player.inventory.kit ? GOLDEN_KIT_DEFUSE_SECONDS : GOLDEN_DEFUSE_SECONDS;
  const defuseStartTick = endTick - Math.round(defuseSeconds * GOLDEN_TICK_RATE);
  const utility = scheduleUtility(
    strategy,
    runtime,
    styleForOrganization(plan, roundPlan.ctOrganizationId),
    rng
  );
  const kills = scheduleKills(
    players,
    roundPlan.winnerOrganizationId,
    bombCarrier?.player.id,
    FREEZE_TICKS,
    endTick,
    roundPlan.number
  );
  const state: GoldenSimulationState = {
    players,
    officialWinnerOrganizationId: roundPlan.winnerOrganizationId,
    liveTimeSeconds: 0,
    ended: false,
    bomb: {
      state: 'carried',
      x: bombCarrier?.player.x ?? MIRAGE_POINTS.tSpawn.x,
      y: bombCarrier?.player.y ?? MIRAGE_POINTS.tSpawn.y
    },
    events,
    shots: [],
    groundItems
  };
  const snapshots: number[] = [];
  const grenadeSnapshots: number[] = [];

  for (let tick = 0; tick <= endTick; tick += 1) {
    state.liveTimeSeconds = Math.max(0, (tick - FREEZE_TICKS) * TICK_SECONDS);
    if (tick === FREEZE_TICKS) events.push({ tick, type: 'go' });

    for (const runtimePlayer of runtime) {
      tryMove(runtimePlayer, state, navigation, tick);
    }
    for (const scheduled of utility) emitUtility(state, scheduled, tick);
    for (const scheduled of kills) {
      if (scheduled.tick === tick) killPlayer(state, runtime, scheduled, tick);
    }

    if (bombCarrier && tick === plantStartTick && bombCarrier.player.alive) {
      bombCarrier.action = 'plant';
      bombCarrier.actionStartTick = plantStartTick;
      bombCarrier.actionEndTick = plantCompleteTick;
    }
    if (bombCarrier && tick === plantCompleteTick && bombCarrier.player.alive) {
      bombCarrier.action = null;
      bombCarrier.hasBomb = false;
      state.bomb = {
        state: 'planted',
        x: navigation.nearestFree(SITE_OFFSETS[strategy.site][0].x, SITE_OFFSETS[strategy.site][0].y).x,
        y: navigation.nearestFree(SITE_OFFSETS[strategy.site][0].x, SITE_OFFSETS[strategy.site][0].y).y
      };
      events.push({
        tick,
        type: 'plant',
        playerId: bombCarrier.player.id,
        site: strategy.site,
        x: state.bomb.x,
        y: state.bomb.y
      });
    }
    if (defuser && tick === defuseStartTick && defuser.player.alive && state.bomb.state === 'planted') {
      defuser.action = 'defuse';
      defuser.actionStartTick = defuseStartTick;
      defuser.actionEndTick = endTick;
    }
    if (tick === endTick) {
      finishAtOfficialBoundary(state, runtime, tick, endTick, winnerSide, strategy.site);
      for (const runtimePlayer of runtime) runtimePlayer.action = null;
    }
    if (tick % GOLDEN_FRAME_STRIDE_TICKS === 0 || tick === endTick) {
      recordSnapshot(snapshots, grenadeSnapshots, runtime, navigation, tick);
    }
  }

  const entry = runtime.find((candidate) => candidate.responsibility === 'ENTRY');
  const mainFollowers = runtime.filter((candidate) =>
    candidate.responsibility === 'BANGER' || candidate.responsibility === 'TRADER');
  const lurker = runtime.find((candidate) => candidate.responsibility === 'LURK');
  const equippedAwperIds = new Set(startState
    .filter((state) =>
      plan.players.find((player) => player.id === state.playerId)?.role === 'awper'
      && state.inventory.primary === 'awp')
    .map((state) => state.playerId));
  const aliveAwperFrames = snapshots.reduce((count, _value, index) => {
    if (index % SNAPSHOT_FLOATS_PER_PLAYER !== 4) return count;
    const playerIndex = Math.floor(index / SNAPSHOT_FLOATS_PER_PLAYER) % players.length;
    return equippedAwperIds.has(players[playerIndex]?.id ?? '') && (snapshots[index] & 1) === 1 ? count + 1 : count;
  }, 0);
  const awpFrames = snapshots.reduce((count, value, index) => {
    if (index % SNAPSHOT_FLOATS_PER_PLAYER !== 5) return count;
    const playerIndex = Math.floor(index / SNAPSHOT_FLOATS_PER_PLAYER) % players.length;
    const flags = snapshots[index - 1] | 0;
    return equippedAwperIds.has(players[playerIndex]?.id ?? '')
      && (flags & 1) === 1
      && (value | 0) === weaponIndex('awp')
      ? count + 1
      : count;
  }, 0);
  const entryFirst = entry !== undefined
    && mainFollowers.every((follower) => entry.startTick < follower.startTick);
  const lurkerSeparateUntilMs = lurker
    ? Math.max(0, (lurker.startTick - FREEZE_TICKS) * 1_000 / GOLDEN_TICK_RATE)
    : 0;
  const planted = events.some((event) => event.type === 'plant');
  const exploded = events.some((event) => event.type === 'explode');
  settleGoldenRoundEconomy(players, {
    winnerSide,
    reason: exploded ? 'explosion' : winnerSide === 'CT' && planted ? 'defuse' : 'elimination',
    planted
  });

  return {
    number: roundPlan.number,
    tickRate: GOLDEN_TICK_RATE,
    frameStrideTicks: GOLDEN_FRAME_STRIDE_TICKS,
    playerIds: players.map((player) => player.id),
    sides: players.map((player) => player.side),
    frames: snapshots.length / (players.length * SNAPSHOT_FLOATS_PER_PLAYER),
    snapshots: Float32Array.from(snapshots),
    grenadeSnapshots: Uint8Array.from(grenadeSnapshots),
    shots: Float32Array.from(state.shots),
    events: [...events].sort((left, right) => left.tick - right.tick || left.type.localeCompare(right.type)),
    winnerOrganizationId: roundPlan.winnerOrganizationId,
    durationMs: endTick / GOLDEN_TICK_RATE * 1_000,
    roleMetrics: {
      entryFirstChokeCrossing: entryFirst,
      lurkerSeparateUntilMs,
      awperAwpShare: aliveAwperFrames > 0 ? awpFrames / aliveAwperFrames : 0
    },
    startState,
    strategy: strategy.kind,
    ctFormation: formation
  };
}

export function simulateGoldenMirage(plan: ReplayPlanV1): GoldenSimulatedMatchReplayV1 {
  if (plan.mapId !== 'mirage') {
    throw new Error(`Golden simulator only supports Mirage, received ${plan.mapId}`);
  }
  const navigation = createMirageNavigation();
  const players = createEconomyPlayers(plan);
  const groundItems: GoldenGroundItem[] = [];
  const rounds = plan.rounds.map((roundPlan) => simulateGoldenMirageRound({
    plan,
    roundPlan,
    players,
    navigation,
    groundItems
  }));
  const blockedPlayerSnapshots = rounds.reduce(
    (sum, round) => sum + countBlockedSnapshots(round, navigation),
    0
  );
  const mismatchedRoundWinners = rounds
    .filter((round, index) => round.winnerOrganizationId !== plan.rounds[index]?.winnerOrganizationId)
    .map((round) => round.number);

  return {
    version: 1,
    planId: plan.id,
    mapId: 'mirage',
    rounds,
    validation: {
      blockedPlayerSnapshots,
      mismatchedRoundWinners
    }
  };
}

export const GOLDEN_SHOT_FLOATS = SHOT_FLOATS;
