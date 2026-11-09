// tests/playerCareerCircuitWorld.test.ts
// O mundo que o circuito do mundo vê (plano 03): o calendário mundial do ano e os elencos da seed sem as suas vagas.
import { describe, expect, it } from 'vitest';
import { worldCircuitOf } from '../src/lib/game/playerCareer/calendar';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { orgIn, registerSeats, worldOrgIn } from '../src/lib/game/playerCareer/world';

describe('o mundo que o circuito vê', () => {
  it('o circuito do ano tem os 2 Majors, a elite e os retornos de elite, em ordem de mês', () => {
    for (const year of [2026, 2027, 2031]) {
      const events = worldCircuitOf(year);
      expect(events.filter((event) => event.tier === 'Major')).toHaveLength(2);
      expect(events.every((event) => ['Major', 'S', 'A'].includes(event.tier))).toBe(true);
      expect(events.map((event) => event.month)).toEqual([...events.map((event) => event.month)].sort((a, b) => a - b));
      expect(new Set(events.map((event) => event.name)).size).toBe(events.length);
      expect(events.some((event) => /CBCS|Gamers Club|ESEA/.test(event.name))).toBe(false);
    }
    expect(worldCircuitOf(2026).map((event) => event.name)).toContain('PGL Major Singapore');
  });

  it('worldOrgIn é o elenco da seed: as suas vagas não mexem no circuito', () => {
    const seed = 'circuit-seats';
    const vitality = sceneOrgs.find((org) => org.name === 'Vitality')!;
    const before = worldOrgIn(seed, 1, vitality.id)!;
    expect(before.roster).toEqual(orgIn(seed, 1, vitality.id)!.roster);
    registerSeats(seed, [{ orgId: vitality.id, nick: 'ZywOo', season: 1 }]);
    expect(orgIn(seed, 1, vitality.id)!.roster.some((member) => member.nick.toLowerCase() === 'zywoo')).toBe(false);
    expect(worldOrgIn(seed, 1, vitality.id)!.roster).toEqual(before.roster);
    expect(worldOrgIn(seed, 1, vitality.id)!.power).toBe(before.power);
  });
});
