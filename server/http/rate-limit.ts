/** Sliding-window counter per key, in memory (one process, one replica). */
export function createSlidingLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    /** Records one hit and tells whether the key is still within the limit. */
    hit(key: string): boolean {
      const current = now();
      const recent = (hits.get(key) ?? []).filter((timestamp) => current - timestamp < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(current);
      hits.set(key, recent);
      return true;
    },
    /** Drops keys with no recent hits; called from the server tick so the map never grows unbounded. */
    prune() {
      const current = now();
      for (const [key, timestamps] of hits) {
        if (timestamps.every((timestamp) => current - timestamp >= windowMs)) hits.delete(key);
      }
    }
  };
}

export type SlidingLimiter = ReturnType<typeof createSlidingLimiter>;
