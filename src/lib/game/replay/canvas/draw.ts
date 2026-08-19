import type { Theme } from '../../types';
import type { ReplayEventV1, ReplayFrameV1 } from '../types';
import type { RadarPlan } from '../topology/types';
import { worldToScreen, type ViewportTransform } from './transform';

interface ReplayPalette {
  background: string;
  surface: string;
  line: string;
  text: string;
  muted: string;
  accent: string;
  terrorist: string;
  counterTerrorist: string;
  danger: string;
  outline: string;
  upperFloor: string;
  lowerFloor: string;
  verticalFloor: string;
  siteA: string;
  siteB: string;
}

function palette(theme: Theme): ReplayPalette {
  return theme === 'light' ? {
    background: '#e7ecef',
    surface: '#f8fafb',
    line: '#9ba8af',
    text: '#13191d',
    muted: '#607078',
    accent: '#8bbd00',
    terrorist: '#b57b00',
    counterTerrorist: '#2f72a8',
    danger: '#c03b3b',
    outline: '#87949a',
    upperFloor: '#d4dde0',
    lowerFloor: '#b8c8ce',
    verticalFloor: '#9eb5a1',
    siteA: '#d88972',
    siteB: '#d1a55c'
  } : {
    background: '#0b0f11',
    surface: '#141a1e',
    line: '#344047',
    text: '#edf2f4',
    muted: '#849198',
    accent: '#c9ff22',
    terrorist: '#e2aa34',
    counterTerrorist: '#56a6dc',
    danger: '#ed5555',
    outline: '#030506',
    upperFloor: '#263238',
    lowerFloor: '#183039',
    verticalFloor: '#334d43',
    siteA: '#70453f',
    siteB: '#6e5935'
  };
}

function roundedRoomPath(
  context: CanvasRenderingContext2D,
  node: RadarPlan['nodes'][number],
  transform: ViewportTransform,
  expansion = 0
) {
  const center = worldToScreen(transform, node);
  if (node.shape?.length) {
    const points = node.shape.map((point) => worldToScreen(transform, point));
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
    return;
  }
  const width = node.roomWidth * transform.scale + expansion * 2;
  const height = node.roomHeight * transform.scale + expansion * 2;
  const radius = node.cornerRadius * transform.scale + expansion;
  context.beginPath();
  context.roundRect(center.x - width / 2, center.y - height / 2, width, height, radius);
}

export function configureReplayCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  devicePixelRatio: number
) {
  const dpr = Math.max(1, Math.min(2, devicePixelRatio));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return context;
}

export function drawRadarBase(
  context: CanvasRenderingContext2D,
  radar: RadarPlan,
  transform: ViewportTransform,
  theme: Theme
) {
  const colors = palette(theme);
  context.clearRect(0, 0, transform.width, transform.height);
  context.fillStyle = colors.background;
  context.fillRect(0, 0, transform.width, transform.height);

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // One dark pass first produces a continuous outer silhouette after the fills overlap it.
  for (const edge of radar.edges) {
    const [start, midpoint, end] = edge.path.map((point) => worldToScreen(transform, point));
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(midpoint.x, midpoint.y, end.x, end.y);
    context.strokeStyle = colors.outline;
    context.lineWidth = edge.corridorWidth * transform.scale + 14;
    context.stroke();
  }
  for (const node of radar.nodes) {
    roundedRoomPath(context, node, transform, 7);
    context.fillStyle = colors.outline;
    context.fill();
    if (node.shape?.length) {
      context.strokeStyle = colors.outline;
      context.lineWidth = 14;
      context.stroke();
    }
  }

  // Filled corridors carry the floor color; no graph line remains visible.
  const nodeById = new Map(radar.nodes.map((node) => [node.id, node]));
  for (const edge of radar.edges) {
    const [start, midpoint, end] = edge.path.map((point) => worldToScreen(transform, point));
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    const isLowerFloor = from?.level === -1 && to?.level === -1;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(midpoint.x, midpoint.y, end.x, end.y);
    context.strokeStyle = edge.kind === 'vertical'
      ? colors.verticalFloor
      : isLowerFloor ? colors.lowerFloor : colors.upperFloor;
    context.lineWidth = edge.corridorWidth * transform.scale;
    context.stroke();
  }

  // Rooms overlap corridor ends, creating a readable filled floor plan.
  for (const node of radar.nodes) {
    roundedRoomPath(context, node, transform);
    context.fillStyle = node.kind === 'site:A'
      ? colors.siteA
      : node.kind === 'site:B'
        ? colors.siteB
        : node.kind === 'spawn:T'
          ? colors.terrorist
          : node.kind === 'spawn:CT'
            ? colors.counterTerrorist
            : node.level < 0 ? colors.lowerFloor : colors.upperFloor;
    context.fill();
  }

  for (const node of radar.nodes) {
    const point = worldToScreen(transform, node);
    context.fillStyle = colors.text;
    context.strokeStyle = colors.outline;
    context.lineWidth = 3;
    context.font = '700 9px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const label = node.id.replaceAll('_', ' ');
    context.strokeText(label, point.x, point.y);
    context.fillText(label, point.x, point.y);
  }
  context.restore();
}

