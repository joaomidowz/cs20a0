// src/lib/game/playerCareer/extraTeams.ts
// Times do guia de campeonatos por tier e região que a coleta da cena não trouxe, com os elencos que o usuário
// pesquisou (career-extra-rosters.game.json: nick, função, país, nascimento), e elencos para quem veio sem
// jogador. A coleta vence conflito (ninguém joga em dois times); a vaga que sobrar usa o gerador. Nicks reais quando o guia lista a lineup; o resto é gerado
import rawProspects from '$lib/data/cs/career-prospects.game.json';
import rawSheet from '$lib/data/cs/career-extra-rosters.game.json';
import type { SceneOrg, SceneRosterMember } from './data';

interface SheetMember { nick: string; role: string; country: string | null; birthYear: number | null }
interface SheetTeam { name: string; level: 2 | 3 | 4; region: string; country: string | null; roster: SheetMember[] }
const SHEET = (rawSheet as unknown as { teams: SheetTeam[] }).teams;

/** "Internacional" na planilha é elenco misto: país null. */
const countryOf = (value: string | null) => (!value || value === 'Internacional' ? null : value);

/** Jogador da planilha que a coleta já põe em outro time (ou repetido na planilha): a coleta vence. */
export interface SheetConflict { team: string; nick: string }
export const sheetConflicts: SheetConflict[] = [];

/** Onde cada jogador repetido fica (resolução do usuário): true = fica neste time, false = sai, undefined = sem regra. */
type StayRule = (nick: string, teamName: string) => boolean | undefined;
let stayRule: StayRule = () => undefined;
export function setStayRule(rule: StayRule) {
  stayRule = rule;
}

/** O elenco da planilha (nicks reais, função, país e nascimento); quem fica em outro time abre vaga com nome gerado. */
function sheetRoster(team: SheetTeam): SceneRosterMember[] {
  return sheetRosterOrNull(team) ?? generatedRoster(team.name, null);
}

/** null quando 4+ da lineup jogam em outro time: o time da planilha era cópia de outro (Detonate com o Boss). */
function sheetRosterOrNull(team: SheetTeam): SceneRosterMember[] | null {
  const members: SceneRosterMember[] = [];
  for (const entry of team.roster) {
    const rule = entry.nick ? stayRule(entry.nick, team.name) : false;
    // Sem regra, a coleta vence; com regra, vale a escolha do usuário (a cópia do outro time sai depois).
    if (!entry.nick || rule === false || (rule !== true && usedNicks.has(entry.nick.toLowerCase()))) {
      if (entry.nick) sheetConflicts.push({ team: team.name, nick: entry.nick });
      continue;
    }
    usedNicks.add(entry.nick.toLowerCase());
    reserveLookalikes([entry.nick]);
    members.push({ nick: entry.nick, country: countryOf(entry.country), birthDate: entry.birthYear ? `${entry.birthYear}-07-01` : null, roles: [entry.role], catalogBaseId: null, prospect: null });
  }
  if (team.roster.length - members.length >= 4) return null;
  const national = orgNationOf(members);
  const missing = team.roster.map((entry) => entry.role).filter((role, index) => !members.some((member) => member.nick === team.roster[index].nick));
  return members.length >= 5 ? members.slice(0, 5) : generatedRoster(team.name, national, [], members, missing);
}

