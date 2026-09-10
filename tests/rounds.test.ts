import { describe, expect, it } from 'vitest';
import {
  applyDecision,
  autoDecide,
  createMapState,
  getConsecutiveLosses,
  getCurrentSideA,
  getTimeoutsRemaining,
  timeoutBonus,
  timeoutTiming,
  TIMEOUT_BONUS_BY_MODE,
  isMapFinished,
  pendingDecision,
  playMapToEnd,
  playNextRound,
  requestTimeout,
  toMapResult,
  flipRoundDetail,
  MapDecisionError
} from '../src/lib/game/rounds';
import { getHighlightLabel, getRoundFlash, getVisibleRoundTag, highlightTag } from '../src/lib/game/roundPresentation';
import { getTeamPlayers, players, teams } from '../src/lib/game/data';
import { currentLossStreak } from '../src/lib/game/online-automation';
import { calculateHistoricalTeamPower, createSeededRng, simulateMap } from '../src/lib/game/simulation';
import type { CombatTeam, RoundDetail, RoundHighlight, TeamSide } from '../src/lib/game/types';

const team = (id: string, power: number, style: CombatTeam['style'] = 'balanced'): CombatTeam => ({
  id, name: id, power, mental: 85, clutch: 85, experience: 85, consistency: 85, style
});

const playRounds = (count: number, seed = 'rounds') => {
  const state = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng(seed), mapId: 'mirage', controllers: { a: 'human', b: 'bot' } });
  for (let index = 0; index < count && !isMapFinished(state); index += 1) {
    if (pendingDecision(state)) autoDecide(state);
    playNextRound(state);
  }
  return state;
};

