import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const onlinePage = readFileSync(new URL('../src/routes/online/+page.svelte', import.meta.url), 'utf8');
const seasonPanel = readFileSync(new URL('../src/lib/components/online/SeasonPanel.svelte', import.meta.url), 'utf8');

describe('online client lifecycle UI', () => {
  it('keeps the time-limited rematch controls visible regardless of the selected Major tab', () => {
    const rematchPanel = onlinePage.indexOf('<RematchPanel');
    const majorTabs = onlinePage.indexOf('<div class="major-tabs">');
    expect(rematchPanel).toBeGreaterThan(-1);
    expect(rematchPanel).toBeLessThan(majorTabs);
    expect(onlinePage.match(/<RematchPanel/g)).toHaveLength(1);
  });

  it('clears transient room UI on session expiry and on a new run', () => {
    expect(onlinePage.match(/resetTransientRoomState\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(onlinePage).toContain("if (state === 'expired') {");
    expect(onlinePage).toContain('if (newRun) startNewRun(next);');
  });

  it('preserves the authoritative season ordering for tied point totals', () => {
    expect(seasonPanel).toContain('$: standings = season.standings;');
  });
});
