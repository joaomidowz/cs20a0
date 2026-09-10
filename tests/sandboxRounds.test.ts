import { describe, expect, it } from 'vitest';
import { getTeamPlayers, players, teams } from '../src/lib/game/data';
import { calculateHistoricalTeamPower, createSeededRng, simulateMap } from '../src/lib/game/simulation';
import { aggregateSandboxKills, countSandboxPistolWins, type SandboxWeapon } from '../src/lib/game/sandbox/rounds';
import type { RoundDetail } from '../src/lib/game/types';

const [teamA, teamB] = teams.slice(0, 2);
const rosterA = { players: getTeamPlayers(teamA) };
const rosterB = { players: getTeamPlayers(teamB) };
const combatA = calculateHistoricalTeamPower(teamA, players);
const combatB = calculateHistoricalTeamPower(teamB, players);

const buildMap = (seed: string, options: Parameters<typeof simulateMap>[4] = {}) =>
  simulateMap(combatA, combatB, createSeededRng(seed), 1, { rosterA, rosterB, ...options });
const buildDetails = (seed: string): RoundDetail[] => buildMap(seed).details ?? [];

const PISTOLS: SandboxWeapon[] = ['usp', 'glock', 'deagle', 'fiveseven', 'p250', 'tec9'];
const RIFLES: SandboxWeapon[] = ['ak47', 'm4a1', 'awp'];

