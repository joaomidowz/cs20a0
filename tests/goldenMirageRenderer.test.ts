import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  drawGoldenMirageFrame,
  drawGoldenMirageMap,
  GOLDEN_MIRAGE_RADAR_URL,
  GOLDEN_RENDER_PALETTE,
  loadGoldenMirageRadar
} from '../src/lib/game/replay/golden/render';
import { readGoldenPlayerSnapshot } from '../src/lib/game/replay/golden/snapshot';
import type { GoldenRoundReplayV1 } from '../src/lib/game/replay/golden/types';

function goldenRoundReplay(): GoldenRoundReplayV1 {
  return {
    number: 1,
    tickRate: 32,
    frameStrideTicks: 2,
    playerIds: ['entry'],
    sides: ['T'],
    frames: 2,
    snapshots: new Float32Array([
      100, 200, 3.1, 100, 1, 13, 0,
      200, 300, -3.1, 50, 1, 13, 1
    ]),
    shots: new Float32Array(),
    events: [],
    winnerOrganizationId: 'alpha',
    durationMs: 125,
    roleMetrics: {
      entryFirstChokeCrossing: true,
      lurkerSeparateUntilMs: 0,
      awperAwpShare: 0
    }
  };
}

function recordingContext() {
  const operations: string[] = [];
  const gradient = { addColorStop: (offset: number) => operations.push(`color:${offset}`) };
  const target: Record<string, unknown> = {};
  const context = new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property as string];
      if (property === 'createRadialGradient') return () => gradient;
      if (property === 'measureText') return (text: string) => ({ width: text.length * 5 });
      return (...args: unknown[]) => operations.push(`${String(property)}:${args.length}`);
    },
    set(object, property, value) {
      operations.push(`${String(property)}=${String(value)}`);
      object[property as string] = value;
      return true;
    }
  });
  return { context: context as unknown as CanvasRenderingContext2D, operations };
}

describe('Mirage golden renderer', () => {
  it('reads seven floats per player and interpolates angle through the shortest arc', () => {
    const player = readGoldenPlayerSnapshot(goldenRoundReplay(), 0.5, 0);

    expect(player).toMatchObject({
      x: 150,
      y: 250,
      hp: 75,
      alive: true,
      weapon: 'ak47',
      actionProgress: 0.5
    });
    expect(player.angle).toBeCloseTo(Math.PI, 5);
  });

  it('uses the exact gold palette and real radar asset without editor state', () => {
    expect(GOLDEN_RENDER_PALETTE).toMatchObject({
      background: '#05070b',
      ct: '#5aa9e6',
      t: '#e8b44f',
      smoke: '#aab4bd',
      fire: '#ff7a2f'
    });
    expect(GOLDEN_MIRAGE_RADAR_URL).toBe('/replay/maps/mirage.webp');

    const source = readFileSync(new URL('../src/lib/game/replay/golden/render.ts', import.meta.url), 'utf8');
    expect(source).toContain('brightness(1.42) contrast(1.06) saturate(0.92)');
    expect(source).not.toMatch(/calibr|localStorage/i);
  });

  it('draws the filtered radar and every compact replay effect through the Canvas boundary', () => {
    const round = goldenRoundReplay();
    round.shots = new Float32Array([6, 100, 200, 200, 300, 3]);
    round.events = [
      { tick: 0, type: 'fire', grenade: 'molotov', x: 320, y: 330 },
      { tick: 0, type: 'smoke', grenade: 'smoke', x: 340, y: 350 },
      { tick: 0, type: 'grenade', playerId: 'entry', grenade: 'flash', x: 360, y: 370 },
      { tick: 0, type: 'flash', grenade: 'flash', x: 360, y: 370 },
      { tick: 0, type: 'he', grenade: 'he', x: 380, y: 390 },
      { tick: 0, type: 'kill', targetPlayerId: 'entry', x: 200, y: 300 },
      { tick: 0, type: 'plant', playerId: 'entry', site: 'A', x: 700, y: 220 },
      { tick: 0, type: 'explode', site: 'A', x: 700, y: 220 }
    ];
    const { context, operations } = recordingContext();
    const image = {} as CanvasImageSource;

    drawGoldenMirageMap(context, image, 512, 2);
    drawGoldenMirageFrame(context, round, 4, {
      size: 512,
      playerNames: ['entry'],
      highlightedPlayerIndex: 0
    });

    expect(operations).toContain(`filter=brightness(1.42) contrast(1.06) saturate(0.92)`);
    expect(operations.some((operation) => operation.startsWith('drawImage:'))).toBe(true);
    expect(operations.some((operation) => operation.startsWith('quadraticCurveTo:'))).toBe(true);
    expect(operations.some((operation) => operation.startsWith('lineTo:'))).toBe(true);
    expect(operations.some((operation) => operation.startsWith('fillText:'))).toBe(true);
  });

  it('loads and caches the versioned Mirage radar image', async () => {
    const OriginalImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';

      decode() {
        queueMicrotask(() => this.onload?.());
        return Promise.resolve();
      }
    }
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage });

    try {
      const first = loadGoldenMirageRadar();
      const second = loadGoldenMirageRadar();
      expect(second).toBe(first);
      const image = await first;
      expect(image.src).toBe('/replay/maps/mirage.webp');
    } finally {
      Object.defineProperty(globalThis, 'Image', { configurable: true, value: OriginalImage });
    }
  });
});
