/**
 * Generates playable game JSON from raw team/player inputs.
 * v2 fixes the previous issue where riflers were punished by low AWP/IGL values.
 * Overall is now role-aware, then player-overrides.json is applied on top.
 */
import { clamp, canonicalNick, readJson, readJsonIfExists, round, writeJson } from './utils.ts';

type Game = 'CSGO' | 'CS2' | 'MIXED';
type Role = 'rifler' | 'entry' | 'awper' | 'igl' | 'support' | 'lurker' | 'awper-igl';
type Playstyle = 'aggressive' | 'balanced' | 'tactical';

type Team = {
  id: string;
  year: number;
  game: Game;
  rank: number;
  name: string;
  points: number | null;
  players: Array<{ nickname: string; hltvPlayerId?: number | null }>;
  sourceUrl: string;
  note?: string;
};

type PlayerInput = {
  id: string;
  nickname: string;
  hltvPlayerId: number | null;
  teamId: string;
  year: number;
  game: Game;
  statsUrl: string | null;
};

type PlayerOverride = Partial<Record<string, unknown>> & {
  title?: string;
  rarity?: string;
  traits?: string[];
  role?: Role;
  playstyle?: Playstyle;
  overall?: number;
  firepower?: number;
  clutch?: number;
  entry?: number;
  awp?: number;
  support?: number;
  igl?: number;
  experience?: number;
  consistency?: number;
  mental?: number;
};

const teams = await readJson<Team[]>('data/raw/teams.raw.json');
const playersInput = await readJson<PlayerInput[]>('data/raw/players.input.json');
const overrides = await readJsonIfExists<Record<string, PlayerOverride>>('data/input/player-overrides.json', {});

const awpers = new Set(['s1mple', 'zywoo', 'm0nesy', 'sh1ro', 'broky', 'w0nderful', 'torzsi', 'jame', 'fallen', 'device', 'guardian', 'woxic', 'cadian']);
const igls = new Set(['karrigan', 'gla1ve', 'apex', 'boombl4', 'hooxi', 'cadian', 'aleksib', 'snax', 'chopper', 'kyxsan', 'nafany', 'siuhy', 'jame', 'fallen', 'stanislaw', 'golden', 'nitr0', 'zeus']);
const entries = new Set(['donk', 'fer', 'yekindar', 'rain', 'dupreeh', 'stewie2k', 'flamez', 'malbsmd', 'xertion', 'rush']);
const lurkers = new Set(['ropz', 'coldzera', 'kscerato', 'naf', 'xyp9x', 'spinx', 'jks']);
const supports = new Set(['taco', 'perfecto', 'interz', 'sjuush', 'mezii', 'rpk', 'qikert']);

const starBonusByNick: Record<string, number> = {
  s1mple: 9,
  zywoo: 9,
  coldzera: 8,
  donk: 9,
  m0nesy: 8,
  niko: 8,
  device: 7,
  ropz: 6,
  sh1ro: 6,
  ax1le: 5,
  elige: 5,
  kscerato: 5,
  twistzz: 4,
  electronic: 4,
  spinx: 4,
  frozen: 4,
  b1t: 4,
  jame: 4,
  cadian: 4,
  fallen: 5,
  fer: 5,
  fnx: 4
};

function rankBase(rank: number) {
  if (rank === 1) return 88;
  if (rank === 2) return 85;
  if (rank === 3) return 82;
  return 78;
}

function inferRole(nickname: string): Role {
  const nick = canonicalNick(nickname);
  if (awpers.has(nick) && igls.has(nick)) return 'awper-igl';
  if (awpers.has(nick)) return 'awper';
  if (igls.has(nick)) return 'igl';
  if (entries.has(nick)) return 'entry';
  if (supports.has(nick)) return 'support';
  if (lurkers.has(nick)) return 'lurker';
  return 'rifler';
}

