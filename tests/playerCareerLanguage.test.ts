// tests/playerCareerLanguage.test.ts
// Idioma da call: time nacional fala o idioma do país, misto fala inglês; você paga sinergia até aprender
// (imersão a cada campeonato e aulas na semana); time da cena misto com inglês fraco perde um pouco de força.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';
import { englishBase, languagePenalty, myFluency, nativeLanguage, npcLanguagePenalty, teamLanguage } from '../src/lib/game/playerCareer/language';
import { AGENDA, agendaAvailable, applyAgenda, drawAgenda } from '../src/lib/game/playerCareer/agenda';
import { celebrateResult, matesOf, myLanguageFit, talkTo } from '../src/lib/game/playerCareer/squad';

const at = (orgName: string, country: string, seed: string): PlayerCareerState => {
  const base = createPlayerCareer({ nick: 'tester', country, role: 'rifler', seed });
  const org = sceneOrgs.find((candidate) => candidate.name === orgName)!;
  return startSeason({ ...base, orgId: org.id, pendingDraw: null, drawDone: true, seatsTaken: [] });
};

describe('idioma dos times', () => {
  it('nacional fala o idioma do país; misto fala inglês', () => {
    expect(teamLanguage(sceneOrgs.find((org) => org.name === 'The MongolZ')!.roster)).toBe('mn');
    expect(teamLanguage(sceneOrgs.find((org) => org.name === 'ODDIK')!.roster)).toBe('pt'); // 4 BR + 1 AR
    expect(teamLanguage(sceneOrgs.find((org) => org.name === 'Vitality')!.roster)).toBe('en');
    expect(nativeLanguage('Brazil')).toBe('pt');
    expect(englishBase('Sweden')).toBeGreaterThan(englishBase('Brazil'));
  });
});

describe('você no time', () => {
  it('brasileiro no time brasileiro: nativo, sem custo; no time de inglês: básico, −1 de sinergia nos parceiros', () => {
    const home = at('ODDIK', 'Brazil', 'lang-1');
    expect(myLanguageFit(home)).toMatchObject({ language: 'pt', fluency: 100, penalty: 0 });
    const abroad = at('Vitality', 'Brazil', 'lang-2');
    const fit = myLanguageFit(abroad);
    expect(fit.language).toBe('en');
    expect(fit.penalty).toBe(1);
    const fluent = { ...abroad, languages: { en: 90 } };
    const penaltyGap = matesOf(fluent).map((mate, index) => mate.player.overall! - matesOf(abroad)[index].player.overall!);
    expect(penaltyGap.every((gap) => gap === 1)).toBe(true);
  });

  it('brasileiro na MongolZ não fala nada: −2 e conversa rende metade', () => {
    const career = at('Vitality', 'Brazil', 'lang-3');
    expect(languagePenalty(myFluency(career, 'mn'))).toBe(2);
    const fluentTalk = talkTo({ ...career, languages: { en: 100 } }, matesOf(career)[0].player.id);
    const weakTalk = talkTo(career, matesOf(career)[0].player.id);
    if (fluentTalk.delta > 1) expect(weakTalk.delta).toBeLessThan(fluentTalk.delta);
  });

  it('imersão: cada campeonato no time ensina; a aula da semana ensina mais', () => {
    let career = at('Vitality', 'Brazil', 'lang-4');
    const before = myFluency(career, 'en');
    career = celebrateResult(recordEventResult(career, 0, { name: 'x', placement: 'Quartas', rating: 1, seriesWins: 0, seriesLosses: 1 }), 'Quartas', 0);
    expect(myFluency(career, 'en')).toBe(before + 5);
    const lesson = AGENDA.find((action) => action.id === 'aula-ingles')!;
    expect(agendaAvailable(career, lesson)).toBe(true);
    const learned = applyAgenda(career, 'aula-ingles');
    expect(myFluency(learned.state, 'en')).toBe(before + 5 + 12);
    expect(learned.state.fatigue!).toBeGreaterThan(career.fatigue ?? 0);
  });

  it('inglês fraco: a maioria das semanas traz uma aula de idioma', () => {
    let withLesson = 0;
    for (let index = 0; index < 20; index += 1) if (drawAgenda(at('Vitality', 'Brazil', `draw-${index}`)).some((action) => action.effects.lang)) withLesson += 1;
    expect(withLesson).toBeGreaterThan(10);
    // Fluente em inglês num time de inglês: aula de inglês nem aparece.
    const fluent = { ...at('Vitality', 'Brazil', 'draw-x'), languages: { en: 100 } };
    expect(agendaAvailable(fluent, AGENDA.find((action) => action.id === 'aula-ingles')!)).toBe(false);
  });
});

describe('times da cena', () => {
  it('a penalidade de comunicação é no máximo 1 e quase nenhum time de elite sofre', () => {
    const elite = sceneOrgs.filter((org) => org.level <= 1);
    expect(elite.filter((org) => npcLanguagePenalty(org.roster) > 0).length).toBeLessThanOrEqual(3);
    for (const org of sceneOrgs) expect(npcLanguagePenalty(org.roster)).toBeLessThanOrEqual(1);
  });
});
