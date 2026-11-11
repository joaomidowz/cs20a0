// tests/playerCareerHappeningsV3.test.ts
// Os 200 acontecimentos novos da planilha de 350: só aparecem com as condições conferidas no estado real, respeitam
// único, limite por temporada, cooldown em meses e o teto de gravidade (10 por ano, 3 graves, 1 crítico); as marcas
// das escolhas ficam na vida e fazem o arco voltar; "mind" mexe no Mental, não na moral.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { ALL_HAPPENINGS, HAPPENINGS, HAPPENINGS_V3, HAPPENING_BY_ID, SEASON_CAP, UNSUPPORTED_V3, resolveHappening, rollHappening } from '../src/lib/game/playerCareer/happenings';
import { careerCtx, conditionsHold } from '../src/lib/game/playerCareer/conditions';
import { DEFAULT_LIFE } from '../src/lib/game/playerCareer/life';

const at = (level: number, seed: string): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 't', country: 'Brazil', role: 'rifler', seed });
  const orgId = level === 5 ? 'lan-house' : sceneOrgs.find((org) => org.level === level)!.id;
  return startSeason({ ...base, orgId, pendingDraw: null, drawDone: true, seatsTaken: [] });
};

describe('planilha nova', () => {
  it('200 novos, nenhum id repetido com os originais; os que dependem de round ficam de fora e listados', () => {
    expect(HAPPENINGS_V3.length + UNSUPPORTED_V3.length).toBe(200);
    expect(new Set(ALL_HAPPENINGS.map((event) => event.id)).size).toBe(ALL_HAPPENINGS.length);
    expect(HAPPENINGS.every((event) => event.yearLimit === 1 && event.severity === 'comum')).toBe(true);
    for (const event of HAPPENINGS_V3) expect(event.choices).toHaveLength(3);
  });

  it('o novo só aparece com as condições valendo no momento', () => {
    let seen = 0;
    for (const level of [4, 3, 2, 1]) {
      for (let index = 0; index < 60; index += 1) {
        const state = at(level, `v3-${level}-${index}`);
        for (const trigger of ['post', 'between', 'pre'] as const) {
          const rolled = rollHappening(state, trigger, { eventIndex: 0 });
          const event = rolled.pendingHappening ? HAPPENING_BY_ID.get(rolled.pendingHappening.id)! : null;
          if (!event?.conditions) continue;
          seen += 1;
          expect(conditionsHold(event.conditions, careerCtx(state, trigger, null))).toBe(true);
        }
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it('teto da temporada: no máximo 10, 3 graves e 1 crítico; único não volta; limite por ano', () => {
    let state = at(1, 'v3-cap');
    for (let index = 0; index < 400; index += 1) {
      state = rollHappening({ ...state, preRolled: null }, (['post', 'between', 'pre'] as const)[index % 3], { eventIndex: index % 8 });
      if (state.pendingHappening) state = resolveHappening(state, index % 3).state;
      state = { ...state, pendingMove: null };
    }
    const season = (state.happeningHistory ?? []).filter((record) => record.season === state.seasonNumber);
    expect(season.length).toBeLessThanOrEqual(SEASON_CAP.total);
    expect(season.filter((record) => record.severity === 'grave').length).toBeLessThanOrEqual(SEASON_CAP.grave);
    expect(season.filter((record) => record.severity === 'critico').length).toBeLessThanOrEqual(SEASON_CAP.critico);
    const counts = new Map<string, number>();
    for (const record of season) counts.set(record.id, (counts.get(record.id) ?? 0) + 1);
    for (const [id, count] of counts) expect(count, id).toBeLessThanOrEqual(HAPPENING_BY_ID.get(id)!.yearLimit ?? 1);
    // A escolha fica gravada no histórico.
    expect(season.every((record) => record.choice !== undefined)).toBe(true);
  });

  it('a escolha deixa marca na vida; "mind" mexe no Mental e não na moral', () => {
    const event = HAPPENINGS_V3.find((candidate) => candidate.choices[1].flags?.length && candidate.choices[1].effects.mind)!;
    const state = { ...at(2, 'v3-flag'), life: { ...DEFAULT_LIFE }, morale: 60 };
    const outcome = resolveHappening({ ...state, pendingHappening: { id: event.id, trigger: 'between', eventIndex: 0 } }, 1);
    expect(outcome.state.life!.flags).toEqual(expect.arrayContaining(event.choices[1].flags!));
    expect(outcome.state.life!.mind).not.toBe(DEFAULT_LIFE.mind);
    if (!event.choices[1].effects.mental) expect(outcome.state.morale).toBe(60);
  });
});
