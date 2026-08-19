import type { RadarPoint } from '../topology/types';

export interface ViewportTransform {
  width: number;
  height: number;
  zoom: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

const round = (value: number) => Number(value.toFixed(8));

export function createViewportTransform(
  width: number,
  height: number,
  zoom = 1,
  pan: RadarPoint = { x: 0, y: 0 }
): ViewportTransform {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeZoom = Math.max(0.75, Math.min(5, zoom));
  const scale = Math.min(safeWidth, safeHeight) * safeZoom;
  return {
    width: safeWidth,
    height: safeHeight,
    zoom: safeZoom,
    scale,
    offsetX: (safeWidth - scale) / 2 + pan.x,
    offsetY: (safeHeight - scale) / 2 + pan.y
  };
}

export function worldToScreen(transform: ViewportTransform, point: RadarPoint): RadarPoint {
  return {
    x: round(transform.offsetX + point.x * transform.scale),
    y: round(transform.offsetY + point.y * transform.scale)
  };
}

export function screenToWorld(transform: ViewportTransform, point: RadarPoint): RadarPoint {
  return {
    x: round((point.x - transform.offsetX) / transform.scale),
    y: round((point.y - transform.offsetY) / transform.scale)
  };
}

export function zoomViewportAt(
  transform: ViewportTransform,
  zoom: number,
  cursor: RadarPoint
): ViewportTransform {
  const worldAtCursor = screenToWorld(transform, cursor);
  const nextZoom = Math.max(0.75, Math.min(5, zoom));
  const nextScale = Math.min(transform.width, transform.height) * nextZoom;
  return {
    ...transform,
    zoom: nextZoom,
    scale: nextScale,
    offsetX: round(cursor.x - worldAtCursor.x * nextScale),
    offsetY: round(cursor.y - worldAtCursor.y * nextScale)
  };
}

export function panViewport(
  transform: ViewportTransform,
  deltaX: number,
  deltaY: number
): ViewportTransform {
  return {
    ...transform,
    offsetX: round(transform.offsetX + deltaX),
    offsetY: round(transform.offsetY + deltaY)
  };
}
