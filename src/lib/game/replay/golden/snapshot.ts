import type {
  GoldenPlayerSnapshot,
  GoldenRoundReplayV1,
  GoldenWeapon
} from './types';

const SNAPSHOT_FLOATS_PER_PLAYER = 7;
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function shortestAngleDifference(from: number, to: number): number {
  let difference = to - from;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

export function readGoldenPlayerSnapshot(
  round: GoldenRoundReplayV1,
  frame: number,
  playerIndex: number
): GoldenPlayerSnapshot {
  const playerCount = round.playerIds.length;
  if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= playerCount) {
    throw new RangeError(`Golden player index ${playerIndex} is outside the round roster`);
  }
  if (round.frames < 1) throw new RangeError('Golden round has no replay frames');

  const firstFrame = clamp(Math.floor(frame), 0, round.frames - 1);
  const secondFrame = clamp(firstFrame + 1, 0, round.frames - 1);
  const interpolation = clamp(frame - firstFrame, 0, 1);
  const firstOffset = (firstFrame * playerCount + playerIndex) * SNAPSHOT_FLOATS_PER_PLAYER;
  const secondOffset = (secondFrame * playerCount + playerIndex) * SNAPSHOT_FLOATS_PER_PLAYER;
  const snapshots = round.snapshots;
  const requiredLength = round.frames * playerCount * SNAPSHOT_FLOATS_PER_PLAYER;
  if (snapshots.length < requiredLength) {
    throw new RangeError(`Golden snapshot buffer has ${snapshots.length} floats, expected ${requiredLength}`);
  }

  const firstFlags = snapshots[firstOffset + 4] | 0;
  const secondFlags = snapshots[secondOffset + 4] | 0;
  const amount = (secondFlags & 1) === 1 ? interpolation : 0;
  const firstAngle = snapshots[firstOffset + 2];
  const weaponIndex = snapshots[firstOffset + 5] | 0;
  const grenadeOffset = (firstFrame * playerCount + playerIndex) * 4;
  const grenadeSnapshots = round.grenadeSnapshots;

  return {
    x: lerp(snapshots[firstOffset], snapshots[secondOffset], amount),
    y: lerp(snapshots[firstOffset + 1], snapshots[secondOffset + 1], amount),
    angle: firstAngle + shortestAngleDifference(firstAngle, snapshots[secondOffset + 2]) * amount,
    hp: lerp(snapshots[firstOffset + 3], snapshots[secondOffset + 3], amount),
    alive: (firstFlags & 1) === 1,
    planting: (firstFlags & 2) === 2,
    defusing: (firstFlags & 4) === 4,
    blind: (firstFlags & 8) === 8,
    hasBomb: (firstFlags & 16) === 16,
    firing: (firstFlags & 32) === 32,
    weapon: GOLDEN_WEAPONS[weaponIndex] ?? 'knife',
    grenades: {
      he: grenadeSnapshots?.[grenadeOffset] ?? 0,
      flash: grenadeSnapshots?.[grenadeOffset + 1] ?? 0,
      smoke: grenadeSnapshots?.[grenadeOffset + 2] ?? 0,
      molotov: grenadeSnapshots?.[grenadeOffset + 3] ?? 0
    },
    actionProgress: lerp(snapshots[firstOffset + 6], snapshots[secondOffset + 6], amount)
  };
}
