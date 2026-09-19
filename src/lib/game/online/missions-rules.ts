/**
 * Missões: regras puras, compartilhadas por cliente e servidor. Valores ficam nesta tabela, fáceis de ajustar.
 * Online (daily/weekly/season) só conta em run competitivo; solo só em run não competitivo e paga uma vez por season.
 */
export type MissionScope = 'daily' | 'weekly' | 'season' | 'solo';
export type MissionMetric = 'played' | 'won' | 'mvp' | 'champions_title' | 'solo_streak' | 'flawless_title';

export interface MissionDef {
  id: string;
  scope: MissionScope;
  metric: MissionMetric;
  target: number;
  coins: number;
  /** Pacotes básicos grátis somados aos sobres do dia do resgate. */
  packs: number;
}

export const MISSIONS: readonly MissionDef[] = [
  { id: 'daily_play_1', scope: 'daily', metric: 'played', target: 1, coins: 150, packs: 0 },
  { id: 'daily_play_3', scope: 'daily', metric: 'played', target: 3, coins: 300, packs: 0 },
  { id: 'daily_mvp_1', scope: 'daily', metric: 'mvp', target: 1, coins: 250, packs: 0 },
  { id: 'weekly_play_10', scope: 'weekly', metric: 'played', target: 10, coins: 600, packs: 0 },
  { id: 'weekly_win_1', scope: 'weekly', metric: 'won', target: 1, coins: 800, packs: 0 },
  { id: 'weekly_mvp_3', scope: 'weekly', metric: 'mvp', target: 3, coins: 700, packs: 1 },
  { id: 'season_play_40', scope: 'season', metric: 'played', target: 40, coins: 2000, packs: 1 },
  { id: 'season_win_5', scope: 'season', metric: 'won', target: 5, coins: 3000, packs: 2 },
  { id: 'season_mvp_10', scope: 'season', metric: 'mvp', target: 10, coins: 2500, packs: 1 },
  { id: 'solo_champions', scope: 'solo', metric: 'champions_title', target: 1, coins: 800, packs: 0 },
  { id: 'solo_streak_2', scope: 'solo', metric: 'solo_streak', target: 2, coins: 300, packs: 0 },
  { id: 'solo_streak_3', scope: 'solo', metric: 'solo_streak', target: 3, coins: 500, packs: 0 },
  { id: 'solo_flawless', scope: 'solo', metric: 'flawless_title', target: 1, coins: 600, packs: 0 }
];

export const missionById = new Map(MISSIONS.map((mission) => [mission.id, mission]));

const shifted = (now: number) => new Date(now - 3 * 60 * 60_000);

/** Semana ISO (segunda a domingo) no horário de Brasília, como `YYYY-WW`. */
export function isoWeekKey(now: number): string {
  const date = shifted(now);
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

/** Chave do período em que a missão está: `d:2026-09-19`, `w:2026-38` ou `s:<seasonId>` (season e solo). */
export function missionPeriodKey(scope: MissionScope, now: number, seasonId: number): string {
  if (scope === 'daily') return `d:${shifted(now).toISOString().slice(0, 10)}`;
  if (scope === 'weekly') return `w:${isoWeekKey(now)}`;
  return `s:${seasonId}`;
}

/** Quando o período atual vira (ms UTC). Season e solo viram com o mês, informado pelo chamador. */
export function missionPeriodEnd(scope: MissionScope, now: number, seasonEndsAt: number): number {
  const date = shifted(now);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + 3 * 60 * 60_000;
  if (scope === 'daily') return midnight + 86_400_000;
  if (scope === 'weekly') return midnight + (8 - (date.getUTCDay() || 7)) * 86_400_000;
  return seasonEndsAt;
}

export interface MissionRunFacts {
  competitive: boolean;
  champion: boolean;
  mvp: boolean;
  field: 'random' | 'champions';
  seriesLost: number;
  /** Sequência solo depois deste run (só run não competitivo). */
  soloStreak: number;
}

/** Quanto um run soma a cada missão. `set` substitui o progresso pelo maior valor (sequência); `add` soma. */
export function missionIncrements(facts: MissionRunFacts): Array<{ mission: MissionDef; mode: 'add' | 'set'; value: number }> {
  const out: Array<{ mission: MissionDef; mode: 'add' | 'set'; value: number }> = [];
  for (const mission of MISSIONS) {
    if ((mission.scope === 'solo') === facts.competitive) continue;
    let value = 0;
    let mode: 'add' | 'set' = 'add';
    switch (mission.metric) {
      case 'played': value = 1; break;
      case 'won': value = facts.champion ? 1 : 0; break;
      case 'mvp': value = facts.mvp ? 1 : 0; break;
      case 'champions_title': value = facts.field === 'champions' && facts.champion ? 1 : 0; break;
      case 'flawless_title': value = facts.champion && facts.seriesLost === 0 ? 1 : 0; break;
      case 'solo_streak': value = facts.soloStreak; mode = 'set'; break;
    }
    if (value > 0) out.push({ mission, mode, value });
  }
  return out;
}
