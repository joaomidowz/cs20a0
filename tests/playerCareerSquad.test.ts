// tests/playerCareerSquad.test.ts
// Contrato do elenco da Carreira de Jogador: parceiros com relacionamento/sinergia que mexem no overall
// de verdade, conversas entre campeonatos com retorno decrescente, treino com os efeitos da Dinastia
// (dynasty/training.ts) e a carta do jogador (overall + função + bônus de treino).
import { describe, expect, it } from 'vitest';
import { chooseStartingOrg, createPlayerCareer, recordEventResult, startSeason, type PlayerCareerState } from '../src/lib/game/playerCareer/engine';
import { userEnginePlayers } from '../src/lib/game/playerCareer/live';
import { applyTrained, celebrateResult, coachOf, ensureSquad, matesOf, myPlayerOf, relationshipOf, synergyBump, talkTo, trainMe, trainingWindowOf, TRAIN_CAP } from '../src/lib/game/playerCareer/squad';

function careerAtRealOrg(seed: string, role: PlayerCareerState['role'] = 'awper'): PlayerCareerState {
  const career = createPlayerCareer({ nick: 'tester', country: 'Brazil', role, seed });
  const option = career.pendingDraw!.find((candidate) => candidate.kind === 'real')!;
  return startSeason(chooseStartingOrg(career, option.orgId));
}

describe('elenco e sinergia', () => {
  it('4 parceiros da org (sem a sua função) com relacionamento inicial seedado 35-65 e sinergia no overall', () => {
    const career = careerAtRealOrg('squad1', 'igl');
    const mates = matesOf(career);
    expect(mates).toHaveLength(4);
    expect(mates.every((mate) => mate.player.role !== 'igl')).toBe(true);
    for (const mate of mates) {
      expect(mate.relationship).toBeGreaterThanOrEqual(35);
      expect(mate.relationship).toBeLessThanOrEqual(65);
      const raw = (mate.player.overall ?? 60) - synergyBump(mate.relationship); // o bônus entra no overall de quadra
      expect(raw).toBeGreaterThanOrEqual(40);
    }
  });

  it('relacionamento alto dá bônus real: o parceiro fica MAIS forte em quadra', () => {
    const career = careerAtRealOrg('squad2');
    const mate = matesOf(career)[0];
    const bonded = { ...career, relationships: { ...career.relationships, [mate.player.id]: 90 } };
    const stronger = matesOf(bonded).find((candidate) => candidate.player.id === mate.player.id)!;
    expect(stronger.player.overall ?? 60).toBeGreaterThan(mate.player.overall ?? 60);
    expect(synergyBump(90)).toBeGreaterThan(0);
    expect(synergyBump(20)).toBeLessThan(0);
  });

  it('ensureSquad completa saves antigos sem inventar relacionamento', () => {
    const legacy = { ...careerAtRealOrg('squad3'), relationships: undefined, talks: undefined, trained: undefined } as never as PlayerCareerState;
    const healed = ensureSquad(legacy);
    expect(healed.relationships).toEqual({});
    expect(healed.trainCount).toBe(0);
    expect(healed.trainProgress).toBe(0);
    // Save de veterano que treinou acima do teto: o que passou vira teto conquistado, e o overall fica.
    const veteran = { ...careerAtRealOrg('squad3b'), age: 30, overall: 88, truePotential: 84, trainCount: 5 } as PlayerCareerState;
    delete veteran.ceilingBonus;
    delete veteran.trainProgress;
    expect(ensureSquad(veteran)).toMatchObject({ overall: 88, ceilingBonus: 4, trainProgress: 2 });
    expect(relationshipOf(healed, 'x')).toBe(relationshipOf(healed, 'x')); // determinístico
  });

  it('o treinador da org é determinístico: o coach real do catálogo ou, sem ele, um coach do mundo marcado como tal', () => {
    const career = careerAtRealOrg('coach1');
    const coach = coachOf(career);
    expect(coachOf(career).id).toBe(coach.id);
    expect(['high', 'placeholder']).toContain(coach.confidence);
    expect(coach.source.note).toMatch(coach.confidence === 'high' ? /catálogo/ : /mundo da carreira/);
    expect(Math.abs(coach.overall - Math.round((coach.tactics + coach.discipline + coach.aggression + coach.development) / 4))).toBeLessThanOrEqual(1);
    expect(coach.tactics).toBeGreaterThanOrEqual(40);
    expect(coach.tactics).toBeLessThanOrEqual(99);
  });
});

