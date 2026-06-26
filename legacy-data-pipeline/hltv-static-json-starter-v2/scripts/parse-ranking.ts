/**
 * Parses cached HLTV ranking HTML if available.
 * If cached HTML does not exist or parsing fails, falls back to data/input/teams.seed.json.
 */
import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { canonicalNick, readJson, slugify, writeJson } from './utils.ts';

type Game = 'CSGO' | 'CS2' | 'MIXED';

type YearInput = {
  year: number;
  game: Game;
  snapshotDate: string;
  rankingUrl: string;
  top: number;
};

type SeedPlayer = string | { nickname: string; hltvPlayerId?: number | null };

type TeamSeed = {
  id: string;
  year: number;
  game: Game;
  rank: number;
  name: string;
  points: number | null;
  hltvTeamId?: number | null;
  players: SeedPlayer[];
  sourceUrl: string;
  note?: string;
};

type Team = {
  id: string;
  year: number;
  game: Game;
  rank: number;
  name: string;
  points: number | null;
  hltvTeamId?: number | null;
  players: Array<{ nickname: string; hltvPlayerId?: number | null }>;
  sourceUrl: string;
  note?: string;
};

const years = await readJson<YearInput[]>('data/input/years.input.json');
const fallbackSeed = await readJson<TeamSeed[]>('data/input/teams.seed.json');
const playerIds = await readJson<Record<string, number | null>>('data/input/player-ids.manual.json');

function parseTeamIdFromHref(href?: string) {
  const match = href?.match(/\/team\/(\d+)\//);
  return match ? Number(match[1]) : null;
}

function parsePlayerIdFromHref(href?: string) {
  const match = href?.match(/\/player\/(\d+)\//);
  return match ? Number(match[1]) : null;
}

function parsePoints(text: string) {
  const match = text.match(/\((\d+)\s+HLTV points\)/i) || text.match(/(\d+)\s+HLTV points/i);
  return match ? Number(match[1]) : null;
}

function normalizePlayer(player: SeedPlayer) {
  const nickname = typeof player === 'string' ? player : player.nickname;
  const key = canonicalNick(nickname);
  const hltvPlayerId = typeof player === 'string'
    ? playerIds[key] ?? null
    : player.hltvPlayerId ?? playerIds[key] ?? null;

  return { nickname, hltvPlayerId };
}

function parseWithSelectors(html: string, input: YearInput): Team[] {
  const $ = cheerio.load(html);
  const teams: Team[] = [];

  $('.ranked-team').each((index, element) => {
    if (teams.length >= input.top) return;

    const root = $(element);
    const rankText = root.find('.position').first().text().trim() || `#${index + 1}`;
    const rank = Number(rankText.replace(/[^0-9]/g, '')) || index + 1;

    const teamAnchor = root.find('a[href*="/team/"]').first();
    const teamName =
      root.find('.name').first().text().trim() ||
      root.find('.team-name').first().text().trim() ||
      teamAnchor.text().trim();

    const points = parsePoints(root.text());
    const hltvTeamId = parseTeamIdFromHref(teamAnchor.attr('href'));

    const playerMap = new Map<string, { nickname: string; hltvPlayerId?: number | null }>();
    root.find('a[href*="/player/"]').each((_, playerEl) => {
      const anchor = $(playerEl);
      const nickname = anchor.text().trim();
      if (!nickname) return;
      playerMap.set(nickname, {
        nickname,
        hltvPlayerId: parsePlayerIdFromHref(anchor.attr('href')) ?? playerIds[canonicalNick(nickname)] ?? null
      });
    });

    if (!teamName) return;

    teams.push({
      id: `${slugify(teamName)}-${input.year}`,
      year: input.year,
      game: input.game,
      rank,
      name: teamName,
      points,
      hltvTeamId,
      players: [...playerMap.values()].slice(0, 5),
      sourceUrl: input.rankingUrl,
      note: 'Parsed from cached ranking HTML.'
    });
  });

  return teams;
}

function fallbackForYear(input: YearInput): Team[] {
  return fallbackSeed
    .filter(team => team.year === input.year)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, input.top)
    .map(team => ({
      ...team,
      players: team.players.map(normalizePlayer),
      note: team.note ?? 'Seed fallback.'
    }));
}

const output: Team[] = [];

for (const input of years) {
  const htmlPath = `data/raw/html/${input.year}-ranking.html`;
  let parsed: Team[] = [];

  try {
    const html = await fs.readFile(htmlPath, 'utf-8');
    parsed = parseWithSelectors(html, input);
  } catch {
    // no cached HTML
  }

  if (parsed.length < input.top || parsed.some(team => team.players.length < 5)) {
    console.log(`[fallback] ${input.year}: using seed data`);
    parsed = fallbackForYear(input);
  } else {
    console.log(`[parsed] ${input.year}: ${parsed.length} teams`);
  }

  output.push(...parsed);
}

await writeJson('data/raw/teams.raw.json', output);
console.log(`[ok] data/raw/teams.raw.json (${output.length} teams)`);
