import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import playersJson from '../src/lib/data/cs/players.game.json';
import {
  buildProRoleEvaluations,
  getProRoleFit,
  PRO_REQUIRED_ROLES,
  PRO_REROLLS_MAX,
  validateProAssignments
} from '../src/lib/game/proMode';
import type { LineupSlotRole, Player } from '../src/lib/game/types';

const players = playersJson as Player[];
const byId = (id: string) => players.find((player) => player.id === id)!;
const pageSource = readFileSync(new URL('../src/routes/+page.svelte', import.meta.url), 'utf8');
const shareRunCardSource = readFileSync(new URL('../src/lib/components/ShareRunCard.svelte', import.meta.url), 'utf8');

describe('PRO mode role fit', () => {
  it('keeps a real AWPer strong as AWPer without mutating the base player', () => {
    const player = byId('m0nesy-2024');
    const baseOverall = player.overall;
    const [evaluation] = buildProRoleEvaluations([player], { [player.id]: 'awper' }, 'balanced');

    expect(getProRoleFit(player, 'awper')).toBe('primary');
    expect(evaluation.fit).toBe('primary');
    expect(evaluation.effectiveOverall).toBeGreaterThanOrEqual(baseOverall ?? 0);
    expect(evaluation.adjustedPlayer).not.toBe(player);
    expect(player.overall).toBe(baseOverall);
  });

  it('punishes an AWPer assigned as IGL as a severe out-of-position pick', () => {
    const player = byId('m0nesy-2024');
    const [evaluation] = buildProRoleEvaluations([player], { [player.id]: 'igl' }, 'aggressive');

    expect(evaluation.fit).toBe('severe');
    expect(evaluation.effectiveOverall).toBeLessThan(75);
    expect(evaluation.adjustedPlayer.igl).toBeLessThanOrEqual(player.igl ?? 70);
    expect(player.role).toContain('awper');
  });

  it('keeps Rifler as a neutral flex assignment without reducing overall', () => {
    const player = byId('zywoo-2024');
    const [evaluation] = buildProRoleEvaluations([player], { [player.id]: 'rifler' }, 'balanced');

    expect(getProRoleFit(player, 'rifler')).toBe('secondary');
    expect(evaluation.fit).toBe('secondary');
    expect(evaluation.primaryRole).toBe('awper');
    expect(evaluation.effectiveOverall).toBe(player.overall ?? 99);
    expect(evaluation.modifier).toBe(1);
    expect(evaluation.eligibleRoles).toContain('rifler');
  });

  it('only lightly reduces an IGL assigned as Support', () => {
    const player = byId('karrigan-2022');
    const [evaluation] = buildProRoleEvaluations([player], { [player.id]: 'support' }, 'tactical');

    expect(getProRoleFit(player, 'support')).toBe('secondary');
    expect(evaluation.primaryRole).toBe('igl');
    expect(evaluation.fit).toBe('secondary');
    expect(evaluation.modifier).toBeCloseTo(0.96, 2);
    expect((player.overall ?? 0) - evaluation.effectiveOverall).toBeLessThanOrEqual(4);
  });

  it('requires five unique PRO position assignments from six classes', () => {
    expect(PRO_REQUIRED_ROLES).toEqual(['igl', 'awper', 'entry', 'lurker', 'support', 'rifler']);
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const complete = validateProAssignments({
      a: 'igl',
      b: 'awper',
      c: 'entry',
      d: 'lurker',
      e: 'support'
    }, ids);
    const duplicate = validateProAssignments({
      a: 'igl',
      b: 'igl',
      c: 'entry',
      d: 'lurker',
      e: 'support'
    } as Record<string, LineupSlotRole>, ids);

    expect(complete.complete).toBe(true);
    expect(duplicate.complete).toBe(false);
    expect(duplicate.hasDuplicate).toBe(true);
    expect(duplicate.missingRoles).toEqual([]);
  });
});

describe('PRO mode page wiring', () => {
  it('exposes PRO as a separate selectable mode', () => {
    expect(PRO_REROLLS_MAX).toBe(1);
    expect(pageSource).toContain("chooseMode('pro')");
    expect(pageSource).toContain("mode-card pro");
    expect(pageSource).toContain("t('proDesc')");
  });

  it('renders name-only PRO draft cards before reveal', () => {
    expect(pageSource).toContain("t('proBlindOfferDesc')");
    expect(pageSource).toContain('pro-blind-card');
    expect(pageSource).toContain('pro-name-only');
    expect(pageSource).toContain('player.nickname');
    expect(pageSource).toContain('confirmProBlindPick');
    expect(pageSource).not.toContain('NO INTEL · NO ROLE · NO OVR');
  });

  it('marks PRO and Ranked result share cards with a red mode flag', () => {
    expect(pageSource).toContain('mode={$game.mode}');
    expect(shareRunCardSource).toContain("mode === 'pro' ? 'PRO MODE'");
    expect(shareRunCardSource).toContain("mode === 'faceit' ? 'RANKED'");
    expect(shareRunCardSource).toContain('mode-flag');
    expect(shareRunCardSource).toContain('background:#c72424');
  });
});
