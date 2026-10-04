/**
 * Receitas de síntese dos efeitos do jogo, portadas da trilha do reel de marketing
 * (cs13a0/mobile/_projeto_edicao/audio_v5.py): mesmos osciladores, filtros, envelopes
 * e seeds fixas. Tudo é renderizado uma vez em Float32Array e vira AudioBuffer —
 * nenhum arquivo de áudio é baixado. Módulo puro (sem DOM) para rodar em teste.
 */

export type GameSoundCue =
  | 'tick' | 'land' | 'pick' | 'lineup' | 'ace' | 'clutch' | 'comeback'
  | 'uiClick' | 'success' | 'error' | 'coinGain' | 'coinSpend'
  | 'betWin' | 'betLoss' | 'charge' | 'attention' | 'matchFound' | 'roomStart' | 'mapWon' | 'mapLost' | 'seriesWon' | 'seriesLost' | 'champion' | 'eliminated' | 'rumble'
  | 'cardCommon' | 'cardRare' | 'cardSuperstar' | 'cardLegend' | 'cardGoat';

export type StereoSignal = { left: Float32Array; right: Float32Array };

/** Ordenado por frequência de uso: o aquecimento pré-renderiza nessa ordem. */
export const ALL_CUES: GameSoundCue[] = [
  'tick', 'uiClick', 'land', 'success', 'error', 'coinGain', 'coinSpend', 'pick',
  'cardCommon', 'cardRare', 'cardSuperstar', 'charge', 'betWin', 'betLoss',
  'mapWon', 'mapLost', 'attention', 'matchFound', 'roomStart', 'lineup', 'ace', 'clutch',
  'comeback', 'seriesWon', 'seriesLost', 'rumble', 'cardLegend', 'cardGoat', 'eliminated', 'champion'
];

const TWO_PI = Math.PI * 2;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gerador determinístico: o mesmo cue soa idêntico em toda renderização. */
class Rng {
  private readonly u: () => number;
  private spare: number | null = null;
  constructor(seed: number) { this.u = mulberry32(seed); }
  uniform(lo = 0, hi = 1): number { return lo + (hi - lo) * this.u(); }
  normal(): number {
    if (this.spare !== null) { const value = this.spare; this.spare = null; return value; }
    let u = 0;
    do { u = this.u(); } while (u <= 1e-12);
    const v = this.u();
    const radius = Math.sqrt(-2 * Math.log(u));
    this.spare = radius * Math.sin(TWO_PI * v);
    return radius * Math.cos(TWO_PI * v);
  }
  noise(n: number): Float32Array {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.normal();
    return out;
  }
}

const samples = (duration: number, sr: number) => Math.max(1, Math.round(duration * sr));
const mtof = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): Float32Array {
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const input = x[i];
    const output = b0 * input + z1;
    z1 = b1 * input - a1 * output + z2;
    z2 = b2 * input - a2 * output;
    x[i] = output;
  }
  return x;
}

/** Passa-baixa RBJ com Q = 1/√2 — o mesmo corte do butter(2) usado no reel. */
function lowpass(x: Float32Array, frequency: number, sr: number): Float32Array {
  const w0 = TWO_PI * Math.min(Math.max(frequency, 10), sr * 0.45) / sr;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) * Math.SQRT1_2;
  const a0 = 1 + alpha;
  return biquad(x, (1 - cosw) / 2 / a0, (1 - cosw) / a0, (1 - cosw) / 2 / a0, -2 * cosw / a0, (1 - alpha) / a0);
}

function highpass(x: Float32Array, frequency: number, sr: number): Float32Array {
  const w0 = TWO_PI * Math.min(Math.max(frequency, 10), sr * 0.45) / sr;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) * Math.SQRT1_2;
  const a0 = 1 + alpha;
  return biquad(x, (1 + cosw) / 2 / a0, -(1 + cosw) / a0, (1 + cosw) / 2 / a0, -2 * cosw / a0, (1 - alpha) / a0);
}

