import { readGoldenPlayerSnapshot } from './snapshot';
import type {
  GoldenGrenade,
  GoldenReplayEvent,
  GoldenRoundReplayV1
} from './types';

export const GOLDEN_RENDER_PALETTE = {
  background: '#05070b',
  floor: '#1b2634',
  floorHighlight: '#212e3d',
  edge: '#3f5468',
  ct: '#5aa9e6',
  t: '#e8b44f',
  ctDark: '#1d4a70',
  tDark: '#7a5c1e',
  smoke: '#aab4bd',
  fire: '#ff7a2f',
  flash: '#ffffff',
  bomb: '#ff8a3d',
  success: '#3ddc84',
  danger: '#e5484d'
} as const;

export const GOLDEN_MIRAGE_RADAR_URL = '/replay/maps/mirage.webp';
export const GOLDEN_MIRAGE_RADAR_FILTER = 'brightness(1.42) contrast(1.06) saturate(0.92)';

let goldenMirageRadarPromise: Promise<HTMLImageElement> | null = null;

export function loadGoldenMirageRadar(): Promise<HTMLImageElement> {
  if (goldenMirageRadarPromise) return goldenMirageRadarPromise;
  goldenMirageRadarPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      goldenMirageRadarPromise = null;
      reject(new Error(`Unable to load Mirage radar from ${GOLDEN_MIRAGE_RADAR_URL}`));
    };
    image.src = GOLDEN_MIRAGE_RADAR_URL;
    if (typeof image.decode === 'function') image.decode().then(() => resolve(image)).catch(() => undefined);
  });
  return goldenMirageRadarPromise;
}

const GOLDEN_WORLD_SIZE = 1024;
const BOMB_TIME_SECONDS = 40;
const SMOKE_RADIUS = 52;
const SMOKE_LIFE_SECONDS = 15.5;
const SMOKE_GROW_SECONDS = 1.1;
const FIRE_RADIUS = 41;
const FIRE_LIFE_SECONDS = 7.2;
const HE_RADIUS = 104;
const FONT_STACK = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const PLAYER_FONT = `600 9.5px ${FONT_STACK}`;

const GRENADE_COLOR: Record<GoldenGrenade, string> = {
  smoke: '#c9d2da',
  flash: '#e9e07a',
  he: '#8fbf6a',
  molotov: '#e07a34'
};

export interface GoldenMirageFrameOptions {
  size: number;
  dpr?: number;
  playerNames?: readonly string[];
  highlightedPlayerIndex?: number;
  clear?: boolean;
}

interface GoldenBombVisualState {
  state: 'none' | 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded';
  x: number;
  y: number;
  timer: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function eventsOfType(
  round: GoldenRoundReplayV1,
  type: GoldenReplayEvent['type']
): GoldenReplayEvent[] {
  return round.events.filter((event) => event.type === type);
}

function eventAgeSeconds(round: GoldenRoundReplayV1, event: GoldenReplayEvent, tick: number): number {
  return (tick - event.tick) / round.tickRate;
}

function getPlayerSnapshotAtTick(
  round: GoldenRoundReplayV1,
  tick: number,
  playerId: string | undefined
) {
  if (!playerId) return null;
  const playerIndex = round.playerIds.indexOf(playerId);
  if (playerIndex < 0) return null;
  return readGoldenPlayerSnapshot(round, tick / round.frameStrideTicks, playerIndex);
}

function shotRange(round: GoldenRoundReplayV1, firstTick: number, lastTick: number): number[] {
  const shots = round.shots;
  const shotCount = Math.floor(shots.length / 6);
  let low = 0;
  let high = shotCount;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (shots[middle * 6] < firstTick) low = middle + 1;
    else high = middle;
  }
  const indices: number[] = [];
  for (let index = low; index < shotCount; index += 1) {
    if (shots[index * 6] > lastTick) break;
    indices.push(index);
  }
  return indices;
}

