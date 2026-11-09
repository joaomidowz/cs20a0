// tests/playerCareerQualifierField.test.ts
// As vagas de qualificatória do circuito do mundo saem das qualificatórias regionais (plano 04): o Major com 2 por região,
// sem convidados; save antigo sem `kind` é campeonato.
import { afterEach, describe, expect, it } from 'vitest';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { QUALIFIER_SLOTS, clearWorldCache, worldEventsOf, worldFieldOf } from '../src/lib/game/playerCareer/circuit';
import { entryKind, qualifierRegionOf, qualifierRegions } from '../src/lib/game/playerCareer/qualifiers';

function seasonAt(seed: string, find: (org: (typeof sceneOrgs)[number]) => boolean): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', seed });
  const org = sceneOrgs.find(find)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
}

afterEach(() => clearWorldCache());

describe('vagas de qualificatória por região', () => {
  it('as vagas de cada campeonato somam o qualifierSlots dele, e a Europa sempre tem uma', () => {
    for (const event of worldEventsOf(seasonAt('qual-slots', (org) => org.level === 4), 1)) {
      const regions = qualifierRegions(event);
      expect(Object.values(regions).reduce((sum, value) => sum + (value ?? 0), 0)).toBe(QUALIFIER_SLOTS[event.format]);
      expect(regions.eu).toBeGreaterThan(0);
    }
    expect(qualifierRegionOf('oce')).toBe('apac');
    expect(qualifierRegionOf('asia')).toBe('apac');
    expect(qualifierRegionOf('sa')).toBe('sa');
  });

  it('as vagas de qualificatória de quem não jogou saem das qualificatórias regionais simuladas: Major com 2 por região', () => {
    const state = seasonAt('qual-bots', (org) => org.level === 4);
    const major = worldEventsOf(state, 1).find((event) => event.format === 'major')!;
    const field = worldFieldOf(state, major);
    const invited = field.filter((slot) => slot.via === 'invite').map((slot) => slot.orgId);
    const qualified = field.filter((slot) => slot.via === 'qualifier').map((slot) => slot.orgId);
    expect(qualified).toHaveLength(8);
    expect(qualified.some((orgId) => invited.includes(orgId))).toBe(false);
    const regions = qualified.map((orgId) => qualifierRegionOf(sceneOrgs.find((org) => org.id === orgId)!.region));
    for (const region of ['eu', 'sa', 'na', 'apac'] as const) expect(regions.filter((item) => item === region)).toHaveLength(2);
    expect(worldFieldOf(state, major)).toEqual(field);
  });

  it('entrada sem kind (save antigo) é campeonato', () => {
    expect(entryKind({})).toBe('event');
    expect(entryKind({ kind: 'qualifier' })).toBe('qualifier');
  });
});