function bandpass(x: Float32Array, lo: number, hi: number, sr: number): Float32Array {
  return lowpass(highpass(x, lo, sr), hi, sr);
}

/** Passa-banda SVF (TPT) com centro variável por amostra: whoosh, riser e trombone. */
function svfBandpass(x: Float32Array, center: Float32Array, q: number, sr: number): Float32Array {
  const k = 1 / q;
  let ic1 = 0;
  let ic2 = 0;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const g = Math.tan(Math.PI * Math.min(Math.max(center[i], 20), sr * 0.45) / sr);
    const v3 = x[i] - ic2;
    const v1 = (g * v3 + ic1) / (1 + g * (g + k));
    const v2 = ic2 + g * v1;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    out[i] = v1;
  }
  return out;
}

/** Dente-de-serra polyBLEP; frequência escalar ou por amostra. */
function sawBlep(frequency: number | Float32Array, n: number, sr: number): Float32Array {
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const dt = (typeof frequency === 'number' ? frequency : frequency[i]) / sr;
    phase += dt;
    phase -= Math.floor(phase);
    let value = 2 * phase - 1;
    if (phase < dt) { const x = phase / dt; value -= x + x - x * x - 1; }
    else if (phase > 1 - dt) { const x = (phase - 1) / dt; value -= x * x + x + x + 1; }
    out[i] = value;
  }
  return out;
}

function adsr(n: number, a: number, d: number, s: number, r: number, sr: number): Float32Array {
  const envelope = new Float32Array(n).fill(s);
  const na = Math.min(Math.round(a * sr), n);
  for (let i = 0; i < na; i++) envelope[i] = i / na;
  const nd = Math.min(Math.round(d * sr), n - na);
  for (let i = 0; i < nd; i++) envelope[na + i] = 1 + (s - 1) * (i / nd);
  const nr = Math.min(Math.round(r * sr), n);
  for (let i = 0; i < nr; i++) envelope[n - nr + i] *= 1 - i / (nr - 1 || 1);
  return envelope;
}

function makeBus(duration: number, sr: number): StereoSignal {
  const n = samples(duration, sr);
  return { left: new Float32Array(n), right: new Float32Array(n) };
}

/** Lei de pan igual à do reel: pan 0 mantém o ganho; width atrasa o canal direito. */
function addMono(bus: StereoSignal, x: Float32Array, t0: number, sr: number, gain = 1, pan = 0, width = 0) {
  const gl = Math.sqrt((1 - pan) / 2) * Math.SQRT2 * gain;
  const gr = Math.sqrt((1 + pan) / 2) * Math.SQRT2 * gain;
  const start = Math.round(t0 * sr);
  const delay = Math.round(width * sr);
  for (let i = 0; i < x.length; i++) {
    const j = start + i;
    if (j >= 0 && j < bus.left.length) bus.left[j] += x[i] * gl;
    const jr = j + delay;
    if (jr >= 0 && jr < bus.right.length) bus.right[jr] += x[i] * gr;
  }
}

function addStereo(bus: StereoSignal, signal: StereoSignal, t0: number, sr: number, gain = 1) {
  const start = Math.round(t0 * sr);
  for (let i = 0; i < signal.left.length; i++) {
    const j = start + i;
    if (j < 0 || j >= bus.left.length) continue;
    bus.left[j] += signal.left[i] * gain;
    bus.right[j] += signal.right[i] * gain;
  }
}

/** Normaliza o pico para 1 (o ganho por cue decide o volume) e tira o clique do corte final. */
function finalize(bus: StereoSignal, sr: number): StereoSignal {
  let peak = 0;
  for (const channel of [bus.left, bus.right]) {
    for (let i = 0; i < channel.length; i++) peak = Math.max(peak, Math.abs(channel[i]));
  }
  const scale = peak > 1e-9 ? 1 / peak : 1;
  const fade = Math.min(samples(0.02, sr), bus.left.length);
  for (const channel of [bus.left, bus.right]) {
    for (let i = 0; i < channel.length; i++) channel[i] *= scale;
    for (let i = 0; i < fade; i++) channel[channel.length - fade + i] *= 1 - i / fade;
  }
  return bus;
}

