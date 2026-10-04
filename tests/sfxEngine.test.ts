import { describe, expect, it } from 'vitest';
import { ALL_CUES, renderCue, renderReverbImpulse } from '../src/lib/game/sfxEngine';

const SR = 48000;

const scan = (channel: Float32Array) => {
  let peak = 0;
  let finite = true;
  for (let i = 0; i < channel.length; i++) {
    const value = channel[i];
    if (!Number.isFinite(value)) { finite = false; break; }
    peak = Math.max(peak, Math.abs(value));
  }
  return { peak, finite };
};

describe('sfxEngine', () => {
  it('renderiza todos os cues com amostras finitas, pico normalizado e duração sã', () => {
    for (const cue of ALL_CUES) {
      const signal = renderCue(cue, SR);
      expect(signal.left.length, cue).toBe(signal.right.length);
      expect(signal.left.length, cue).toBeGreaterThan(0);
      expect(signal.left.length, cue).toBeLessThan(SR * 4);
      const left = scan(signal.left);
      const right = scan(signal.right);
      expect(left.finite && right.finite, `${cue}: amostra não finita`).toBe(true);
      const peak = Math.max(left.peak, right.peak);
      expect(peak, `${cue}: pico fora da normalização`).toBeGreaterThan(0.9);
      expect(peak, `${cue}: estourou o teto`).toBeLessThanOrEqual(1.0001);
    }
  });

  it('mantém o tick curto o bastante para a cadência da roleta', () => {
    expect(renderCue('tick', SR).left.length).toBeLessThan(SR * 0.06);
  });

  it('é determinístico: duas renderizações do mesmo cue são idênticas', () => {
    const first = renderCue('betWin', SR);
    const second = renderCue('betWin', SR);
    expect(first.left.length).toBe(second.left.length);
    let equal = true;
    for (let i = 0; i < first.left.length; i++) {
      if (first.left[i] !== second.left[i] || first.right[i] !== second.right[i]) { equal = false; break; }
    }
    expect(equal).toBe(true);
  });

  it('gera impulso de reverb finito com o início silenciado', () => {
    const impulse = renderReverbImpulse(SR);
    expect(impulse.left.length).toBe(Math.round(1.4 * SR));
    expect(scan(impulse.left).finite && scan(impulse.right).finite).toBe(true);
    expect(impulse.left[10]).toBe(0);
  });
});
