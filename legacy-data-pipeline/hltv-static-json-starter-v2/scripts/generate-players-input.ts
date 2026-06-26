/**
 * Creates player-year inputs from teams.raw.json.
 * Uses hltvPlayerId from cached ranking HTML or data/input/player-ids.manual.json.
 */
import { buildStatsUrl, canonicalNick, readJson, writeJson } from './utils.ts';

type Game = 'CSGO' | 'CS2' | 'MIXED';

type Team = {
  id: string;
  year: number;
  game: Game;
  players: Array<{ nickname: string; hltvPlayerId?: number | null }>;
};

const teams = await readJson<Team[]>('data/raw/teams.raw.json');
const playerIds = await readJson<Record<string, number | null>>('data/input/player-ids.manual.json');

function csVersionForYear(game: Game, year: number): 'CSGO' | 'CS2' | null {
  // 2023 is a mixed CSGO/CS2 season; omitting csVersion is usually better for annual cards.
  if (game === 'MIXED' || year === 2023) return null;
  return game;
}

const players = teams.flatMap(team => {
  const startDate = `${team.year}-01-01`;
  const endDate = `${team.year}-12-31`;
  const csVersion = csVersionForYear(team.game, team.year);

  return team.players.map(player => {
    const hltvPlayerId = player.hltvPlayerId ?? playerIds[canonicalNick(player.nickname)] ?? null;

    return {
      id: `${canonicalNick(player.nickname)}-${team.year}`,
      nickname: player.nickname,
      hltvPlayerId,
      teamId: team.id,
      year: team.year,
      game: team.game,
      csVersion,
      startDate,
      endDate,
      statsUrl: hltvPlayerId
        ? buildStatsUrl({
            hltvPlayerId,
            nickname: player.nickname,
            startDate,
            endDate,
            csVersion
          })
        : null
    };
  });
});

await writeJson('data/raw/players.input.json', players);
console.log(`[ok] data/raw/players.input.json (${players.length} player-year rows)`);
