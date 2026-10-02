import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('mobile match presentation contract', () => {
  it('opens round inspection through the shared accessible sheet', () => {
    const strip = source('src/lib/components/RoundStrip.svelte');
    const feed = source('src/lib/components/RoundFeed.svelte');
    const sheet = source('src/lib/components/RoundDetailSheet.svelte');

    expect(strip).toContain('onInspect');
    expect(feed).toContain('mobile-round-summary');
    expect(feed).toContain('onInspect');
    expect(sheet).toContain('aria-modal="true"');
    expect(sheet).toContain('round-sheet-backdrop');
    expect(sheet).toContain('env(safe-area-inset-bottom)');
  });

  it('keeps both viewers dense and maps readable on phones', () => {
    const series = source('src/lib/components/SeriesViewer.svelte');
    const sandbox = source('src/lib/components/SandboxSeriesViewer.svelte');

    for (const viewer of [series, sandbox]) {
      expect(viewer).toContain('RoundDetailSheet');
      expect(viewer).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
      expect(viewer).not.toContain('@media(max-width:400px){.decided-map-list{grid-template-columns:1fr}}');
    }
  });

  it('does not render locked speed controls for queue matches', () => {
    const online = source('src/routes/online/+page.svelte');
    const offline = source('src/routes/+page.svelte');
    const sandbox = source('src/routes/sandbox/+page.svelte');

    expect(online).toContain("snapshot.origin === 'queue'");
    expect(online).toContain('queue-match-tools');
    expect(online).toContain('compact-match-controls');
    expect(offline).toContain('compact-match-controls');
    expect(sandbox).toContain('compact-match-controls');
  });

  it('stacks mobile controls and keeps every revealed round visible', () => {
    const app = source('src/app.css');
    const strip = source('src/lib/components/RoundStrip.svelte');

    expect(app).toMatch(/\.compact-match-controls\{grid-template-columns:1fr/);
    expect(strip).toContain('grid-template-columns:repeat(12,minmax(0,1fr))');
    expect(strip).toContain('@media (max-width:379px)');
    expect(strip).not.toContain('overflow-x:auto');
  });
});
