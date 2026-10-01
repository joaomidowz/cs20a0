export const sellableQuantity = (owned: number, locked: boolean): number => Math.max(0, owned - (locked ? 1 : 0));

/** Each tap adds one copy; tapping after the maximum clears that card from the batch. */
export function toggleQuickSellQuantity(selection: Map<string, number>, cardId: string, maximum: number): Map<string, number> {
  const next = new Map(selection);
  const quantity = next.get(cardId) ?? 0;
  if (maximum <= 0 || quantity >= maximum) next.delete(cardId);
  else next.set(cardId, quantity + 1);
  return next;
}

export const quickSellCount = (selection: Map<string, number>): number => [...selection.values()].reduce((sum, quantity) => sum + quantity, 0);

export const quickSellTotal = (selection: Map<string, number>, valueOf: (cardId: string) => number): number =>
  [...selection].reduce((sum, [cardId, quantity]) => sum + valueOf(cardId) * quantity, 0);
