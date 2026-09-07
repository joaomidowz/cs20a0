import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import playersJson from '../src/lib/data/cs/players.game.json';
import teamsJson from '../src/lib/data/cs/teams.game.json';
import { buildMajorRun, calculateUserTeamPower, createSeededRng, getMatchDayPower, getWinProbability, simulateMap, simulatePlayoffs, simulateSeries } from '../src/lib/game/simulation';
import { createRunStats } from '../src/lib/game/runStats';
import { getPlayerPlaystyle } from '../src/lib/game/playstyle';
import { getEligibleSlotRoles } from '../src/lib/game/roleRules';
import { getDefaultMapSelection } from '../src/lib/game/maps';
import { SPEEDS, type CombatTeam, type HistoricalTeam, type MajorRun, type Player, type SelectedPlayer } from '../src/lib/game/types';

const roleTokens = (player: Player) => (player.role ?? '').toLowerCase().split(/[-/,+\s]+/).filter(Boolean);
const seriesViewerSource = readFileSync(new URL('../src/lib/components/SeriesViewer.svelte', import.meta.url), 'utf8');
const appCssSource = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const eligibleRoleTokens = (player: Player) => {
  const explicit = (player as Player & { eligibleSlotRoles?: string[] }).eligibleSlotRoles;
  return explicit?.length ? explicit : roleTokens(player);
};
const statKeys = ['firepower', 'clutch', 'entry', 'awp', 'support', 'igl', 'experience', 'consistency', 'mental'] as const;
const statValue = (player: Player, key: (typeof statKeys)[number]) => Number((player as Player & Record<string, unknown>)[key] ?? 0);
const hasIglEligibility = (player: Player) => roleTokens(player).includes('igl') || eligibleRoleTokens(player).includes('igl');

const team = (id: string, power: number): CombatTeam => ({
  id,
  name: id,
  power,
  mental: power,
  clutch: power,
  experience: power
});

