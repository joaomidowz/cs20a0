// tests/missionsRules.test.ts
// Regras puras das missões: períodos em UTC-3 e quanto cada run soma.
import { describe, expect, it } from 'vitest';
import { MISSIONS, isoWeekKey, missionIncrements, missionPeriodEnd, missionPeriodKey } from '../src/lib/game/online/missions-rules';

describe('missões: períodos', () => {
  it('dia e semana viram à meia-noite de Brasília', () => {
    const lateSaturday = Date.UTC(2026, 8, 20, 2, 30); // 23:30 de sábado, 19/09, em UTC-3
    expect(missionPeriodKey('daily', lateSaturday, 7)).toBe('d:2026-09-19');
    expect(missionPeriodKey('weekly', lateSaturday, 7)).toBe('w:2026-38');
    expect(missionPeriodKey('season', lateSaturday, 7)).toBe('s:7');
    expect(missionPeriodKey('solo', lateSaturday, 7)).toBe('s:7');
    expect(missionPeriodEnd('daily', lateSaturday, 0)).toBe(Date.UTC(2026, 8, 20, 3));
    expect(missionPeriodEnd('weekly', lateSaturday, 0)).toBe(Date.UTC(2026, 8, 21, 3));
    expect(missionPeriodKey('weekly', Date.UTC(2026, 8, 21, 3), 7)).toBe('w:2026-39');
  });

  it('semana ISO atravessa a virada do ano', () => {
    expect(isoWeekKey(Date.UTC(2027, 0, 1, 12))).toBe('2026-53');
    expect(isoWeekKey(Date.UTC(2026, 0, 1, 12))).toBe('2026-01');
  });

  it('ids únicos e valores positivos', () => {
    expect(new Set(MISSIONS.map((mission) => mission.id)).size).toBe(MISSIONS.length);
    for (const mission of MISSIONS) { expect(mission.target).toBeGreaterThan(0); expect(mission.coins).toBeGreaterThan(0); }
  });
});

describe('missões: incrementos por run', () => {
  const base = { competitive: true, champion: false, mvp: false, field: 'random' as const, seriesLost: 2, soloStreak: 0 };
  const ids = (facts: typeof base | Parameters<typeof missionIncrements>[0]) => missionIncrements(facts).map((item) => item.mission.id).sort();

  it('run competitivo conta só nas online', () => {
    expect(ids(base)).toEqual(['daily_play_1', 'daily_play_3', 'season_play_40', 'weekly_play_10']);
    expect(ids({ ...base, champion: true, mvp: true })).toContain('weekly_win_1');
    expect(ids({ ...base, champion: true, mvp: true })).toContain('season_mvp_10');
  });

  it('run solo conta só nas solo, pela entrada', () => {
    expect(ids({ ...base, competitive: false })).toEqual([]);
    expect(ids({ ...base, competitive: false, champion: true, field: 'champions', seriesLost: 0, soloStreak: 3 })).toEqual(['solo_champions', 'solo_flawless', 'solo_streak_2', 'solo_streak_3']);
    const streak = missionIncrements({ ...base, competitive: false, champion: true, soloStreak: 2 }).find((item) => item.mission.id === 'solo_streak_3');
    expect(streak).toMatchObject({ mode: 'set', value: 2 });
  });
});
