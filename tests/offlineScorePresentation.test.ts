import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seriesViewerSource = readFileSync(
  new URL('../src/lib/components/SeriesViewer.svelte', import.meta.url),
  'utf8'
);
const appCssSource = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');

describe('offline series score presentation', () => {
  it('keeps live and final score states in the desktop right header column', () => {
    expect(seriesViewerSource).toContain('class="series-header-main"');
    expect(seriesViewerSource).toContain('class="series-header-result"');
    expect(seriesViewerSource).toContain('class="series-score"');
    expect(seriesViewerSource).toContain('class="series-status live"');
    expect(appCssSource).toContain('.series-header{display:grid;grid-template-columns:minmax(0,1fr) auto');
    expect(appCssSource).toContain('.series-header-result{justify-self:end');
  });

  it('uses one compact live score on mobile without losing the responsive result slot', () => {
    expect(seriesViewerSource).toContain('class="mobile-series-live"');
    expect(appCssSource).toContain('.series-status.live{display:none}');
    expect(appCssSource).toContain('.mobile-series-live{display:flex');
    expect(appCssSource).toContain('.series-header-result{justify-self:stretch');
  });

  it('preserves map names, rows and scores without offline replay markup', () => {
    expect(seriesViewerSource).toContain('class="map-list"');
    expect(seriesViewerSource).toContain('class="map-row"');
    expect(seriesViewerSource).toContain('class="map-score"');
    expect(seriesViewerSource).toContain('getMapName(map.mapId');
    expect(seriesViewerSource).not.toContain('<ReplayViewer');
  });
});
