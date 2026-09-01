import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seriesViewerSource = readFileSync(
  new URL('../src/lib/components/SeriesViewer.svelte', import.meta.url),
  'utf8'
);
const replayViewerSource = readFileSync(
  new URL('../src/lib/components/SchematicReplayViewer.svelte', import.meta.url),
  'utf8'
);

describe('offline replay viewer integration', () => {
  it('keeps offline maps and score presentation without mounting the replay', () => {
    expect(seriesViewerSource).not.toContain("import ReplayViewer from '$lib/components/ReplayViewer.svelte'");
    expect(seriesViewerSource).not.toContain('<ReplayViewer');
    expect(seriesViewerSource).toContain('class="map-list"');
    expect(seriesViewerSource).toContain('class="map-row"');
    expect(seriesViewerSource).toContain('class="map-score"');
  });

  it('keeps playback local and uses two canvas layers', () => {
    expect(replayViewerSource).toContain('new ReplayClock');
    expect(replayViewerSource).toContain('class="replay-canvas replay-canvas-base"');
    expect(replayViewerSource).toContain('class="replay-canvas replay-canvas-live"');
    expect(replayViewerSource).not.toMatch(/WebSocket|send\s*\(|fetch\s*\(/);
  });

  it('keeps scoreboard, controls, kill feed and replay stats in the DOM', () => {
    expect(replayViewerSource).toContain('class="replay-hud"');
    expect(replayViewerSource).toContain('class="replay-controls"');
    expect(replayViewerSource).toContain('class="replay-kill-feed"');
    expect(replayViewerSource).toContain('class="replay-stats-table"');
  });

  it('follows received rounds through a boundary-safe local queue until manually scrubbed', () => {
    expect(replayViewerSource).toContain('followingLive');
    expect(replayViewerSource).toContain('ReplayLiveQueue');
    expect(replayViewerSource).toContain('markRoundEndRendered');
    expect(replayViewerSource).toContain('advanceBetweenRounds');
    expect(replayViewerSource).toContain('goToLiveEdge');
    expect(replayViewerSource).toContain("t('replayGoLive')");
    expect(replayViewerSource).toContain('class="replay-round-select"');
  });
});
