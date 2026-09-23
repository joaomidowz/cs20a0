import { get, writable } from 'svelte/store';

export type GameSoundCue =
  | 'tick' | 'land' | 'pick' | 'lineup' | 'ace' | 'clutch' | 'comeback'
  | 'uiClick' | 'success' | 'error' | 'coinGain' | 'coinSpend'
  | 'cardCommon' | 'cardRare' | 'cardSuperstar' | 'cardLegend' | 'cardGoat';
/** @deprecated Use `GameSoundCue`; retained for existing integrations. */
export type OfflineCue = GameSoundCue;
export const offlineSoundEnabled = writable(true);
const preferenceKey = 'cs13a0:offline-sound';
let context: AudioContext | null = null;
let master: GainNode | null = null;
const lastCueAt = new Map<GameSoundCue, number>();
let lastAudibleCueAt = -Infinity;
const voices = new Set<OscillatorNode>();

export function loadOfflineSound() {
  try { offlineSoundEnabled.set(localStorage.getItem(preferenceKey) !== 'false'); } catch { /* Optional preference. */ }
}

/** Called only from a user gesture; failed/unsupported audio never interrupts play. */
export function unlockOfflineAudio() {
  if (typeof window === 'undefined' || !get(offlineSoundEnabled)) return;
  try {
    if (!context || context.state === 'closed') {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.19;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch { /* Play silently if Web Audio is unavailable. */ }
}

export function setOfflineSound(enabled: boolean) {
  offlineSoundEnabled.set(enabled);
  try { localStorage.setItem(preferenceKey, String(enabled)); } catch { /* Keep the in-memory choice. */ }
  if (!enabled) stopOfflineSounds();
  else unlockOfflineAudio();
}

export function stopOfflineSounds() {
  for (const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } }
  voices.clear();
}

export function disposeOfflineAudio() {
  stopOfflineSounds();
  if (context) void context.close().catch(() => {});
  context = null;
  master = null;
  lastCueAt.clear();
  lastAudibleCueAt = -Infinity;
}

const cues: Record<GameSoundCue, { notes: number[]; duration: number; peak: number; type: OscillatorType; gap: number }> = {
  tick: { notes: [920], duration: 0.024, peak: 0.16, type: 'triangle', gap: 0.035 },
  land: { notes: [150, 300], duration: 0.2, peak: 0.42, type: 'sine', gap: 0.08 },
  pick: { notes: [520, 780], duration: 0.16, peak: 0.34, type: 'sine', gap: 0.055 },
  lineup: { notes: [392, 494, 587, 784], duration: 0.25, peak: 0.34, type: 'triangle', gap: 0.055 },
  ace: { notes: [523, 784, 1047], duration: 0.22, peak: 0.34, type: 'triangle', gap: 0.05 },
  clutch: { notes: [220, 330, 660], duration: 0.24, peak: 0.34, type: 'sine', gap: 0.06 },
  comeback: { notes: [262, 392, 587, 784], duration: 0.22, peak: 0.3, type: 'triangle', gap: 0.045 },
  uiClick: { notes: [620], duration: 0.055, peak: 0.12, type: 'triangle', gap: 0 },
  success: { notes: [587, 784], duration: 0.15, peak: 0.2, type: 'sine', gap: 0.04 },
  error: { notes: [220, 165], duration: 0.14, peak: 0.22, type: 'triangle', gap: 0.045 },
  coinGain: { notes: [784, 1047, 1319], duration: 0.17, peak: 0.24, type: 'sine', gap: 0.045 },
  coinSpend: { notes: [659, 494, 392], duration: 0.13, peak: 0.18, type: 'triangle', gap: 0.04 },
  cardCommon: { notes: [392], duration: 0.16, peak: 0.2, type: 'sine', gap: 0 },
  cardRare: { notes: [440, 587], duration: 0.18, peak: 0.22, type: 'sine', gap: 0.055 },
  cardSuperstar: { notes: [523, 659, 784], duration: 0.2, peak: 0.25, type: 'triangle', gap: 0.05 },
  cardLegend: { notes: [523, 659, 784, 1047], duration: 0.3, peak: 0.28, type: 'triangle', gap: 0.065 },
  cardGoat: { notes: [392, 523, 659, 784, 1047], duration: 0.34, peak: 0.3, type: 'triangle', gap: 0.07 }
};

/** Short synthesized game/UI cues, with capped polyphony and no downloaded audio. */
export function playGameSound(cue: GameSoundCue) {
  if (!get(offlineSoundEnabled) || !context || !master || context.state !== 'running' || document.hidden) return;
  const now = context.currentTime;
  const settings = cues[cue];
  if (now - (lastCueAt.get(cue) ?? -Infinity) < settings.gap) return;
  // A coin change and its success toast often arrive in the same update; let the more specific first cue win.
  if (cue !== 'tick' && now - lastAudibleCueAt < 0.055) return;
  lastCueAt.set(cue, now);
  if (cue !== 'tick') lastAudibleCueAt = now;
  try {
    settings.notes.forEach((frequency, index) => {
      if (!context || !master || voices.size >= 16) return;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = now + index * settings.gap;
      const duration = settings.duration;
      oscillator.type = settings.type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.8, start + duration);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(settings.peak, start + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(master);
      voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    });
  } catch { /* Audio is enhancement only, including interrupted device contexts. */ }
}

/** @deprecated Use `playGameSound`; retained for existing integrations. */
export const playOfflineSound = playGameSound;
