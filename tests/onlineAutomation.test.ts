import { describe, expect, it } from 'vitest';
import { answersDecision, autoEcoCall, autoSidePick, autoVetoMap, currentLossStreak, decisionKey, halfOfRound, shouldAnswerAgain, shouldCallTimeout, timeoutTimingFor } from '../src/lib/game/online-automation';
import { DEFAULT_STRATEGIC_AUTOMATION } from '../src/lib/game/preferences';
import type { PublicPendingDecision } from '../src/lib/game/online/contracts';
import type { RoundDetail, TeamSide } from '../src/lib/game/types';

const round = (number: number, winner: TeamSide): RoundDetail => ({
  number, winner, sideA: 'ct', overtime: number > 24,
  economy: { a: { buy: 'full', awp: false, money: 4000 }, b: { buy: 'full', awp: false, money: 4000 } },
  kills: [], ending: 'elimination', tags: []
});

const veto: PublicPendingDecision = { kind: 'veto', teamId: 'me', deadlineAt: null, action: 'ban', step: 0, available: ['inferno', 'nuke', 'mirage'] };
const eco: PublicPendingDecision = { kind: 'eco-call', teamId: 'me', deadlineAt: null, mapIndex: 0, roundNumber: 2, money: 1800 };

describe('automação da engrenagem no online', () => {
  it('responde cada decisão conforme o toggle correspondente', () => {
    const all = { ...DEFAULT_STRATEGIC_AUTOMATION };
    expect(answersDecision(veto, all)).toBe(true);
    expect(answersDecision(eco, all)).toBe(true);
    expect(answersDecision(veto, { ...all, autoMapPicksAndVetos: false })).toBe(false);
    expect(answersDecision(eco, { ...all, autoEconomy: false })).toBe(false);
    // Desligar a economia não pode mexer no veto, nem o contrário.
    expect(answersDecision(veto, { ...all, autoEconomy: false })).toBe(true);
    expect(answersDecision(eco, { ...all, autoMapPicksAndVetos: false })).toBe(true);
  });

  it('bane o mapa menos conhecido e escolhe o mais conhecido', () => {
    const familiarity = { inferno: 20, nuke: 80, mirage: 60 } as const;
    expect(autoVetoMap(['inferno', 'nuke', 'mirage'], familiarity, 'ban')).toBe('inferno');
    expect(autoVetoMap(['inferno', 'nuke', 'mirage'], familiarity, 'pick')).toBe('nuke');
    expect(autoVetoMap([], familiarity, 'ban')).toBeNull();
  });

  it('usa a mesma chamada padrão que o servidor aplicaria no fim do tempo', () => {
    expect(autoEcoCall('aggressive', 800)).toBe('force');
    expect(autoEcoCall('tactical', 3000)).toBe('eco');
    expect(['ct', 't']).toContain(autoSidePick('balanced', 'inferno'));
  });

  it('não repete a mesma resposta para a mesma decisão', () => {
    expect(decisionKey('s1', veto)).toBe(decisionKey('s1', veto));
    expect(decisionKey('s1', veto)).not.toBe(decisionKey('s1', { ...veto, step: 1 }));
    expect(decisionKey('s1', eco)).not.toBe(decisionKey('s2', eco));
  });

  it('reenvia a resposta se a sala recusar, sem repetir a cada snapshot', () => {
    // A sala recusa comandos antes da rodada começar, então a mesma decisão é respondida de novo pouco depois.
    expect(shouldAnswerAgain(null, 'k1', 1_000)).toBe(true);
    expect(shouldAnswerAgain({ key: 'k1', at: 1_000 }, 'k1', 1_400)).toBe(false);
    expect(shouldAnswerAgain({ key: 'k1', at: 1_000 }, 'k1', 2_000)).toBe(true);
    expect(shouldAnswerAgain({ key: 'k1', at: 1_000 }, 'k2', 1_050)).toBe(true);
  });

  it('conta a sequência de derrotas só dentro do tempo atual', () => {
    const firstHalf = [round(9, 'a'), round(10, 'b'), round(11, 'b'), round(12, 'b')];
    expect(currentLossStreak(firstHalf, 'a')).toBe(3);
    expect(currentLossStreak(firstHalf, 'b')).toBe(0);
    // O intervalo zera: o round 13 abre o segundo tempo.
    expect(currentLossStreak([...firstHalf, round(13, 'b')], 'a')).toBe(1);
    expect(halfOfRound(12)).not.toBe(halfOfRound(13));
    expect(halfOfRound(25)).not.toBe(halfOfRound(24));
  });

  it('classifica o momento da pausa pela sequência de derrotas do tempo atual', () => {
    const streak = [round(1, 'b'), round(2, 'b'), round(3, 'b'), round(4, 'b'), round(5, 'b')];
    expect(timeoutTimingFor([], 'a')).toBe('early');
    expect(timeoutTimingFor(streak.slice(0, 1), 'a')).toBe('early');
    expect(timeoutTimingFor(streak.slice(0, 2), 'a')).toBe('window');
    expect(timeoutTimingFor(streak.slice(0, 4), 'a')).toBe('window');
    expect(timeoutTimingFor(streak, 'a')).toBe('late');
    // O intervalo zera a contagem: o round 13 abre o segundo tempo.
    expect(timeoutTimingFor([round(10, 'b'), round(11, 'b'), round(12, 'b'), round(13, 'b')], 'a')).toBe('early');
  });

  it('pede a pausa depois de quatro derrotas seguidas, e só se restar pausa', () => {
    const streak = [round(1, 'b'), round(2, 'b'), round(3, 'b'), round(4, 'b')];
    expect(shouldCallTimeout(streak, 'a', 1)).toBe(true);
    expect(shouldCallTimeout(streak, 'a', 0)).toBe(false);
    expect(shouldCallTimeout(streak.slice(0, 3), 'a', 1)).toBe(false);
    expect(shouldCallTimeout(streak, 'b', 1)).toBe(false);
  });
});
