import { describe, expect, it } from 'vitest';
import { chooseAutomaticDraftPick, emptyDraftState, scoreDraftCandidate, shouldAutomaticReroll } from '../src/lib/game/online/draft';
import type { Player } from '../src/lib/game/types';

const player = (id: string, overall: number, role = 'rifler'): Player => ({
  id, nickname: id, teamId: 'offer', role, eligibleSlotRoles: [role], overall,
  firepower: overall, entry: overall, clutch: overall, support: overall, consistency: overall, mental: overall
});

describe('automatic draft advisor', () => {
  it('uses strength, composition and personal history without becoming seed-invariant', () => {
    const roster = [player('star', 94, 'awper'), player('solid', 86, 'support'), player('caller', 82, 'igl')];
    const picked = chooseAutomaticDraftPick({ roster, mode: 'premier', state: emptyDraftState(), style: 'balanced', seed: 'draft-a', playerLookup: (id) => roster.find((item) => item.id === id) });
    expect(picked?.player.id).toBe('star');
    const remembered = chooseAutomaticDraftPick({ roster, mode: 'premier', state: emptyDraftState(), style: 'balanced', history: { playerScores: { caller: 4 } }, seed: 'draft-a', playerLookup: (id) => roster.find((item) => item.id === id) });
    expect(remembered?.score).toBeGreaterThan(0);
  });

  it('never reads hidden PRO attributes', () => {
    const weak = player('blind-player', 20, 'awper');
    const strong = { ...weak, overall: 100, firepower: 100, awp: 100, mental: 100 };
    const options = { mode: 'pro' as const, style: 'balanced' as const, lineup: [], seed: 'blind', role: undefined };
    expect(scoreDraftCandidate({ ...options, player: weak })).toBe(scoreDraftCandidate({ ...options, player: strong }));
  });

  it('rerolls only clearly weak offers while respecting the mode limit', () => {
    expect(shouldAutomaticReroll({ bestOfferScore: 40, mode: 'premier', rerollsUsed: 0, pickIndex: 0, seed: 'x' })).toBe(true);
    expect(shouldAutomaticReroll({ bestOfferScore: 90, mode: 'premier', rerollsUsed: 0, pickIndex: 0, seed: 'x' })).toBe(false);
    expect(shouldAutomaticReroll({ bestOfferScore: 10, mode: 'faceit', rerollsUsed: 1, pickIndex: 0, seed: 'x' })).toBe(false);
  });
});
