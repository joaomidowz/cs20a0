import { get, writable } from 'svelte/store';
import { ALL_CUES, renderCue, renderReverbImpulse, type GameSoundCue } from './sfxEngine';

export type { GameSoundCue };
/** @deprecated Use `GameSoundCue`; retained for existing integrations. */
export type OfflineCue = GameSoundCue;
export const offlineSoundEnabled = writable(true);
const preferenceKey = 'cs13a0:offline-sound';
let context: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;
const buffers = new Map<GameSoundCue, AudioBuffer>();
const lastCueAt = new Map<GameSoundCue, number>();
let lastAudibleCueAt = -Infinity;
const voices = new Set<AudioBufferSourceNode>();
let warmQueue: GameSoundCue[] = [];
let warming = false;

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
      reverb = context.createConvolver();
      reverb.buffer = toAudioBuffer(renderReverbImpulse(context.sampleRate));
      reverb.connect(master);
      buffers.clear();
      warmUp();
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
  reverb = null;
  buffers.clear();
  warmQueue = [];
  lastCueAt.clear();
  lastAudibleCueAt = -Infinity;
}

/**
 * Volume, intervalo mínimo entre repetições e quanto do cue vai para o reverb.
 * Os sons vêm normalizados do sfxEngine: `gain` é a hierarquia de volume inteira.
 */
const cues: Record<GameSoundCue, { gain: number; gap: number; wet: number }> = {
  tick: { gain: 0.17, gap: 0.03, wet: 0 },
  uiClick: { gain: 0.12, gap: 0.05, wet: 0 },
  land: { gain: 0.42, gap: 0.08, wet: 0.1 },
  pick: { gain: 0.3, gap: 0.12, wet: 0.08 },
  lineup: { gain: 0.32, gap: 0.3, wet: 0.12 },
  ace: { gain: 0.33, gap: 0.3, wet: 0.12 },
  clutch: { gain: 0.32, gap: 0.3, wet: 0.12 },
  comeback: { gain: 0.3, gap: 0.3, wet: 0.1 },
  success: { gain: 0.2, gap: 0.15, wet: 0.08 },
  error: { gain: 0.24, gap: 0.15, wet: 0.08 },
  coinGain: { gain: 0.24, gap: 0.12, wet: 0.1 },
  coinSpend: { gain: 0.18, gap: 0.12, wet: 0.08 },
  cardCommon: { gain: 0.2, gap: 0.12, wet: 0.08 },
  cardRare: { gain: 0.24, gap: 0.12, wet: 0.1 },
  cardSuperstar: { gain: 0.28, gap: 0.2, wet: 0.14 },
  cardLegend: { gain: 0.32, gap: 0.3, wet: 0.16 },
  cardGoat: { gain: 0.34, gap: 0.3, wet: 0.16 },
  betWin: { gain: 0.3, gap: 0.4, wet: 0.14 },
  betLoss: { gain: 0.26, gap: 0.4, wet: 0.12 },
  charge: { gain: 0.2, gap: 0.4, wet: 0.1 },
  attention: { gain: 0.22, gap: 0.3, wet: 0.08 },
  matchFound: { gain: 0.26, gap: 0.4, wet: 0.1 },
  roomStart: { gain: 0.26, gap: 0.4, wet: 0.12 },
  mapWon: { gain: 0.26, gap: 0.3, wet: 0.1 },
  mapLost: { gain: 0.2, gap: 0.3, wet: 0.1 },
  seriesWon: { gain: 0.3, gap: 0.5, wet: 0.14 },
  seriesLost: { gain: 0.22, gap: 0.5, wet: 0.12 },
  champion: { gain: 0.34, gap: 1, wet: 0.16 },
  eliminated: { gain: 0.24, gap: 1, wet: 0.12 },
  rumble: { gain: 0.3, gap: 0.3, wet: 0.1 }
};

function toAudioBuffer(signal: { left: Float32Array; right: Float32Array }): AudioBuffer {
  if (!context) throw new Error('sem contexto');
  const buffer = context.createBuffer(2, signal.left.length, context.sampleRate);
  buffer.copyToChannel(signal.left as Float32Array<ArrayBuffer>, 0);
  buffer.copyToChannel(signal.right as Float32Array<ArrayBuffer>, 1);
  return buffer;
}

function bufferFor(cue: GameSoundCue): AudioBuffer | null {
  if (!context) return null;
  const cached = buffers.get(cue);
  if (cached) return cached;
  const buffer = toAudioBuffer(renderCue(cue, context.sampleRate));
  buffers.set(cue, buffer);
  return buffer;
}

/** Pré-renderiza os cues em tempo ocioso para o primeiro play não gaguejar. */
function warmUp() {
  warmQueue = [...ALL_CUES];
  if (warming) return;
  warming = true;
  const idle = (task: () => void) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => task(), { timeout: 2000 });
    else setTimeout(task, 40);
  };
  const step = () => {
    const cue = warmQueue.shift();
    if (!cue || !context) { warming = false; return; }
    try { bufferFor(cue); } catch { warming = false; return; }
    idle(step);
  };
  idle(step);
}

/** Short pre-rendered game/UI cues, with capped polyphony and no downloaded audio. */
export function playGameSound(cue: GameSoundCue) {
  if (!get(offlineSoundEnabled) || !context || !master || context.state !== 'running' || document.hidden) return;
  const now = context.currentTime;
  const settings = cues[cue];
  if (now - (lastCueAt.get(cue) ?? -Infinity) < settings.gap) return;
  // A coin change and its success toast often arrive in the same update; let the more specific first cue win.
  if (cue !== 'tick' && now - lastAudibleCueAt < 0.055) return;
  try {
    const buffer = bufferFor(cue);
    if (!buffer || voices.size >= 12) return;
    lastCueAt.set(cue, now);
    if (cue !== 'tick') lastAudibleCueAt = now;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const level = context.createGain();
    level.gain.value = settings.gain;
    source.connect(level);
    level.connect(master);
    let send: GainNode | null = null;
    if (reverb && settings.wet > 0) {
      send = context.createGain();
      send.gain.value = settings.gain * settings.wet;
      source.connect(send);
      send.connect(reverb);
    }
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      try { source.disconnect(); level.disconnect(); send?.disconnect(); } catch { /* Already gone. */ }
    };
    source.start();
  } catch { /* Audio is enhancement only, including interrupted device contexts. */ }
}

/** @deprecated Use `playGameSound`; retained for existing integrations. */
export const playOfflineSound = playGameSound;
