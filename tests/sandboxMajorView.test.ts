import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewSource = readFileSync(
  new URL('../src/lib/components/SandboxMajorView.svelte', import.meta.url),
  'utf8'
);
const replayRouterSource = readFileSync(
  new URL('../src/lib/components/ReplayViewer.svelte', import.meta.url),
  'utf8'
);

describe('Sandbox Major view', () => {
  it('forwards the automatic replay contract through the shared map router', () => {
    expect(replayRouterSource).toContain('export let autoplay = false');
    expect(replayRouterSource).toContain("export let initialSpeed: ReplayPlaybackSpeed = 'normal'");
    expect(replayRouterSource).toContain('export let onComplete: () => void = () => {}');
    expect(replayRouterSource).toContain('{autoplay} {initialSpeed} {onComplete}');
  });

  it('renders resolved bot matches as result cards without replay viewers', () => {
    expect(viewSource).toContain('data-testid="sandbox-bot-results"');
    expect(viewSource).toContain('resolvedBotMatches');
    expect(viewSource).toContain('data-testid="sandbox-bot-result"');
    expect(viewSource).toContain('{match.scoreA} : {match.scoreB}');
  });

  it('shows replay only for the current user match and defaults to Simular', () => {
    expect(viewSource).toContain("export let initialSpeed: ReplayPlaybackSpeed = 'simulate'");
    expect(viewSource).toContain('currentMatch?.replayable}');
    expect(viewSource).toContain('<ReplayViewer');
    expect(viewSource).toContain('initialSpeed={initialSpeed}');
    expect(viewSource).toContain('autoplay={started}');
  });

  it('waits once in manual mode, then advances maps without a per-map Play button', () => {
    expect(viewSource).toContain('{#if mode === \'manual\' && !started}');
    expect(viewSource).toContain('on:click={startCurrentMatch}');
    expect(viewSource).toContain('function handleMapComplete()');
    expect(viewSource).toContain('activeMapIndex += 1');
    expect(viewSource).toContain('onAdvance();');
    expect(viewSource).not.toContain('Iniciar mapa');
  });

  it('exposes match lifecycle callbacks and map tabs', () => {
    expect(viewSource).toContain('export let onStart: () => void = () => {}');
    expect(viewSource).toContain('export let onAdvance: () => void = () => {}');
    expect(viewSource).toContain('export let onRestart: () => void = () => {}');
    expect(viewSource).toContain('data-testid="sandbox-map-tabs"');
    expect(viewSource).toContain('on:click={onRestart}');
  });
});