// ----------------------------------------------------------------- vozes do reel

function tickSound(sr: number): Float32Array {
  const n = samples(0.025, sr);
  const nz = highpass(new Rng(101).noise(n), 4000, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = (Math.sin(TWO_PI * 3400 * t) * 0.6 + nz[i] * 0.4) * Math.exp(-t / 0.004) * 0.5;
  }
  return out;
}

function clickSound(sr: number): Float32Array {
  const n = samples(0.03, sr);
  const nz = highpass(new Rng(102).noise(n), 2000, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = nz[i] * Math.exp(-t / 0.004) * 0.6 + Math.sin(TWO_PI * 2800 * t) * Math.exp(-t / 0.006) * 0.4;
  }
  return out;
}

type CoinOptions = { freqScale?: number; tauScale?: number; duration?: number; delayCopy?: boolean };

function coinSound(sr: number, { freqScale = 1, tauScale = 1, duration = 0.9, delayCopy = true }: CoinOptions = {}): StereoSignal {
  const n = samples(duration, sr);
  const body = new Float32Array(n);
  const partials: Array<[number, number, number]> = [
    [2093, 0.5, 0.35], [2637, 0.4, 0.3], [3136, 0.25, 0.22], [4186, 0.15, 0.15], [5274, 0.08, 0.1]
  ];
  for (const [frequency, amplitude, tau] of partials) {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      body[i] += amplitude * Math.sin(TWO_PI * frequency * freqScale * t) * Math.exp(-t / (tau * tauScale));
    }
  }
  const echo = new Float32Array(n);
  if (delayCopy) {
    const shift = samples(0.075, sr);
    for (let i = shift; i < n; i++) echo[i] = body[i - shift] * 0.9;
  }
  const chinkLength = Math.min(samples(0.05, sr), n);
  const chink = highpass(new Rng(103).noise(chinkLength), 3000, sr);
  for (let i = 0; i < chinkLength; i++) body[i] += chink[i] * Math.exp(-(i / sr) / 0.01) * 0.6;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (body[i] + echo[i]) * 0.35;
  const out = makeBus(duration, sr);
  addMono(out, mono, 0, sr, 1, 0, 0.003);
  return out;
}

function boomSound(sr: number, duration = 1.6, fHi = 95, fLo = 32, subTau = 0.55, drive = 1.8): Float32Array {
  const n = samples(duration, sr);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += TWO_PI * (fLo + (fHi - fLo) * Math.exp(-t / 0.09)) / sr;
    out[i] = Math.sin(phase) * Math.exp(-t / subTau);
  }
  const thumpLength = Math.min(samples(0.12, sr), n);
  const thump = lowpass(new Rng(104).noise(thumpLength), 260, sr);
  for (let i = 0; i < thumpLength; i++) out[i] += thump[i] * Math.exp(-(i / sr) / 0.03) * 1.2;
  for (let i = 0; i < n; i++) out[i] = Math.tanh(drive * out[i]) * 0.8;
  return out;
}

function vineBoomSound(sr: number, duration = 1.8): Float32Array {
  const n = samples(duration, sr);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += TWO_PI * (52 + 30 * Math.exp(-t / 0.06)) / sr;
    const tone = Math.sin(phase) + 0.35 * Math.sin(2 * phase) + 0.18 * Math.sin(3 * phase);
    out[i] = Math.tanh(2.2 * tone * Math.exp(-t / 0.65)) * 0.75;
  }
  return out;
}