function defaultStats(input: PlayerInput, team: Team) {
  const nick = canonicalNick(input.nickname);
  const role = inferRole(input.nickname);
  const base = rankBase(team.rank);
  const starBonus = starBonusByNick[nick] ?? 0;
  const eraBonus = team.year <= 2021 ? 1 : 0;

  let firepower = base + 2 + starBonus + eraBonus;
  let clutch = base + 1 + Math.floor(starBonus * 0.75) + eraBonus;
  let entry = base - 1 + Math.floor(starBonus * 0.65);
  let awp = 18;
  let support = base + 1;
  let igl = 18;
  let experience = base + (team.year <= 2020 ? 7 : team.year <= 2022 ? 5 : 3);
  let consistency = base + Math.floor(starBonus * 0.65) + 2;
  let mental = base + Math.floor(starBonus * 0.60) + 3;

  if (role === 'awper') {
    awp = 92 + Math.floor(starBonus * 0.7);
    entry += 2;
    support -= 5;
  }

  if (role === 'awper-igl') {
    awp = 90 + Math.floor(starBonus * 0.6);
    igl = 90 + Math.floor(starBonus * 0.5);
    support += 4;
    mental += 5;
  }

  if (role === 'igl') {
    igl = 90 + Math.floor(starBonus * 0.4);
    support += 6;
    mental += 5;
    firepower -= 5;
  }

  if (role === 'entry') {
    entry += 8;
    firepower += 3;
    support -= 4;
  }

  if (role === 'support') {
    support += 9;
    clutch += 3;
    firepower -= 3;
    entry -= 4;
  }

  if (role === 'lurker') {
    clutch += 6;
    consistency += 5;
    support += 3;
    entry -= 5;
  }

  return {
    role,
    firepower: round(firepower),
    clutch: round(clutch),
    entry: round(entry),
    awp: round(awp),
    support: round(support),
    igl: round(igl),
    experience: round(experience),
    consistency: round(consistency),
    mental: round(mental)
  };
}

function calculateOverall(stats: {
  role: Role;
  firepower: number;
  clutch: number;
  entry: number;
  awp: number;
  support: number;
  igl: number;
  experience: number;
  consistency: number;
  mental: number;
}) {
  if (stats.role === 'awper') {
    return round(
      stats.firepower * 0.24 +
      stats.awp * 0.24 +
      stats.clutch * 0.14 +
      stats.consistency * 0.14 +
      stats.experience * 0.08 +
      stats.mental * 0.08 +
      stats.entry * 0.05 +
      stats.support * 0.03
    );
  }

  if (stats.role === 'awper-igl') {
    return round(
      stats.awp * 0.20 +
      stats.igl * 0.20 +
      stats.firepower * 0.14 +
      stats.clutch * 0.12 +
      stats.experience * 0.12 +
      stats.mental * 0.12 +
      stats.consistency * 0.07 +
      stats.support * 0.03
    );
  }

  if (stats.role === 'igl') {
    return round(
      stats.igl * 0.28 +
      stats.support * 0.16 +
      stats.experience * 0.16 +
      stats.mental * 0.14 +
      stats.consistency * 0.10 +
      stats.clutch * 0.08 +
      stats.firepower * 0.06 +
      stats.entry * 0.02
    );
  }

  if (stats.role === 'entry') {
    return round(
      stats.firepower * 0.30 +
      stats.entry * 0.22 +
      stats.clutch * 0.12 +
      stats.consistency * 0.13 +
      stats.experience * 0.08 +
      stats.mental * 0.10 +
      stats.support * 0.05
    );
  }

  if (stats.role === 'support') {
    return round(
      stats.support * 0.24 +
      stats.clutch * 0.18 +
      stats.consistency * 0.18 +
      stats.experience * 0.12 +
      stats.mental * 0.12 +
      stats.firepower * 0.11 +
      stats.entry * 0.05
    );
  }

  if (stats.role === 'lurker') {
    return round(
      stats.firepower * 0.24 +
      stats.clutch * 0.22 +
      stats.consistency * 0.20 +
      stats.support * 0.10 +
      stats.experience * 0.09 +
      stats.mental * 0.10 +
      stats.entry * 0.05
    );
  }

  return round(
    stats.firepower * 0.30 +
    stats.clutch * 0.18 +
    stats.consistency * 0.18 +
    stats.entry * 0.12 +
    stats.experience * 0.10 +
    stats.mental * 0.08 +
    stats.support * 0.04
  );
}

