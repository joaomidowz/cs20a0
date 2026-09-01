import { MIRAGE_GRID_B64 } from './mirage-grid.generated';
import type { GoldenPoint } from './types';

export const MIRAGE_WORLD_SIZE = 1_024 as const;
export const MIRAGE_GRID_SIZE = 192 as const;
export const MIRAGE_CELL_SIZE = MIRAGE_WORLD_SIZE / MIRAGE_GRID_SIZE;
export const MIRAGE_PLAYER_RADIUS = 9.2;

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1]
] as const;

const clamp = (value: number, minimum: number, maximum: number): number =>
  value < minimum ? minimum : value > maximum ? maximum : value;

const decodeGrid = (): Uint8Array => {
  const packed = atob(MIRAGE_GRID_B64);
  const walk = new Uint8Array(MIRAGE_GRID_SIZE * MIRAGE_GRID_SIZE);
  for (let index = 0; index < walk.length; index += 1) {
    walk[index] = (packed.charCodeAt(index >> 3) >> (index & 7)) & 1;
  }
  return walk;
};

export interface GoldenNavigation {
  worldSize: 1_024;
  gridSize: 192;
  walkableCells: number;
  isFree(x: number, y: number): boolean;
  nearestFree(x: number, y: number): GoldenPoint;
  findPath(from: GoldenPoint, to: GoldenPoint): GoldenPoint[];
  steerPoint(from: GoldenPoint, to: GoldenPoint): GoldenPoint | null;
  hasWallBetween(from: GoldenPoint, to: GoldenPoint): boolean;
  segmentCrossesCircle(
    from: GoldenPoint,
    to: GoldenPoint,
    center: GoldenPoint,
    radius: number
  ): boolean;
}

