import { readJson } from './utils.ts';

type Team = { id: string; year: number; players: string[] };
type Player = { id: string; hltvPlayerId: number | null; overall: number; nickname: string; year: number; teamId: string };
type YearInput = { year: number; top: number };

const teams = await readJson<Team[]>('data/generated/teams.game.json');
const players = await readJson<Player[]>('data/generated/players.game.json');
const years = await readJson<YearInput[]>('data/input/years.input.json');

const problems: string[] = [];
const expectedTeams = years.reduce((total, year) => total + year.top, 0);
const expectedPlayers = expectedTeams * 5;

if (teams.length !== expectedTeams) problems.push(`Expected ${expectedTeams} teams, got ${teams.length}`);
if (players.length !== expectedPlayers) problems.push(`Expected ${expectedPlayers} player-year rows, got ${players.length}`);

for (const input of years) {
  const teamsInYear = teams.filter(team => team.year === input.year).length;
  if (teamsInYear !== input.top) problems.push(`Expected ${input.top} teams for ${input.year}, got ${teamsInYear}`);
}

for (const team of teams) {
  if (team.players.length !== 5) problems.push(`${team.id} has ${team.players.length} players`);
}

const missingIds = players.filter(player => !player.hltvPlayerId);
const suspicious = players.filter(player => player.overall < 70 || player.overall > 100);

if (missingIds.length) {
  console.warn(`[warn] ${missingIds.length} player-year rows are missing hltvPlayerId. You can still play; fill data/input/player-ids.manual.json later.`);
}

if (suspicious.length) {
  problems.push(`Suspicious overall values: ${suspicious.map(p => `${p.id}=${p.overall}`).join(', ')}`);
}

if (problems.length) {
  console.error('[error] Validation failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`[ok] validation passed: ${teams.length} teams, ${players.length} player-year rows, ${missingIds.length} missing hltv IDs`);
