// src/lib/game/playerCareer/extraTeams.ts
// Times do guia de campeonatos por tier e região (base de estudo do usuário, 2026) que a coleta da cena não
// trouxe, e elencos para quem veio sem jogador. Os times do guia ainda NÃO entram no jogo: o usuário vai coletar
// os elencos reais (planilha elencos-pendentes-carreira.csv); o gerador fica para quem continuar sem jogador. Nicks reais quando o guia lista a lineup; o resto é gerado
// (gerador do usuário: raiz + leetspeak, prefixo ou sufixo), determinístico pelo nome do time e marcado como
// placeholder (sem data de nascimento nem catálogo). Países só para times de cena nacional; misto fica null.
import type { SceneOrg, SceneRosterMember } from './data';

export interface ExtraTeam {
  name: string;
  /** 2 = Tier 2 · 3 = Challenger · 4 = CCT/GC */
  level: 2 | 3 | 4;
  /** País do time (define o circuito regional). */
  country: string | null;
  /** Elenco de um país só (os jogadores herdam o país do time). */
  national: boolean;
  /** Lineup real listada no guia. */
  nicks?: string[];
}

const T = (name: string, level: 2 | 3 | 4, country: string | null, national: boolean, nicks?: string[]): ExtraTeam => ({ name, level, country, national, ...(nicks ? { nicks } : {}) });

