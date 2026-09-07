import { describe, expect, it } from 'vitest';
import playersJson from '../src/lib/data/cs/players.game.json';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { buildMajorRun, createSeededRng } from '../src/lib/game/simulation';
import {
  applyOfflineDecision,
  autoOfflineDecision,
  confirmOfflineSeries,
  createOfflineMajor,
  currentOfflineSeries,
  getOfflineDecisionRules,
  getOfflineLiveView,
  isOfflineMajorFinished,
  offlineCompletedSeries,
  pendingOfflineDecision,
  requestOfflineTimeout,
  restoreOfflineMajor,
  skipOfflineMap,
  stepOfflineSeries,
  toMajorRun,
  type OfflineMajorState
} from '../src/lib/game/offlineMajor';
import type { GameMode, HistoricalTeam, Player, SelectedPlayer } from '../src/lib/game/types';

const allPlayers = playersJson as Player[];
const teams = teamsJson as HistoricalTeam[];
const picked = teams.slice(0, 5).map((team) => allPlayers.find((player) => player.teamId === team.id)!).filter(Boolean);
const lineup: SelectedPlayer[] = picked.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const selectedMaps = getDefaultMapSelection(picked, teams);
const args = (seed: string, mode: GameMode, extra: { autopilot?: boolean } = {}) =>
  [picked, 'balanced', teams, allPlayers, seed, lineup, { selectedMaps, mode, ...extra }] as const;

/** Drives the whole Major answering every prompt with `decide`; returns the number of user series played. */
function playToEnd(state: OfflineMajorState, decide: (state: OfflineMajorState) => void, guard = 20_000) {
  let played = 0;
  for (let index = 0; index < guard && !isOfflineMajorFinished(state); index += 1) {
    const live = currentOfflineSeries(state);
    if (!live) throw new Error('No user series while the tournament is unfinished');
    if (live.phase === 'finished') {
      confirmOfflineSeries(state);
      played += 1;
    } else if (pendingOfflineDecision(state)) decide(state);
    else stepOfflineSeries(state);
  }
  return played;
}

/** Resolves setup prompts until the user's first map is live and ready for a tactical timeout. */
function reachLiveMap(state: OfflineMajorState) {
  for (let index = 0; index < 60; index += 1) {
    const pending = pendingOfflineDecision(state);
    if (pending?.kind === 'veto') {
      applyOfflineDecision(state, { kind: 'veto', teamId: state.userId, action: pending.action, mapId: pending.available[0] });
    } else if (pending?.kind === 'side') {
      applyOfflineDecision(state, { kind: 'side', teamId: state.userId, side: 'ct' });
    } else if (pending?.kind === 'eco-call') {
      applyOfflineDecision(state, { kind: 'eco-call', teamId: state.userId, call: 'eco' });
    } else if (getOfflineLiveView(state)?.phase === 'live') {
      return;
    } else {
      stepOfflineSeries(state);
    }
  }
  throw new Error('The first offline map did not become live');
}

const stripAwards = (run: ReturnType<typeof toMajorRun>) => ({ ...run, tournament: run.tournament ? { ...run.tournament, awards: undefined } : undefined });

