import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wrapper = readFileSync(
  new URL('../src/lib/components/ReplayViewer.svelte', import.meta.url),
  'utf8'
);
const golden = readFileSync(
  new URL('../src/lib/components/GoldenMirageReplayViewer.svelte', import.meta.url),
  'utf8'
);

describe('Mirage golden viewer integration', () => {
  it('routes Mirage to gold and keeps every other map schematic', () => {
    expect(wrapper).toContain("mapId === 'mirage'");
    expect(wrapper).toContain('<GoldenMirageReplayViewer');
    expect(wrapper).toContain('<SchematicReplayViewer');
  });

  it('replicates the gold HUD without calibration or editing controls', () => {
    for (const className of [
      'golden-topbar',
      'golden-player-list',
      'golden-map-canvas',
      'golden-kill-feed',
      'golden-timeline',
      'golden-controls'
    ]) {
      expect(golden).toContain(`class="${className}`);
    }
    expect(golden).not.toMatch(/calibr|marcar pixel|localStorage|btnApplyCal|btnResetCal/i);
  });

  it('shows the requested local playback speeds', () => {
    expect(golden).toContain('NORMAL · 4×');
    expect(golden).toContain('RÁPIDO · 8×');
    expect(golden).toContain('ULTRA · INSTANTÂNEO');
  });

  it('renders current grenade inventory instead of the static round start loadout', () => {
    expect(golden).toContain('row.snapshot.grenades');
    expect(golden).not.toContain('start.inventory.grenades');
  });

  it('does not send network commands from either offline viewer', () => {
    expect(wrapper + golden).not.toMatch(/WebSocket|fetch\s*\(|send\s*\(/);
  });
});