function defaultRarity(overall: number) {
  if (overall >= 98) return 'goat';
  if (overall >= 95) return 'legend';
  if (overall >= 92) return 'superstar';
  if (overall >= 88) return 'elite';
  return 'rare';
}

function applyOverride<T extends Record<string, any>>(player: T, override?: PlayerOverride): T {
  if (!override) return player;
  const merged = {
    ...player,
    ...override,
    traits: override.traits ?? player.traits ?? []
  };
  const roleStats = {
    role: merged.role,
    firepower: merged.firepower,
    clutch: merged.clutch,
    entry: merged.entry,
    awp: merged.awp,
    support: merged.support,
    igl: merged.igl,
    experience: merged.experience,
    consistency: merged.consistency,
    mental: merged.mental
  };
  merged.overall = override.overall ?? calculateOverall(roleStats);
  merged.rarity = override.rarity ?? defaultRarity(merged.overall);
  return merged;
}

const playerGame = playersInput.map(player => {
  const team = teams.find(item => item.id === player.teamId);
  if (!team) throw new Error(`Missing team for ${player.id}: ${player.teamId}`);

  const stats = defaultStats(player, team);
  const basePlayer = {
    id: player.id,
    nickname: player.nickname,
    title: null as string | null,
    hltvPlayerId: player.hltvPlayerId,
    teamId: player.teamId,
    year: player.year,
    game: player.game,
    role: stats.role,
    overall: calculateOverall(stats),
    rarity: 'rare',
    traits: [] as string[],
    ...stats,
    source: {
      statsUrl: player.statsUrl,
      note: player.statsUrl
        ? 'Stats URL generated from hltvPlayerId. Use collect:player-pages only for local dataset preparation.'
        : 'Missing hltvPlayerId; fill data/input/player-ids.manual.json if you need a stats URL.'
    }
  };

  basePlayer.rarity = defaultRarity(basePlayer.overall);
  return applyOverride(basePlayer, overrides[player.id]);
});

const teamsGame = teams.map(team => {
  const players = playerGame.filter(player => player.teamId === team.id).map(player => player.id);
  const base = rankBase(team.rank);
  const avgOverall = players.length
    ? players.reduce((sum, id) => sum + (playerGame.find(player => player.id === id)?.overall ?? 0), 0) / players.length
    : base;

  const isDynasty = ['astralis-2018', 'astralis-2019', 'natus-vincere-2021', 'sk-2017', 'vitality-2025'].includes(team.id);

  return {
    id: team.id,
    name: team.name,
    year: team.year,
    game: team.game,
    sourceRank: team.rank,
    hltvPoints: team.points,
    tier: team.rank === 1 ? 'S+' : 'S',
    rarity: isDynasty || team.rank === 1 ? 'legendary' : 'elite',
    players,
    teamPowerPreview: round(avgOverall),
    teamStats: {
      chemistry: round(base + (isDynasty ? 10 : 5)),
      tactics: round(base + (isDynasty ? 9 : team.rank === 1 ? 5 : 2)),
      mapPool: round(base + (isDynasty ? 8 : 2)),
      mental: round(base + (isDynasty ? 8 : 4)),
      experience: round(base + (team.year <= 2022 ? 7 : 4)),
      clutch: round(base + (isDynasty ? 7 : 3)),
      consistency: round(base + (isDynasty ? 9 : team.rank === 1 ? 5 : 2))
    },
    source: {
      rankingUrl: team.sourceUrl,
      note: team.note ?? 'Generated from ranking snapshot seed and game balancing.'
    }
  };
});

await writeJson('data/generated/players.game.json', playerGame);
await writeJson('data/generated/teams.game.json', teamsGame);
await writeJson('src/lib/data/cs/players.game.json', playerGame);
await writeJson('src/lib/data/cs/teams.game.json', teamsGame);

console.log(`[ok] generated ${teamsGame.length} teams and ${playerGame.length} player-year rows`);