function sparkleSound(sr: number, duration = 1, count = 26, seed = 5): StereoSignal {
  const rng = new Rng(seed);
  const out = makeBus(duration + 0.4, sr);
  const toneLength = samples(0.35, sr);
  for (let spark = 0; spark < count; spark++) {
    const t0 = rng.uniform(0, duration) ** 1.4;
    const frequency = rng.uniform(2400, 7800);
    const tau = rng.uniform(0.04, 0.12);
    const tone = new Float32Array(toneLength);
    for (let i = 0; i < toneLength; i++) {
      const t = i / sr;
      tone[i] = Math.sin(TWO_PI * frequency * t) * Math.exp(-t / tau);
    }
    addMono(out, tone, t0, sr, rng.uniform(0.04, 0.11), rng.uniform(-0.9, 0.9));
  }
  return out;
}

function whooshSound(sr: number, duration = 0.38, f0 = 300, f1 = 4200, q = 1.6, seed = 105): StereoSignal {
  const n = samples(duration, sr);
  const center = new Float32Array(n);
  for (let i = 0; i < n; i++) center[i] = f0 * (f1 / f0) ** Math.sin(Math.PI * (i / (n - 1 || 1)) * 0.5);
  const swept = svfBandpass(new Rng(seed).noise(n), center, q, sr);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    swept[i] *= Math.sin(Math.PI * (i / (n - 1 || 1))) ** 1.5;
    peak = Math.max(peak, Math.abs(swept[i]));
  }
  for (let i = 0; i < n; i++) swept[i] = swept[i] / peak * 0.5;
  const out = makeBus(duration, sr);
  addMono(out, swept, 0, sr, 1, 0, 0.004);
  return out;
}

function riserSound(sr: number, duration = 1.3, f0 = 250, f1 = 2600, seed = 106): StereoSignal {
  const n = samples(duration, sr);
  const center = new Float32Array(n);
  const quarter = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    center[i] = f0 * (f1 / f0) ** (i / (n - 1 || 1));
    quarter[i] = center[i] / 4;
  }
  const swept = svfBandpass(new Rng(seed).noise(n), center, 3, sr);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(swept[i]));
  const tone = lowpass(sawBlep(quarter, n, sr), 3000, sr);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1 || 1);
    mono[i] = (swept[i] / peak * 0.6 + tone[i] * 0.18) * x ** 2.2 * 0.6;
  }
  const out = makeBus(duration, sr);
  addMono(out, mono, 0, sr, 1, 0, 0.005);
  return out;
}

function sadTromboneSound(sr: number): Float32Array {
  const notes: Array<[number, number]> = [[62, 0.17], [61, 0.17], [60, 0.17], [59, 0.62]];
  const parts: Float32Array[] = [];
  let total = 0;
  notes.forEach(([midi, duration], index) => {
    const n = samples(duration, sr);
    const base = mtof(midi - 12);
    const frequency = new Float32Array(n);
    const center = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vibrato = index === 3 && t > 0.12 ? 1 + 0.012 * Math.sin(TWO_PI * 5.5 * t) : 1;
      frequency[i] = base * vibrato;
      center[i] = 300 + 1500 * Math.sin(Math.PI * Math.min(t / Math.min(duration, 0.3), 1)) ** 0.8;
    }
    const tone = svfBandpass(sawBlep(frequency, n, sr), center, 0.9, sr);
    const envelope = adsr(n, 0.02, 0.05, 0.9, 0.06, sr);
    for (let i = 0; i < n; i++) tone[i] *= envelope[i];
    parts.push(tone);
    total += n;
  });
  const out = new Float32Array(total);
  let offset = 0;
  let peak = 1e-9;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < total; i++) out[i] = out[i] / peak * 0.5;
  return out;
}

