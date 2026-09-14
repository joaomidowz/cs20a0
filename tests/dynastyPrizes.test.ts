import { describe, expect, it } from 'vitest';
import { awardsBonus, formatUsd, INDIVIDUAL_AWARD_BONUS, MVP_BONUS, prizeForPlacement } from '../src/lib/game/dynasty/prizes';
import type { MajorAwards, MajorPlayerAward } from '../src/lib/game/types';

const award = (playerId: string) => ({ playerId, name: playerId, teamId: 'user', teamName: 'Org' }) as unknown as MajorPlayerAward;

describe('premiação da Dinastia', () => {
  it('paga por saída, do campeão ao eliminado no Stage 1', () => {
    expect(prizeForPlacement('placementChampion')).toBe(500_000);
    expect(prizeForPlacement('placementRunnerUp')).toBe(170_000);
    expect(prizeForPlacement('placement3to4')).toBe(80_000);
    expect(prizeForPlacement('placement5to8')).toBe(45_000);
    expect(prizeForPlacement('placementStage3')).toBe(20_000);
    expect(prizeForPlacement('placementStage2')).toBe(10_000);
    expect(prizeForPlacement('placementStage1')).toBe(5_000);
    expect(prizeForPlacement('qualquer-coisa')).toBe(0);
  });

  it('soma MVP e prêmios individuais só dos jogadores do usuário', () => {
    const awards = { mvp: award('a'), topPlayers: [], topTeam: null, teams: [], clutchKing: award('b'), highlightReel: award('fora') } as unknown as MajorAwards;
    expect(awardsBonus(awards, ['a', 'b'])).toBe(MVP_BONUS + INDIVIDUAL_AWARD_BONUS);
    expect(awardsBonus(awards, ['b'])).toBe(INDIVIDUAL_AWARD_BONUS);
    expect(awardsBonus(awards, ['c'])).toBe(0);
    expect(awardsBonus(null, ['a'])).toBe(0);
    expect(awardsBonus(undefined, ['a'])).toBe(0);
  });

  it('um jogador que leva MVP e clutch king recebe os dois bônus', () => {
    const awards = { mvp: award('a'), topPlayers: [], topTeam: null, teams: [], clutchKing: award('a'), highlightReel: null } as unknown as MajorAwards;
    expect(awardsBonus(awards, ['a'])).toBe(65_000);
  });

  it('formata dólar inteiro por idioma', () => {
    expect(formatUsd(500_000, 'en')).toBe('$500,000');
    expect(formatUsd(0, 'en')).toBe('$0');
    expect(formatUsd(1_250_000, 'pt-BR')).toContain('1.250.000');
  });
});
