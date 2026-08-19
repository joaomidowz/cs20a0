import type { ReplayPlaybackSpeed } from '../types';

const SPEED_MULTIPLIER: Record<Exclude<ReplayPlaybackSpeed, 'ultra'>, number> = {
  normal: 1,
  fast: 2.5
};
const ROUND_PLAYBACK_WINDOW_MS: Record<Exclude<ReplayPlaybackSpeed, 'ultra'>, number> = {
  normal: 8_000,
  fast: 3_000
};

export class ReplayClock {
  currentMs = 0;
  playing = false;
  speed: ReplayPlaybackSpeed = 'normal';
  durationMs: number;
  private roundDurations: number[];
  private roundPlaybackWindowMs: number | null = null;

  constructor(durationMs: number, roundDurations: number[] = []) {
    this.durationMs = Math.max(0, durationMs);
    this.roundDurations = roundDurations.map((duration) => Math.max(1, duration));
  }

  play() {
    if (this.speed === 'ultra') {
      this.currentMs = this.durationMs;
      this.playing = false;
      return;
    }
    if (this.currentMs >= this.durationMs) this.currentMs = 0;
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  scrub(atMs: number) {
    this.currentMs = Math.max(0, Math.min(this.durationMs, atMs));
  }

  setDuration(durationMs: number) {
    this.durationMs = Math.max(0, durationMs);
    this.currentMs = Math.min(this.currentMs, this.durationMs);
  }

  setRoundDurations(roundDurations: number[]) {
    this.roundDurations = roundDurations.map((duration) => Math.max(1, duration));
  }

  setRoundPlaybackWindow(windowMs: number | null) {
    this.roundPlaybackWindowMs = windowMs === null ? null : Math.max(1, windowMs);
  }

  setSpeed(speed: ReplayPlaybackSpeed) {
    this.speed = speed;
    if (speed === 'ultra') {
      this.currentMs = this.durationMs;
      this.playing = false;
    }
  }

  advance(deltaMs: number) {
    if (!this.playing || this.speed === 'ultra') return this.currentMs;
    let remainingRealMs = Math.max(0, deltaMs);
    if (!this.roundDurations.length) {
      this.currentMs = Math.min(this.durationMs, this.currentMs + remainingRealMs * SPEED_MULTIPLIER[this.speed]);
    } else {
      while (remainingRealMs > 0 && this.currentMs < this.durationMs) {
        let roundStartMs = 0;
        let roundDurationMs = this.roundDurations.at(-1) ?? this.durationMs;
        for (const durationMs of this.roundDurations) {
          if (this.currentMs < roundStartMs + durationMs) {
            roundDurationMs = durationMs;
            break;
          }
          roundStartMs += durationMs;
        }
        const roundEndMs = Math.min(this.durationMs, roundStartMs + roundDurationMs);
        const playbackWindowMs = this.roundPlaybackWindowMs ?? ROUND_PLAYBACK_WINDOW_MS[this.speed];
        const logicalPerRealMs = roundDurationMs / playbackWindowMs;
        const logicalRemainingMs = Math.max(0, roundEndMs - this.currentMs);
        const realToRoundEndMs = logicalRemainingMs / logicalPerRealMs;
        if (remainingRealMs >= realToRoundEndMs) {
          this.currentMs = roundEndMs;
          remainingRealMs -= realToRoundEndMs;
        } else {
          this.currentMs = Math.min(roundEndMs, this.currentMs + remainingRealMs * logicalPerRealMs);
          remainingRealMs = 0;
        }
      }
    }
    if (this.currentMs >= this.durationMs) this.playing = false;
    return this.currentMs;
  }
}
