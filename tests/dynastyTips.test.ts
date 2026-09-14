// tests/dynastyTips.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIP_STATE, DYNASTY_TIPS, disableTips, markTipSeen, nextTip, parseTipState, serializeTipState } from '../src/lib/game/dynasty/tips';
import { TIP_STORAGE_KEY, loadTipPreferences, saveTipPreferences } from '../src/lib/game/preferences';

describe('dicas da Dinastia', () => {
  it('tem exatamente uma dica por contexto, na ordem do fluxo', () => {
    expect(DYNASTY_TIPS.map((tip) => tip.context)).toEqual(['identity', 'series-plan', 'team-tab', 'training', 'window', 'swap']);
    expect(new Set(DYNASTY_TIPS.map((tip) => tip.id)).size).toBe(DYNASTY_TIPS.length);
  });

  it('mostra a dica do contexto até ser vista, e depois nunca mais', () => {
    const tip = nextTip('identity', DEFAULT_TIP_STATE);
    expect(tip?.context).toBe('identity');
    const seen = markTipSeen(DEFAULT_TIP_STATE, tip!.id);
    expect(nextTip('identity', seen)).toBeNull();
    expect(nextTip('window', seen)?.context).toBe('window');
    expect(markTipSeen(seen, tip!.id)).toEqual(seen);
  });

  it('desligar esconde todas as dicas', () => {
    const off = disableTips(DEFAULT_TIP_STATE);
    for (const tip of DYNASTY_TIPS) expect(nextTip(tip.context, off)).toBeNull();
  });

  it('JSON inválido ou com formato errado volta ao padrão', () => {
    expect(parseTipState(null)).toEqual(DEFAULT_TIP_STATE);
    expect(parseTipState('{quebrado')).toEqual(DEFAULT_TIP_STATE);
    expect(parseTipState('[1,2]')).toEqual(DEFAULT_TIP_STATE);
    expect(parseTipState('{"seen":"x","disabled":"sim"}')).toEqual(DEFAULT_TIP_STATE);
    expect(parseTipState('{"seen":["tip-identity",3,"inexistente"],"disabled":true}')).toEqual({ seen: ['tip-identity'], disabled: true });
  });

  it('serializa e relê o mesmo estado', () => {
    const state = markTipSeen(disableTips(DEFAULT_TIP_STATE), 'tip-window');
    expect(parseTipState(serializeTipState(state))).toEqual(state);
  });

  it('preferências não quebram sem localStorage ou com storage que lança erro', () => {
    expect(loadTipPreferences(null)).toEqual(DEFAULT_TIP_STATE);
    expect(() => saveTipPreferences(DEFAULT_TIP_STATE, null)).not.toThrow();
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); } };
    expect(loadTipPreferences(broken)).toEqual(DEFAULT_TIP_STATE);
    expect(() => saveTipPreferences(DEFAULT_TIP_STATE, broken)).not.toThrow();
  });

  it('grava e lê pela chave v1', () => {
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    saveTipPreferences(markTipSeen(DEFAULT_TIP_STATE, 'tip-swap'), storage);
    expect(memory.has(TIP_STORAGE_KEY)).toBe(true);
    expect(loadTipPreferences(storage)).toEqual({ seen: ['tip-swap'], disabled: false });
  });
});