export const createMirageNavigation = (): GoldenNavigation => {
  const walk = decodeGrid();
  const walkWithRadius = new Uint8Array(MIRAGE_GRID_SIZE * MIRAGE_GRID_SIZE);
  const fields = new Map<number, Int32Array>();
  const fieldOrder: number[] = [];

  const cellOf = (value: number): number =>
    clamp(Math.floor(value / MIRAGE_CELL_SIZE), 0, MIRAGE_GRID_SIZE - 1);
  const cellWalk = (cellX: number, cellY: number): number =>
    cellX < 0 || cellY < 0 || cellX >= MIRAGE_GRID_SIZE || cellY >= MIRAGE_GRID_SIZE
      ? 0
      : walk[cellY * MIRAGE_GRID_SIZE + cellX];
  const cellWalkWithRadius = (cellX: number, cellY: number): number =>
    cellX < 0 || cellY < 0 || cellX >= MIRAGE_GRID_SIZE || cellY >= MIRAGE_GRID_SIZE
      ? 0
      : walkWithRadius[cellY * MIRAGE_GRID_SIZE + cellX];
  const pointWalk = (x: number, y: number): number => cellWalk(cellOf(x), cellOf(y));
  const isFree = (x: number, y: number): boolean => {
    if (!pointWalk(x, y)) return false;
    const radius = MIRAGE_PLAYER_RADIUS * 0.78;
    return Boolean(
      pointWalk(x - radius, y - radius) &&
        pointWalk(x + radius, y - radius) &&
        pointWalk(x - radius, y + radius) &&
        pointWalk(x + radius, y + radius)
    );
  };

  let walkableCells = 0;
  for (let cellY = 0; cellY < MIRAGE_GRID_SIZE; cellY += 1) {
    for (let cellX = 0; cellX < MIRAGE_GRID_SIZE; cellX += 1) {
      const index = cellY * MIRAGE_GRID_SIZE + cellX;
      if (
        isFree(
          cellX * MIRAGE_CELL_SIZE + MIRAGE_CELL_SIZE / 2,
          cellY * MIRAGE_CELL_SIZE + MIRAGE_CELL_SIZE / 2
        )
      ) {
        walkWithRadius[index] = 1;
        walkableCells += 1;
      }
    }
  }

  const nearestFree = (x: number, y: number): GoldenPoint => {
    if (isFree(x, y)) return { x, y };
    for (let radius = MIRAGE_CELL_SIZE; radius < 260; radius += MIRAGE_CELL_SIZE) {
      for (let angleIndex = 0; angleIndex < 20; angleIndex += 1) {
        const angle = (angleIndex / 20) * Math.PI * 2;
        const candidateX = x + Math.cos(angle) * radius;
        const candidateY = y + Math.sin(angle) * radius;
        if (isFree(candidateX, candidateY)) return { x: candidateX, y: candidateY };
      }
    }
    return { x, y };
  };

  const fieldFor = (worldX: number, worldY: number): Int32Array | null => {
    const cellX = cellOf(worldX);
    const cellY = cellOf(worldY);
    let goalX = cellX;
    let goalY = cellY;

    if (!cellWalkWithRadius(goalX, goalY)) {
      let best = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let radius = 1; radius <= 14; radius += 1) {
        for (let deltaY = -radius; deltaY <= radius; deltaY += 1) {
          for (let deltaX = -radius; deltaX <= radius; deltaX += 1) {
            if (Math.abs(deltaX) !== radius && Math.abs(deltaY) !== radius) continue;
            const nextX = cellX + deltaX;
            const nextY = cellY + deltaY;
            if (!cellWalkWithRadius(nextX, nextY)) continue;
            const distance = deltaX * deltaX + deltaY * deltaY;
            if (distance < bestDistance) {
              bestDistance = distance;
              best = nextY * MIRAGE_GRID_SIZE + nextX;
            }
          }
        }
        if (best >= 0) break;
      }
      if (best < 0) return null;
      goalX = best % MIRAGE_GRID_SIZE;
      goalY = Math.floor(best / MIRAGE_GRID_SIZE);
    }

    const key = goalY * MIRAGE_GRID_SIZE + goalX;
    const cached = fields.get(key);
    if (cached) return cached;

    const field = new Int32Array(MIRAGE_GRID_SIZE * MIRAGE_GRID_SIZE).fill(-1);
    const queue = new Int32Array(MIRAGE_GRID_SIZE * MIRAGE_GRID_SIZE);
    let queueHead = 0;
    let queueTail = 0;
    field[key] = 0;
    queue[queueTail] = key;
    queueTail += 1;

    while (queueHead < queueTail) {
      const cell = queue[queueHead];
      queueHead += 1;
      const currentX = cell % MIRAGE_GRID_SIZE;
      const currentY = Math.floor(cell / MIRAGE_GRID_SIZE);
      const distance = field[cell];

      for (let neighborIndex = 0; neighborIndex < NEIGHBORS.length; neighborIndex += 1) {
        const [deltaX, deltaY] = NEIGHBORS[neighborIndex];
        const nextX = currentX + deltaX;
        const nextY = currentY + deltaY;
        if (
          nextX < 0 ||
          nextY < 0 ||
          nextX >= MIRAGE_GRID_SIZE ||
          nextY >= MIRAGE_GRID_SIZE
        ) {
          continue;
        }
        const nextIndex = nextY * MIRAGE_GRID_SIZE + nextX;
        if (field[nextIndex] !== -1 || !walkWithRadius[nextIndex]) continue;
        if (
          neighborIndex > 3 &&
          (!walkWithRadius[currentY * MIRAGE_GRID_SIZE + nextX] ||
            !walkWithRadius[nextY * MIRAGE_GRID_SIZE + currentX])
        ) {
          continue;
        }
        field[nextIndex] = distance + 1;
        queue[queueTail] = nextIndex;
        queueTail += 1;
      }
    }

    fields.set(key, field);
    fieldOrder.push(key);
    if (fieldOrder.length > 70) {
      const expiredKey = fieldOrder.shift();
      if (expiredKey !== undefined) fields.delete(expiredKey);
    }
    return field;
  };

  const walkLine = (from: GoldenPoint, to: GoldenPoint): boolean => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / 5));
    for (let index = 1; index <= steps; index += 1) {
      const progress = index / steps;
      if (
        !isFree(
          from.x + (to.x - from.x) * progress,
          from.y + (to.y - from.y) * progress
        )
      ) {
        return false;
      }
    }
    return true;
  };

  const steerPoint = (from: GoldenPoint, to: GoldenPoint): GoldenPoint | null => {
    const field = fieldFor(to.x, to.y);
    if (!field) return null;

    let cellX = cellOf(from.x);
    let cellY = cellOf(from.y);
    if (field[cellY * MIRAGE_GRID_SIZE + cellX] < 0) {
      let best: readonly [number, number] | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let deltaY = -18; deltaY <= 18; deltaY += 1) {
        for (let deltaX = -18; deltaX <= 18; deltaX += 1) {
          const nextX = cellX + deltaX;
          const nextY = cellY + deltaY;
          if (
            nextX < 0 ||
            nextY < 0 ||
            nextX >= MIRAGE_GRID_SIZE ||
            nextY >= MIRAGE_GRID_SIZE
          ) {
            continue;
          }
          if (field[nextY * MIRAGE_GRID_SIZE + nextX] < 0) continue;
          const distance = deltaX * deltaX + deltaY * deltaY;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = [nextX, nextY];
          }
        }
      }
      if (!best) return null;
      [cellX, cellY] = best;
    }

    let lastGood: GoldenPoint | null = null;
    for (let step = 0; step < 22; step += 1) {
      let bestNeighbor = -1;
      let bestValue = field[cellY * MIRAGE_GRID_SIZE + cellX];
      for (let index = 0; index < NEIGHBORS.length; index += 1) {
        const [deltaX, deltaY] = NEIGHBORS[index];
        const nextX = cellX + deltaX;
        const nextY = cellY + deltaY;
        if (
          nextX < 0 ||
          nextY < 0 ||
          nextX >= MIRAGE_GRID_SIZE ||
          nextY >= MIRAGE_GRID_SIZE
        ) {
          continue;
        }
        const value = field[nextY * MIRAGE_GRID_SIZE + nextX];
        if (value >= 0 && value < bestValue) {
          bestValue = value;
          bestNeighbor = index;
        }
      }
      if (bestNeighbor < 0) break;
      cellX += NEIGHBORS[bestNeighbor][0];
      cellY += NEIGHBORS[bestNeighbor][1];
      const candidate = {
        x: cellX * MIRAGE_CELL_SIZE + MIRAGE_CELL_SIZE / 2,
        y: cellY * MIRAGE_CELL_SIZE + MIRAGE_CELL_SIZE / 2
      };
      if (walkLine(from, candidate)) lastGood = candidate;
      else break;
      if (bestValue === 0) break;
    }
    if (lastGood) return lastGood;

    let bestNeighbor = -1;
    let bestValue = field[cellY * MIRAGE_GRID_SIZE + cellX];
    for (let index = 0; index < NEIGHBORS.length; index += 1) {
      const [deltaX, deltaY] = NEIGHBORS[index];
      const nextX = cellX + deltaX;
      const nextY = cellY + deltaY;
      if (
        nextX < 0 ||
        nextY < 0 ||
        nextX >= MIRAGE_GRID_SIZE ||
        nextY >= MIRAGE_GRID_SIZE
      ) {
        continue;
      }
      const value = field[nextY * MIRAGE_GRID_SIZE + nextX];
      if (value >= 0 && value < bestValue) {
        bestValue = value;
        bestNeighbor = index;
      }
    }
    if (bestNeighbor < 0) return null;
    return {
      x: (cellX + NEIGHBORS[bestNeighbor][0]) * MIRAGE_CELL_SIZE + MIRAGE_CELL_SIZE / 2,
      y: (cellY + NEIGHBORS[bestNeighbor][1]) * MIRAGE_CELL_SIZE + MIRAGE_CELL_SIZE / 2
    };
  };

  const findPath = (from: GoldenPoint, to: GoldenPoint): GoldenPoint[] => {
    const start = nearestFree(from.x, from.y);
    const destination = nearestFree(to.x, to.y);
    const path: GoldenPoint[] = [start];
    let current = start;

    for (let step = 0; step < MIRAGE_GRID_SIZE * 2; step += 1) {
      const next = steerPoint(current, destination);
      if (!next) break;
      if (Math.hypot(next.x - current.x, next.y - current.y) < 0.01) break;
      path.push(next);
      current = next;
      if (Math.hypot(destination.x - current.x, destination.y - current.y) <= MIRAGE_CELL_SIZE * 1.5) {
        if (Math.hypot(destination.x - current.x, destination.y - current.y) >= 0.01) {
          path.push(destination);
        }
        break;
      }
    }
    return path;
  };

  const hasWallBetween = (from: GoldenPoint, to: GoldenPoint): boolean => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / 4.5));
    for (let index = 1; index < steps; index += 1) {
      const progress = index / steps;
      if (
        !pointWalk(
          from.x + (to.x - from.x) * progress,
          from.y + (to.y - from.y) * progress
        )
      ) {
        return true;
      }
    }
    return false;
  };

  const segmentCrossesCircle = (
    from: GoldenPoint,
    to: GoldenPoint,
    center: GoldenPoint,
    radius: number
  ): boolean => {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const projection =
      lengthSquared > 0
        ? ((center.x - from.x) * deltaX + (center.y - from.y) * deltaY) / lengthSquared
        : 0;
    const progress = clamp(projection, 0, 1);
    const pointX = from.x + deltaX * progress;
    const pointY = from.y + deltaY * progress;
    return (
      (pointX - center.x) * (pointX - center.x) +
        (pointY - center.y) * (pointY - center.y) <=
      radius * radius
    );
  };

  return {
    worldSize: MIRAGE_WORLD_SIZE,
    gridSize: MIRAGE_GRID_SIZE,
    walkableCells,
    isFree,
    nearestFree,
    findPath,
    steerPoint,
    hasWallBetween,
    segmentCrossesCircle
  };
};