export const EXTRA_TEAMS: ExtraTeam[] = [
  // América do Sul
  T('BESTIA', 3, 'Argentina', true, ['Noktse', 'luchov', 'zock', 'tomaszin', 'naz']),
  T('Dusty Roots', 3, 'Brazil', true, ['tom1jed', 'maxxkor', 'rzk', 'guty', 'next']),
  T('Solid', 3, 'Brazil', true, ['Ltz', 'nardes', 'gbb', 'destiny', 'mello']),
  T('Case Esports', 3, 'Brazil', true, ['snow', 'yeel', 'reaz3n', 'RCF', 'm4T']),
  T('W7M', 3, 'Brazil', true),
  T('00 Nation', 3, 'Brazil', true),
  T('KRÜ Esports', 3, 'Argentina', true),
  T('Intense Game', 4, 'Brazil', true),
  T('Vikings KR', 4, 'Brazil', true),
  T('YNG Warriors', 4, 'Brazil', true),
  T('SWS', 4, 'Brazil', true),
  T('Corinthians Esports', 4, 'Brazil', true),
  T('Havan Liberty', 4, 'Brazil', true),
  T('Bravos', 4, 'Brazil', true),
  T('Paquetá', 4, 'Brazil', true),
  T('Meta Gaming', 4, 'Brazil', true),
  T('River Plate', 4, 'Argentina', true),
  T('Boca Juniors', 4, 'Argentina', true),
  T('Furious Gaming', 4, 'Argentina', true),
  T('9z Academy', 4, 'Argentina', true),
  // Europa e CIS
  T('Eternal Fire', 2, 'Turkey', true),
  T('Cloud9', 2, null, false),
  T('1WIN', 2, 'Russia', true),
  T('AMKAL', 2, 'Russia', true),
  T('FORZE', 2, 'Russia', true),
  T('SAW', 2, 'Portugal', true),
  T('Nine To Five', 2, null, false),
  T('Nemiga Gaming', 3, null, false, ['Xant3r', '1eeR', 'riskyb0b', 'sowalio', 'khaN']),
  T('Sangal Esports', 3, null, false, ['xfl0ud', 'LNZ', 'yxngstxr', 'L4R3N', 'Sapec']),
  T('Zero Tenacity', 3, null, false, ['simke', 'Cptkurt01', 'aress', 'brut3', 'nemanja']),
  T('Rhyno Esports', 3, 'Portugal', true, ['DDias', 'TMKj', 'Icarus', 'rafax', 'snpy']),
  T('Preasy', 3, 'Denmark', true),
  T('Sashi Esports', 3, 'Denmark', true),
  T('NAVI Junior', 3, 'Ukraine', true),
  T('MOUZ NXT', 3, null, false),
  T('Astralis Talent', 3, 'Denmark', true),
  T('Young Ninjas', 3, 'Sweden', true),
  T('ALTERNATE aTTaX', 3, 'Germany', true),
  T('Permitta', 3, 'Poland', true),
  T('9 Pandas', 3, 'Russia', true),
  T('K23', 3, 'Kazakhstan', true),
  T('Nexus Gaming', 3, 'Romania', true),
  T('Dynamo Eclot', 3, null, false),
  T('Endpoint', 3, null, false),
  T('ITB', 3, null, false),
  // América do Norte (elencos mistos: só o circuito é o da região)
  T('Complexity', 2, 'United States', false),
  T('Nouns', 2, 'United States', false),
  T('Party Astronauts', 2, 'United States', false),
  T('Boss', 3, 'United States', false, ['d3rn', 'brett', 'cryptic', 'micro', 'freshie']),
  T('Fluffy Aimers', 3, 'United States', false, ['Jason', 'Joga', 'slump', 'PNaDa', 'ERIN']),
  T('Limitless', 3, 'United States', false, ['Makzwell', 'KMZ', 'grape', 'Sandman', 'phantom']),
  T('Take Flyte', 3, 'United States', false),
  T('Carpe Diem', 3, 'United States', false),
  T('Lag Gaming', 4, 'United States', false),
  T('Wanted Goons', 4, 'United States', false),
  T('NuTsunami', 4, 'United States', false),
  T('Detonate', 4, 'United States', false),
  T('Strife', 4, 'United States', false),
  T('timbermen', 4, 'United States', false),
  // Ásia e Oceania
  T('ATOX Esports', 3, 'Mongolia', true, ['dobu', 'kabal', 'MiQ', 'Zelos', 'y3k']),
  T('Steel Helmet', 3, 'China', true, ['captainMo', 'DD', 'AE', '18yM', 'mo']),
  T('Bad News Kangaroos', 3, 'Australia', true, ['marke', 'damyo', 'hazr', 'm2c', 'pzz']),
  T('IHC Esports', 3, 'Mongolia', true),
  T('Gods Reign', 3, 'India', true),
  T('Vantage', 3, 'Australia', true),
  T('CatEvil', 3, 'China', true),
  T('Wings Up', 3, 'China', true),
  T('Renewal', 3, 'China', true),
  T('Talon Esports', 3, 'Hong Kong', false),
  T('Chinggis Warriors', 4, 'Mongolia', true),
  T('Team Kobolds', 4, 'Mongolia', true),
  T('Sunday School', 4, 'Australia', true),
  T('Vertical', 4, 'Australia', true),
  T('True Rippers', 4, 'India', true),
  T('Revenant', 4, 'India', true),
  T('Marcos Gaming', 4, 'India', true),
  T('Wicked', 4, 'India', true),
  T('Enigma Gaming', 4, 'India', true),
  T('Team Vladivostok', 4, 'Russia', true),
  // País a confirmar com a coleta do usuário.
  T('KOI', 2, null, false),
  T('Stake', 3, null, false),
  T('Space', 3, null, false),
  T('Enterprise', 3, null, false),
  T('Verdant', 3, null, false),
  T('GR Gaming', 3, null, false)
];

// Gerador de nicks do guia: raiz competitiva + leetspeak leve, prefixo ou sufixo.
const PREFIXES = ['x_', 'v1_', 'z_', 'k3_', 'neo_', 'f3_', 'sl_'];
const ROOT_WORDS = [
  'Viper', 'Phantom', 'Shadow', 'Blitz', 'Pulse', 'Rogue', 'Nova', 'Frost', 'Kage', 'Spectre', 'Zenith', 'Blaze', 'Titan', 'Vortex', 'Slayer',
  'Strike', 'Havoc', 'Fury', 'Cipher', 'Matrix', 'Reaper', 'Clutch', 'AimeR',
  // Ampliação: o guia gera centenas de jogadores; com 24 raízes os nicks se repetem demais.
  'Lynx', 'Raven', 'Onyx', 'Hex', 'Rift', 'Echo', 'Jinx', 'Sage', 'Ghost', 'Bolt', 'Nyx', 'Orbit', 'Krypt', 'Wolf', 'Mako', 'Tempo',
  'Flick', 'Snipe', 'Rush', 'Duke', 'Vex', 'Kilo', 'Juno', 'Rook', 'Taz', 'Ozzy', 'Drako', 'Kairo', 'Nitro', 'Pyro', 'Zorro', 'Brisa',
  'Tatu', 'Garra', 'Lobo', 'Fumaca', 'Trovao', 'Corvo', 'Puma', 'Gelo', 'Kenji', 'Takeo', 'Batu', 'Temuj', 'Arslan', 'Vova', 'Sasha', 'Mirko'
];
const SUFFIXES = ['_god', 'z3ro', 'jr', '77', '99', 'x', '_CS', '01', '7'];
const LEET: Record<string, string> = { e: '3', a: '4', o: '0', i: '1', s: 'z' };
/** As 5 funções do jogo na ordem do gerador (AWPer, IGL, entry, suporte, lurker). */
const ROLES = ['awp', 'igl', 'entry', 'support', 'lurker'];

