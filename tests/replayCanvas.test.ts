import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ReplayClock } from '../src/lib/game/replay/canvas/clock';
import { hitTestReplay } from '../src/lib/game/replay/canvas/hit-testing';
import { interpolateReplayFrame } from '../src/lib/game/replay/canvas/interpolation';
import {
  createViewportTransform,
  panViewport,
  screenToWorld,
  worldToScreen,
  zoomViewportAt
} from '../src/lib/game/replay/canvas/transform';
import { getMapGraph } from '../src/lib/game/replay/topology/maps';
import { createRadarPlan } from '../src/lib/game/replay/topology/radar';
import type { ReplayFrameV1 } from '../src/lib/game/replay/types';

const frames: ReplayFrameV1[] = [
  {
    index: 0,
    roundNumber: 1,
    atMs: 0,
    players: [{ playerId: 'p1', organizationId: 'alpha', side: 'T', x: 0.2, y: 0.4, level: 0, hp: 100, alive: true }],
    grenades: [],
    bomb: { state: 'carried', carrierPlayerId: 'p1' }
  },
  {
    index: 1,
    roundNumber: 1,
    atMs: 1_000,
    players: [{ playerId: 'p1', organizationId: 'alpha', side: 'T', x: 0.8, y: 0.6, level: 0, hp: 40, alive: true }],
    grenades: [{ eventId: 'g1', grenadeType: 'flash', x: 0.5, y: 0.5, level: 0, progress: 0.5 }],
    bomb: { state: 'planted', siteNodeId: 'a_site' }
  }
];
const drawSource = readFileSync(new URL('../src/lib/game/replay/canvas/draw.ts', import.meta.url), 'utf8');

describe('replay canvas core', () => {
  it('plays normal at 4x, fast at 8x and ultra instantly', () => {
    const clock = new ReplayClock(40_000);
    clock.play();
    clock.advance(1_000);
    expect(clock.currentMs).toBe(4_000);
    clock.setSpeed('fast');
    clock.advance(1_000);
    expect(clock.currentMs).toBe(12_000);
    clock.setSpeed('ultra');
    expect(clock.currentMs).toBe(40_000);
    expect(clock.playing).toBe(false);
  });

  it('plays simulate across one visual round in exactly ten seconds', () => {
    const clock = new ReplayClock(40_000);
    clock.setSpeed('simulate');
    clock.play();

    clock.advance(5_000);
    expect(clock.currentMs).toBe(20_000);
    expect(clock.playing).toBe(true);

    clock.advance(5_000);
    expect(clock.currentMs).toBe(40_000);
    expect(clock.playing).toBe(false);
  });

  it('plays an offset simulation window without compressing earlier rounds', () => {
    const clock = new ReplayClock(100_000);
    clock.setPlaybackWindow(40_000, 100_000);
    clock.setSpeed('simulate');
    clock.scrub(40_000);
    clock.play();

    clock.advance(5_000);
    expect(clock.currentMs).toBe(70_000);

    clock.advance(5_000);
    expect(clock.currentMs).toBe(100_000);
  });

  it('interpolates before, between and after replay frames', () => {
    expect(interpolateReplayFrame(frames, -10)).toEqual(frames[0]);
    const middle = interpolateReplayFrame(frames, 500);
    expect(middle.players[0]).toMatchObject({ x: 0.5, y: 0.5, hp: 70, alive: true });
    expect(middle.bomb.state).toBe('carried');
    expect(interpolateReplayFrame(frames, 2_000)).toEqual(frames[1]);
  });

  it('preserves the world point under the cursor while zooming and supports pan', () => {
    const viewport = createViewportTransform(800, 600);
    const cursor = { x: 240, y: 310 };
    const before = screenToWorld(viewport, cursor);
    const zoomed = zoomViewportAt(viewport, 2, cursor);
    const after = screenToWorld(zoomed, cursor);
    const panned = panViewport(zoomed, 25, -10);

    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
    expect(worldToScreen(panned, before)).toEqual({ x: cursor.x + 25, y: cursor.y - 10 });
  });

  it('hit-tests players before callouts in screen space', () => {
    const viewport = createViewportTransform(800, 600);
    const radar = createRadarPlan(getMapGraph('ancient'), 'hit-test');
    const playerPoint = worldToScreen(viewport, { x: frames[0].players[0].x, y: frames[0].players[0].y });
    const node = radar.nodes[0];
    const nodePoint = worldToScreen(viewport, node);

    expect(hitTestReplay(frames[0], radar, viewport, playerPoint)).toEqual({ kind: 'player', id: 'p1' });
    expect(hitTestReplay(frames[0], radar, viewport, nodePoint)).toEqual({ kind: 'callout', id: node.id });
    expect(hitTestReplay(frames[0], radar, viewport, { x: -100, y: -100 })).toBeNull();
  });

  it('draws the base as filled floor-plan geometry and reserves circles for players', () => {
    const baseSource = drawSource.slice(
      drawSource.indexOf('export function drawRadarBase'),
      drawSource.indexOf('export function drawReplayFrame')
    );

    expect(baseSource).toContain("context.lineCap = 'round'");
    expect(baseSource).toContain("context.lineJoin = 'round'");
    expect(baseSource).toContain('roundedRoomPath');
    expect(baseSource).toContain('context.strokeText');
    expect(baseSource).not.toContain('context.arc(');
    expect(drawSource.match(/context\.arc\(/g)).toHaveLength(2);
  });
});