describe('round details produced by the engine', () => {
  it('is deterministic for the same seed and covers every round', () => {
    const first = buildMap('feed-a');
    const second = buildMap('feed-a');
    expect(second).toEqual(first);
    expect(first.details).toHaveLength(first.rounds.length);
    expect(first.details!.map((round) => round.number)).toEqual(first.rounds.map((_, index) => index + 1));
    const other = buildMap('feed-b');
    expect(other.details!.flatMap((round) => round.kills)).not.toEqual(first.details!.flatMap((round) => round.kills));
  });

  it('matches the winner of every round and keeps sides swapping at halftime', () => {
    for (const seed of ['feed-a', 'feed-b', 'feed-c']) {
      const map = buildMap(seed);
      const details = map.details!;
      details.forEach((round, index) => {
        const before = index > 0 ? map.rounds[index - 1] : { a: 0, b: 0 };
        expect(round.winner).toBe(map.rounds[index].a > before.a ? 'a' : 'b');
      });
      expect(details[12].sideA).not.toBe(details[0].sideA);
      expect(details.slice(0, 12).every((round) => round.sideA === details[0].sideA)).toBe(true);
      expect(details[0].sideA).toBe(map.aStartsCt ? 'ct' : 't');
      expect(map.halves!.length).toBeGreaterThanOrEqual(2);
      expect(map.halves![0].a + map.halves![0].b).toBe(12);
    }
  });

  it('forces pistol rounds and keeps the economy inside CS2 bounds', () => {
    for (const seed of ['feed-a', 'feed-b', 'feed-c', 'feed-d']) {
      const details = buildDetails(seed);
      expect(details[0].economy.a.buy).toBe('pistol');
      expect(details[0].economy.b.buy).toBe('pistol');
      expect(details[0].tags).toContain('pistol');
      expect(details[12].economy.a.buy).toBe('pistol');
      expect(details[12].economy.b.buy).toBe('pistol');
      for (const round of details) {
        for (const economy of [round.economy.a, round.economy.b]) {
          expect(economy.money).toBeGreaterThanOrEqual(0);
          expect(economy.money).toBeLessThanOrEqual(16000);
          if (economy.awp) expect(economy.buy).toBe('full');
        }
      }
      // Eco and force buys must happen at least once in a full map: the model is not "always full buy".
      const buys = new Set(details.flatMap((round) => [round.economy.a.buy, round.economy.b.buy]));
      expect(buys.has('full')).toBe(true);
      expect(buys.has('eco') || buys.has('force')).toBe(true);
    }
  });

  it('never lets the AWP show up on a team without an AWPer', () => {
    // Synthetic players: real ids/nicknames could match the known-role fallbacks (e.g. FalleN is always an AWPer).
    const noAwpers = { players: [1, 2, 3, 4, 5].map((index) => ({ id: `synthetic-${index}`, nickname: `Synth${index}`, role: 'rifler', awp: 40, firepower: 80, entry: 70, overall: 80 })) };
    const details = buildMap('feed-a', { rosterA: noAwpers }).details!;
    expect(details.every((round) => !round.economy.a.awp)).toBe(true);
    expect(details.flatMap((round) => round.kills).filter((kill) => kill.killerSide === 'a').every((kill) => kill.weapon !== 'awp')).toBe(true);
    const userAwper = { players: noAwpers.players, roles: new Map([[noAwpers.players[0].id, 'awper' as const]]) };
    const awpKills = ['feed-a', 'feed-b', 'feed-c', 'feed-d', 'feed-e']
      .flatMap((seed) => buildMap(seed, { rosterA: userAwper }).details!)
      .flatMap((round) => round.kills)
      .filter((kill) => kill.weapon === 'awp' && kill.killerSide === 'a');
    expect(awpKills.length).toBeGreaterThan(0);
    expect(awpKills.every((kill) => kill.killerId === noAwpers.players[0].id)).toBe(true);
  });

  it('produces kill feeds consistent with the round result and the buys', () => {
    for (const seed of ['feed-a', 'feed-b', 'feed-c']) {
      for (const round of buildDetails(seed)) {
        const loser = round.winner === 'a' ? 'b' : 'a';
        const winnerKills = round.kills.filter((kill) => kill.killerSide === round.winner);
        const loserKills = round.kills.filter((kill) => kill.killerSide === loser);
        expect(winnerKills.length).toBeGreaterThanOrEqual(1);
        expect(loserKills.length).toBeLessThanOrEqual(4);
        if (round.ending === 'elimination') expect(winnerKills.length).toBe(5);
        expect(round.kills.at(-1)?.killerSide).toBe(round.winner);
        expect(new Set(round.kills.map((kill) => kill.victimId)).size).toBe(round.kills.length);
        expect(round.kills.every((kill, index) => index === 0 || kill.second >= round.kills[index - 1].second)).toBe(true);
        for (const kill of round.kills) {
          const buy = round.economy[kill.killerSide].buy;
          if (kill.weapon === 'knife') continue;
          const keptAwp = Boolean(round.economy[kill.killerSide].awpKept) && kill.weapon === 'awp';
          if (buy === 'pistol') expect(PISTOLS).toContain(kill.weapon);
          // A saved AWP comes back on eco and force rounds; a force buy also drops one rifle to the team's star.
          if (buy === 'eco' && !keptAwp) expect(PISTOLS).toContain(kill.weapon);
          if (buy === 'full') expect([...RIFLES, 'deagle', 'usp', 'glock']).toContain(kill.weapon);
          if (buy === 'force' && !keptAwp) expect(kill.weapon).not.toBe('awp');
          if (buy === 'pistol') expect(RIFLES).not.toContain(kill.weapon);
        }
      }
    }
  });

  it('aggregates frags and pistol wins from the feed', () => {
    const details = buildDetails('feed-a');
    const lines = aggregateSandboxKills(details);
    const totalKills = details.reduce((sum, round) => sum + round.kills.length, 0);
    expect(lines.reduce((sum, line) => sum + line.kills, 0)).toBe(totalKills);
    expect(lines.reduce((sum, line) => sum + line.deaths, 0)).toBe(totalKills);
    expect(lines.every((line, index) => index === 0 || lines[index - 1].kills >= line.kills)).toBe(true);
    expect(aggregateSandboxKills(details, 0)).toEqual([]);
    const pistols = countSandboxPistolWins(details);
    expect(pistols.a + pistols.b).toBe(2);
  });

  it('still simulates the map (without a kill feed) when a roster is missing', () => {
    const map = simulateMap(combatA, combatB, createSeededRng('feed-a'), 1, { rosterB });
    expect(map.details).toHaveLength(map.rounds.length);
    expect(map.details!.every((round) => round.kills.length === 0)).toBe(true);
    expect(Math.max(map.scoreA, map.scoreB)).toBeGreaterThanOrEqual(13);
  });
});
