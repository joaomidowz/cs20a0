import type { ReplayFrameV1, ReplayGrenadeFrameV1, ReplayPlayerFrameV1 } from '../types';

const round = (value: number) => Number(value.toFixed(6));

function interpolatePlayer(
  left: ReplayPlayerFrameV1,
  right: ReplayPlayerFrameV1,
  progress: number
): ReplayPlayerFrameV1 {
  return {
    ...left,
    x: round(left.x + (right.x - left.x) * progress),
    y: round(left.y + (right.y - left.y) * progress),
    level: progress < 0.5 ? left.level : right.level,
    hp: round(left.hp + (right.hp - left.hp) * progress),
    alive: progress < 1 ? left.alive : right.alive
  };
}

function interpolateGrenades(
  left: ReplayGrenadeFrameV1[],
  right: ReplayGrenadeFrameV1[],
  progress: number
) {
  const rightById = new Map(right.map((grenade) => [grenade.eventId, grenade]));
  return left.map((grenade) => {
    const next = rightById.get(grenade.eventId);
    if (!next) return grenade;
    return {
      ...grenade,
      x: round(grenade.x + (next.x - grenade.x) * progress),
      y: round(grenade.y + (next.y - grenade.y) * progress),
      level: progress < 0.5 ? grenade.level : next.level,
      progress: round(grenade.progress + (next.progress - grenade.progress) * progress)
    };
  });
}

export function interpolateReplayFrame(frames: ReplayFrameV1[], atMs: number): ReplayFrameV1 {
  if (!frames.length) throw new Error('Cannot interpolate an empty replay');
  if (atMs <= frames[0].atMs) return frames[0];
  const finalFrame = frames[frames.length - 1];
  if (atMs >= finalFrame.atMs) return finalFrame;

  let low = 0;
  let high = frames.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].atMs <= atMs) low = middle;
    else high = middle;
  }
  const left = frames[low];
  const right = frames[high];
  if (left.roundNumber !== right.roundNumber) return left;
  const progress = (atMs - left.atMs) / Math.max(1, right.atMs - left.atMs);
  const rightPlayers = new Map(right.players.map((player) => [player.playerId, player]));
  return {
    ...left,
    atMs,
    players: left.players.map((player) => {
      const next = rightPlayers.get(player.playerId);
      return next ? interpolatePlayer(player, next, progress) : player;
    }),
    grenades: interpolateGrenades(left.grenades, right.grenades, progress),
    bomb: progress < 1 ? left.bomb : right.bomb
  };
}
