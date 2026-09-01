import type { ReplaySide } from '../types';
import type {
  GoldenGrenade,
  GoldenGroundItem,
  GoldenPlayerState,
  GoldenPoint,
  GoldenWeapon
} from './types';

export type GoldenBuyPlan = 'pistol' | 'eco' | 'force' | 'full';

export interface GoldenBuyContext {
  side: ReplaySide;
  plan: GoldenBuyPlan;
  pistolRound: boolean;
}

export interface GoldenPickup {
  playerId: string;
  itemId: string;
  kind: GoldenGroundItem['kind'];
}

export interface GoldenDelivery {
  fromPlayerId: string;
  toPlayerId: string;
  weapon: GoldenWeapon;
}

export interface GoldenBuySummary {
  plan: GoldenBuyPlan;
  deliveries: GoldenDelivery[];
  equipmentValue: number;
}

export interface GoldenRoundEconomyResult {
  winnerSide: ReplaySide;
  reason: 'elimination' | 'time' | 'defuse' | 'explosion';
  planted: boolean;
}

export const GOLDEN_PICKUP_RADIUS = 20;
export const GOLDEN_MAX_MONEY = 16_000;

export const GOLDEN_WEAPON_PRICE: Record<GoldenWeapon, number> = {
  knife: 0,
  glock: 0,
  usp: 0,
  p2000: 0,
  duals: 300,
  p250: 300,
  deagle: 700,
  mp9: 1_250,
  mac10: 1_050,
  ump: 1_200,
  nova: 1_050,
  galil: 1_800,
  famas: 2_050,
  ak47: 2_700,
  m4a1: 3_100,
  awp: 4_750
};

export const GOLDEN_WEAPON_VALUE: Record<GoldenWeapon, number> = {
  knife: 0,
  glock: 1,
  usp: 1,
  p2000: 1,
  duals: 2,
  p250: 2,
  deagle: 4,
  mp9: 5,
  mac10: 5,
  ump: 5,
  nova: 5,
  galil: 6,
  famas: 6,
  ak47: 8,
  m4a1: 8,
  awp: 10
};

const DEFAULT_SIDEARM = new Set<GoldenWeapon>(['knife', 'glock', 'usp', 'p2000']);
const GRENADE_CAP: Record<GoldenGrenade, number> = {
  he: 1,
  flash: 2,
  smoke: 1,
  molotov: 1
};
const GRENADE_PRICE: Record<GoldenGrenade, Record<ReplaySide, number>> = {
  he: { T: 300, CT: 300 },
  flash: { T: 200, CT: 200 },
  smoke: { T: 300, CT: 300 },
  molotov: { T: 400, CT: 600 }
};

const distance = (left: GoldenPoint, right: GoldenPoint) =>
  Math.hypot(left.x - right.x, left.y - right.y);

const preferredRifle = (side: ReplaySide): GoldenWeapon => side === 'T' ? 'ak47' : 'm4a1';

export function shouldPickupWeapon(
  player: GoldenPlayerState,
  weapon: GoldenWeapon,
  team: GoldenPlayerState[]
) {
  if (weapon === 'awp') {
    if (player.selectedRole === 'awper') return player.inventory.primary !== 'awp';
    return team.some((mate) =>
      mate.organizationId === player.organizationId
      && mate.selectedRole === 'awper'
      && mate.inventory.primary !== 'awp');
  }
  if (player.selectedRole === 'awper' && player.inventory.primary === 'awp') return false;
  return GOLDEN_WEAPON_VALUE[weapon] > GOLDEN_WEAPON_VALUE[player.inventory.primary];
}

export function dropGoldenInventory(player: GoldenPlayerState, deathPoint: GoldenPoint) {
  const items: GoldenGroundItem[] = [];
  const primary = player.inventory.primary;
  if (!DEFAULT_SIDEARM.has(primary)) {
    items.push({
      id: `${player.id}:weapon:${primary}`,
      kind: 'weapon',
      weapon: primary,
      x: deathPoint.x,
      y: deathPoint.y,
      sourcePlayerId: player.id,
      ...(primary === 'awp' ? { reservedForRole: 'awper' as const } : {})
    });
  }
  for (const grenade of ['he', 'flash', 'smoke', 'molotov'] as const) {
    for (let index = 0; index < player.inventory.grenades[grenade]; index += 1) {
      items.push({
        id: `${player.id}:grenade:${grenade}:${index}`,
        kind: 'grenade',
        grenade,
        x: deathPoint.x,
        y: deathPoint.y,
        sourcePlayerId: player.id
      });
    }
    player.inventory.grenades[grenade] = 0;
  }
  player.inventory.primary = player.inventory.secondary;
  return items;
}

