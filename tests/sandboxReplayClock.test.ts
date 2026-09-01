import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const goldenViewerSource = readFileSync(
  new URL('../src/lib/components/GoldenMirageReplayViewer.svelte', import.meta.url),
  'utf8'
);
const schematicViewerSource = readFileSync(
  new URL('../src/lib/components/SchematicReplayViewer.svelte', import.meta.url),
  'utf8'
);

describe('sandbox replay viewer contract', () => {
  it.each([
    ['golden Mirage', goldenViewerSource],
    ['schematic maps', schematicViewerSource]
  ])('exposes autoplay, initial speed and map completion for %s', (_name, source) => {
    expect(source).toContain('export let autoplay = false');
    expect(source).toContain("export let initialSpeed: ReplayPlaybackSpeed = 'normal'");
    expect(source).toContain('export let onComplete: () => void = () => {}');
    expect(source).toContain("('simulate')");
    expect(source).toContain('SIMULAR · 10s/ROUND');
  });

  it.each([
    ['golden Mirage', goldenViewerSource],
    ['schematic maps', schematicViewerSource]
  ])('hides the per-round play button during autoplay for %s', (_name, source) => {
    expect(source).toContain('{#if !autoplay}');
    expect(source).toContain('notifyComplete');
  });

  it('advances every schematic round in autoplay instead of applying live backlog compression', () => {
    expect(schematicViewerSource).toContain('if (autoplay && playbackRound < receivedRounds)');
    expect(schematicViewerSource).toContain('startQueuedRound(playbackRound + 1');
  });
});