export function drawReplayFrame(
  context: CanvasRenderingContext2D,
  frame: ReplayFrameV1,
  events: ReplayEventV1[],
  radar: RadarPlan,
  transform: ViewportTransform,
  theme: Theme
) {
  const colors = palette(theme);
  context.clearRect(0, 0, transform.width, transform.height);
  const playerById = new Map(frame.players.map((player) => [player.playerId, player]));

  for (const event of events) {
    if (event.type !== 'shot' || Math.abs(event.atMs - frame.atMs) > 120) continue;
    const shooter = playerById.get(event.playerId);
    const target = playerById.get(event.targetPlayerId);
    if (!shooter || !target) continue;
    const from = worldToScreen(transform, shooter);
    const to = worldToScreen(transform, target);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.strokeStyle = colors.danger;
    context.lineWidth = 1.5;
    context.stroke();
  }

  for (const grenade of frame.grenades) {
    const point = worldToScreen(transform, grenade);
    const radius = 4 + grenade.progress * 3;
    context.beginPath();
    context.moveTo(point.x, point.y - radius);
    context.lineTo(point.x + radius, point.y);
    context.lineTo(point.x, point.y + radius);
    context.lineTo(point.x - radius, point.y);
    context.closePath();
    context.fillStyle = grenade.grenadeType === 'smoke' ? colors.muted : grenade.grenadeType === 'flash' ? colors.text : colors.danger;
    context.fill();
  }

  for (const player of frame.players) {
    const point = worldToScreen(transform, player);
    const teamColor = player.side === 'T' ? colors.terrorist : colors.counterTerrorist;
    if (player.alive) {
      context.beginPath();
      context.arc(point.x, point.y, 17, 0, Math.PI * 2);
      context.fillStyle = `${teamColor}18`;
      context.fill();
      context.beginPath();
      context.arc(point.x, point.y, 6, 0, Math.PI * 2);
      context.fillStyle = teamColor;
      context.fill();
      context.strokeStyle = colors.background;
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = colors.text;
      context.font = '700 9px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText(String(Math.round(player.hp)), point.x, point.y - 10);
    } else {
      context.strokeStyle = colors.danger;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(point.x - 5, point.y - 5);
      context.lineTo(point.x + 5, point.y + 5);
      context.moveTo(point.x + 5, point.y - 5);
      context.lineTo(point.x - 5, point.y + 5);
      context.stroke();
    }
  }

  if (frame.bomb.siteNodeId) {
    const site = radar.nodes.find((node) => node.id === frame.bomb.siteNodeId);
    if (site) {
      const point = worldToScreen(transform, site);
      context.strokeStyle = frame.bomb.state === 'exploded' ? colors.danger : colors.accent;
      context.lineWidth = 2;
      context.strokeRect(point.x - 8, point.y - 8, 16, 16);
    }
  }
}
