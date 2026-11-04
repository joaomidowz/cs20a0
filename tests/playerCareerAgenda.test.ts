// tests/playerCareerAgenda.test.ts
// A semana entre campeonatos: catálogo grande, cartas sorteadas por janela, uma escolha por semana e efeitos reais.
import { describe, expect, it } from 'vitest';
import { chooseStartingOrg, createPlayerCareer, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { AGENDA, AGENDA_BY_ID, agendaAvailable, agendaChips, applyAgenda, applyCustomTraining, coachTalk, coachTalksLeft, coachTipsOf, customTrainingSplit, drawAgenda, ROLE_SKILLS, TRAINING_BY_FOCUS } from '../src/lib/game/playerCareer/agenda';
import { matesOf, myPlayerOf, relationshipOf, TRAIN_CAP } from '../src/lib/game/playerCareer/squad';

function seasonAt(seed: string, real = true): PlayerCareerState {
  const career = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'awper', seed });
  const option = career.pendingDraw!.find((candidate) => candidate.kind === (real ? 'real' : 'lan-house'))!;
  return startSeason(chooseStartingOrg(career, option.orgId));
}

describe('catálogo da semana', () => {
  it('tem 50+ ações com ids únicos, efeito e texto curto sem travessão', () => {
    expect(AGENDA.length).toBeGreaterThanOrEqual(50);
    expect(new Set(AGENDA.map((action) => action.id)).size).toBe(AGENDA.length);
    for (const action of AGENDA) {
      expect(agendaChips(action.effects).length).toBeGreaterThan(0);
      for (const text of [action.title, action.text, action.line, action.risk?.line ?? '']) {
        expect(text).not.toMatch(/—|--/);
      }
      expect(action.title.length).toBeLessThanOrEqual(34);
      expect(action.text.length).toBeLessThanOrEqual(60);
    }
  });

  it('cobre treino, amigos, bootcamp, stream, coach, profissional, time, descanso e mercado', () => {
    expect(new Set(AGENDA.map((action) => action.category)).size).toBe(9);
  });
});

describe('cartas da janela', () => {
  it('4 cartas sorteadas, sem os treinos básicos (esses viram o treino livre), iguais na mesma janela', () => {
    const career = seasonAt('agenda-draw');
    const cards = drawAgenda(career);
    expect(cards).toHaveLength(4);
    const basic = new Set(Object.values(TRAINING_BY_FOCUS));
    for (const card of cards) expect(basic.has(card.id)).toBe(false);
    expect(new Set(cards.map((card) => card.category)).size).toBe(4);
    expect(drawAgenda(career).map((card) => card.id)).toEqual(cards.map((card) => card.id));
  });

  it('na lan house não aparece bootcamp; sem fama não aparece collab', () => {
    const lan = seasonAt('agenda-lan', false);
    for (let index = 0; index < 6; index += 1) {
      const window = recordEventResult(lan, 0, { name: 'x', placement: 'Quartas', rating: 1, seriesWins: 0, seriesLosses: 1 });
      for (const card of drawAgenda(index ? window : lan)) {
        expect(card.category).not.toBe('bootcamp');
        expect(card.id).not.toBe('collab-streamer');
      }
    }
    expect(agendaAvailable(lan, AGENDA_BY_ID.get('bootcamp-europa')!)).toBe(false);
  });
});

