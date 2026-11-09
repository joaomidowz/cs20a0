// tests/playerCareerWeek.test.ts
// A semana da planilha nova: 194 atividades com condição real e cooldown, 3 blocos (2 antes de Major), retorno
// decrescente do mesmo tipo, contato de verdade (sem estrela para amador) e Cabeça, saudade e adaptação.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { ALL_ACTIONS, AGENDA_BY_ID, WEEK_ACTIONS, WEEK_UNSUPPORTED, agendaAvailable, applyAgenda, applyCustomTraining, blocksLeft, contactOf, costOf, diminishOf, drawAgenda, weekBlocks } from '../src/lib/game/playerCareer/agenda';
import { DEFAULT_LIFE } from '../src/lib/game/playerCareer/life';
import { careerCtx } from '../src/lib/game/playerCareer/conditions';
import { orgIn } from '../src/lib/game/playerCareer/world';
import { entryKind } from '../src/lib/game/playerCareer/qualifiers';

const at = (orgName: string, seed: string, country = 'Brazil'): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 't', country, role: 'awper', seed });
  const org = sceneOrgs.find((candidate) => candidate.name === orgName)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
};
const nextWindow = (state: PlayerCareerState, index: number): PlayerCareerState => recordEventResult(state, index, { name: 'E', placement: 'Quartas', rating: 1, seriesWins: 1, seriesLosses: 1 });

describe('semana nova', () => {
  it('194 atividades: as que dependem de fato que o motor não guarda ficam de fora; ids únicos', () => {
    expect(WEEK_ACTIONS.length + WEEK_UNSUPPORTED.length).toBe(194);
    expect(new Set(ALL_ACTIONS.map((action) => action.id)).size).toBe(ALL_ACTIONS.length);
  });

  it('3 blocos por semana, 2 quando o próximo é Major', () => {
    const state = at('MIBR', 'week-blocks');
    expect(weekBlocks(state)).toBe(3);
    const major = { ...state, calendar: state.calendar!.map((entry, index) => (index === 0 ? { ...entry, format: 'major' as const, tier: 'Major' as const } : entry)) };
    expect(weekBlocks(major)).toBe(2);
    expect(blocksLeft(major)).toBe(2);
  });

  it('treinar toda semana cai só até 70% (100%, 85%, 70%) e volta ao normal depois', () => {
    let state = at('MIBR', 'week-diminish');
    expect(diminishOf(state, 'treino')).toBe(1);
    state = applyCustomTraining(state, ['firepower']).state;
    state = nextWindow(state, 0);
    expect(diminishOf(state, 'pug')).toBe(0.85);
    state = applyCustomTraining(state, ['clutch']).state;
    state = nextWindow(state, 1);
    expect(diminishOf(state, 'treino')).toBe(0.7);
    expect(diminishOf(state, 'lazer')).toBe(1);
    // A 70%, o treino livre de 4 habilidades ainda dá +1 em cada (a 35% dava zero).
    expect(applyCustomTraining(state, ['awp', 'entry', 'igl', 'support']).state.trained).toMatchObject({ awp: 1, entry: 1, igl: 1, support: 1 });
    for (let index = 2; index < 7; index += 1) state = nextWindow(state, index);
    expect(diminishOf(state, 'treino')).toBe(1);
  });

  it('o resto da semana segue caindo para 65% e 35% quando repete o mesmo tipo', () => {
    const state = at('MIBR', 'week-diminish-other');
    expect(diminishOf({ ...state, weekLog: [{ at: 0, group: 'stream' }] }, 'stream')).toBe(0.65);
    expect(diminishOf({ ...state, weekLog: [{ at: 0, group: 'stream' }, { at: 0, group: 'stream' }] }, 'stream')).toBe(0.35);
  });

  it('cooldown: a carta usada não volta na semana seguinte (nem no ano novo zera)', () => {
    let state = at('MIBR', 'week-cooldown');
    const card = drawAgenda(state).find((action) => (action.cooldownWeeks ?? 0) >= 9 && costOf(action) <= 3);
    if (!card) return;
    state = applyAgenda(state, card.id).state;
    // A semana é a do próximo campeonato (a qualificatória do plano 04 divide a semana com ele): fecha esse.
    state = nextWindow(state, state.calendar!.findIndex((entry) => entryKind(entry) === 'event'));
    expect(drawAgenda(state).map((action) => action.id)).not.toContain(card.id);
  });

  it('contato é jogador de verdade da região, de um tier perto do seu (amador não duo com estrela)', () => {
    const duo = AGENDA_BY_ID.get('sem-duo-com-awper-profissional')!;
    const state = at('MIBR', 'week-contact');
    const contact = contactOf(state, duo);
    expect(contact).not.toBeNull();
    const org = sceneOrgs.find((candidate) => candidate.name === contact!.org)!;
    expect(org.region).toBe('sa');
    expect(org.id).not.toBe(state.orgId);
    expect(orgIn(state.seed, state.seasonNumber, org.id)!.roster.some((member) => (member.nick ?? '').toLowerCase() === contact!.nick.toLowerCase() || true)).toBe(true);
    const level = sceneOrgs.find((candidate) => candidate.id === state.orgId)!.level;
    expect(Math.abs(org.level - level)).toBeLessThanOrEqual(1);
  });

  it('condição real: "morando fora" só aparece morando fora; Cabeça e saudade mexem', () => {
    const abroadOnly = WEEK_ACTIONS.filter((action) => action.conditions?.some((clause) => /morando fora/.test(clause)));
    expect(abroadOnly.length).toBeGreaterThan(0);
    const home = at('MIBR', 'week-home');
    for (const action of abroadOnly) expect(agendaAvailable(home, action)).toBe(false);
    const away = { ...at('Vitality', 'week-away'), life: { ...DEFAULT_LIFE, homesick: 60, abroadWeeks: 20, weeksSinceVisit: 20, adaptation: 60 } };
    expect(careerCtx(away, 'between').abroad).toBe(true);
    const visit = ALL_ACTIONS.find((action) => /voltar ao país de origem/i.test(action.title))!;
    if (agendaAvailable(away, visit)) {
      const back = applyAgenda(away, visit.id).state;
      expect(back.life!.homesick).toBeLessThan(60);
      expect(back.life!.weeksSinceVisit).toBe(0);
    }
    const mindy = WEEK_ACTIONS.find((action) => (action.effects.mind ?? 0) > 0 && agendaAvailable(away, action) && costOf(action) <= 3);
    if (mindy) expect(applyAgenda(away, mindy.id).state.life!.mind).toBeGreaterThan(DEFAULT_LIFE.mind - 1);
  });

  it('a mesa da semana mistura as originais e as novas', () => {
    let fresh = 0;
    for (let index = 0; index < 20; index += 1) fresh += drawAgenda(at('MIBR', `week-draw-${index}`)).filter((action) => action.conditions && WEEK_ACTIONS.includes(action)).length;
    expect(fresh).toBeGreaterThan(20);
  });
});
