import { describe, expect, it } from 'vitest';
import {
  collectGoldenGroundItems,
  consumeGoldenGrenade,
  deliverSavedWeapons,
  dropGoldenInventory,
  prepareGoldenRoundEconomy
} from '../src/lib/game/replay/golden/economy';
import type { GoldenGroundItem } from '../src/lib/game/replay/golden/types';
import { goldenPlayer } from './helpers/goldenMirage';

describe('Mirage golden economy', () => {
  it('collects a better rifle and remaining grenades only while crossing a body', () => {
    const ct = goldenPlayer({
      id: 'ct',
      side: 'CT',
      primary: 'm4a1',
      grenades: { smoke: 1, flash: 1 },
      x: 400,
      y: 500
    });
    const t = goldenPlayer({ id: 't', side: 'T', primary: 'p250', x: 400, y: 500 });
    const items = dropGoldenInventory(ct, { x: 400, y: 500 });

    const pickups = collectGoldenGroundItems(t, [t], items);

    expect(t.inventory.primary).toBe('m4a1');
    expect(t.inventory.grenades.smoke).toBe(1);
    expect(t.inventory.grenades.flash).toBe(1);
    expect(pickups.map((pickup) => pickup.kind).sort()).toEqual(['grenade', 'grenade', 'weapon']);
  });

  it('does not collect an item from a distant body', () => {
    const t = goldenPlayer({ id: 't', side: 'T', primary: 'p250', x: 100, y: 100 });
    const items: GoldenGroundItem[] = [{
      id: 'enemy-awp',
      kind: 'weapon',
      weapon: 'awp',
      x: 300,
      y: 300,
      sourcePlayerId: 'ct'
    }];

    expect(collectGoldenGroundItems(t, [t], items)).toEqual([]);
    expect(t.inventory.primary).toBe('p250');
    expect(items).toHaveLength(1);
  });

  it('carries an enemy AWP and gives it to the team AWPer next round', () => {
    const carrier = goldenPlayer({
      id: 'rifler',
      selectedRole: 'rifler',
      primary: 'ak47',
      x: 300,
      y: 300
    });
    const awper = goldenPlayer({
      id: 'awper',
      selectedRole: 'awper',
      primary: 'p250',
      x: 310,
      y: 300
    });
    const items: GoldenGroundItem[] = [{
      id: 'enemy-awp',
      kind: 'weapon',
      weapon: 'awp',
      x: 300,
      y: 300,
      sourcePlayerId: 'ct'
    }];

    collectGoldenGroundItems(carrier, [carrier, awper], items);
    expect(carrier.inventory.primary).toBe('awp');

    const deliveries = deliverSavedWeapons([carrier, awper]);

    expect(deliveries).toEqual([{
      fromPlayerId: 'rifler',
      toPlayerId: 'awper',
      weapon: 'awp'
    }]);
    expect(awper.inventory.primary).toBe('awp');
    expect(carrier.inventory.primary).toBe('p250');
  });

  it('makes the IGL buy a needed rifle before upgrading their own weapon', () => {
    const entry = goldenPlayer({
      id: 'entry',
      selectedRole: 'entry',
      money: 300,
      primary: 'p250'
    });
    const igl = goldenPlayer({
      id: 'igl',
      selectedRole: 'igl',
      money: 3_600,
      primary: 'p250'
    });

    const summary = prepareGoldenRoundEconomy(
      [entry, igl],
      { side: 'T', plan: 'full', pistolRound: false },
      () => 0.5
    );

    expect(summary.deliveries).toContainEqual({
      fromPlayerId: 'igl',
      toPlayerId: 'entry',
      weapon: 'ak47'
    });
    expect(entry.inventory.primary).toBe('ak47');
    expect(igl.inventory.primary).toBe('p250');
    expect(igl.money).toBe(900);
  });

  it('charges players for utility and lets picked grenades feed real throws', () => {
    const tactical = goldenPlayer({
      id: 'support',
      selectedRole: 'support',
      style: 'tactical',
      money: 2_000,
      primary: 'ak47',
      grenades: { smoke: 0 }
    });

    prepareGoldenRoundEconomy(
      [tactical],
      { side: 'T', plan: 'full', pistolRound: false },
      () => 0.5
    );

    expect(tactical.inventory.grenades).toEqual({ he: 1, flash: 2, smoke: 1, molotov: 1 });
    expect(tactical.money).toBe(600);
    expect(consumeGoldenGrenade(tactical, 'smoke')).toBe(true);
    expect(tactical.inventory.grenades.smoke).toBe(0);

    const pickedSmoke: GoldenGroundItem[] = [{
      id: 'picked-smoke',
      kind: 'grenade',
      grenade: 'smoke',
      x: tactical.x,
      y: tactical.y,
      sourcePlayerId: 'enemy'
    }];
    collectGoldenGroundItems(tactical, [tactical], pickedSmoke);

    expect(consumeGoldenGrenade(tactical, 'smoke')).toBe(true);
    expect(tactical.inventory.grenades.smoke).toBe(0);
  });
});