describe('offline Major decision rules', () => {
  it('gives PRO and Ranked every decision and Normal only the tactical timeout', () => {
    expect(getOfflineDecisionRules('pro')).toEqual({ veto: true, side: true, ecoCall: true, timeout: true });
    expect(getOfflineDecisionRules('faceit')).toEqual({ veto: true, side: true, ecoCall: true, timeout: true });
    expect(getOfflineDecisionRules('premier')).toEqual({ veto: false, side: false, ecoCall: false, timeout: true });
  });

  it('never leaves a veto, side or eco decision pending in Normal but still grants a timeout', () => {
    const state = createOfflineMajor(...args('offline-premier', 'premier'));
    expect(state.rules.veto).toBe(false);
    const live = currentOfflineSeries(state)!;
    expect(live.phase).toBe('intermission');
    expect(live.veto?.steps.at(-1)?.action).toBe('decider');
    let timeoutCalled = false;
    let guard = 0;
    while (getOfflineLiveView(state)?.finished === false && guard < 400) {
      expect(pendingOfflineDecision(state)).toBeNull();
      const view = getOfflineLiveView(state)!;
      if (!timeoutCalled && view.phase === 'live' && view.visibleRounds >= 3) {
        requestOfflineTimeout(state);
        timeoutCalled = true;
        expect(getOfflineLiveView(state)?.timeoutsLeft).toBe(0);
      } else stepOfflineSeries(state);
      guard += 1;
    }
    expect(timeoutCalled).toBe(true);
    const run = toMajorRun(state);
    expect(run.matches[0].decisions?.some((decision) => decision.kind === 'timeout' && decision.teamId === 'user' && !decision.auto)).toBe(true);
    const automaticDecisions = run.matches[0].decisions?.filter((decision) => decision.kind === 'side' || decision.kind === 'eco-call') ?? [];
    expect(automaticDecisions.some((decision) => decision.kind === 'side')).toBe(true);
    expect(automaticDecisions.every((decision) => decision.auto)).toBe(true);
    expect(state.log.series[0].events.some((event) => event.kind === 'timeout')).toBe(true);
  });

  it.each(['premier', 'faceit', 'pro'] as const)('allows the user to call a tactical timeout in %s', (mode) => {
    const state = createOfflineMajor(...args(`offline-timeout-${mode}`, mode));
    reachLiveMap(state);

    expect(getOfflineLiveView(state)?.timeoutsLeft).toBe(1);
    requestOfflineTimeout(state);
    expect(getOfflineLiveView(state)?.timeoutsLeft).toBe(0);
    expect(stepOfflineSeries(state)).toBe('round');

    const timeoutDecisions = toMajorRun(state).matches[0].decisions?.filter((decision) => decision.kind === 'timeout') ?? [];
    expect(timeoutDecisions).toContainEqual(expect.objectContaining({ teamId: 'user', auto: false }));
    expect(state.log.series[0].events).toContainEqual({ kind: 'timeout' });
  });

  it('pauses a PRO run for the veto, the side pick and the eco call of the user', () => {
    const state = createOfflineMajor(...args('offline-pro', 'pro'));
    const first = pendingOfflineDecision(state);
    expect(first).toMatchObject({ kind: 'veto', teamId: 'user', action: 'ban' });
    expect(stepOfflineSeries(state)).toBe('decision');
    const kinds = new Set<string>();
    let guard = 0;
    while (getOfflineLiveView(state)?.finished === false && guard < 600) {
      const pending = pendingOfflineDecision(state);
      if (pending?.kind === 'veto') applyOfflineDecision(state, { kind: 'veto', teamId: 'user', action: pending.action, mapId: pending.available[0] });
      else if (pending?.kind === 'side') applyOfflineDecision(state, { kind: 'side', teamId: 'user', side: 'ct' });
      else if (pending?.kind === 'eco-call') applyOfflineDecision(state, { kind: 'eco-call', teamId: 'user', call: 'force' });
      else stepOfflineSeries(state);
      if (pending) kinds.add(pending.kind);
      guard += 1;
    }
    expect(kinds.has('veto')).toBe(true);
    expect(kinds.has('side')).toBe(true);
    const run = toMajorRun(state);
    expect(run.matches[0].winnerId).toBeTruthy();
    expect(run.matches[0].decisions?.some((decision) => decision.kind === 'veto' && decision.teamId === 'user' && !decision.auto)).toBe(true);
    expect(run.matches[0].decisions?.some((decision) => decision.kind === 'side' && decision.teamId === 'user' && !decision.auto)).toBe(true);
    // The tournament does not move on until the user confirms the result.
    expect(offlineCompletedSeries(state)).toBe(0);
    expect(confirmOfflineSeries(state)).toBe(true);
    expect(offlineCompletedSeries(state)).toBe(1);
    expect(pendingOfflineDecision(state)?.kind).toBe('veto');
    expect(toMajorRun(state).matches).toHaveLength(2);
  });
});