function airhornSound(sr: number): StereoSignal {
  const n = samples(1.1, sr);
  const mono = new Float32Array(n);
  const blasts: Array<[number, number]> = [[0, 0.13], [0.17, 0.13], [0.34, 0.62]];
  for (const [t0, duration] of blasts) {
    const bn = samples(duration, sr);
    const frequency = new Float32Array(bn);
    for (let i = 0; i < bn; i++) {
      const t = i / sr;
      frequency[i] = 466 * (1 - 0.04 * Math.exp(-t / 0.02)) * (1 - 0.03 * (t / duration) ** 4);
    }
    const detuned = new Float32Array(bn);
    const fifth = new Float32Array(bn);
    for (let i = 0; i < bn; i++) { detuned[i] = frequency[i] * 1.007; fifth[i] = frequency[i] * 1.5; }
    const sawA = sawBlep(frequency, bn, sr);
    const sawB = sawBlep(detuned, bn, sr);
    const sawC = sawBlep(fifth, bn, sr);
    const blast = new Float32Array(bn);
    for (let i = 0; i < bn; i++) blast[i] = sawA[i] + 0.8 * sawB[i] + 0.5 * sawC[i];
    bandpass(blast, 380, 3800, sr);
    const envelope = adsr(bn, 0.008, 0.03, 0.9, 0.04, sr);
    const start = samples(t0, sr);
    for (let i = 0; i < bn && start + i < n; i++) mono[start + i] += Math.tanh(2.5 * blast[i] * envelope[i]);
  }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono[i]));
  for (let i = 0; i < n; i++) mono[i] = mono[i] / peak * 0.55;
  const out = makeBus(1.1, sr);
  addMono(out, mono, 0, sr, 1, 0, 0.006);
  return out;
}

function interpolateCurve(n: number, points: number[], sr: number, duration: number): Float32Array {
  const out = new Float32Array(n);
  const step = duration / (points.length - 1 || 1);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const slot = Math.min(Math.max(t / step, 0), points.length - 1);
    const low = Math.floor(slot);
    const high = Math.min(low + 1, points.length - 1);
    out[i] = points[low] + (points[high] - points[low]) * (slot - low);
  }
  return out;
}

function crowdSound(sr: number, duration = 3.8, seed = 9): StereoSignal {
  const rng = new Rng(seed);
  const n = samples(duration, sr);
  const out = makeBus(duration, sr);
  for (const channel of [out.left, out.right]) {
    const base = bandpass(rng.noise(n), 280, 2600, sr);
    const points: number[] = [];
    for (let i = 0; i < 40; i++) points.push(rng.uniform(0.4, 1));
    const flutter = interpolateCurve(n, points, sr, duration);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const envelope = Math.min(t / 0.25, 1) * Math.exp(-Math.max(t - 1.2, 0) / 1.3);
      channel[i] = base[i] * (0.75 + 0.25 * flutter[i]) * envelope * 0.22;
    }
  }
  const clapLength = samples(0.03, sr);
  for (let clapIndex = 0; clapIndex < Math.floor(duration * 22); clapIndex++) {
    const at = rng.uniform(0.05, duration * 0.8);
    const clap = bandpass(rng.noise(clapLength), 900, 5000, sr);
    for (let i = 0; i < clapLength; i++) clap[i] *= Math.exp(-(i / sr) / 0.006);
    addMono(out, clap, at, sr, rng.uniform(0.05, 0.16) * Math.exp(-Math.max(0, at - 1.2) / 1.3), rng.uniform(-1, 1));
  }
  for (let whistleIndex = 0; whistleIndex < 6; whistleIndex++) {
    const at = rng.uniform(0.1, 1.6);
    const wd = rng.uniform(0.25, 0.5);
    const f0 = rng.uniform(1700, 2600);
    const wn = samples(wd, sr);
    const whistle = new Float32Array(wn);
    let phase = 0;
    for (let i = 0; i < wn; i++) {
      const t = i / sr;
      phase += TWO_PI * f0 * (1 + 0.25 * Math.sin(Math.PI * t / wd)) / sr;
      whistle[i] = Math.sin(phase);
    }
    const envelope = adsr(wn, 0.03, 0.05, 0.8, 0.08, sr);
    for (let i = 0; i < wn; i++) whistle[i] *= envelope[i];
    addMono(out, whistle, at, sr, 0.05, rng.uniform(-0.8, 0.8));
  }
  return out;
}

