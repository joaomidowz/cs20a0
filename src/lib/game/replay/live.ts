interface ReplayRoundDuration {
  durationMs: number;
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
  private currentRoundEndRendered = false;

  receive(visibleRounds: number, _atMs: number) {
    const nextReceivedRounds = Math.max(0, Math.floor(visibleRounds));
    if (nextReceivedRounds < this.receivedRounds) {
      this.resetToLatest(nextReceivedRounds, _atMs);
      return;
    }
    if (nextReceivedRounds === this.receivedRounds) return;

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

  resetToLatest(visibleRounds: number, _atMs: number) {
    const latestRound = Math.max(0, Math.floor(visibleRounds));
    this.currentRound = latestRound;
    this.pendingRounds = [];
    this.receivedRounds = latestRound;
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
