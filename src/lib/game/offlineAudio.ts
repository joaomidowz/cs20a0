import { get, writable } from 'svelte/store';

export type OfflineCue = 'tick' | 'land' | 'pick' | 'lineup' | 'ace' | 'clutch' | 'comeback';
export const offlineSoundEnabled = writable(true);
const preferenceKey = 'cs13a0:offline-sound';
let context: AudioContext | null = null;
let master: GainNode | null = null;
let lastCueAt = -Infinity;
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
      master.gain.value = 0.11;
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
  lastCueAt = -Infinity;
}

const notes: Record<OfflineCue, number[]> = {
  tick: [900], land: [130, 260], pick: [440, 660], lineup: [330, 440, 550, 660],
  ace: [440, 660, 880], clutch: [220, 330, 660], comeback: [260, 330, 520]
};

/** Short synthesized cues, with capped polyphony and no downloaded audio. */
export function playOfflineSound(cue: OfflineCue) {
  if (!get(offlineSoundEnabled) || !context || !master || context.state !== 'running' || document.hidden) return;
  const now = context.currentTime;
  if (now - lastCueAt < (cue === 'tick' ? 0.035 : 0.09)) return;
  lastCueAt = now;
  try {
    notes[cue].forEach((frequency, index) => {
      if (!context || !master || voices.size >= 8) return;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = now + index * 0.07;
      const duration = cue === 'tick' ? 0.025 : 0.19;
      oscillator.type = cue === 'tick' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.8, start + duration);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(cue === 'tick' ? 0.3 : 0.55, start + 0.004);
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
