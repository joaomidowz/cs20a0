/** Calendar day in Brasília time (UTC-3, no DST) as YYYY-MM-DD: the daily packs turn over at midnight there. */
export function dayKeyUtcMinus3(now: number): string {
  return new Date(now - 3 * 60 * 60_000).toISOString().slice(0, 10);
}

/** First day of the season month (UTC-3) as YYYY-MM-01 plus its window in UTC ms. */
export function seasonMonthOf(now: number): { month: string; startsAt: number; endsAt: number } {
  const shifted = new Date(now - 3 * 60 * 60_000);
  const year = shifted.getUTCFullYear();
  const monthIndex = shifted.getUTCMonth();
  const startsAt = Date.UTC(year, monthIndex, 1, 3);
  const endsAt = Date.UTC(year, monthIndex + 1, 1, 3);
  return { month: `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`, startsAt, endsAt };
}
