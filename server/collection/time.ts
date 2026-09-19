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

/** ISO week in Brasília time (UTC-3) as YYYY-Www: the free Prata pack turns over on Monday at midnight there. */
export function isoWeekKeyUtcMinus3(now: number): string {
  const shifted = new Date(now - 3 * 60 * 60_000);
  const date = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  // The Thursday of this week decides the ISO year and week number.
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const week = 1 + Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / (7 * 86_400_000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Month in Brasília time (UTC-3) as YYYY-MM: the free Ouro pack turns over on the 1st at midnight there. */
export function monthKeyUtcMinus3(now: number): string {
  return new Date(now - 3 * 60 * 60_000).toISOString().slice(0, 7);
}
