import { describe, expect, it } from 'vitest';
import { quickSellCount, quickSellTotal, sellableQuantity, toggleQuickSellQuantity } from '../src/lib/game/online/quick-sell';

describe('venda rápida', () => {
  it('reserva uma cópia escalada e libera apenas as repetidas', () => {
    expect(sellableQuantity(1, true)).toBe(0);
    expect(sellableQuantity(3, true)).toBe(2);
    expect(sellableQuantity(3, false)).toBe(3);
  });

  it('o toque percorre as cópias livres e depois remove a carta', () => {
    let selected = new Map<string, number>();
    selected = toggleQuickSellQuantity(selected, 'device-2016', 2);
    expect(selected.get('device-2016')).toBe(1);
    selected = toggleQuickSellQuantity(selected, 'device-2016', 2);
    expect(selected.get('device-2016')).toBe(2);
    selected = toggleQuickSellQuantity(selected, 'device-2016', 2);
    expect(selected.has('device-2016')).toBe(false);
  });

  it('soma unidades e valores de jogadores e coaches', () => {
    const selected = new Map([['device-2016', 2], ['zonic-2019', 1]]);
    const values = new Map([['device-2016', 4000], ['zonic-2019', 1600]]);
    expect(quickSellCount(selected)).toBe(3);
    expect(quickSellTotal(selected, (id) => values.get(id) ?? 0)).toBe(9600);
  });
});