/** País do elenco quando 3+ são do mesmo país (mesma regra de time nacional da cena). */
export function orgNationOf(members: SceneRosterMember[]): string | null {
  const counts = new Map<string, number>();
  for (const member of members) if (member.country) counts.set(member.country, (counts.get(member.country) ?? 0) + 1);
  const [country, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return count >= 3 ? country : null;
}

const sheetKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const SHEET_BY_KEY = new Map(SHEET.map((team) => [sheetKey(team.name), team]));

/** Elenco da planilha para um time coletado sem jogadores (Peladona, Rooster…), quando ela traz. */
export function sheetRosterFor(name: string): SceneRosterMember[] | null {
  const team = SHEET_BY_KEY.get(sheetKey(name));
  return team ? sheetRoster(team) : null;
}

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

/** A "cara" de um nick, para não gerar sósia de jogador real: sem prefixo/sufixo do gerador, sem leetspeak, só
 *  letras ("k3_sasha" e "sasha", "Nitr0" e "nitr0", "Taz" e "TaZ" têm a mesma cara). */
const DELEET: Record<string, string> = { '3': 'e', '4': 'a', '0': 'o', '1': 'i', '5': 's', z: 's' };
const SUFFIXES_BY_LENGTH = [...SUFFIXES].sort((a, b) => b.length - a.length);
export function faceOf(nick: string, generated = false): string {
  let value = nick.toLowerCase();
  if (generated) {
    const prefix = PREFIXES.find((candidate) => value.startsWith(candidate));
    if (prefix) value = value.slice(prefix.length);
    const suffix = SUFFIXES_BY_LENGTH.find((candidate) => value.endsWith(candidate.toLowerCase()) && value.length > candidate.length + 1);
    if (suffix) value = value.slice(0, -suffix.length);
  }
  return [...value].map((char) => DELEET[char] ?? char).join('').replace(/[^a-z]/g, '');
}

/** Caras de todo jogador real conhecido (cena, catálogo, planilhas, promessas): o gerador não repete nenhuma. */
const realFaces = new Set<string>();
export function reserveLookalikes(nicks: string[]) {
  for (const nick of nicks) {
    const face = faceOf(nick);
    if (face.length >= 2) realFaces.add(face);
  }
}
const looksReal = (nick: string) => realFaces.has(faceOf(nick, true)) || realFaces.has(faceOf(nick));

function generateNick(rng: () => number): string {
  const style = pick(['simple', 'leet', 'prefixed', 'suffixed', 'combo'], rng);
  const base = pick(ROOT_WORDS, rng);
  if (style === 'simple') return base;
  if (style === 'leet') return leet(base, rng);
  if (style === 'prefixed') return `${pick(PREFIXES, rng)}${base.toLowerCase()}`;
  if (style === 'suffixed') return `${base}${pick(SUFFIXES, rng)}`;
  return `${leet(base, rng)}${pick(SUFFIXES, rng)}`;
}

/** Nicks já usados (os da coleta, as promessas e os gerados): ninguém aparece em dois elencos, nem vira xará. */
const usedNicks = new Set<string>((rawProspects as unknown as { prospects: Array<{ nick: string }> }).prospects.map((kid) => kid.nick.toLowerCase()));
const PROSPECT_NICKS = new Set((rawProspects as unknown as { prospects: Array<{ nick: string }> }).prospects.map((kid) => kid.nick.toLowerCase()));
export const isProspectNick = (nick: string) => PROSPECT_NICKS.has(nick.toLowerCase());
// Promessas e toda a planilha entram antes de qualquer geração (a ordem dos times não pode criar sósia).
reserveLookalikes([...PROSPECT_NICKS, ...SHEET.flatMap((team) => team.roster.map((entry) => entry.nick))]);

export function reserveNicks(nicks: string[]) {
  for (const nick of nicks) usedNicks.add(nick.toLowerCase());
}

/** Completa o elenco até 5 (nicks reais primeiro), com funções embaralhadas pela seed do time. */
export function generatedRoster(teamName: string, country: string | null, known: string[] = [], current: SceneRosterMember[] = [], missingRoles: string[] = []): SceneRosterMember[] {
  const rng = rngOf(`roster:${teamName}`);
  const shuffled = [...ROLES];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  // Vaga aberta herda a função de quem saiu; o resto segue o sorteio do time.
  const roles = [...current.map((member) => member.roles[0] ?? 'rifler'), ...missingRoles, ...shuffled];
  const members: SceneRosterMember[] = [...current];
  for (const nick of known) {
    if (members.length >= 5) break;
    usedNicks.add(nick.toLowerCase());
    members.push({ nick, country, birthDate: null, roles: [roles[members.length]], catalogBaseId: null, prospect: null });
  }
  for (let guard = 0; members.length < 5 && guard < 400; guard += 1) {
    const nick = generateNick(rng);
    if (usedNicks.has(nick.toLowerCase()) || looksReal(nick)) continue;
    usedNicks.add(nick.toLowerCase());
    members.push({ nick, country, birthDate: null, roles: [roles[members.length]], catalogBaseId: null, prospect: null, generated: true });
  }
  return members;
}

const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Os times da planilha que a coleta não trouxe, no formato da cena (fonte marcada; sem torneios coletados). */
export function extraSceneOrgs(skip: (name: string) => boolean): SceneOrg[] {
  return SHEET.filter((team) => !skip(team.name)).flatMap((team) => {
    const roster = sheetRosterOrNull(team);
    return roster ? [{
      id: `${slug(team.name)}-2026`,
      name: team.name,
      level: team.level,
      country: countryOf(team.country),
      calendarDensity: team.level === 2 ? 9 : 10,
      tournaments: [],
      roster,
      sources: [{ tournament: 'Planilha de elencos do usuário (guia de campeonatos por tier e região, 2026)' }]
    }] : [];
  });
}

/** País de um time coletado sem elenco, pelo circuito em que ele jogou (CCT South America, Oceania). */
export function countryFromTournaments(org: SceneOrg): string | null {
  const names = org.tournaments.map((tournament) => tournament.name).join(' ');
  if (/South America/i.test(names)) return 'Brazil';
  if (/Oceania/i.test(names)) return 'Australia';
  return null;
}
