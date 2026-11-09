// tests/playerCareerTrainingCap.test.ts
// O treino rende no máximo +5 de overall por temporada, e treinar toda semana cansa: com campeonato toda semana,
// o jogador chega ao cansaço (7ª semana com 1 habilidade, 5ª com 4) e precisa descansar para o treino voltar a contar.
import { describe, expect, it } from 'vitest';
import { createPlayerCareer, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { countTrainingSession, TRAINING_SEASON_CAP } from '../src/lib/game/playerCareer/growth';
import { TIRED_AT } from '../src/lib/game/playerCareer/agenda';
import { EVENT_FATIGUE, WEEK_RECOVERY } from '../src/lib/game/playerCareer/squad';

function young(seed: string): PlayerCareerState {
  const base = createPlayerCareer({ nick: 'tester', country: 'Brazil', role: 'rifler', archetype: 'prodigio', seed });
  return { ...base, age: 16, overall: 66, truePotential: 97, seasonNumber: 1 };
}

describe('teto do treino por temporada', () => {
  it('treinando sem parar, o treino dá no máximo +5 na temporada e avisa quando bateu o teto', () => {
    let state = young('cap-1');
    const start = state.overall;
    let capped = false;
    for (let week = 0; week < 30; week += 1) {
      const session = countTrainingSession(state);
      state = session.state;
      if (session.seasonCapped) capped = true;
    }
    expect(state.overall - start).toBe(TRAINING_SEASON_CAP);
    expect(TRAINING_SEASON_CAP).toBe(5);
    expect(capped).toBe(true);
  });

  it('na temporada seguinte o treino volta a render', () => {
    let state = young('cap-2');
    for (let week = 0; week < 30; week += 1) state = countTrainingSession(state).state;
    const before = state.overall;
    state = { ...state, seasonNumber: 2, seasonTrain: null };
    for (let week = 0; week < 4; week += 1) state = countTrainingSession(state).state;
    expect(state.overall).toBeGreaterThan(before);
  });
});

describe('treinar toda semana cansa', () => {
  it('treino livre + campeonato toda semana chega ao cansaço antes do fim da temporada (~11 semanas)', () => {
    const weeksToTired = (skills: number) => Math.ceil(TIRED_AT / (12 + 2 * skills + EVENT_FATIGUE - WEEK_RECOVERY)); // agenda.ts: 12 + 2 por habilidade
    expect(weeksToTired(1)).toBe(7);
    expect(weeksToTired(4)).toBe(5);
  });
});
