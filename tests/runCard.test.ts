import { describe, expect, it } from 'vitest';
import { buildRunImageFilename } from '../src/lib/game/shareImage';
import { buildOnlineRunCardReport } from '../src/lib/game/runCard';

describe('run card presentation', () => {
  it('builds a private multiplayer report without changing campaign values', () => {
    const report = buildOnlineRunCardReport({
      campaign: { organizationId: 'org-a', seriesWon: 4, seriesLost: 1, mapsWon: 8, mapsLost: 3, roundsWon: 120, roundsLost: 88, placement: 'Campeão' },
      stats: []
    }, 'org-a', 'org-a');
    expect(report).toEqual({ champion: true, placement: 'Campeão', seriesWon: 4, seriesLost: 1, mapsWon: 8, mapsLost: 3 });
  });

  it('creates a safe individual multiplayer filename', () => {
    expect(buildRunImageFilename('ABCD2345-Organização Águia', 'cs13a0-multiplayer'))
      .toBe('cs13a0-multiplayer-abcd2345-organizacao-aguia.png');
  });
});