describe('conversar entre campeonatos', () => {
  it('conversa muda o relacionamento com linha de diálogo, e repetir no mesmo dia rende menos até zerar', () => {
    let career = careerAtRealOrg('talk1');
    const mateId = matesOf(career)[0].player.id;
    const first = talkTo(career, mateId);
    expect(first.line.length).toBeGreaterThan(5);
    expect(career.relationships[mateId]).toBeUndefined(); // não muta o estado antigo
    career = first.state;
    const before = career.relationships[mateId]!;
    const second = talkTo(career, mateId);
    // A segunda no mesmo dia rende metade: no máximo 3 (metade da melhor conversa, +6), e o estado anda junto.
    expect(Math.abs(second.delta)).toBeLessThanOrEqual(3);
    expect(second.state.relationships[mateId]).toBe(Math.max(0, Math.min(100, before + second.delta)));
    const third = talkTo(second.state, mateId);
    expect(third.delta).toBe(0); // a partir da terceira no mesmo dia, conversa não move mais
    expect(third.line).toContain('bastante');
    expect(third.state.talks[mateId]).toBe(3);
  });

  it('jogar um campeonato zera a janela de conversas e o resultado mexe no elenco', () => {
    let career = careerAtRealOrg('talk2');
    const mateId = matesOf(career)[0].player.id;
    career = talkTo(career, mateId).state;
    expect(Object.keys(career.talks).length).toBeGreaterThan(0);
    career = recordEventResult(career, 0, { name: 'Etapa', placement: 'Quartas', rating: 1, seriesWins: 0, seriesLosses: 1 });
    expect(career.talks).toEqual({});
    const afterLoss = matesOf(career).find((mate) => mate.player.id === mateId)!.relationship;
    const celebrated = celebrateResult(career, 'Campeão');
    expect(matesOf(celebrated).find((mate) => mate.player.id === mateId)!.relationship).toBeGreaterThan(afterLoss);
  });
});

describe('treino entre campeonatos', () => {
  it('um treino por janela, com os efeitos da Dinastia; aos 16 o overall senta +1 a cada 2 sessões', () => {
    let career = careerAtRealOrg('train1');
    const me = myPlayerOf(career);
    const window = trainingWindowOf(career)!;
    expect(window).toBe('1:0');
    const aim = trainMe(career, me, 'aim');
    expect(aim.gained.firepower).toBe(2); // efeitos da Dinastia: aim = firepower+2, consistency+1
    expect(aim.gained.consistency).toBe(1);
    expect(aim.state.trainedWindow).toBe(window);
    const again = trainMe(aim.state, myPlayerOf(aim.state), 'utility');
    expect(again.state).toBe(aim.state); // janela usada: não treina de novo
    career = aim.state;
    // janela nova abre depois do campeonato
    career = recordEventResult(career, 0, { name: 'E', placement: 'Quartas', rating: 1, seriesWins: 0, seriesLosses: 1 });
    expect(trainingWindowOf(career)).toBe('1:1');
    // Aos 16 (até os 21) o overall sobe na 2ª sessão, cada uma na sua janela; a 3ª recomeça a contagem.
    const overallBefore = career.overall;
    const second = trainMe(career, myPlayerOf(career), 'clutch');
    expect(second.overallUp).toBe(true);
    expect(second.state.overall).toBe(overallBefore + 1);
    expect(second.state.trainProgress).toBe(0);
    career = recordEventResult(second.state, 1, { name: 'E2', placement: 'Quartas', rating: 1, seriesWins: 0, seriesLosses: 1 });
    const third = trainMe(career, myPlayerOf(career), 'opening');
    expect(third.overallUp).toBe(false);
    expect(third.state.trainCount).toBe(3);
  });

  it('treino acumula no bônus com teto por atributo e aparece na carta de quadra', () => {
    let career = careerAtRealOrg('train2');
    const base = myPlayerOf(career);
    for (let session = 0; session < 5; session += 1) {
      const result = trainMe(career, myPlayerOf(career), 'aim');
      career = result.state;
      career = recordEventResult(career, career.calendar!.find((entry) => entry.status === 'UPCOMING')!.index, { name: 'E', placement: 'Quartas', rating: 1, seriesWins: 0, seriesLosses: 1 });
      if (career.calendar!.every((entry) => entry.status === 'PLAYED')) break;
    }
    expect(career.trained.firepower ?? 0).toBeGreaterThan(0);
    expect(career.trained.firepower ?? 0).toBeLessThanOrEqual(TRAIN_CAP);
    const meInGame = userEnginePlayers(career)[0];
    expect(meInGame.firepower).toBe(myPlayerOf(career).firepower); // a carta de quadra carrega o treino
    expect(meInGame.firepower ?? 60).toBeGreaterThan(base.firepower ?? 60);
    expect(applyTrained(base, { firepower: 99 }).firepower).toBe(99); // cap 99
  });
});

