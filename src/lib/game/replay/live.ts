import type { ReplayPlaybackSpeed } from './types';

interface ReplayRoundDuration {
  durationMs: number;
}

const BASE_PLAYBACK_WINDOW_MS: Record<Exclude<ReplayPlaybackSpeed, 'ultra'>, number> = {
  normal: 8_000,
  fast: 3_000
};
const ARRIVAL_SAMPLE_LIMIT = 6;

export function getReplayPlaybackWindowMs(
  speed: ReplayPlaybackSpeed,
  meanArrivalIntervalMs: number | null,
  pendingRounds: number
): number {
  if (speed === 'ultra') return 0;
  const meanInterval = meanArrivalIntervalMs !== null && meanArrivalIntervalMs > 0
    ? meanArrivalIntervalMs
    : null;
  const adaptiveBase = meanInterval === null
    ? BASE_PLAYBACK_WINDOW_MS[speed]
    : Math.min(BASE_PLAYBACK_WINDOW_MS[speed], meanInterval);
  if (speed === 'fast' || pendingRounds <= 2) return adaptiveBase;
  const adaptiveFastMinimum = meanInterval === null
    ? BASE_PLAYBACK_WINDOW_MS.fast
    : Math.min(BASE_PLAYBACK_WINDOW_MS.fast, meanInterval);
  return Math.max(adaptiveFastMinimum, adaptiveBase * (2 / pendingRounds));
}

export interface ReplayQueueAdvance {
  roundNumber: number;
  pendingBefore: number;
  skippedRounds: number[];
}

export class ReplayLiveQueue {
  currentRound = 0;
  pendingRounds: number[] = [];
  private receivedRounds = 0;
  private lastArrivalAtMs: number | null = null;
  private arrivalIntervalsMs: number[] = [];
  private currentRoundEndRendered = false;

  get meanArrivalIntervalMs(): number | null {
    if (!this.arrivalIntervalsMs.length) return null;
    return this.arrivalIntervalsMs.reduce((total, interval) => total + interval, 0)
      / this.arrivalIntervalsMs.length;
  }

  receive(visibleRounds: number, atMs: number) {
    const nextReceivedRounds = Math.max(0, Math.floor(visibleRounds));
    if (nextReceivedRounds < this.receivedRounds) {
      this.resetToLatest(nextReceivedRounds, atMs);
      return;
    }
    if (nextReceivedRounds === this.receivedRounds) return;

    const addedRounds = nextReceivedRounds - this.receivedRounds;
    if (this.lastArrivalAtMs !== null && this.receivedRounds > 0) {
      const interval = Math.max(1, atMs - this.lastArrivalAtMs) / addedRounds;
      for (let index = 0; index < addedRounds; index += 1) this.arrivalIntervalsMs.push(interval);
      if (this.arrivalIntervalsMs.length > ARRIVAL_SAMPLE_LIMIT) {
        this.arrivalIntervalsMs.splice(0, this.arrivalIntervalsMs.length - ARRIVAL_SAMPLE_LIMIT);
      }
    }
    this.lastArrivalAtMs = atMs;

    if (this.currentRound === 0) {
      this.currentRound = nextReceivedRounds;
      this.currentRoundEndRendered = false;
    } else {
      for (let round = this.receivedRounds + 1; round <= nextReceivedRounds; round += 1) {
        if (round > this.currentRound && !this.pendingRounds.includes(round)) this.pendingRounds.push(round);
      }
    }
    this.receivedRounds = nextReceivedRounds;
  }

  markRoundEndRendered(roundNumber: number, rendered: boolean) {
    if (!rendered || roundNumber !== this.currentRound) {
      throw new Error(`round-end must be rendered before leaving round ${this.currentRound}`);
    }
    this.currentRoundEndRendered = true;
  }

  advanceBetweenRounds(): ReplayQueueAdvance | null {
    if (!this.currentRoundEndRendered || !this.pendingRounds.length) return null;
    const pendingBefore = this.pendingRounds.length;
    const skippedRounds = pendingBefore > 6 ? this.pendingRounds.slice(0, -2) : [];
    if (skippedRounds.length) this.pendingRounds.splice(0, skippedRounds.length);
    const roundNumber = this.pendingRounds.shift();
    if (roundNumber === undefined) return null;
    this.currentRound = roundNumber;
    this.currentRoundEndRendered = false;
    return { roundNumber, pendingBefore, skippedRounds };
  }

  resetToLatest(visibleRounds: number, atMs: number) {
    const latestRound = Math.max(0, Math.floor(visibleRounds));
    this.currentRound = latestRound;
    this.pendingRounds = [];
    this.receivedRounds = latestRound;
    this.lastArrivalAtMs = latestRound > 0 ? atMs : null;
    this.arrivalIntervalsMs = [];
    this.currentRoundEndRendered = false;
  }
}

export function getLatestReplayRoundStartMs(
  rounds: ReplayRoundDuration[],
  visibleRounds: number
): number {
  const latestRoundIndex = Math.max(0, Math.min(rounds.length, Math.floor(visibleRounds)) - 1);
  return rounds.slice(0, latestRoundIndex).reduce((total, round) => total + round.durationMs, 0);
}

export function getReplayRoundStartMs(rounds: ReplayRoundDuration[], roundNumber: number): number {
  const roundIndex = Math.max(0, Math.min(rounds.length, Math.floor(roundNumber)) - 1);
  return rounds.slice(0, roundIndex).reduce((total, round) => total + round.durationMs, 0);
}

export function getReplayRoundAtMs(rounds: ReplayRoundDuration[], atMs: number): number {
  if (!rounds.length) return 0;
  let roundStartAt = 0;
  for (let index = 0; index < rounds.length; index += 1) {
    const roundEndAt = roundStartAt + rounds[index].durationMs;
    if (atMs < roundEndAt) return index + 1;
    roundStartAt = roundEndAt;
  }
  return rounds.length;
}
