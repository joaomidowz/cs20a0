// tests/dynastyCoachEngine.test.ts
import { describe, expect, it } from 'vitest';
import { coaches, getTeamPlayers, players, teams } from '../src/lib/game/data';
import { createCampaignMajor } from '../src/lib/game/campaign-major';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { createMajorField } from '../src/lib/game/simulation';
import type { Coach, SelectedPlayer } from '../src/lib/game/types';

const roster = getTeamPlayers(teams[0]).slice(0, 5);
const lineup: SelectedPlayer[] = roster.map((player) => ({ playerId: player.id, selectedSlotRole: getEligibleSlotRoles(player)[0] ?? 'rifler' }));
const selectedMaps = getDefaultMapSelection(roster, teams);
const strong: Coach = { ...coaches.find((coach) => coach.confidence === 'high')!, tactics: 99, discipline: 99, aggression: 99 };

describe('coach no motor', () => {
  it('sem coach o time do usuário não ganha campos de coach', () => {
    const { user } = createMajorField(roster, 'balanced', teams, players, 'motor-coach', lineup, { selectedMaps, mode: 'dynasty' });
    expect(user.coachId).toBeUndefined();
    expect(user.coachSidePreference).toBeUndefined();
    expect(user.timeoutFactor).toBeUndefined();
  });

  it('com coach o time do usuário fica mais forte e carrega lado e pausa', () => {
    const plain = createMajorField(roster, 'balanced', teams, players, 'motor-coach', lineup, { selectedMaps, mode: 'dynasty' }).user;
    const coached = createMajorField(roster, 'balanced', teams, players, 'motor-coach', lineup, { selectedMaps, mode: 'dynasty', coach: strong }).user;
    expect(coached.power).toBeGreaterThan(plain.power);
    expect(coached.mental).toBeGreaterThan(plain.mental);
    expect(coached.coachSidePreference).toBeLessThan(0);
    expect(coached.timeoutFactor).toBeGreaterThan(1);
  });

  it('a campanha da Dinastia leva o coach para as séries do usuário e não para os bots', () => {
    const major = createCampaignMajor(roster, 'balanced', teams, players, 'motor-coach-campanha', lineup, { selectedMaps, mode: 'dynasty', dynastyEntryStage: 'stage1', coach: strong });
    const series = major.engine.rounds.flatMap((round) => round.series);
    const userSeries = series.find((item) => item.config.teamA.id === 'user' || item.config.teamB.id === 'user')!;
    const userTeam = userSeries.config.teamA.id === 'user' ? userSeries.config.teamA : userSeries.config.teamB;
    expect(userTeam.coachId).toBe(strong.id);
    const botTeams = series.flatMap((item) => [item.config.teamA, item.config.teamB]).filter((item) => item.id !== 'user');
    expect(botTeams.every((item) => item.coachId === undefined && item.timeoutFactor === undefined)).toBe(true);
  });

  it('a seed v2 do campo não depende do estilo', () => {
    const balanced = createMajorField(roster, 'balanced', teams, players, 'seed-sem-estilo', lineup, { seedsWithoutStyle: true });
    const aggressive = createMajorField(roster, 'aggressive', teams, players, 'seed-sem-estilo', lineup, { seedsWithoutStyle: true });
    expect(aggressive.tournamentSeed).toBe(balanced.tournamentSeed);
    expect(aggressive.field.map((team) => team.id)).toEqual(balanced.field.map((team) => team.id));
    expect(createMajorField(roster, 'balanced', teams, players, 'seed-legada', lineup).tournamentSeed).not.toBe(createMajorField(roster, 'aggressive', teams, players, 'seed-legada', lineup).tournamentSeed);
  });
});