describe('offline Major parity and persistence', () => {
  it('equals buildMajorRun when every decision is left to the bot policies', () => {
    const state = createOfflineMajor(...args('parity-seed', 'faceit', { autopilot: true }));
    playToEnd(state, () => { throw new Error('autopilot never asks'); });
    const batch = buildMajorRun(...args('parity-seed', 'faceit'));
    const incremental = toMajorRun(state);
    expect(stripAwards(incremental)).toEqual(stripAwards(batch));
    expect(incremental.tournament?.awards).toEqual(batch.tournament?.awards);
  });

  it('skips a map with the user in charge and keeps the overview free of unfinished user scores', () => {
    const state = createOfflineMajor(...args('offline-skip', 'faceit'));
    let guard = 0;
    while (pendingOfflineDecision(state)?.kind === 'veto' && guard < 20) {
      const pending = pendingOfflineDecision(state)!;
      if (pending.kind !== 'veto') break;
      applyOfflineDecision(state, { kind: 'veto', teamId: 'user', action: pending.action, mapId: pending.available.at(-1)! });
      guard += 1;
    }
    stepOfflineSeries(state);
    if (pendingOfflineDecision(state)?.kind === 'side') applyOfflineDecision(state, { kind: 'side', teamId: 'user', side: 't' });
    skipOfflineMap(state);
    const run = toMajorRun(state);
    expect(run.matches[0].maps[0].winnerId || pendingOfflineDecision(state)).toBeTruthy();
    expect(run.matches[0].winnerId).toBe('');
    expect(run.stage3.wins + run.stage3.losses).toBe(0);
    expect(run.tournament?.rounds).toHaveLength(1);
    expect(run.tournament?.rounds[0].series.filter((series) => !series.userMatch).every((series) => series.winnerId && series.maps.every((map) => map.details === undefined))).toBe(true);
    expect(run.matches[0].maps.every((map) => Array.isArray(map.details))).toBe(true);
  });

  it('restores an identical engine and pending decision by replaying the log', () => {
    const rng = createSeededRng('replay-choices');
    let decisions = 0;
    const decide = (state: OfflineMajorState) => {
      const pending = pendingOfflineDecision(state)!;
      decisions += 1;
      // Every fourth decision is left to the bot policy, so the log mixes explicit and automatic choices.
      if (decisions % 4 === 0) {
        autoOfflineDecision(state);
        return;
      }
      if (pending.kind === 'veto') applyOfflineDecision(state, { kind: 'veto', teamId: 'user', action: pending.action, mapId: pending.available[Math.floor(rng() * pending.available.length)] });
      else if (pending.kind === 'side') applyOfflineDecision(state, { kind: 'side', teamId: 'user', side: rng() < 0.5 ? 'ct' : 't' });
      else applyOfflineDecision(state, { kind: 'eco-call', teamId: 'user', call: rng() < 0.5 ? 'force' : 'eco' });
    };
    const state = createOfflineMajor(...args('replay-seed', 'pro'));
    // Play two and a half user series with random decisions, timeouts and a skipped map along the way.
    let timeouts = 0;
    let stoppedAt: string | null = null;
    for (let index = 0; index < 5_000; index += 1) {
      const live = currentOfflineSeries(state)!;
      if (offlineCompletedSeries(state) === 2 && getOfflineLiveView(state)!.visibleRounds >= 7 && live.phase === 'live' && !pendingOfflineDecision(state)) {
        stoppedAt = live.config.id;
        break;
      }
      if (live.phase === 'finished') confirmOfflineSeries(state);
      else if (pendingOfflineDecision(state)) decide(state);
      else if (live.phase === 'live' && timeouts < 3 && rng() < 0.05) {
        try { requestOfflineTimeout(state); timeouts += 1; } catch { stepOfflineSeries(state); }
      } else if (offlineCompletedSeries(state) === 1 && rng() < 0.02) skipOfflineMap(state);
      else stepOfflineSeries(state);
    }
    expect(stoppedAt).not.toBeNull();
    expect(timeouts).toBeGreaterThan(0);
    expect(state.log.series.some((entry) => entry.events.some((event) => event.kind === 'auto'))).toBe(true);

    const snapshot = toMajorRun(state);
    const serialised = JSON.parse(JSON.stringify(state.log));
    const restored = restoreOfflineMajor(...args('replay-seed', 'pro'), serialised);
    expect(toMajorRun(restored)).toEqual(snapshot);
    expect(offlineCompletedSeries(restored)).toBe(2);
    expect(currentOfflineSeries(restored)?.config.id).toBe(stoppedAt);
    expect(getOfflineLiveView(restored)).toEqual(getOfflineLiveView(state));
    expect(restored.log).toEqual(state.log);

    // A decision pending at the cut survives the restore too.
    while (!pendingOfflineDecision(state) && getOfflineLiveView(state)?.finished === false) stepOfflineSeries(state);
    const again = restoreOfflineMajor(...args('replay-seed', 'pro'), JSON.parse(JSON.stringify(state.log)));
    expect(pendingOfflineDecision(again)).toEqual(pendingOfflineDecision(state));
    expect(toMajorRun(again)).toEqual(toMajorRun(state));
  });

  it('ignores a log that belongs to another draft instead of crashing', () => {
    const state = createOfflineMajor(...args('other-seed', 'pro'));
    const pending = pendingOfflineDecision(state)!;
    if (pending.kind === 'veto') applyOfflineDecision(state, { kind: 'veto', teamId: 'user', action: pending.action, mapId: pending.available[0] });
    const restored = restoreOfflineMajor(...args('different-seed', 'pro'), state.log);
    expect(restored.log.series).toHaveLength(0);
    expect(pendingOfflineDecision(restored)?.kind).toBe('veto');
  });

  it('carries awards and a champion once the run is over', () => {
    const rng = createSeededRng('awards-run');
    const state = createOfflineMajor(...args('awards-seed', 'faceit'));
    const played = playToEnd(state, (current) => {
      const pending = pendingOfflineDecision(current)!;
      if (pending.kind === 'veto') applyOfflineDecision(current, { kind: 'veto', teamId: 'user', action: pending.action, mapId: pending.available[Math.floor(rng() * pending.available.length)] });
      else if (pending.kind === 'side') applyOfflineDecision(current, { kind: 'side', teamId: 'user', side: 'ct' });
      else applyOfflineDecision(current, { kind: 'eco-call', teamId: 'user', call: 'eco' });
    });
    expect(isOfflineMajorFinished(state)).toBe(true);
    expect(played).toBeGreaterThanOrEqual(3);
    const run = toMajorRun(state);
    expect(run.matches).toHaveLength(played);
    expect(run.matches.every((series) => series.winnerId)).toBe(true);
    expect(run.tournament?.championId).toBeTruthy();
    expect(run.tournament?.awards?.mvp).toBeTruthy();
    expect(run.tournament?.awards?.teams.length).toBeGreaterThan(8);
    expect(run.placement).toMatch(/^placement/);
    expect(offlineCompletedSeries(state)).toBe(played);
    expect(getOfflineLiveView(state)).toBeNull();
    // Kill feeds of the other teams are gone from the snapshot, the user's stay.
    expect(run.tournament?.rounds.flatMap((round) => round.series).filter((series) => !series.userMatch).every((series) => series.maps.every((map) => map.details === undefined))).toBe(true);
    expect(run.matches.every((series) => series.maps.every((map) => map.details?.length === map.rounds.length))).toBe(true);
  });
});