describe('simulation', () => {
  it('loads the expanded Major participant pool through the June 2026 snapshot', () => {
    const teams = teamsJson as HistoricalTeam[];
    const players = playersJson as Player[];
    const teams2026 = teams.filter((team) => team.year === 2026);
    const placeholderPattern = /Review|Placeholder|IGL 1|AWPER 2|ENTRY 3|LURKER 4|SUPPORT 5/i;

    const placeholderPlayers = players.filter((player) => placeholderPattern.test([player.id, player.nickname, player.title].filter(Boolean).join(' ')));

    expect(teams.length).toBeGreaterThanOrEqual(281);
    expect(players.length).toBeGreaterThanOrEqual(1405);
    expect(placeholderPlayers.every((player) => player.needsReview)).toBe(true);
    expect(players.every((player) => player.source)).toBe(true);
    expect(teams2026.map((team) => team.name)).toEqual(expect.arrayContaining(['Vitality', 'Natus Vincere', 'Spirit', 'Falcons', 'FURIA']));
  });

  it('keeps rank four and five players competitive without flattening stars', () => {
    const players = playersJson as Player[];
    const byId = new Map(players.map((player) => [player.id, player]));

    expect(byId.get('tarik-2019')?.overall).toBeGreaterThanOrEqual(81);
    expect(byId.get('brehze-2019')?.overall).toBeGreaterThanOrEqual(87);
    expect(byId.get('donk-2026')?.overall).toBeGreaterThanOrEqual(90);
    expect(byId.get('niko-2026')?.overall).toBeGreaterThanOrEqual(89);
  });

  it('keeps exactly one primary IGL option per historical team', () => {
    const teams = teamsJson as HistoricalTeam[];
    const players = playersJson as Player[];
    const playersByTeam = new Map<string, Player[]>();
    for (const player of players) {
      if (!player.teamId) continue;
      const roster = playersByTeam.get(player.teamId) ?? [];
      roster.push(player);
      playersByTeam.set(player.teamId, roster);
    }

    for (const team of teams) {
      const roster = playersByTeam.get(team.id) ?? [];
      const iglOptions = roster.filter(hasIglEligibility);
      expect(iglOptions.length, `${team.id} should not have duplicate IGLs`).toBeLessThanOrEqual(1);
    }
  });

  it('keeps boost corrections role-aware instead of creating all-99 players', () => {
    const players = playersJson as Player[];
    const byId = new Map(players.map((player) => [player.id, player]));
    const monesy2024 = byId.get('m0nesy-2024')!;
    const monesy2025 = byId.get('m0nesy-2025')!;
    const monesy2026 = byId.get('m0nesy-2026')!;
    const zywoo2025 = byId.get('zywoo-2025')!;
    const donk2024 = byId.get('donk-2024')!;

    for (const player of players) {
      const high99 = statKeys.filter((key) => statValue(player, key) >= 99);
      expect(high99.length, `${player.id} has too many 99 stats`).toBeLessThan(3);
    }

    expect(eligibleRoleTokens(monesy2024)).toEqual(['awper']);
    expect(getEligibleSlotRoles(monesy2025)).toEqual(['awper']);
    expect(statValue(monesy2024, 'awp')).toBeGreaterThanOrEqual(97);
    expect(statValue(monesy2024, 'igl')).toBeLessThanOrEqual(30);
    expect(statValue(monesy2024, 'support')).toBeLessThanOrEqual(82);

    expect(eligibleRoleTokens(monesy2026)).toEqual(['awper']);
    expect(statValue(monesy2026, 'awp')).toBeGreaterThanOrEqual(97);
    expect(statValue(monesy2026, 'igl')).toBeLessThanOrEqual(30);
    expect(statValue(monesy2026, 'support')).toBeLessThanOrEqual(82);

    expect(eligibleRoleTokens(zywoo2025)).toEqual(['awper', 'rifler']);
    expect(statValue(zywoo2025, 'awp')).toBeGreaterThanOrEqual(97);
    expect(statValue(zywoo2025, 'igl')).toBeLessThanOrEqual(30);

    expect(eligibleRoleTokens(donk2024)).toEqual(['entry', 'rifler']);
    expect(statValue(donk2024, 'entry')).toBeGreaterThanOrEqual(97);
    expect(statValue(donk2024, 'awp')).toBeLessThanOrEqual(82);
    expect(statValue(donk2024, 'igl')).toBeLessThanOrEqual(30);
  });

  it('assigns the core NRG 2018 roles', () => {
    const players = playersJson as Player[];
    const byId = new Map(players.map((player) => [player.id, player]));

    expect(byId.get('daps-2018')?.role).toBe('igl');
    expect(byId.get('cerq-2018')?.role).toBe('awper');
    expect(byId.get('fugly-2018')?.role).toBe('rifle-support');
  });

  it('assigns oSee as Liquid 2022 AWPer', () => {
    const players = playersJson as Player[];
    expect(players.find((player) => player.id === 'osee-2022')?.role).toBe('awper');
  });

  it('keeps general support options without replacing AWPers', () => {
    const teams = teamsJson as HistoricalTeam[];
    const players = playersJson as Player[];
    const byId = new Map(players.map((player) => [player.id, player]));
    const knownSupportPlayers = ['fallen-2025', 'fallen-2026', 'mezii-2025', 'xyp9x-2016', 'vini-2025'];

    const supportHybrids = knownSupportPlayers
      .map((id) => byId.get(id))
      .filter((player): player is Player => Boolean(player));

    expect(supportHybrids.length).toBe(knownSupportPlayers.length);
    expect(supportHybrids.every((player) => eligibleRoleTokens(player).includes('support'))).toBe(true);
    expect(supportHybrids.every((player) => !eligibleRoleTokens(player).includes('awper'))).toBe(true);
    expect(teams.every((team) => (team.players?.length ?? 0) === 5)).toBe(true);
  });

  it('keeps known AWPer-IGLs hybrid across eras', () => {
    const players = playersJson as Player[];
    const hybridIds = [
      'fallen-2016',
      'fallen-2022',
      'fallen-2024',
      'cadian-2021',
      'cadian-2022',
      'cadian-2023',
      'jame-2022',
      'jame-2025',
      'jame-2026'
    ];
    const hybrids = hybridIds
      .map((id) => players.find((player) => player.id === id))
      .filter((player): player is Player => Boolean(player));

    expect(hybrids.length).toBeGreaterThan(3);
    expect(hybrids.every((player) => eligibleRoleTokens(player).includes('awper') && eligibleRoleTokens(player).includes('igl'))).toBe(true);
    expect(players.find((player) => player.id === 'fallen-2025')?.eligibleSlotRoles).toEqual(['igl', 'support']);
    expect(players.find((player) => player.id === 'fallen-2026')?.eligibleSlotRoles).toEqual(['igl', 'support']);
  });

  it('uses tactical playstyle overrides for configured ropz and ZywOo eras', () => {
    const players = playersJson as Player[];
    const overridden = players.filter((player) => ['ropz', 'ZywOo'].includes(player.nickname ?? '') && player.playstyle === 'tactical');

    expect(overridden.length).toBeGreaterThan(2);
    expect(overridden.every((player) => getPlayerPlaystyle(player) === 'tactical')).toBe(true);
  });

  it('uses the configured round ticker intervals', () => {
    expect(SPEEDS).toEqual({ normal: 2400, fast: 1200, ultra: 200 });
  });

  it('is deterministic for the same seed', () => {
    const first = simulateSeries(team('a', 88), team('b', 86), 3, createSeededRng('same'));
    const second = simulateSeries(team('a', 88), team('b', 86), 3, createSeededRng('same'));
    expect(second.maps).toEqual(first.maps);
  });

  it('produces a valid MR12 map result', () => {
    const map = simulateMap(team('a', 90), team('b', 90), createSeededRng('overtime-candidate'));
    expect(Math.max(map.scoreA, map.scoreB)).toBeGreaterThanOrEqual(13);
    expect(map.scoreA).not.toBe(map.scoreB);
    expect(map.rounds.at(-1)).toMatchObject({ a: map.scoreA, b: map.scoreB });
  });

  it('buffs tactical by 10% without a fixed aggressive penalty', () => {
    const players = (playersJson as Player[]).filter((player) => player.teamId === 'astralis-2018').slice(0, 5);
    const lineup: SelectedPlayer[] = players.map((player, index) => ({
      playerId: player.id,
      selectedSlotRole: (['igl', 'support', 'awper', 'entry', 'rifler'] as const)[index]
    }));
    const balanced = calculateUserTeamPower(players, 'balanced', lineup, 'style-hotfix');
    const tactical = calculateUserTeamPower(players, 'tactical', lineup, 'style-hotfix');
    const aggressive = calculateUserTeamPower(players, 'aggressive', lineup, 'style-hotfix');

    expect(tactical.power).toBeGreaterThanOrEqual(balanced.power);
    expect(aggressive.power).toBeGreaterThanOrEqual(balanced.power - 2);
    expect(tactical.studyPercentage).toBeGreaterThanOrEqual(60);
    expect(tactical.studyPercentage).toBeLessThanOrEqual(100);
    expect(calculateUserTeamPower(players, 'tactical', lineup, 'style-hotfix').studyPercentage).toBe(tactical.studyPercentage);
  });

  it('gives aggressive teams a deterministic high-upside match day', () => {
    const aggressive: CombatTeam = {
      ...team('aggressive', 94),
      style: 'aggressive',
      aggressionPercentage: 99
    };
    const goodDayRng = createSeededRng('aggressive-good-day');
    let peak = 0;
    for (let match = 0; match < 40; match += 1) peak = Math.max(peak, getMatchDayPower(aggressive, goodDayRng));

    expect(peak).toBeGreaterThan(98);
    const first = getMatchDayPower(aggressive, createSeededRng('same-match'));
    const second = getMatchDayPower(aggressive, createSeededRng('same-match'));
    expect(first).toBe(second);
  });

  it('raises the ceiling of a lineup with three 99-overall players', () => {
    const basePlayers = (playersJson as Player[]).slice(0, 5).map((player) => ({ ...player }));
    basePlayers.slice(0, 3).forEach((player) => {
      player.overall = 99;
      player.firepower = 99;
      player.entry = 99;
    });
    const lineup: SelectedPlayer[] = basePlayers.map((player, index) => ({
      playerId: player.id,
      selectedSlotRole: (['igl', 'support', 'awper', 'entry', 'rifler'] as const)[index]
    }));

    const power = calculateUserTeamPower(basePlayers, 'aggressive', lineup, 'elite-core').power;
    expect(power).toBeGreaterThanOrEqual(94);
  });

  it('lets a stacked lineup beat a mid-tier team almost every time while keeping close matchups open', () => {
    const N = 1500;
    const stacked: CombatTeam = { ...team('stacked', 104), consistency: 95 };
    const mid: CombatTeam = { ...team('mid', 89), consistency: 82 };
    let md1 = 0;
    let md3 = 0;
    for (let index = 0; index < N; index += 1) {
      if (simulateSeries(stacked, mid, 1, createSeededRng(`stacked-md1-${index}`)).winnerId === stacked.id) md1 += 1;
      if (simulateSeries(stacked, mid, 3, createSeededRng(`stacked-md3-${index}`)).winnerId === stacked.id) md3 += 1;
    }
    expect(md1 / N).toBeGreaterThanOrEqual(0.88);
    expect(md3 / N).toBeGreaterThanOrEqual(0.95);

    let close = 0;
    for (let index = 0; index < N; index += 1) {
      if (simulateSeries(team('a', 92), team('b', 90), 3, createSeededRng(`close-${index}`)).winnerId === 'a') close += 1;
    }
    expect(close / N).toBeGreaterThan(0.55);
    expect(close / N).toBeLessThan(0.7);
  });

  it('lets five superstars push the team power past the old ceiling', () => {
    const stars = (playersJson as Player[]).slice(0, 5).map((player) => ({ ...player, overall: 99, firepower: 97, consistency: 95 }));
    const lineup: SelectedPlayer[] = stars.map((player, index) => ({ playerId: player.id, selectedSlotRole: (['igl', 'support', 'awper', 'entry', 'rifler'] as const)[index] }));
    const power = calculateUserTeamPower(stars, 'balanced', lineup, 'stars').power;
    expect(power).toBeGreaterThan(99);
    expect(power).toBeLessThanOrEqual(106);
  });

  it('turns superior tactical study into extra win probability', () => {
    const baseline = team('baseline', 86);
    const tactical: CombatTeam = {
      ...team('tactical', 86),
      style: 'tactical',
      studyPercentage: 92,
      aggressionPercentage: 77
    };
    expect(getWinProbability(tactical, baseline)).toBeGreaterThan(0.5);
    expect(getWinProbability(baseline, tactical)).toBeLessThan(0.5);
  });

  it('builds the same complete Major run from the same choices and seed', () => {
    const players = playersJson as Player[];
    const teams = teamsJson as HistoricalTeam[];
    const picked = teams.slice(0, 5).map((item) => players.find((player) => player.teamId === item.id)!).filter(Boolean);
    const first = buildMajorRun(picked, 'balanced', teams, players, 'major-seed');
    const second = buildMajorRun(picked, 'balanced', teams, players, 'major-seed');
    expect(second).toEqual(first);
    expect(first.stage3.matches.length).toBeLessThanOrEqual(5);
    expect(first.matches.every((match) => match.maps.length <= match.bestOf)).toBe(true);
  });

  it('adds named maps and a complete veto only to the configured offline Major path', () => {
    const allPlayers = playersJson as Player[];
    const historicalTeams = teamsJson as HistoricalTeam[];
    const picked = historicalTeams.slice(0, 5)
      .map((item) => allPlayers.find((player) => player.teamId === item.id)!)
      .filter(Boolean);
    const mapped = buildMajorRun(picked, 'balanced', historicalTeams, allPlayers, 'mapped-major', [], {
      selectedMaps: getDefaultMapSelection(picked, historicalTeams),
      mode: 'faceit'
    });

    expect(mapped.matches.length).toBeGreaterThan(0);
    expect(mapped.matches.every((match) => (match.veto?.length ?? 0) >= 7)).toBe(true);
    expect(mapped.matches.every((match) => new Set(match.veto?.map((step) => step.mapId)).size === match.veto?.length)).toBe(true);
    expect(mapped.matches.flatMap((match) => match.maps).every((map) => map.mapId)).toBe(true);

    const legacy = simulateSeries(team('legacy-a', 88), team('legacy-b', 86), 3, createSeededRng('legacy-online'));
    expect(legacy.veto).toBeUndefined();
    expect(legacy.maps.every((map) => map.mapId === undefined)).toBe(true);
  });

  it('keeps the user organization on the left side during playoff series', () => {
    const user = { ...team('user', 86), isUser: true };
    const opponents = Array.from({ length: 12 }, (_, index) => team(`opponent-${index}`, 80 + index));

    for (let seedIndex = 0; seedIndex < 30; seedIndex += 1) {
      const playoffs = simulatePlayoffs(user, opponents, createSeededRng(`playoff-side-${seedIndex}`));
      expect(playoffs.userMatches.length).toBeGreaterThan(0);
      expect(playoffs.userMatches.every((match) => match.teamA.id === 'user')).toBe(true);
      expect(playoffs.userMatches.every((match) => match.teamA.name === 'user')).toBe(true);
    }
  });

  it('uses a compact mobile live status instead of the large desktop live card', () => {
    expect(seriesViewerSource).toContain('mobile-series-live');
    expect(seriesViewerSource).toContain('{mapsLabel} {visibleScoreA}-{visibleScoreB}');
    expect(seriesViewerSource).toContain("{getMapName(currentMap?.mapId, currentMap?.map ?? displayActiveMap + 1, labels.map ?? 'Mapa')} · R{displayVisibleRounds}");
    expect(appCssSource).toContain('.series-status.live{display:none}');
    expect(appCssSource).toContain('.mobile-series-live{display:flex');
  });

  it('keeps heavy-loss ratings and K/D distributions realistic', () => {
    const players = (playersJson as Player[]).slice(0, 5);
    const lineup: SelectedPlayer[] = players.map((player, index) => ({
      playerId: player.id,
      selectedSlotRole: (['support', 'entry', 'igl', 'awper', 'rifler'] as const)[index]
    }));
    const user = team('user', 85);
    const opponent = team('opponent', 91);
    const heavyLoss: MajorRun = {
      stage3: { wins: 0, losses: 1, qualified: false, matches: [] },
      champion: false,
      placement: 'placementStage3',
      matches: [{
        id: 'heavy-loss',
        phase: 'stage3',
        bestOf: 3,
        teamA: user,
        teamB: opponent,
        scoreA: 0,
        scoreB: 2,
        winnerId: opponent.id,
        userMatch: true,
        maps: [
          { map: 1, scoreA: 5, scoreB: 13, winnerId: opponent.id, overtime: false, rounds: [] },
          { map: 2, scoreA: 7, scoreB: 13, winnerId: opponent.id, overtime: false, rounds: [] }
        ]
      }]
    };

    const first = createRunStats(players, heavyLoss, 'heavy-loss-seed', lineup);
    const second = createRunStats(players, heavyLoss, 'heavy-loss-seed', lineup);
    expect(second).toEqual(first);
    expect(first.filter((stat) => stat.runRating > 1.05).length).toBeLessThanOrEqual(1);
    expect(first.some((stat) => stat.runRating <= 0.7)).toBe(true);
    expect(first.filter((stat) => stat.runRating < 0.9).every((stat) => stat.kills < stat.deaths)).toBe(true);
  });
});
