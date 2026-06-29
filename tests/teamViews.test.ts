import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import playersJson from '../src/lib/data/cs/players.game.json';
import {
  playerMatchesRole,
  sortPlayersByOverall,
  topPlayersByRole
} from '../src/lib/game/playerRankings';
import {
  playerAwardLabels,
  shouldShowPlayerAwards,
  sortTeamsByPlacement,
  teamAverageOverall
} from '../src/lib/game/teamViews';
import { translate } from '../src/lib/game/i18n';
import type { HistoricalTeam, Player } from '../src/lib/game/types';

const players = playersJson as Player[];
const playersPageSource = readFileSync(new URL('../src/routes/players/+page.svelte', import.meta.url), 'utf8');

describe('team view helpers', () => {
  it('shows player awards only in Normal mode or on the teams page', () => {
    expect(shouldShowPlayerAwards('premier', 'game')).toBe(true);
    expect(shouldShowPlayerAwards('faceit', 'game')).toBe(false);
    expect(shouldShowPlayerAwards('faceit', 'teams')).toBe(true);
    expect(shouldShowPlayerAwards(null, 'teams')).toBe(true);
  });

  it('uses only awards stored on the current player-year', () => {
    const zywoo2024 = players.find((player) => player.id === 'zywoo-2024')!;
    const labels = playerAwardLabels(zywoo2024);

    expect(labels).toContain('Perfect World Shanghai 2024 EVP');
    expect(labels).toContain('HLTV Top 20 2024 #3');
    expect(labels.some((label) => label.includes('2023'))).toBe(false);
    expect(labels.some((label) => label.includes('2025'))).toBe(false);
  });

  it('sorts teams by Major placement before rank/name fallbacks', () => {
    const review: HistoricalTeam = { id: 'review', name: 'Review', needsReview: true, majorSummary: { bestPlacement: 'champion' } };
    const top8: HistoricalTeam = { id: 'top8', name: 'Top 8', badges: ['major-playoff-team'] };
    const champion: HistoricalTeam = { id: 'champion', name: 'Champion', badges: ['major-champion'] };
    const finalist: HistoricalTeam = { id: 'finalist', name: 'Finalist', majorSummary: { bestPlacement: 'finalist' } };
    const stage2: HistoricalTeam = { id: 'stage2', name: 'Stage 2', badges: ['major-stage2'] };

    expect([stage2, review, top8, finalist, champion].sort(sortTeamsByPlacement).map((team) => team.id))
      .toEqual(['champion', 'finalist', 'top8', 'stage2', 'review']);
  });

  it('calculates roster average from the five player versions', () => {
    const team: HistoricalTeam = { id: 'vitality-2024', teamPowerPreview: 40 };
    expect(teamAverageOverall(team)).toBeGreaterThan(80);
  });
});

describe('player ranking helpers', () => {
  it('sorts ranking rows by overall, then year, then rarity', () => {
    const common2024: Player = { id: 'common-2024', overall: 90, year: 2024, rarity: 'common' };
    const legend2024: Player = { id: 'legend-2024', overall: 90, year: 2024, rarity: 'legend' };
    const elite2025: Player = { id: 'elite-2025', overall: 90, year: 2025, rarity: 'elite' };
    const lower2026: Player = { id: 'lower-2026', overall: 89, year: 2026, rarity: 'goat' };

    expect([common2024, lower2026, legend2024, elite2025].sort(sortPlayersByOverall).map((player) => player.id))
      .toEqual(['elite-2025', 'legend-2024', 'common-2024', 'lower-2026']);
  });

  it('does not rank a high-overall AWPer as an IGL without eligible IGL role', () => {
    const m0nesy2024 = players.find((player) => player.id === 'm0nesy-2024')!;
    expect(playerMatchesRole(m0nesy2024, 'awper')).toBe(true);
    expect(playerMatchesRole(m0nesy2024, 'igl')).toBe(false);
  });

  it('builds role rankings only from players eligible for that role', () => {
    const topIgls = topPlayersByRole(players, 'igl', 25);
    expect(topIgls.length).toBeGreaterThan(0);
    expect(topIgls.every((player) => playerMatchesRole(player, 'igl'))).toBe(true);
    expect(topIgls.some((player) => player.id === 'm0nesy-2024')).toBe(false);
  });
});

describe('players ranking page structure', () => {
  it('keeps the page focused on role rankings', () => {
    expect(translate('pt-BR', 'byRole')).toBe('Por função');
    expect(translate('pt-BR', 'roleRankings')).toBe('Ranking por posição');
    expect(playersPageSource).toContain("t('byRole')");
    expect(playersPageSource).toContain("t('roleRankings')");
    expect(playersPageSource).toContain('RANKING_ROLES');
  });

  it('does not render the removed general ranking and filter controls', () => {
    expect(playersPageSource).not.toContain("t('overallRanking')");
    expect(playersPageSource).not.toContain('overall-ranking-list');
    expect(playersPageSource).not.toContain('players-filters');
    expect(playersPageSource).not.toContain("t('playersFilters')");
    expect(playersPageSource).not.toContain("t('onlyTop20')");
    expect(playersPageSource).not.toContain("t('onlyMajorAwards')");
    expect(playersPageSource).not.toContain("t('onlyMajorChampions')");
    expect(playersPageSource).not.toContain('PlayerAwardsBadges');
  });
});
