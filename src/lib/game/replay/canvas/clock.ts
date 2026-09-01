import type { ReplayPlaybackSpeed } from '../types';

const SPEED_MULTIPLIER: Record<Exclude<ReplayPlaybackSpeed, 'simulate' | 'ultra'>, number> = {
  normal: 4,
  fast: 8
};

export const SIMULATED_ROUND_VISUAL_DURATION_MS = 10_000;

export class ReplayClock {
  currentMs = 0;
  playing = false;
  speed: ReplayPlaybackSpeed = 'normal';
  durationMs: number;
  private playbackStartMs = 0;
  private playbackEndMs: number;

  constructor(durationMs: number) {
    this.durationMs = Math.max(0, durationMs);
    this.playbackEndMs = this.durationMs;
  }

  play() {
    if (this.speed === 'ultra') {
      this.currentMs = this.durationMs;
      this.playing = false;
      return;
    }
    const playbackEndMs = this.speed === 'simulate' ? this.playbackEndMs : this.durationMs;
    if (this.currentMs >= playbackEndMs) {
      this.currentMs = this.speed === 'simulate' ? this.playbackStartMs : 0;
    }
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
    this.playbackStartMs = 0;
    this.playbackEndMs = this.durationMs;
  }

  setPlaybackWindow(startMs: number, endMs: number) {
    this.playbackStartMs = Math.max(0, Math.min(this.durationMs, startMs));
    this.playbackEndMs = Math.max(
      this.playbackStartMs,
      Math.min(this.durationMs, endMs)
    );
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
    const multiplier = this.speed === 'simulate'
      ? (this.playbackEndMs - this.playbackStartMs) / SIMULATED_ROUND_VISUAL_DURATION_MS
      : SPEED_MULTIPLIER[this.speed];
    const playbackEndMs = this.speed === 'simulate' ? this.playbackEndMs : this.durationMs;
    this.currentMs = Math.min(
      playbackEndMs,
      this.currentMs + Math.max(0, deltaMs) * multiplier
    );
    if (this.currentMs >= playbackEndMs) this.playing = false;
    return this.currentMs;
  }
}
