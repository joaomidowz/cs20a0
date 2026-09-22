// tests/missionsRules.test.ts
// Regras puras das missões: períodos em UTC-3 e quanto cada run soma.
import { describe, expect, it } from 'vitest';
import { MISSIONS, isoWeekKey, missionIncrements, missionPeriodEnd, missionPeriodKey } from '../src/lib/game/online/missions-rules';
import type { OnlineTranslationKey } from '../src/lib/game/online/i18n';

describe('missões: períodos', () => {
  it('dia e semana viram à meia-noite de Brasília', () => {
    const lateSaturday = Date.UTC(2026, 8, 20, 2, 30); // 23:30 de sábado, 19/09, em UTC-3
    expect(missionPeriodKey('daily', lateSaturday, 7)).toBe('d:2026-09-19');
    expect(missionPeriodKey('weekly', lateSaturday, 7)).toBe('w:2026-38');
    expect(missionPeriodKey('season', lateSaturday, 7)).toBe('s:7');
    expect(missionPeriodKey('solo', lateSaturday, 7)).toBe('d:2026-09-19');
    expect(missionPeriodEnd('daily', lateSaturday, 0)).toBe(Date.UTC(2026, 8, 20, 3));
    expect(missionPeriodEnd('solo', lateSaturday, 0)).toBe(Date.UTC(2026, 8, 20, 3));
    expect(missionPeriodEnd('weekly', lateSaturday, 0)).toBe(Date.UTC(2026, 8, 21, 3));
    expect(missionPeriodKey('weekly', Date.UTC(2026, 8, 21, 3), 7)).toBe('w:2026-39');
  });

  it('solo paga o triplo e renova no dia seguinte', () => {
    const solo = (id: string) => MISSIONS.find((mission) => mission.id === id)!;
    expect(solo('solo_champions').coins).toBe(1680);
    expect(solo('solo_streak_2').coins).toBe(630);
    expect(solo('solo_streak_3').coins).toBe(1050);
    expect(solo('solo_flawless').coins).toBe(1260);
    const midnight = Date.UTC(2026, 8, 20, 3);
    expect(missionPeriodKey('solo', midnight, 7)).toBe('d:2026-09-20');
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
  const base = { competitive: true, champion: false, mvp: false, field: 'random' as const, seriesLost: 2, soloStreak: 0, lineupsDistinct: 0 };
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

  it('lineups distintas contam nos dois mundos, em modo set; baú não vem de run', () => {
    const ranked = missionIncrements({ ...base, lineupsDistinct: 2 }).find((item) => item.mission.id === 'daily_lineups_3');
    const solo = missionIncrements({ ...base, competitive: false, lineupsDistinct: 3 }).find((item) => item.mission.id === 'daily_lineups_3');
    expect(ranked).toMatchObject({ mode: 'set', value: 2 });
    expect(solo).toMatchObject({ mode: 'set', value: 3 });
    expect(ids({ ...base, lineupsDistinct: 5, champion: true, mvp: true })).not.toContain('daily_packs_5');
    expect(ids({ ...base, competitive: false, lineupsDistinct: 5 })).not.toContain('daily_packs_5');
  });
});

describe('missões: contrato de i18n', () => {
  it('toda missão e medalha da season tem label nos três idiomas', async () => {
    const { translateOnline } = await import('../src/lib/game/online/i18n');
    const languages = ['pt-BR', 'en', 'es'] as const;
    const keys = [...MISSIONS.map((mission) => `mission_${mission.id}`), ...['season_champion', 'season_vice', 'season_third', 'season_top8', 'season_top12', 'season_top16'].map((kind) => `award_${kind}`), 'seasonPrizes'];
    for (const language of languages) {
      for (const key of keys) {
        expect(translateOnline(language, key as OnlineTranslationKey), `${language}:${key}`).toBeTruthy();
      }
    }
  });

  it('o prêmio total da season é a soma do ladder', async () => {
    const { SEASON_PRIZES } = await import('../src/lib/game/online/collection-rules');
    expect(SEASON_PRIZES).toHaveLength(16);
    expect(SEASON_PRIZES.reduce((sum, coins) => sum + coins, 0)).toBe(765_000);
    expect(SEASON_PRIZES[0]).toBe(150_000);
    expect(SEASON_PRIZES[1]).toBe(100_000);
    expect(SEASON_PRIZES[2]).toBe(75_000);
  });
});