function readBombState(
  round: GoldenRoundReplayV1,
  frame: number,
  currentTick: number
): GoldenBombVisualState {
  const plant = eventsOfType(round, 'plant')
    .filter((event) => event.tick <= currentTick)
    .at(-1);
  if (plant) {
    const elapsedSeconds = eventAgeSeconds(round, plant, currentTick);
    const defused = eventsOfType(round, 'defuse')
      .find((event) => event.tick >= plant.tick && event.tick <= currentTick);
    if (defused) {
      return {
        state: 'defused',
        x: plant.x ?? 0,
        y: plant.y ?? 0,
        timer: Math.max(0, BOMB_TIME_SECONDS - elapsedSeconds)
      };
    }
    const exploded = eventsOfType(round, 'explode')
      .find((event) => event.tick >= plant.tick && event.tick <= currentTick);
    if (exploded) {
      return { state: 'exploded', x: plant.x ?? 0, y: plant.y ?? 0, timer: 0 };
    }
    return {
      state: 'planted',
      x: plant.x ?? 0,
      y: plant.y ?? 0,
      timer: Math.max(0, BOMB_TIME_SECONDS - elapsedSeconds)
    };
  }

  for (let playerIndex = 0; playerIndex < round.playerIds.length; playerIndex += 1) {
    const player = readGoldenPlayerSnapshot(round, frame, playerIndex);
    if (player.alive && player.hasBomb) {
      return { state: 'carried', x: player.x, y: player.y, timer: 0 };
    }
  }

  let lastDrop: GoldenReplayEvent | null = null;
  for (const event of round.events) {
    if (event.tick > currentTick) continue;
    if (event.type === 'bomb-drop') lastDrop = event;
    if (event.type === 'bomb-pickup' && lastDrop && event.tick > lastDrop.tick) lastDrop = null;
  }
  if (lastDrop) {
    return { state: 'dropped', x: lastDrop.x ?? 0, y: lastDrop.y ?? 0, timer: 0 };
  }
  return { state: 'none', x: 0, y: 0, timer: 0 };
}

