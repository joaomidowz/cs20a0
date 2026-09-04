import { describe, expect, it } from 'vitest';
import { getTeamPlayers, teams } from '../src/lib/game/data';
import { calculateHistoricalTeamPower, createSeededRng, simulateMap } from '../src/lib/game/simulation';
import { aggregateSandboxKills, buildSandboxRoundDetails, countSandboxPistolWins, type SandboxWeapon } from '../src/lib/game/sandbox/rounds';
import { players } from '../src/lib/game/data';

const [teamA, teamB] = teams.slice(0, 2);
const rosterA = { players: getTeamPlayers(teamA) };
const rosterB = { players: getTeamPlayers(teamB) };
const combatA = calculateHistoricalTeamPower(teamA, players);
const combatB = calculateHistoricalTeamPower(teamB, players);

const buildMap = (seed: string) => simulateMap(combatA, combatB, createSeededRng(seed), 1);
const buildDetails = (seed: string) => buildSandboxRoundDetails(buildMap(seed), rosterA, rosterB, `${seed}:rounds`);

const PISTOLS: SandboxWeapon[] = ['usp', 'glock', 'deagle', 'fiveseven', 'p250', 'tec9'];
const RIFLES: SandboxWeapon[] = ['ak47', 'm4a1', 'awp'];

describe('sandbox round details', () => {
  it('is deterministic for the same map and seed and covers every round', () => {
    const map = buildMap('feed-a');
    const first = buildSandboxRoundDetails(map, rosterA, rosterB, 'feed-a:rounds');
    const second = buildSandboxRoundDetails(map, rosterA, rosterB, 'feed-a:rounds');
    expect(second).toEqual(first);
    expect(first).toHaveLength(map.rounds.length);
    expect(first.map((round) => round.number)).toEqual(map.rounds.map((_, index) => index + 1));
    const other = buildSandboxRoundDetails(map, rosterA, rosterB, 'feed-b:rounds');
    expect(other.flatMap((round) => round.kills)).not.toEqual(first.flatMap((round) => round.kills));
  });

  it('matches the winner of every simulated round and keeps sides swapping at halftime', () => {
    for (const seed of ['feed-a', 'feed-b', 'feed-c']) {
      const map = buildMap(seed);
      const details = buildSandboxRoundDetails(map, rosterA, rosterB, `${seed}:rounds`);
      details.forEach((round, index) => {
        const before = index > 0 ? map.rounds[index - 1] : { a: 0, b: 0 };
        expect(round.winner).toBe(map.rounds[index].a > before.a ? 'a' : 'b');
      });
      expect(details[12].sideA).not.toBe(details[0].sideA);
      expect(details.slice(0, 12).every((round) => round.sideA === details[0].sideA)).toBe(true);
    }
  });

  it('forces pistol rounds and keeps the economy inside CS2 bounds', () => {
    for (const seed of ['feed-a', 'feed-b', 'feed-c', 'feed-d']) {
      const details = buildDetails(seed);
      expect(details[0].economy.a.buy).toBe('pistol');
      expect(details[0].economy.b.buy).toBe('pistol');
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
    const details = buildSandboxRoundDetails(buildMap('feed-a'), noAwpers, rosterB, 'feed-a:noawp');
    expect(details.every((round) => !round.economy.a.awp)).toBe(true);
    expect(details.flatMap((round) => round.kills).filter((kill) => kill.killerSide === 'a').every((kill) => kill.weapon !== 'awp')).toBe(true);
    const userAwper = { players: noAwpers.players, roles: new Map([[noAwpers.players[0].id, 'awper' as const]]) };
    const withUser = buildSandboxRoundDetails(buildMap('feed-a'), userAwper, rosterB, 'feed-a:userawp');
    const awpKills = withUser.flatMap((round) => round.kills).filter((kill) => kill.weapon === 'awp' && kill.killerSide === 'a');
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
          if (buy === 'pistol' || buy === 'eco') expect(PISTOLS).toContain(kill.weapon);
          if (buy === 'full') expect([...RIFLES, 'deagle', 'usp', 'glock']).toContain(kill.weapon);
          if (buy !== 'full') expect(RIFLES).not.toContain(kill.weapon);
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

  it('returns nothing when a roster is missing', () => {
    expect(buildSandboxRoundDetails(buildMap('feed-a'), { players: [] }, rosterB, 'x')).toEqual([]);
  });
});
