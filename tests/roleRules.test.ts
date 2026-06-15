import { describe, expect, it } from 'vitest';
import playersJson from '../src/lib/data/cs/players.game.json';
import { getEligibleSlotRoles, getPlayerBaseId, validatePlayerPick } from '../src/lib/game/roleRules';
import type { Player, SelectedPlayer } from '../src/lib/game/types';

const players = playersJson as Player[];
const byBaseId = (baseId: string, year?: number) =>
  players.find((player) => getPlayerBaseId(player) === baseId && (!year || player.year === year))!;
const lookup = (id: string) => players.find((player) => player.id === id);

describe('lineup role rules', () => {
  it('normalizes player identity across eras', () => {
    expect(getPlayerBaseId(byBaseId('fallen', 2016))).toBe('fallen');
    expect(getPlayerBaseId(byBaseId('fallen', 2025))).toBe('fallen');
    expect(getPlayerBaseId({ ...byBaseId('fallen', 2025), baseId: 'FalleN-2025' })).toBe('fallen');
  });

  it('blocks the same player in another era', () => {
    const selected: SelectedPlayer[] = [{ playerId: byBaseId('fallen', 2025).id, selectedSlotRole: 'igl' }];
    const result = validatePlayerPick(byBaseId('fallen', 2016), selected, undefined, lookup);
    expect(result.ok).toBe(false);
    expect(result.validRoles).toEqual([]);
  });

  it('allows FalleN only as IGL when an AWPer is already selected', () => {
    const selected: SelectedPlayer[] = [{ playerId: byBaseId('m0nesy').id, selectedSlotRole: 'awper' }];
    const result = validatePlayerPick(byBaseId('fallen'), selected, undefined, lookup);
    expect(result.validRoles).toEqual(['igl']);
  });

  it('blocks a hybrid when AWPer and IGL are occupied', () => {
    const selected: SelectedPlayer[] = [
      { playerId: byBaseId('m0nesy').id, selectedSlotRole: 'awper' },
      { playerId: byBaseId('gla1ve').id, selectedSlotRole: 'igl' }
    ];
    expect(validatePlayerPick(byBaseId('fallen'), selected, undefined, lookup).ok).toBe(false);
  });

  it('applies known hybrid role fallbacks', () => {
    expect(getEligibleSlotRoles(byBaseId('s1mple'))).toEqual(['awper', 'rifler']);
    expect(getEligibleSlotRoles(byBaseId('naf'))).toEqual(['lurker', 'rifler', 'support']);
  });

  it('exposes generated rifle-support and lurker-support options', () => {
    expect(getEligibleSlotRoles(byBaseId('fugly', 2018))).toEqual(['support', 'rifler']);
    expect(getEligibleSlotRoles(byBaseId('xyp9x', 2018))).toEqual(['lurker', 'support']);
  });

  it('blocks a second entry and a second lurker', () => {
    const entrySelected: SelectedPlayer[] = [{ playerId: byBaseId('donk').id, selectedSlotRole: 'entry' }];
    const lurkerSelected: SelectedPlayer[] = [{ playerId: byBaseId('ropz').id, selectedSlotRole: 'lurker' }];
    expect(validatePlayerPick(byBaseId('fer'), entrySelected, undefined, lookup).ok).toBe(false);
    expect(validatePlayerPick(byBaseId('coldzera'), lurkerSelected, 'lurker', lookup).ok).toBe(false);
    expect(validatePlayerPick(byBaseId('coldzera'), lurkerSelected, 'rifler', lookup).ok).toBe(true);
  });

  it('blocks a fourth generic rifler', () => {
    const riflers = players.filter((player) => getEligibleSlotRoles(player).length === 1 && getEligibleSlotRoles(player)[0] === 'rifler').slice(0, 4);
    const selected: SelectedPlayer[] = riflers.slice(0, 3).map((player) => ({ playerId: player.id, selectedSlotRole: 'rifler' }));
    const result = validatePlayerPick(riflers[3], selected, 'rifler', lookup);
    expect(result.ok).toBe(false);
  });

  it('allows a valid five-role lineup', () => {
    const choices: Array<[string, SelectedPlayer['selectedSlotRole']]> = [
      ['m0nesy', 'awper'],
      ['gla1ve', 'igl'],
      ['donk', 'entry'],
      ['ropz', 'lurker'],
      ['perfecto', 'support']
    ];
    const selected: SelectedPlayer[] = [];
    for (const [baseId, role] of choices) {
      const player = byBaseId(baseId);
      expect(validatePlayerPick(player, selected, role, lookup).ok).toBe(true);
      selected.push({ playerId: player.id, selectedSlotRole: role });
    }
    expect(selected).toHaveLength(5);
  });
});