describe('round engine', () => {
  it('asks the side picker for a side before the first round and applies it to the map', () => {
    const state = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng('side'), mapId: 'nuke', sidePickerTeamId: 'b', controllers: { a: 'bot', b: 'human' } });
    expect(pendingDecision(state)).toEqual({ type: 'side', teamId: 'b', side: 'b' });
    expect(() => playNextRound(state)).toThrow(MapDecisionError);
    applyDecision(state, { type: 'side', side: 'ct' });
    expect(pendingDecision(state)).toBeNull();
    expect(getCurrentSideA(state)).toBe('t');
    playNextRound(state);
    const result = toMapResult(state);
    expect(result.aStartsCt).toBe(false);
    expect(result.sidePickerId).toBe('b');
    expect(result.decisions).toEqual([{ kind: 'side', teamId: 'b', mapIndex: 0, side: 'ct', auto: false }]);
    expect(result.winnerId).toBe('');
  });

  it('flips a coin for the side when nobody picks and never asks bots anything', () => {
    const state = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng('coin') });
    expect(pendingDecision(state)).toBeNull();
    const result = playMapToEnd(state);
    expect(typeof result.aStartsCt).toBe('boolean');
    expect(result.details!.every((round) => round.tags !== undefined)).toBe(true);
    expect(result.details!.filter((round) => round.tags.includes('pistol'))).toHaveLength(2);
  });

  it('lets the human pistol loser call force or eco and applies it to the next buy', () => {
    for (const seed of ['eco-1', 'eco-2', 'eco-3', 'eco-4']) {
      const state = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng(seed), controllers: { a: 'human', b: 'human' } });
      const pistol = playNextRound(state);
      const loser = pistol.winner === 'a' ? 'b' : 'a';
      const pending = pendingDecision(state);
      expect(pending).toMatchObject({ type: 'eco-call', teamId: loser, side: loser, roundNumber: 2 });
      expect(() => applyDecision(state, { type: 'side', side: 'ct' })).toThrow(MapDecisionError);
      applyDecision(state, { type: 'eco-call', call: 'force' });
      const second = playNextRound(state);
      expect(second.economy[loser].buy).toBe('force');
      expect(second.economy[pistol.winner].buy).not.toBe('pistol');
    }
    const saver = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng('eco-save'), controllers: { a: 'human', b: 'human' } });
    const pistol = playNextRound(saver);
    const loser = pistol.winner === 'a' ? 'b' : 'a';
    applyDecision(saver, { type: 'eco-call', call: 'eco' });
    expect(playNextRound(saver).economy[loser].buy).toBe('eco');
  });

  it('allows one tactical timeout per half and marks the round it precedes', () => {
    const state = playRounds(3, 'timeout');
    expect(getTimeoutsRemaining(state, 'a')).toBe(1);
    expect(requestTimeout(state, 'a')).toBe(true);
    expect(getTimeoutsRemaining(state, 'a')).toBe(0);
    expect(requestTimeout(state, 'a')).toBe(false);
    if (pendingDecision(state)) autoDecide(state);
    const round = playNextRound(state);
    expect(round.timeout).toBe('a');
    expect(round.timeoutTiming).toMatch(/^(window|early|late)$/);
    expect(state.decisions.find((decision) => decision.kind === 'timeout')).toMatchObject({ timing: round.timeoutTiming });
    expect(state.decisions.filter((decision) => decision.kind === 'timeout' && decision.teamId === 'a')).toHaveLength(1);
    // The second half hands the timeout back.
    while (state.rounds.length < 12 && !isMapFinished(state)) {
      if (pendingDecision(state)) autoDecide(state);
      playNextRound(state);
    }
    expect(state.details.at(-1)?.tags).toContain('half-end');
    if (pendingDecision(state)) autoDecide(state);
    playNextRound(state);
    expect(getTimeoutsRemaining(state, 'a')).toBe(1);
  });

  it('weighs the tactical timeout by queue and by how well it is timed', () => {
    expect(timeoutTiming(0)).toBe('early');
    expect(timeoutTiming(1)).toBe('early');
    expect(timeoutTiming(2)).toBe('window');
    expect(timeoutTiming(4)).toBe('window');
    expect(timeoutTiming(5)).toBe('late');
    expect(timeoutBonus('premier', 'window')).toBeCloseTo(0.03);
    expect(timeoutBonus('faceit', 'window')).toBeCloseTo(0.03);
    expect(timeoutBonus('pro', 'window')).toBeCloseTo(0.08);
    expect(timeoutBonus('fun', 'window')).toBeCloseTo(0.1);
    expect(timeoutBonus('max_fun', 'early')).toBeCloseTo(0.1 / 3);
    expect(timeoutBonus('pro', 'late')).toBeCloseTo(0.08 / 3);
    // The armed bonus is a pure function of the state: a pause called during a two-loss streak lands in the window.
    for (const mode of ['premier', 'pro', 'fun'] as const) {
      const state = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng('timing'), mapId: 'mirage', mode, controllers: { a: 'human', b: 'bot' } });
      while (!isMapFinished(state) && getConsecutiveLosses(state, 'a') < 2) {
        if (pendingDecision(state)) autoDecide(state);
        playNextRound(state);
      }
      expect(requestTimeout(state, 'a')).toBe(true);
      expect(state.pendingTimeoutTiming).toBe('window');
      expect(state.pendingTimeoutBonus).toBeCloseTo(TIMEOUT_BONUS_BY_MODE[mode]);
    }
  });

  it('counts straight losses per half exactly like the client-side automation does', () => {
    const state = createMapState(team('a', 90), team('b', 90), { rng: createSeededRng('streaks'), mapId: 'inferno' });
    while (!isMapFinished(state)) {
      if (pendingDecision(state)) autoDecide(state);
      playNextRound(state);
      for (const side of ['a', 'b'] as TeamSide[]) expect(getConsecutiveLosses(state, side)).toBe(currentLossStreak(state.details, side));
    }
  });

  it('is deterministic for the same seed and decisions, and diverges with different decisions', () => {
    const run = (side: 'ct' | 't') => {
      const state = createMapState(team('a', 92), team('b', 90), { rng: createSeededRng('det'), mapId: 'inferno', sidePickerTeamId: 'a', controllers: { a: 'human', b: 'bot' } });
      applyDecision(state, { type: 'side', side });
      return playMapToEnd(state);
    };
    expect(run('ct')).toEqual(run('ct'));
    expect(run('ct').rounds).not.toEqual(run('t').rounds);
    // A pause called at the same round in both runs keeps them identical: the bonus draws no extra random numbers.
    const paused = () => {
      const state = createMapState(team('a', 92), team('b', 90), { rng: createSeededRng('det-pause'), mapId: 'inferno', mode: 'pro', controllers: { a: 'human', b: 'bot' } });
      for (let index = 0; index < 5; index += 1) { if (pendingDecision(state)) autoDecide(state); playNextRound(state); }
      requestTimeout(state, 'a');
      return playMapToEnd(state);
    };
    expect(paused()).toEqual(paused());
  });

  it('produces valid MR12 maps with halves, overtime blocks and comeback flags', () => {
    let comebacks = 0;
    let overtimes = 0;
    for (let index = 0; index < 300; index += 1) {
      const map = simulateMap(team('a', 90), team('b', 90), createSeededRng(`valid-${index}`), 1, { mapId: 'dust2' });
      expect(Math.max(map.scoreA, map.scoreB)).toBeGreaterThanOrEqual(13);
      expect(map.scoreA).not.toBe(map.scoreB);
      expect(map.rounds.at(-1)).toMatchObject({ a: map.scoreA, b: map.scoreB });
      expect(map.halves![0]).toEqual(expect.objectContaining({}));
      expect(map.halves![0].a + map.halves![0].b).toBe(12);
      const halfSum = map.halves!.reduce((sum, half) => sum + half.a + half.b, 0);
      expect(halfSum).toBe(map.rounds.length);
      if (map.overtime) {
        overtimes += 1;
        expect(map.rounds.length).toBeGreaterThan(24);
        expect(Math.abs(map.scoreA - map.scoreB)).toBeGreaterThanOrEqual(1);
      } else {
        expect(map.rounds.length).toBeLessThanOrEqual(24);
      }
      if (map.comeback) {
        comebacks += 1;
        const winner = map.comeback;
        const trailedBy = Math.max(...map.rounds.map((round) => (winner === 'a' ? round.b - round.a : round.a - round.b)));
        const firstHalfLoss = winner === 'a' ? map.halves![0].b - map.halves![0].a : map.halves![0].a - map.halves![0].b;
        expect(Math.max(trailedBy, firstHalfLoss)).toBeGreaterThanOrEqual(4);
        expect(map.winnerId).toBe(winner);
      }
    }
    expect(comebacks).toBeGreaterThan(5);
    expect(overtimes).toBeGreaterThan(5);
  });

  it('keeps the pistol close to even, favours the pistol winner in round two and resets round three', () => {
    const N = 1500;
    let pistolFavourite = 0;
    let secondToPistolWinner = 0;
    let thirdToPistolWinner = 0;
    let thirdRounds = 0;
    for (let index = 0; index < N; index += 1) {
      const details = simulateMap(team('a', 93), team('b', 90), createSeededRng(`pistol-${index}`), 1).details!;
      if (details[0].winner === 'a') pistolFavourite += 1;
      if (details[1].winner === details[0].winner) secondToPistolWinner += 1;
      if (details[2]) {
        thirdRounds += 1;
        if (details[2].winner === details[0].winner) thirdToPistolWinner += 1;
      }
    }
    expect(pistolFavourite / N).toBeGreaterThan(0.46);
    expect(pistolFavourite / N).toBeLessThan(0.6);
    expect(secondToPistolWinner / N).toBeGreaterThanOrEqual(0.65);
    expect(thirdToPistolWinner / thirdRounds).toBeGreaterThan(0.42);
    expect(thirdToPistolWinner / thirdRounds).toBeLessThan(0.58);
  });

  it('gives full buys a real edge over ecos', () => {
    let fullVsEco = 0;
    let fullWins = 0;
    for (let index = 0; index < 400; index += 1) {
      for (const round of simulateMap(team('a', 90), team('b', 90), createSeededRng(`buy-${index}`), 1).details!) {
        const buys = [round.economy.a.buy, round.economy.b.buy];
        if (buys.includes('full') && buys.includes('eco')) {
          fullVsEco += 1;
          if (round.economy[round.winner].buy === 'full') fullWins += 1;
        }
      }
    }
    expect(fullVsEco).toBeGreaterThan(100);
    expect(fullWins / fullVsEco).toBeGreaterThanOrEqual(0.72);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Kill realism and highlights: measured over thousands of rounds with real rosters.
// ---------------------------------------------------------------------------------------------------------------------

const BUY_RANK = { eco: 0, pistol: 1, force: 1, full: 2 } as const;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const loserOf = (round: RoundDetail): TeamSide => (round.winner === 'a' ? 'b' : 'a');
const buyGap = (round: RoundDetail) => BUY_RANK[round.economy[round.winner].buy] - BUY_RANK[round.economy[loserOf(round)].buy];
const killsPerPlayer = (round: RoundDetail) => {
  const counts = new Map<string, number>();
  for (const kill of round.kills) counts.set(kill.killerId, (counts.get(kill.killerId) ?? 0) + 1);
  return counts;
};
const bestMultiKill = (round: RoundDetail) => Math.max(0, ...killsPerPlayer(round).values());

/** Rounds of `maps` maps between real historical rosters (≈ 20 rounds per map). */
const rosterRounds = (maps: number, seed = 'realism'): RoundDetail[] => {
  const pool = teams.slice(0, 12);
  const details: RoundDetail[] = [];
  for (let index = 0; index < maps; index += 1) {
    const teamA = pool[index % pool.length];
    const teamB = pool[(index * 7 + 3) % pool.length];
    if (teamA.id === teamB.id) continue;
    const map = simulateMap(calculateHistoricalTeamPower(teamA, players), calculateHistoricalTeamPower(teamB, players), createSeededRng(`${seed}-${index}`), 1, {
      rosterA: { players: getTeamPlayers(teamA) },
      rosterB: { players: getTeamPlayers(teamB) }
    });
    details.push(...(map.details ?? []));
  }
  return details;
};

describe('kill realism', () => {
  const rounds = rosterRounds(400);
  const gunRounds = rounds.filter((round) => !round.tags.includes('pistol'));

  it('lands around seven or eight kills per round with most rounds ending in a wipe', () => {
    expect(rounds.length).toBeGreaterThan(6000);
    const total = mean(rounds.map((round) => round.kills.length));
    expect(total).toBeGreaterThanOrEqual(6.5);
    expect(total).toBeLessThanOrEqual(8);
    const eliminations = rounds.filter((round) => round.ending === 'elimination').length / rounds.length;
    expect(eliminations).toBeGreaterThanOrEqual(0.55);
    expect(eliminations).toBeLessThanOrEqual(0.72);
  });

  it('gives the winner five kills on a wipe and mostly three to five when the bomb or the clock decides', () => {
    const decided = rounds.filter((round) => round.ending !== 'elimination');
    const winnerKills = decided.map((round) => round.kills.filter((kill) => kill.killerSide === round.winner).length);
    expect(winnerKills.every((kills) => kills >= 1)).toBe(true);
    expect(winnerKills.filter((kills) => kills >= 3).length / winnerKills.length).toBeGreaterThanOrEqual(0.8);
    expect(rounds.filter((round) => round.ending === 'elimination').every((round) => round.kills.filter((kill) => kill.killerSide === round.winner).length === 5)).toBe(true);
    // The clock only runs out while the losing side still stands: never five kills on a time ending.
    expect(rounds.filter((round) => round.ending === 'time').every((round) => round.kills.filter((kill) => kill.killerSide === round.winner).length <= 4)).toBe(true);
  });

  it('scales the loser kills with the buy gap: even buys trade, full buys wipe ecos', () => {
    const loserKills = (gap: number) => gunRounds.filter((round) => buyGap(round) === gap).map((round) => round.kills.filter((kill) => kill.killerSide !== round.winner).length);
    const even = loserKills(0);
    const oneDown = loserKills(1);
    const twoDown = loserKills(2);
    expect(even.length).toBeGreaterThan(1500);
    expect(oneDown.length).toBeGreaterThan(800);
    expect(twoDown.length).toBeGreaterThan(300);
    expect(mean(even)).toBeGreaterThanOrEqual(2.55);
    expect(mean(even)).toBeLessThanOrEqual(3.05);
    expect(even.filter((kills) => kills >= 2 && kills <= 4).length / even.length).toBeGreaterThanOrEqual(0.85);
    expect(mean(oneDown)).toBeGreaterThanOrEqual(1.55);
    expect(mean(oneDown)).toBeLessThanOrEqual(2.05);
    expect(mean(twoDown)).toBeGreaterThanOrEqual(0.55);
    expect(mean(twoDown)).toBeLessThanOrEqual(1.05);
    expect(twoDown.filter((kills) => kills <= 1).length / twoDown.length).toBeGreaterThanOrEqual(0.7);
    expect(twoDown.filter((kills) => kills >= 3).length / twoDown.length).toBeLessThanOrEqual(0.1);
    expect(rounds.every((round) => round.kills.filter((kill) => kill.killerSide !== round.winner).length <= 4)).toBe(true);
  });

  it('lets a lower buy win against a full buy, and then it still frags three to five', () => {
    const upsets = gunRounds.filter((round) => buyGap(round) < 0);
    expect(upsets.length).toBeGreaterThan(300);
    const winnerKills = upsets.map((round) => round.kills.filter((kill) => kill.killerSide === round.winner).length);
    expect(winnerKills.filter((kills) => kills >= 3).length / winnerKills.length).toBeGreaterThanOrEqual(0.8);
    const loserKills = upsets.map((round) => round.kills.filter((kill) => kill.killerSide !== round.winner).length);
    expect(mean(loserKills)).toBeGreaterThanOrEqual(2.5);
  });

  it('keeps ecos and forces as real but rare upsets against a full buy for equal teams', () => {
    // BUY_EDGE retune: eco vs full ≈ 10–15% and force vs full ≈ 30–38% (was ≈ 22% / 30% before the kill retune).
    const details: RoundDetail[] = [];
    for (let index = 0; index < 500; index += 1) details.push(...simulateMap(team('a', 90), team('b', 90), createSeededRng(`edge-${index}`), 1, { mapId: 'dust2' }).details!);
    const share = (low: 'eco' | 'force', high: 'full') => {
      const matchups = details.filter((round) => !round.tags.includes('pistol') && [round.economy.a.buy, round.economy.b.buy].sort().join('/') === `${high}/${low}`.split('/').sort().join('/'));
      expect(matchups.length).toBeGreaterThan(300);
      return matchups.filter((round) => round.economy[round.winner].buy === low).length / matchups.length;
    };
    const ecoVsFull = share('eco', 'full');
    expect(ecoVsFull).toBeGreaterThanOrEqual(0.09);
    expect(ecoVsFull).toBeLessThanOrEqual(0.17);
    const forceVsFull = share('force', 'full');
    expect(forceVsFull).toBeGreaterThanOrEqual(0.28);
    expect(forceVsFull).toBeLessThanOrEqual(0.39);
  });
});

describe('round highlights', () => {
  const rounds = rosterRounds(400, 'highlights');

  it('produces aces, 4ks and 3ks at plausible frequencies and tags them', () => {
    expect(rounds.length).toBeGreaterThanOrEqual(3000);
    const count = (kills: number) => rounds.filter((round) => bestMultiKill(round) === kills).length / rounds.length;
    const aces = rounds.filter((round) => bestMultiKill(round) >= 5).length / rounds.length;
    // Real pro play: an ace about every 400-500 rounds, a 4K in ~1-3% of the rounds, a 3K in roughly one round in five.
    expect(aces).toBeGreaterThanOrEqual(0.0008);
    expect(aces).toBeLessThanOrEqual(0.006);
    expect(count(4)).toBeGreaterThanOrEqual(0.01);
    expect(count(4)).toBeLessThanOrEqual(0.045);
    expect(count(3)).toBeGreaterThanOrEqual(0.1);
    expect(count(3)).toBeLessThanOrEqual(0.3);
    for (const round of rounds) {
      const best = bestMultiKill(round);
      expect(round.tags.includes('ace')).toBe(best >= 5);
      expect(round.tags.includes('4k')).toBe(best === 4);
      expect(round.tags.includes('3k')).toBe(best === 3);
    }
  });

  it('keeps the highlight consistent with the kills and the clutch rule', () => {
    const rank = (highlight: RoundHighlight) => (highlight.kind === 'ace' ? 5 : highlight.kind === 'clutch' ? ((highlight.against ?? 0) >= 3 ? 4 : 2) : highlight.kind === 'quad' ? 3 : 1);
    let clutches = 0;
    for (const round of rounds) {
      const perPlayer = killsPerPlayer(round);
      const highlight = round.highlight;
      if (round.tags.includes('clutch')) {
        clutches += 1;
        expect(highlight).toBeDefined();
      }
      if (!highlight) {
        expect(bestMultiKill(round)).toBeLessThan(3);
        expect(round.tags).not.toContain('clutch');
        continue;
      }
      expect(perPlayer.get(highlight.playerId)).toBeGreaterThanOrEqual(1);
      if (highlight.kind === 'clutch') {
        expect(highlight.side).toBe(round.winner);
        expect(highlight.against).toBeGreaterThanOrEqual(2);
        expect(round.tags).toContain('clutch');
        // Once the winner is down to its last player every remaining kill belongs to that player.
        const lastDeath = round.kills.map((kill) => kill.killerSide).lastIndexOf(loserOf(round));
        const after = round.kills.slice(lastDeath + 1);
        expect(after.length).toBe(highlight.kills);
        expect(after.every((kill) => kill.killerId === highlight.playerId && kill.killerSide === round.winner)).toBe(true);
      } else {
        expect(perPlayer.get(highlight.playerId)).toBe(highlight.kills);
        expect(highlight.kind).toBe(highlight.kills >= 5 ? 'ace' : highlight.kills === 4 ? 'quad' : 'triple');
        expect(highlight.kills).toBe(bestMultiKill(round));
      }
      // Priority: ace > 1v3+ clutch > 4k > 1v2 clutch > 3k; the winner's feat first on ties.
      const alternatives: RoundHighlight[] = [...perPlayer.entries()]
        .filter(([, kills]) => kills >= 3)
        .map(([playerId, kills]) => ({ kind: kills >= 5 ? 'ace' : kills === 4 ? 'quad' : 'triple', playerId, playerName: '', side: round.kills.find((kill) => kill.killerId === playerId)!.killerSide, kills }));
      for (const alternative of alternatives) {
        expect(rank(highlight)).toBeGreaterThanOrEqual(rank(alternative));
        if (rank(highlight) === rank(alternative) && highlight.playerId !== alternative.playerId && alternative.side === round.winner) expect(highlight.side).toBe(round.winner);
      }
    }
    expect(clutches / rounds.length).toBeGreaterThan(0.03);
    expect(clutches / rounds.length).toBeLessThan(0.14);
    expect(rounds.some((round) => round.highlight?.kind === 'clutch' && (round.highlight.against ?? 0) >= 3)).toBe(true);
    expect(rounds.some((round) => round.highlight?.kind === 'ace')).toBe(true);
  });

  it('is deterministic, including the highlights', () => {
    const first = rosterRounds(20, 'det-highlight');
    const second = rosterRounds(20, 'det-highlight');
    expect(second).toEqual(first);
    expect(first.some((round) => round.highlight)).toBe(true);
  });

  it('mirrors the highlight side when a round detail is flipped', () => {
    const round = rounds.find((detail) => detail.highlight)!;
    const flipped = flipRoundDetail(round);
    expect(flipped.highlight).toEqual({ ...round.highlight, side: round.highlight!.side === 'a' ? 'b' : 'a' });
    expect(flipRoundDetail(flipped)).toEqual(round);
    const plain = rounds.find((detail) => !detail.highlight)!;
    expect('highlight' in flipRoundDetail(plain)).toBe(false);
  });

  it('labels highlights and picks what to flash for a round', () => {
    const ace: RoundHighlight = { kind: 'ace', playerId: 's1mple', playerName: 's1mple', side: 'a', kills: 5 };
    const clutch: RoundHighlight = { kind: 'clutch', playerId: 'niko', playerName: 'NiKo', side: 'b', kills: 2, against: 3 };
    expect(getHighlightLabel('pt-BR', ace)).toEqual({ title: 'ACE', subtitle: 's1mple · 5 kills' });
    expect(getHighlightLabel('en', clutch)).toEqual({ title: 'CLUTCH 1v3', subtitle: 'NiKo' });
    expect(getHighlightLabel('es', { ...ace, kind: 'quad', kills: 4 }).title).toBe('4K');
    expect(getHighlightLabel('es', { ...ace, kind: 'triple', kills: 3 }).title).toBe('3K');
    expect(getRoundFlash('pt-BR', { winner: 'a', tags: ['ace', 'eco-win'], highlight: ace })).toMatchObject({ kind: 'ace', title: 'ACE', side: 'a' });
    expect(getRoundFlash('en', { winner: 'b', tags: ['clutch'], highlight: clutch })).toMatchObject({ kind: 'clutch', title: 'CLUTCH 1v3', subtitle: 'NiKo', side: 'b' });
    // Round-level turnarounds beat a 3k, and flash even without an individual feat.
    expect(getRoundFlash('pt-BR', { winner: 'b', tags: ['3k', 'eco-win'], highlight: { ...ace, kind: 'triple', kills: 3 } })).toMatchObject({ kind: 'eco-win', title: 'ECO VENCEU', side: 'b' });
    expect(getRoundFlash('es', { winner: 'a', tags: ['force-win'] })).toMatchObject({ kind: 'force-win', title: 'GANÓ EL FORZADO', side: 'a' });
    expect(getRoundFlash('en', { winner: 'b', tags: ['comeback-alert', 'streak-break'] })).toMatchObject({ kind: 'comeback', title: 'FIGHTING BACK', side: 'b' });
    expect(getRoundFlash('en', { winner: 'a', tags: ['3k', 'streak-break'], highlight: { ...ace, kind: 'triple', kills: 3 } })).toMatchObject({ kind: 'triple', title: '3K', side: 'a' });
    expect(getRoundFlash('pt-BR', { winner: 'b', tags: ['streak-break'] })).toMatchObject({ kind: 'streak-break', title: 'QUEBROU A SÉRIE', side: 'b' });
    expect(getRoundFlash('pt-BR', { winner: 'a', tags: ['pistol', 'anti-eco', 'match-point'] })).toBeNull();
    expect(highlightTag({ tags: ['pistol', '3k', 'eco-win', 'clutch'] })).toBe('clutch');
    expect(highlightTag({ tags: ['4k', 'eco-win', 'ace'] })).toBe('ace');
    expect(highlightTag({ tags: ['streak-break', '3k'] })).toBe('3k');
  });

  it('does not reveal result-dependent tags while the round is still in progress', () => {
    const detail = {
      tags: ['pistol', 'anti-eco', 'match-point', '3k'] as RoundDetail['tags']
    };
    expect(getVisibleRoundTag(detail, false)).toBe('pistol');
    expect(getVisibleRoundTag({ tags: ['anti-eco', 'match-point', '3k'] }, false)).toBeNull();
    expect(getVisibleRoundTag(detail, true)).toBe('3k');
  });
});