export function collectGoldenGroundItems(
  player: GoldenPlayerState,
  team: GoldenPlayerState[],
  items: GoldenGroundItem[]
) {
  const pickups: GoldenPickup[] = [];
  const droppedWeapons: GoldenGroundItem[] = [];
  const candidates = items.filter((item) => distance(player, item) <= GOLDEN_PICKUP_RADIUS);

  for (const item of candidates) {
    if (item.kind === 'weapon' && item.weapon) {
      if (!shouldPickupWeapon(player, item.weapon, team)) continue;
      const previous = player.inventory.primary;
      player.inventory.primary = item.weapon;
      if (!DEFAULT_SIDEARM.has(previous)) {
        droppedWeapons.push({
          id: `${player.id}:swap:${previous}:${item.id}`,
          kind: 'weapon',
          weapon: previous,
          x: player.x,
          y: player.y,
          sourcePlayerId: player.id
        });
      }
    } else if (item.kind === 'grenade' && item.grenade) {
      if (player.inventory.grenades[item.grenade] >= GRENADE_CAP[item.grenade]) continue;
      player.inventory.grenades[item.grenade] += 1;
    } else {
      continue;
    }

    const itemIndex = items.findIndex((candidate) => candidate.id === item.id);
    if (itemIndex >= 0) items.splice(itemIndex, 1);
    pickups.push({ playerId: player.id, itemId: item.id, kind: item.kind });
  }

  items.push(...droppedWeapons);
  return pickups;
}

export function deliverSavedWeapons(players: GoldenPlayerState[]) {
  const deliveries: GoldenDelivery[] = [];
  const organizations = [...new Set(players.map((player) => player.organizationId))];
  for (const organizationId of organizations) {
    const team = players.filter((player) => player.organizationId === organizationId && player.alive);
    const awper = team.find((player) => player.selectedRole === 'awper');
    if (!awper || awper.inventory.primary === 'awp') continue;
    const carrier = team.find((player) =>
      player.id !== awper.id
      && player.inventory.primary === 'awp');
    if (!carrier) continue;
    const awperPrevious = awper.inventory.primary;
    awper.inventory.primary = 'awp';
    carrier.inventory.primary = awperPrevious;
    deliveries.push({ fromPlayerId: carrier.id, toPlayerId: awper.id, weapon: 'awp' });
  }
  return deliveries;
}

function buyWeapon(player: GoldenPlayerState, weapon: GoldenWeapon) {
  const price = GOLDEN_WEAPON_PRICE[weapon];
  if (player.money < price) return false;
  player.money -= price;
  player.inventory.primary = weapon;
  return true;
}

function buyGoldenGrenade(player: GoldenPlayerState, grenade: GoldenGrenade) {
  if (player.inventory.grenades[grenade] >= GRENADE_CAP[grenade]) return false;
  const price = GRENADE_PRICE[grenade][player.side];
  if (player.money < price) return false;
  player.money -= price;
  player.inventory.grenades[grenade] += 1;
  return true;
}

export function consumeGoldenGrenade(player: GoldenPlayerState, grenade: GoldenGrenade) {
  if (player.inventory.grenades[grenade] <= 0) return false;
  player.inventory.grenades[grenade] -= 1;
  return true;
}

function buyRoundUtility(player: GoldenPlayerState, plan: GoldenBuyPlan) {
  if (plan === 'eco') return;
  if (player.selectedRole === 'igl') return;
  if (player.selectedRole === 'awper' && player.inventory.primary !== 'awp') return;
  const orderedUtility: GoldenGrenade[] = player.style === 'aggressive'
    ? ['flash', 'flash', 'smoke', 'he', 'molotov']
    : player.style === 'tactical'
      ? ['smoke', 'flash', 'flash', 'molotov', 'he']
      : ['smoke', 'flash', 'he', 'flash', 'molotov'];
  const limit = plan === 'pistol' ? 3 : plan === 'force' ? 3 : orderedUtility.length;
  for (const grenade of orderedUtility.slice(0, limit)) buyGoldenGrenade(player, grenade);
}