/** RNG pequeno e determinístico (mulberry32 sobre o hash do texto): o mesmo time sempre gera o mesmo elenco. */
function rngOf(text: string): () => number {
  let hash = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(list: T[], rng: () => number) => list[Math.floor(rng() * list.length)];
const leet = (text: string, rng: () => number) => [...text].map((char) => (rng() < 0.35 && LEET[char.toLowerCase()] ? LEET[char.toLowerCase()] : char)).join('');

function generateNick(rng: () => number): string {
  const style = pick(['simple', 'leet', 'prefixed', 'suffixed', 'combo'], rng);
  const base = pick(ROOT_WORDS, rng);
  if (style === 'simple') return base;
  if (style === 'leet') return leet(base, rng);
  if (style === 'prefixed') return `${pick(PREFIXES, rng)}${base.toLowerCase()}`;
  if (style === 'suffixed') return `${base}${pick(SUFFIXES, rng)}`;
  return `${leet(base, rng)}${pick(SUFFIXES, rng)}`;
}

/** Nicks já usados (os da coleta e os gerados): ninguém aparece em dois elencos, nem vira xará de um pro real. */
const usedNicks = new Set<string>();
export function reserveNicks(nicks: string[]) {
  for (const nick of nicks) usedNicks.add(nick.toLowerCase());
}

/** Completa o elenco até 5 (nicks reais primeiro), com funções embaralhadas pela seed do time. */
export function generatedRoster(teamName: string, country: string | null, known: string[] = [], current: SceneRosterMember[] = []): SceneRosterMember[] {
  const rng = rngOf(`roster:${teamName}`);
  const roles = [...ROLES];
  for (let index = roles.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [roles[index], roles[swap]] = [roles[swap], roles[index]];
  }
  const members: SceneRosterMember[] = [...current];
  for (const nick of known) {
    if (members.length >= 5) break;
    usedNicks.add(nick.toLowerCase());
    members.push({ nick, country, birthDate: null, roles: [roles[members.length]], catalogBaseId: null, prospect: null });
  }
  for (let guard = 0; members.length < 5 && guard < 200; guard += 1) {
    const nick = generateNick(rng);
    if (usedNicks.has(nick.toLowerCase())) continue;
    usedNicks.add(nick.toLowerCase());
    members.push({ nick, country, birthDate: null, roles: [roles[members.length]], catalogBaseId: null, prospect: null });
  }
  return members;
}

const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Os times do guia no formato da cena (fonte marcada; sem torneios coletados). */
export function extraSceneOrgs(): SceneOrg[] {
  return EXTRA_TEAMS.map((team) => ({
    id: `${slug(team.name)}-2026`,
    name: team.name,
    level: team.level,
    country: team.country,
    calendarDensity: team.level === 2 ? 9 : 10,
    tournaments: [],
    roster: generatedRoster(team.name, team.national ? team.country : null, team.nicks),
    sources: [{ tournament: 'Guia de campeonatos CS2 por tier e região (base de estudo, 2026)' }]
  }));
}

/** País de um time coletado sem elenco, pelo circuito em que ele jogou (CCT South America, Oceania). */
export function countryFromTournaments(org: SceneOrg): string | null {
  const names = org.tournaments.map((tournament) => tournament.name).join(' ');
  if (/South America/i.test(names)) return 'Brazil';
  if (/Oceania/i.test(names)) return 'Australia';
  return null;
}