export function drawGoldenMirageMap(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  size: number,
  dpr: number
): void {
  const renderSize = Math.max(1, size);
  const pixelRatio = Math.max(1, dpr);
  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.fillStyle = GOLDEN_RENDER_PALETTE.background;
  context.fillRect(0, 0, renderSize, renderSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.filter = GOLDEN_MIRAGE_RADAR_FILTER;
  context.drawImage(image, 0, 0, renderSize, renderSize);
  context.filter = 'none';
  context.fillStyle = 'rgba(8,14,22,.10)';
  context.fillRect(0, 0, renderSize, renderSize);
  context.restore();
}

function drawFireEffects(
  context: CanvasRenderingContext2D,
  round: GoldenRoundReplayV1,
  currentTick: number,
  worldScale: number
): void {
  for (const event of eventsOfType(round, 'fire')) {
    const age = eventAgeSeconds(round, event, currentTick);
    if (age < 0 || age > FIRE_LIFE_SECONDS) continue;
    const alpha = age > FIRE_LIFE_SECONDS - 1.2
      ? (FIRE_LIFE_SECONDS - age) / 1.2
      : Math.min(1, age / 0.35);
    const radius = FIRE_RADIUS * worldScale;
    const centerX = (event.x ?? 0) * worldScale;
    const centerY = (event.y ?? 0) * worldScale;
    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2 + Math.sin(currentTick * 0.06 + index) * 0.6;
      const flameRadius = radius * (0.3 + 0.3 * Math.abs(Math.sin(currentTick * 0.05 + index * 1.7)));
      const x = centerX + Math.cos(angle) * radius * 0.42;
      const y = centerY + Math.sin(angle) * radius * 0.42;
      const gradient = context.createRadialGradient(x, y, 0, x, y, flameRadius);
      gradient.addColorStop(0, `rgba(255,190,90,${0.42 * alpha})`);
      gradient.addColorStop(0.55, `rgba(255,110,35,${0.3 * alpha})`);
      gradient.addColorStop(1, 'rgba(200,60,10,0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, flameRadius, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = `rgba(255,130,50,${0.35 * alpha})`;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
  }
}

function drawSmokeEffects(
  context: CanvasRenderingContext2D,
  round: GoldenRoundReplayV1,
  currentTick: number,
  worldScale: number
): void {
  for (const event of eventsOfType(round, 'smoke')) {
    const age = eventAgeSeconds(round, event, currentTick);
    if (age < 0 || age > SMOKE_LIFE_SECONDS) continue;
    const grow = Math.min(1, age / SMOKE_GROW_SECONDS);
    const fade = age > SMOKE_LIFE_SECONDS - 2.5
      ? (SMOKE_LIFE_SECONDS - age) / 2.5
      : 1;
    const radius = SMOKE_RADIUS * worldScale * grow;
    const x = (event.x ?? 0) * worldScale;
    const y = (event.y ?? 0) * worldScale;
    const gradient = context.createRadialGradient(x, y, radius * 0.15, x, y, radius);
    gradient.addColorStop(0, `rgba(196,205,213,${0.6 * fade})`);
    gradient.addColorStop(0.72, `rgba(150,161,172,${0.48 * fade})`);
    gradient.addColorStop(1, 'rgba(120,131,142,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

function drawGrenadeTrajectories(
  context: CanvasRenderingContext2D,
  round: GoldenRoundReplayV1,
  currentTick: number,
  worldScale: number
): void {
  for (const event of eventsOfType(round, 'grenade')) {
    const grenade = event.grenade;
    if (!grenade) continue;
    const start = getPlayerSnapshotAtTick(round, event.tick, event.playerId);
    if (!start) continue;
    const targetX = event.x ?? start.x;
    const targetY = event.y ?? start.y;
    const distance = Math.hypot(targetX - start.x, targetY - start.y);
    const flightSeconds = clamp(distance / 430, 0.25, 2.4);
    const age = eventAgeSeconds(round, event, currentTick);
    if (age < 0 || age > flightSeconds + 2.4) continue;
    const progress = clamp(age / flightSeconds, 0, 1);
    const tail = age > flightSeconds ? clamp(1 - (age - flightSeconds) / 2.4, 0, 1) : 1;
    const dx = targetX - start.x;
    const dy = targetY - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const playerIndex = Math.max(0, round.playerIds.indexOf(event.playerId ?? ''));
    const arc = clamp(distance * 0.13, 22, 74) * ((event.tick + playerIndex) % 2 === 0 ? 1 : -1);
    const controlX = (start.x + targetX) / 2 - (dy / length) * arc;
    const controlY = (start.y + targetY) / 2 + (dx / length) * arc;
    const inverse = 1 - progress;
    const x = (inverse * inverse * start.x + 2 * inverse * progress * controlX + progress * progress * targetX) * worldScale;
    const y = (inverse * inverse * start.y + 2 * inverse * progress * controlY + progress * progress * targetY) * worldScale;
    const color = GRENADE_COLOR[grenade];

    context.save();
    context.globalAlpha = 0.82 * tail;
    context.strokeStyle = color;
    context.lineWidth = 1.25;
    context.setLineDash([5, 4]);
    context.beginPath();
    context.moveTo(start.x * worldScale, start.y * worldScale);
    context.quadraticCurveTo(
      controlX * worldScale,
      controlY * worldScale,
      targetX * worldScale,
      targetY * worldScale
    );
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = tail;
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(targetX * worldScale, targetY * worldScale, 5, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, 3.1, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function drawBomb(
  context: CanvasRenderingContext2D,
  bomb: GoldenBombVisualState,
  currentTick: number,
  worldScale: number
): void {
  if (bomb.state === 'planted' || bomb.state === 'defused' || bomb.state === 'exploded') {
    const x = bomb.x * worldScale;
    const y = bomb.y * worldScale;
    const blink = bomb.state === 'planted'
      ? (Math.sin(currentTick * (0.28 + (BOMB_TIME_SECONDS - bomb.timer) * 0.02)) > 0 ? 1 : 0.25)
      : 1;
    const color = bomb.state === 'defused'
      ? GOLDEN_RENDER_PALETTE.success
      : bomb.state === 'exploded'
        ? '#ff4a2f'
        : GOLDEN_RENDER_PALETTE.bomb;
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = color;
    context.globalAlpha = blink;
    context.fillRect(-4.2, -4.2, 8.4, 8.4);
    context.restore();
    if (bomb.state === 'planted') {
      const pulseRadius = (1 - bomb.timer / BOMB_TIME_SECONDS) * 26 + 9;
      context.strokeStyle = `${color}88`;
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(x, y, pulseRadius, 0, Math.PI * 2);
      context.stroke();
    }
  } else if (bomb.state === 'dropped') {
    const x = bomb.x * worldScale;
    const y = bomb.y * worldScale;
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = '#a86a30';
    context.fillRect(-3.4, -3.4, 6.8, 6.8);
    context.restore();
    context.font = `800 8px ${FONT_STACK}`;
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.fillStyle = 'rgba(5,8,12,.84)';
    context.fillRect(x - 29, y - 20, 58, 11);
    context.fillStyle = GOLDEN_RENDER_PALETTE.bomb;
    context.fillText('C4 NO CHÃO', x, y - 10);
  }
}

function drawShots(
  context: CanvasRenderingContext2D,
  round: GoldenRoundReplayV1,
  currentTick: number,
  worldScale: number
): void {
  for (const index of shotRange(round, currentTick - 3.2, currentTick)) {
    const offset = index * 6;
    const age = (currentTick - round.shots[offset]) / 3.2;
    const flags = round.shots[offset + 5] | 0;
    const isCounterTerrorist = (flags & 1) === 1;
    const hit = (flags & 2) === 2;
    context.strokeStyle = `${isCounterTerrorist ? 'rgba(120,190,245,' : 'rgba(240,195,110,'}${(
      0.55 * (1 - age)
    ).toFixed(3)})`;
    context.lineWidth = hit ? 1.5 : 1;
    context.beginPath();
    context.moveTo(round.shots[offset + 1] * worldScale, round.shots[offset + 2] * worldScale);
    context.lineTo(round.shots[offset + 3] * worldScale, round.shots[offset + 4] * worldScale);
    context.stroke();
  }
}

function drawDeathMarkers(
  context: CanvasRenderingContext2D,
  round: GoldenRoundReplayV1,
  currentTick: number,
  worldScale: number
): void {
  for (const event of eventsOfType(round, 'kill')) {
    const age = eventAgeSeconds(round, event, currentTick);
    if (age < 0 || age > 11) continue;
    const alpha = clamp(1 - age / 11, 0, 1) * 0.75;
    const targetIndex = event.targetPlayerId ? round.playerIds.indexOf(event.targetPlayerId) : -1;
    const side = targetIndex >= 0 ? round.sides[targetIndex] : 'T';
    const x = (event.x ?? 0) * worldScale;
    const y = (event.y ?? 0) * worldScale;
    context.strokeStyle = `${side === 'CT' ? 'rgba(90,169,230,' : 'rgba(232,180,79,'}${alpha.toFixed(3)})`;
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(x - 4, y - 4);
    context.lineTo(x + 4, y + 4);
    context.moveTo(x + 4, y - 4);
    context.lineTo(x - 4, y + 4);
    context.stroke();
  }
}

function drawPlayers(
  context: CanvasRenderingContext2D,
  round: GoldenRoundReplayV1,
  frame: number,
  worldScale: number,
  options: GoldenMirageFrameOptions
): void {
  for (let playerIndex = 0; playerIndex < round.playerIds.length; playerIndex += 1) {
    const player = readGoldenPlayerSnapshot(round, frame, playerIndex);
    if (!player.alive) continue;
    const isCounterTerrorist = round.sides[playerIndex] === 'CT';
    const x = player.x * worldScale;
    const y = player.y * worldScale;
    const color = isCounterTerrorist ? GOLDEN_RENDER_PALETTE.ct : GOLDEN_RENDER_PALETTE.t;

    const visionRadius = 42;
    const vision = context.createRadialGradient(x, y, 3, x, y, visionRadius);
    vision.addColorStop(0, `${isCounterTerrorist ? 'rgba(90,169,230,' : 'rgba(232,180,79,'}0.26)`);
    vision.addColorStop(1, `${isCounterTerrorist ? 'rgba(90,169,230,' : 'rgba(232,180,79,'}0)`);
    context.fillStyle = vision;
    context.beginPath();
    context.moveTo(x, y);
    context.arc(x, y, visionRadius, player.angle - 0.44, player.angle + 0.44);
    context.closePath();
    context.fill();

    if (options.highlightedPlayerIndex === playerIndex) {
      context.beginPath();
      context.arc(x, y, 15, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(255,255,255,.85)';
      context.lineWidth = 1.6;
      context.stroke();
      context.setLineDash([]);
    }

    context.beginPath();
    context.arc(x, y, 6.4, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.lineWidth = 1.4;
    context.strokeStyle = '#06090d';
    context.stroke();

    if (player.hp < 100) {
      context.beginPath();
      context.arc(x, y, 8.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (player.hp / 100));
      context.strokeStyle = player.hp > 60
        ? GOLDEN_RENDER_PALETTE.success
        : player.hp > 30
          ? GOLDEN_RENDER_PALETTE.t
          : GOLDEN_RENDER_PALETTE.danger;
      context.lineWidth = 1.8;
      context.stroke();
    }
    if (player.blind) {
      context.beginPath();
      context.arc(x, y, 10.5, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(255,255,255,.75)';
      context.lineWidth = 1.6;
      context.stroke();
    }
    if (player.firing) {
      context.strokeStyle = '#fff6d0';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + Math.cos(player.angle) * 7, y + Math.sin(player.angle) * 7);
      context.lineTo(x + Math.cos(player.angle) * 13, y + Math.sin(player.angle) * 13);
      context.stroke();
    }
    if (player.hasBomb) {
      context.fillStyle = GOLDEN_RENDER_PALETTE.bomb;
      context.beginPath();
      context.arc(x + 7, y - 7, 2.6, 0, Math.PI * 2);
      context.fill();
    }
    if (player.planting || player.defusing) {
      context.strokeStyle = 'rgba(5,8,12,.72)';
      context.lineWidth = 3.6;
      context.beginPath();
      context.arc(x, y, 12.5, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = player.planting
        ? GOLDEN_RENDER_PALETTE.bomb
        : GOLDEN_RENDER_PALETTE.success;
      context.lineWidth = 2.4;
      context.beginPath();
      context.arc(
        x,
        y,
        12.5,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * clamp(player.actionProgress, 0.03, 1)
      );
      context.stroke();
    }

    const name = options.playerNames?.[playerIndex] ?? round.playerIds[playerIndex];
    context.font = PLAYER_FONT;
    context.textAlign = 'center';
    context.textBaseline = 'top';
    const textWidth = context.measureText(name).width;
    context.fillStyle = 'rgba(6,9,13,.75)';
    context.fillRect(x - textWidth / 2 - 2.5, y + 9, textWidth + 5, 11);
    context.fillStyle = isCounterTerrorist ? '#bcdcf5' : '#f2d69a';
    context.fillText(name, x, y + 10);
  }
}

function drawDetonations(
  context: CanvasRenderingContext2D,
  round: GoldenRoundReplayV1,
  currentTick: number,
  worldScale: number
): void {
  for (const event of eventsOfType(round, 'flash')) {
    const age = eventAgeSeconds(round, event, currentTick);
    if (age < 0 || age > 0.55) continue;
    const alpha = 1 - age / 0.55;
    const radius = (20 + age * 150) * worldScale * 1.6;
    const x = (event.x ?? 0) * worldScale;
    const y = (event.y ?? 0) * worldScale;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${0.75 * alpha})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  for (const event of eventsOfType(round, 'he')) {
    const age = eventAgeSeconds(round, event, currentTick);
    if (age < 0 || age > 0.5) continue;
    const alpha = 1 - age / 0.5;
    context.strokeStyle = `rgba(255,150,60,${alpha})`;
    context.lineWidth = 2.2;
    context.beginPath();
    context.arc(
      (event.x ?? 0) * worldScale,
      (event.y ?? 0) * worldScale,
      HE_RADIUS * worldScale * (0.35 + 0.65 * (1 - alpha)),
      0,
      Math.PI * 2
    );
    context.stroke();
  }
  for (const event of eventsOfType(round, 'explode')) {
    const age = eventAgeSeconds(round, event, currentTick);
    if (age < 0 || age >= 1.4) continue;
    const alpha = 1 - age / 1.4;
    const x = (event.x ?? 0) * worldScale;
    const y = (event.y ?? 0) * worldScale;
    const radius = 300 * worldScale * (0.3 + age);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255,220,120,${0.8 * alpha})`);
    gradient.addColorStop(0.4, `rgba(255,110,30,${0.5 * alpha})`);
    gradient.addColorStop(1, 'rgba(255,60,0,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
}

export function drawGoldenMirageFrame(
  context: CanvasRenderingContext2D,
  round: GoldenRoundReplayV1,
  frame: number,
  options: GoldenMirageFrameOptions
): void {
  const size = Math.max(1, options.size);
  const pixelRatio = Math.max(1, options.dpr ?? 1);
  const worldScale = size / GOLDEN_WORLD_SIZE;
  const currentTick = frame * round.frameStrideTicks;

  context.save();
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (options.clear) context.clearRect(0, 0, size, size);
  drawFireEffects(context, round, currentTick, worldScale);
  drawSmokeEffects(context, round, currentTick, worldScale);
  drawGrenadeTrajectories(context, round, currentTick, worldScale);
  drawBomb(context, readBombState(round, frame, currentTick), currentTick, worldScale);
  drawShots(context, round, currentTick, worldScale);
  drawDeathMarkers(context, round, currentTick, worldScale);
  drawPlayers(context, round, frame, worldScale, options);
  drawDetonations(context, round, currentTick, worldScale);
  context.restore();
}