function donateWeapon(
  donor: GoldenPlayerState,
  recipient: GoldenPlayerState,
  weapon: GoldenWeapon,
  deliveries: GoldenDelivery[]
) {
  const donorPrevious = donor.inventory.primary;
  if (!buyWeapon(donor, weapon)) return false;
  recipient.inventory.primary = weapon;
  donor.inventory.primary = donorPrevious;
  deliveries.push({ fromPlayerId: donor.id, toPlayerId: recipient.id, weapon });
  return true;
}

function equipmentValue(player: GoldenPlayerState) {
  let value = GOLDEN_WEAPON_PRICE[player.inventory.primary];
  if (player.inventory.armor > 0) value += 650;
  if (player.inventory.helmet) value += 350;
  if (player.inventory.kit) value += 400;
  for (const grenade of ['he', 'flash', 'smoke', 'molotov'] as const) {
    value += player.inventory.grenades[grenade] * GRENADE_PRICE[grenade][player.side];
  }
  return value;
}

export function prepareGoldenRoundEconomy(
  players: GoldenPlayerState[],
  context: GoldenBuyContext,
  rng: () => number
): GoldenBuySummary {
  const team = players.filter((player) => player.side === context.side && player.alive);
  const deliveries = deliverSavedWeapons(team);
  const pistolRound = context.pistolRound || context.plan === 'pistol';

  if (!pistolRound && context.plan !== 'eco') {
    const igl = team.find((player) => player.selectedRole === 'igl');
    const awper = team.find((player) =>
      player.selectedRole === 'awper'
      && player.inventory.primary !== 'awp');
    if (igl && awper && igl.money >= GOLDEN_WEAPON_PRICE.awp) {
      donateWeapon(igl, awper, 'awp', deliveries);
    }
    const entry = team.find((player) =>
      player.selectedRole === 'entry'
      && GOLDEN_WEAPON_VALUE[player.inventory.primary] < GOLDEN_WEAPON_VALUE.galil);
    if (igl && entry) donateWeapon(igl, entry, preferredRifle(context.side), deliveries);
  }

  for (const player of team) {
    if (pistolRound) {
      buyRoundUtility(player, 'pistol');
      continue;
    }
    if (context.plan === 'eco') {
      if (player.money > 4_200 && rng() < 0.5) buyWeapon(player, 'p250');
      continue;
    }
    if (GOLDEN_WEAPON_VALUE[player.inventory.primary] < GOLDEN_WEAPON_VALUE.galil) {
      if (player.selectedRole === 'awper' && player.money >= GOLDEN_WEAPON_PRICE.awp + 800) {
        buyWeapon(player, 'awp');
      } else {
        const rifle = preferredRifle(context.side);
        const cheap = context.side === 'T' ? 'galil' : 'famas';
        if (!buyWeapon(player, rifle)) buyWeapon(player, cheap);
      }
    }
    const donatedWeapon = deliveries.some((delivery) => delivery.fromPlayerId === player.id);
    if (!donatedWeapon) buyRoundUtility(player, context.plan);
  }

  return {
    plan: pistolRound ? 'pistol' : context.plan,
    deliveries,
    equipmentValue: team.reduce((total, player) => total + equipmentValue(player), 0)
  };
}

export function settleGoldenRoundEconomy(
  players: GoldenPlayerState[],
  result: GoldenRoundEconomyResult
) {
  const winReward = result.reason === 'defuse' || result.reason === 'explosion' ? 3_500 : 3_250;
  for (const player of players) {
    const reward = player.side === result.winnerSide ? winReward : 1_400;
    const plantBonus = player.side === 'T' && result.planted && result.winnerSide === 'CT' ? 800 : 0;
    player.money = Math.min(GOLDEN_MAX_MONEY, player.money + reward + plantBonus);
  }
}