function bleepSound(frequency: number, sr: number, duration = 0.09): Float32Array {
  const n = samples(duration, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = Math.sign(Math.sin(TWO_PI * frequency * t)) * 0.5 + Math.sin(TWO_PI * 2 * frequency * t) * 0.3;
  }
  lowpass(out, 6000, sr);
  for (let i = 0; i < n; i++) out[i] *= Math.exp(-(i / sr) / 0.035) * 0.45;
  return out;
}

function suspenseHitSound(sr: number): Float32Array {
  const n = samples(1.2, sr);
  const rumbleNoise = lowpass(new Rng(107).noise(n), 400, sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const tone = Math.sin(TWO_PI * 49 * t) * Math.exp(-t / 0.35) + 0.4 * Math.sin(TWO_PI * 98 * t) * Math.exp(-t / 0.2);
    out[i] = Math.tanh(1.5 * (tone + rumbleNoise[i] * Math.exp(-t / 0.08) * 0.6)) * 0.6;
  }
  return out;
}

/** A corda dedilhada dos arpejos do reel: a voz dos cues melódicos do jogo. */
function pluckSound(frequency: number, sr: number, duration = 0.22, cutoff = 2600): Float32Array {
  const n = samples(duration, sr);
  const out = sawBlep(frequency, n, sr);
  for (let i = 0; i < n; i++) out[i] *= Math.exp(-(i / sr) / 0.11);
  lowpass(out, cutoff, sr);
  const envelope = adsr(n, 0.002, 0, 1, 0.02, sr);
  for (let i = 0; i < n; i++) out[i] *= envelope[i];
  return out;
}

// ----------------------------------------------------------------- cues

function addPlucks(bus: StereoSignal, notes: number[], sr: number, step: number, gain = 1, cutoff = 2600) {
  notes.forEach((frequency, index) => addMono(bus, pluckSound(frequency, sr, 0.22, cutoff), index * step, sr, gain));
}

