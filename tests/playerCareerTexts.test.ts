// tests/playerCareerTexts.test.ts
// Textos da Carreira de Jogador sem travessão: origens, funções, nomes de campeonato, histórias da call e falas.
import { describe, expect, it } from 'vitest';
import { ARCHETYPES, ROLE_META, chooseStartingOrg, createPlayerCareer, startSeason } from '../src/lib/game/playerCareer/engine';
import { clutchStory, DECISION_MATRIX, SHARED_SITUATIONS } from '../src/lib/game/playerCareer/decisions';
import { talkTo, matesOf } from '../src/lib/game/playerCareer/squad';
import { sceneOrgs } from '../src/lib/game/playerCareer/data';

const DASH = /—|--/;

describe('textos sem travessão', () => {
  it('origens e funções', () => {
    for (const meta of Object.values(ARCHETYPES)) expect(meta.blurb).not.toMatch(DASH);
    for (const meta of Object.values(ROLE_META)) expect(meta.blurb).not.toMatch(DASH);
  });

  it('nomes de campeonato em todos os níveis', () => {
    const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'igl', seed: 'texts' });
    const started = chooseStartingOrg(base, base.pendingDraw!.find((option) => option.kind === 'real')!.orgId);
    for (const level of [1, 2, 3, 4]) {
      const org = sceneOrgs.find((candidate) => candidate.level === level);
      if (!org) continue;
      for (const entry of startSeason({ ...started, orgId: org.id }).calendar ?? []) expect(entry.name).not.toMatch(DASH);
    }
  });

  it('histórias da call', () => {
    for (const situation of [...Object.values(DECISION_MATRIX).flat(), ...SHARED_SITUATIONS]) {
      for (const alternative of situation.alternatives) {
        for (const won of [true, false]) {
          expect(clutchStory(alternative.profile, alternative.text, won, 2)).not.toMatch(DASH);
          // Com o roteiro: a história conta o que você fez (plantou, desarmou, salvou) sem travessão nem infinitivo solto.
          const facts = { intent: alternative.intent, survived: !won, planted: alternative.intent === 'plant', defused: alternative.intent === 'defuse' && won, assisted: alternative.intent === 'support' };
          const story = clutchStory(alternative.profile, alternative.text, won, 1, facts);
          expect(story).not.toMatch(DASH);
          expect(story).not.toMatch(/[Vv]ocê [a-zà-ú]+(ar|er|ir)\b/);
          if (facts.planted) expect(story).toMatch(/plantou a bomba/);
          if (facts.defused) expect(story).toMatch(/desarmou a bomba/);
          if (alternative.intent === 'save' && !won) expect(story).toMatch(/arma/);
          if (!won && alternative.intent !== 'save') expect(story).not.toMatch(/te bangaram|te pegou/); // você saiu vivo
          // Matou e caiu: a jogada nasceu, a história não pode dizer o contrário.
          const fought = clutchStory(alternative.profile, alternative.text, false, 2, { ...facts, survived: false });
          if (alternative.intent !== 'save') expect(fought).not.toMatch(/antes da jogada nascer|te bangaram/);
        }
      }
    }
  });

  it('falas dos parceiros', () => {
    for (let index = 0; index < 20; index += 1) {
      let state = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'support', seed: `talk-${index}` });
      state = startSeason(chooseStartingOrg(state, state.pendingDraw!.find((option) => option.kind === 'real')!.orgId));
      const mate = matesOf(state)[index % 4];
      for (let talk = 0; talk < 3; talk += 1) {
        const result = talkTo(state, mate.player.id);
        expect(result.line).not.toMatch(DASH);
        state = result.state;
      }
    }
  });
});