describe('escolher a ação da semana', () => {
  it('aplica os efeitos uma vez por janela', () => {
    const career = seasonAt('agenda-apply');
    const result = applyAgenda(career, 'treino-mira');
    expect(result.state.trained.firepower).toBe(2);
    expect(result.state.trainCount).toBe(1);
    expect(result.chips.find((chip) => chip.label === 'Mira')?.value).toBe(2);
    const again = applyAgenda(result.state, 'psicologo');
    expect(again.state).toBe(result.state);
    expect(again.chips).toHaveLength(0);
  });

  it('elenco mexe na relação dos 4 parceiros; moral e forma ficam nos limites', () => {
    const career = seasonAt('agenda-team');
    const before = matesOf(career).map((mate) => relationshipOf(career, mate.player.id));
    const after = applyAgenda(career, 'jantar-time').state;
    matesOf(after).forEach((mate, index) => expect(relationshipOf(after, mate.player.id)).toBe(Math.min(100, before[index] + 5)));
    const low = applyAgenda({ ...career, morale: 2 }, 'treino-maratona').state;
    expect(low.morale).toBeGreaterThanOrEqual(0);
    const hot = applyAgenda({ ...career, form: 3 }, 'coach-anti').state;
    expect(hot.form).toBe(3);
  });

  it('atributo respeita o teto do treino', () => {
    const career = { ...seasonAt('agenda-cap'), trained: { firepower: TRAIN_CAP - 1 } };
    expect(applyAgenda(career, 'coach-mira-particular').state.trained.firepower).toBe(TRAIN_CAP);
  });

  it('forma vale no próximo campeonato e zera depois dele', () => {
    const career = seasonAt('agenda-form');
    const formed = applyAgenda(career, 'coach-anti').state;
    expect(formed.form).toBe(2);
    expect(myPlayerOf(formed).overall).toBe(Math.min(99, career.overall + 2));
    const played = recordEventResult(formed, 0, { name: 'x', placement: 'Semis', rating: 1.05, seriesWins: 1, seriesLosses: 1 });
    expect(played.form).toBe(0);
  });

  it('moral alta sobe o Mental da carta; baixa derruba', () => {
    const career = seasonAt('agenda-morale');
    const base = myPlayerOf({ ...career, morale: 60 }).mental ?? 0;
    expect(myPlayerOf({ ...career, morale: 100 }).mental).toBeGreaterThan(base);
    expect(myPlayerOf({ ...career, morale: 10 }).mental).toBeLessThan(base);
  });
});

describe('treino livre', () => {
  it('divide os pontos: 1 habilidade +3, 2 → +2/+2, 3 → +2/+1/+1, 4 → +1 cada', () => {
    expect(customTrainingSplit(['clutch'])).toEqual({ clutch: 3 });
    expect(customTrainingSplit(['clutch', 'awp'])).toEqual({ clutch: 2, awp: 2 });
    expect(customTrainingSplit(['clutch', 'awp', 'mental'])).toEqual({ clutch: 2, awp: 1, mental: 1 });
    expect(customTrainingSplit(['clutch', 'awp', 'mental', 'igl', 'entry'])).toEqual({ clutch: 1, awp: 1, mental: 1, igl: 1 });
  });

  it('treina 3 habilidades de uma vez e ocupa a semana', () => {
    const career = seasonAt('free-train');
    const result = applyCustomTraining(career, ['firepower', 'clutch', 'mental']);
    expect(result.state.trained).toMatchObject({ firepower: 2, clutch: 1, mental: 1 });
    expect(result.state.trainCount).toBe(1);
    expect(result.line).toContain('Mira, Clutch e Mental');
    expect(applyCustomTraining(result.state, ['igl']).state).toBe(result.state);
    expect(applyAgenda(result.state, 'psicologo').state).toBe(result.state);
  });
});

describe('conversa com o coach', () => {
  it('sem conversa não há recomendação; a primeira aponta os 2 pontos fracos da função', () => {
    const career = seasonAt('coach-1');
    expect(coachTipsOf(career)).toEqual([]);
    const first = coachTalk(career);
    expect(first.tips).toHaveLength(2);
    for (const tip of first.tips) expect(ROLE_SKILLS.awper).toContain(tip);
    expect(coachTipsOf(first.state)).toEqual(first.tips);
    expect(first.talksLeft).toBe(2);
  });

  it('até 3 por TEMPORADA: jogar um campeonato não devolve conversa; a temporada nova sim', () => {
    let state = seasonAt('coach-2');
    const lines: string[] = [];
    for (let talk = 0; talk < 4; talk += 1) {
      const result = coachTalk(state);
      lines.push(result.line);
      state = result.state;
    }
    expect(new Set(lines.slice(0, 3)).size).toBe(3);
    expect(lines[3]).toContain('já falou tudo');
    expect(coachTalksLeft(state)).toBe(0);
    expect(applyCustomTraining(state, ['awp']).state.trained.awp).toBe(3);
    const nextWindow = recordEventResult(state, 0, { name: 'x', placement: 'Semis', rating: 1, seriesWins: 1, seriesLosses: 1 });
    expect(coachTalksLeft(nextWindow)).toBe(0);
    // A dica marcada no treino livre vale só a semana em que o coach falou.
    expect(coachTipsOf(state).length).toBeGreaterThan(0);
    expect(coachTipsOf(nextWindow)).toEqual([]);
    const nextSeason = { ...nextWindow, seasonNumber: nextWindow.seasonNumber + 1 };
    expect(coachTalksLeft(nextSeason)).toBe(3);
    expect(coachTipsOf(nextSeason)).toEqual([]);
  });
});