describe('troca de função e saída de parceiro', () => {
  it('trocar de função: o parceiro da nova função assume a sua; resultado bom ou ruim mexe no overall; 1x por temporada', async () => {
    const { canChangeRole, changeRole } = await import('../src/lib/game/playerCareer/squad');
    let good = 0;
    for (let index = 0; index < 12; index += 1) {
      const career = careerAtRealOrg(`role-${index}`);
      if (!career.calendar) continue;
      const from = career.role;
      const target = from === 'awper' ? 'igl' : 'awper';
      const result = changeRole(career, target);
      expect(result.state.role).toBe(target);
      expect(result.state.overall).toBe(career.overall + (result.good ? 1 : -2));
      if (result.good) good += 1;
      const roles = matesOf(result.state).map((mate) => mate.player.role);
      expect(roles).not.toContain(target);
      expect(canChangeRole(result.state)).toBe(false);
    }
    expect(good).toBeGreaterThan(0);
  });

  it('pedir a saída: aceito, entra substituto e o elenco esfria; recusado, a relação com ele despenca', async () => {
    const { canKickMate, kickMate } = await import('../src/lib/game/playerCareer/squad');
    let accepted = 0;
    let refused = 0;
    for (let index = 0; index < 16; index += 1) {
      const career = { ...careerAtRealOrg(`kick-${index}`), fame: 60000, reputation: 70 };
      const mate = matesOf(career)[0];
      const result = kickMate(career, mate.player.id);
      expect(canKickMate(result.state)).toBe(false);
      if (result.accepted) {
        accepted += 1;
        const nicks = matesOf(result.state).map((other) => other.player.nickname);
        expect(nicks).not.toContain(mate.player.nickname);
        expect(matesOf(result.state)).toHaveLength(4);
      } else {
        refused += 1;
        expect(relationshipOf(result.state, mate.player.id)).toBeLessThan(mate.relationship);
      }
    }
    expect(accepted + refused).toBe(16);
    expect(accepted).toBeGreaterThan(0);
  });

  it('quem entra no lugar de quem saiu vem no nível do time, não no de quem saiu', async () => {
    const { replacementOverall } = await import('../src/lib/game/playerCareer/squad');
    // Fybru 69 num time de ~91: o substituto chega perto de 89 (média dos outros, 2 abaixo) com a variação.
    expect(replacementOverall(69, 89, 2)).toBe(91);
    expect(replacementOverall(69, 89, -3)).toBe(86);
    // Quem saiu já era melhor que o time: não piora por isso.
    expect(replacementOverall(92, 85, -2)).toBe(90);
  });
});