export function renderCue(cue: GameSoundCue, sr: number): StereoSignal {
  switch (cue) {
    case 'tick': {
      const bus = makeBus(0.03, sr);
      addMono(bus, tickSound(sr), 0, sr);
      return finalize(bus, sr);
    }
    case 'uiClick': {
      const bus = makeBus(0.035, sr);
      addMono(bus, clickSound(sr), 0, sr);
      return finalize(bus, sr);
    }
    case 'land': {
      const bus = makeBus(0.72, sr);
      addMono(bus, boomSound(sr, 0.6, 130, 50, 0.12), 0, sr);
      return finalize(bus, sr);
    }
    case 'coinGain': {
      const bus = makeBus(0.95, sr);
      addStereo(bus, coinSound(sr), 0, sr);
      return finalize(bus, sr);
    }
    case 'coinSpend': {
      const bus = makeBus(0.45, sr);
      addStereo(bus, coinSound(sr, { freqScale: 0.75, tauScale: 0.45, duration: 0.4, delayCopy: false }), 0, sr);
      return finalize(bus, sr);
    }
    case 'success': {
      const bus = makeBus(0.4, sr);
      addPlucks(bus, [587, 784], sr, 0.07);
      return finalize(bus, sr);
    }
    case 'error': {
      const bus = makeBus(0.42, sr);
      addPlucks(bus, [220, 165], sr, 0.08, 1, 1400);
      const thudLength = samples(0.06, sr);
      const thud = lowpass(new Rng(108).noise(thudLength), 400, sr);
      for (let i = 0; i < thudLength; i++) thud[i] *= Math.exp(-(i / sr) / 0.025);
      addMono(bus, thud, 0, sr, 0.5);
      return finalize(bus, sr);
    }
    case 'pick': {
      const bus = makeBus(0.35, sr);
      addPlucks(bus, [520, 780], sr, 0.05);
      return finalize(bus, sr);
    }
    case 'lineup': {
      const bus = makeBus(0.8, sr);
      addPlucks(bus, [392, 494, 587, 784], sr, 0.06);
      addStereo(bus, sparkleSound(sr, 0.35, 6, 31), 0.12, sr, 0.5);
      return finalize(bus, sr);
    }
    case 'ace': {
      const bus = makeBus(0.85, sr);
      addPlucks(bus, [523, 784, 1047], sr, 0.055);
      addStereo(bus, sparkleSound(sr, 0.45, 9, 32), 0.08, sr, 0.6);
      return finalize(bus, sr);
    }
    case 'clutch': {
      const bus = makeBus(0.55, sr);
      addPlucks(bus, [220, 330, 660], sr, 0.06);
      return finalize(bus, sr);
    }
    case 'comeback': {
      // Os bleeps dos "rounds voltando" do reel, subindo em tons inteiros.
      const bus = makeBus(0.75, sr);
      for (let i = 0; i < 4; i++) addMono(bus, bleepSound(mtof(72 + i * 2), sr), i * 0.145, sr);
      return finalize(bus, sr);
    }
    case 'matchFound': {
      const bus = makeBus(0.55, sr);
      [660, 880, 1320].forEach((frequency, index) => addMono(bus, bleepSound(frequency, sr), index * 0.1, sr));
      return finalize(bus, sr);
    }
    case 'attention': {
      const bus = makeBus(0.4, sr);
      [660, 880].forEach((frequency, index) => addMono(bus, bleepSound(frequency, sr), index * 0.09, sr, 0.8));
      return finalize(bus, sr);
    }
    case 'roomStart': {
      const bus = makeBus(0.8, sr);
      addStereo(bus, whooshSound(sr, 0.32, 300, 3800), 0, sr, 0.8);
      addMono(bus, boomSound(sr, 0.5, 110, 45, 0.18), 0.1, sr, 0.6);
      return finalize(bus, sr);
    }
    case 'mapWon': {
      const bus = makeBus(0.55, sr);
      addPlucks(bus, [523, 659, 784], sr, 0.05);
      return finalize(bus, sr);
    }
    case 'mapLost': {
      const bus = makeBus(0.55, sr);
      addPlucks(bus, [330, 262], sr, 0.08, 1, 1600);
      return finalize(bus, sr);
    }
    case 'seriesWon': {
      const bus = makeBus(1.3, sr);
      addPlucks(bus, [392, 494, 587, 784, 988], sr, 0.055);
      addStereo(bus, coinSound(sr), 0.2, sr, 0.35);
      addStereo(bus, sparkleSound(sr, 0.5, 10, 33), 0.22, sr, 0.5);
      return finalize(bus, sr);
    }
    case 'seriesLost': {
      const bus = makeBus(0.9, sr);
      addPlucks(bus, [294, 247, 196], sr, 0.1, 1, 1500);
      return finalize(bus, sr);
    }
    case 'champion': {
      // A virada do reel: vine boom + multidão + airhorn + sparkle.
      const bus = makeBus(3.8, sr);
      addMono(bus, vineBoomSound(sr), 0, sr, 0.9);
      addMono(bus, boomSound(sr), 0, sr, 0.45);
      addStereo(bus, crowdSound(sr, 3.2), 0.05, sr, 1);
      addStereo(bus, airhornSound(sr), 0.12, sr, 0.6);
      addStereo(bus, sparkleSound(sr, 1.4, 34, 11), 0.08, sr, 0.9);
      return finalize(bus, sr);
    }
    case 'eliminated': {
      const bus = makeBus(1.5, sr);
      addMono(bus, suspenseHitSound(sr), 0, sr, 0.7);
      [262, 233, 196, 147].forEach((frequency, index) =>
        addMono(bus, pluckSound(frequency, sr, 0.24, 1500), 0.1 + index * 0.12, sr, 0.55));
      return finalize(bus, sr);
    }
    case 'rumble': {
      const bus = makeBus(0.8, sr);
      [70, 62, 78, 58].forEach((frequency, index) => {
        const n = samples(0.16, sr);
        const pulse = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          pulse[i] = Math.tanh(2 * Math.sin(TWO_PI * frequency * t)) * Math.exp(-t / 0.06);
        }
        addMono(bus, pulse, index * 0.12, sr);
      });
      const bedLength = samples(0.7, sr);
      const bed = lowpass(new Rng(109).noise(bedLength), 120, sr);
      for (let i = 0; i < bedLength; i++) bed[i] *= Math.exp(-(i / sr) / 0.25);
      addMono(bus, bed, 0, sr, 0.5);
      return finalize(bus, sr);
    }
    case 'charge': {
      const bus = makeBus(1.2, sr);
      addStereo(bus, riserSound(sr, 1.1, 260, 3600), 0, sr);
      return finalize(bus, sr);
    }
    case 'betWin': {
      // O acerto de 75% do reel: boom + moeda + sparkle no mesmo instante.
      const bus = makeBus(1.8, sr);
      addMono(bus, boomSound(sr), 0, sr, 0.85);
      addStereo(bus, coinSound(sr), 0.02, sr, 0.8);
      addStereo(bus, sparkleSound(sr, 0.9, 20, 8), 0.02, sr, 0.9);
      return finalize(bus, sr);
    }
    case 'betLoss': {
      // O 12,3% que falhou: pancada surda e o sad trombone.
      const bus = makeBus(1.5, sr);
      addMono(bus, suspenseHitSound(sr), 0, sr, 0.4);
      addMono(bus, sadTromboneSound(sr), 0.05, sr, 0.9);
      return finalize(bus, sr);
    }
    case 'cardCommon': {
      const bus = makeBus(0.35, sr);
      addMono(bus, pluckSound(392, sr), 0, sr);
      addMono(bus, clickSound(sr), 0, sr, 0.3);
      return finalize(bus, sr);
    }
    case 'cardRare': {
      const bus = makeBus(0.75, sr);
      addPlucks(bus, [440, 587], sr, 0.055);
      addStereo(bus, sparkleSound(sr, 0.3, 5, 34), 0.05, sr, 0.7);
      return finalize(bus, sr);
    }
    case 'cardSuperstar': {
      const bus = makeBus(1.2, sr);
      addMono(bus, boomSound(sr, 0.7, 110, 40, 0.2), 0, sr, 0.5);
      addStereo(bus, sparkleSound(sr, 0.7, 14, 35), 0.02, sr, 0.9);
      return finalize(bus, sr);
    }
    case 'cardLegend': {
      const bus = makeBus(2, sr);
      addMono(bus, vineBoomSound(sr, 1.4), 0, sr, 0.75);
      addStereo(bus, sparkleSound(sr, 1.1, 26, 5), 0.03, sr, 1);
      return finalize(bus, sr);
    }
    case 'cardGoat': {
      // O drop do 99 no reel: vine boom inteiro + sub + chuva de sparkles.
      const bus = makeBus(2.2, sr);
      addMono(bus, vineBoomSound(sr), 0, sr, 1);
      addMono(bus, boomSound(sr), 0, sr, 0.45);
      addStereo(bus, sparkleSound(sr, 1.3, 30, 36), 0.03, sr, 1);
      return finalize(bus, sr);
    }
  }
}

/** Resposta de sala curta para o send de reverb (o ConvolverNode normaliza o nível). */
export function renderReverbImpulse(sr: number): StereoSignal {
  const duration = 1.4;
  const n = samples(duration, sr);
  const rng = new Rng(3);
  const out = { left: rng.noise(n), right: rng.noise(n) };
  const silent = samples(0.012, sr);
  for (const channel of [out.left, out.right]) {
    for (let i = 0; i < n; i++) channel[i] *= Math.exp(-(i / sr) / (duration / 6.5));
    lowpass(channel, 5000, sr);
    for (let i = 0; i < Math.min(silent, n); i++) channel[i] = 0;
  }
  return out;
}
