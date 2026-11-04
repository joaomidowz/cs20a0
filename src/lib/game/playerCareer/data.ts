// src/lib/game/playerCareer/data.ts
// Cena real 2026 + calibração real de aging, exportadas pelo Studio (export-career-player-data.mjs). O catálogo é
// read-only; a carreira do jogador vive no save. Países e elencos vêm da coleta Liquipedia (CC-BY-SA 3.0); o que
// não foi coletado é null — nunca estimado.
import rawScene from '$lib/data/cs/career-scene.game.json';
import rawCalibration from '$lib/data/cs/career-calibration.game.json';
import rawPlayers from '$lib/data/cs/players.game.json';
import rawTeams from '$lib/data/cs/teams.game.json';
import type { AgingCalibration } from '../career/aging';
import type { PlayerRole } from './engine';
import { regionOf, type Region } from './calendar';
import rawResolutions from '$lib/data/cs/career-roster-resolutions.game.json';
import rawFills from '$lib/data/cs/career-slot-fills.game.json';
import { countryFromTournaments, extraSceneOrgs, generatedRoster, isProspectNick, orgNationOf, reserveLookalikes, reserveNicks, setStayRule, sheetRosterFor } from './extraTeams';

export interface SceneTournamentRef { name: string; tier: string; placement: string | null }
export interface SceneRosterMember {
  nick: string;
  country: string | null;
  birthDate: string | null;
  roles: string[];
  catalogBaseId: string | null;
  prospect: boolean | null;
  /** Overall da temporada no mundo da carreira (evolui com a idade; ausente na cena coletada = catálogo). */
  overall?: number;
  /** Identidade curada de promessa (link HLTV), quando o jogador veio da base real. */
  hltv?: string;
  /** Vaga sem jogador real conhecido: nick gerado (placeholder). */
  generated?: boolean;
}
export interface SceneOrg {
  id: string;
  name: string;
  level: number; // 1 = Major · 2 = EPL/IEM/EWC · 3 = Contenders/Bounty/Thunderpick · 4 = CCT/GC
  country: string | null;
  calendarDensity: number;
  tournaments: SceneTournamentRef[];
  roster: SceneRosterMember[];
  sources: Array<{ tournament?: string; url?: string }>;
  /** Posição no ranking real (HLTV 2025/2026 do catálogo), quando o time aparece nele. */
  worldRank?: number | null;
  /** Força base do time no motor (média do quinteto antes dos jogadores reais do catálogo). */
  power?: number;
  /** Região do circuito (pelo país; sem país, pelo circuito que o time jogou). */
  region?: Region;
}
interface SceneFile {
  referenceYear: number;
  summary: { orgs: number; rosterMembers: number; rosterMembersWithBirthDate: number; coveragePct: number };
  orgs: SceneOrg[];
}

export const scene = rawScene as unknown as SceneFile;

/** Faixa de força base por nível da pirâmide (mecânica derivada; o elenco do catálogo ajusta quando existe). */
export const ORG_BASE_POWER: Record<number, number> = { 0: 91, 1: 87, 2: 82, 3: 74, 4: 66, 5: 58 };


/** "Team Vitality" e "Vitality" são o mesmo time: o nome sem "team" e sem pontuação é a chave. */
const teamKey = (name: string) => name.toLowerCase().replace(/^team\s+/, '').replace(/\s+(team|gaming|esports?|club)$/, '').replace(/[^a-z0-9]/g, '');

/** Jogador repetido (trocou de time no meio de 2026): fica só no time que o usuário escolheu. */
const STAY_AT = new Map(Object.entries((rawResolutions as { stayAt: Record<string, string> }).stayAt).map(([nick, team]) => [nick.toLowerCase(), teamKey(team)]));
const staysIn = (nick: string, teamName: string): boolean | undefined => {
  const key = STAY_AT.get(nick.toLowerCase());
  return key === undefined ? undefined : key === teamKey(teamName);
};

/** Função escrita de qualquer jeito ("rifle", "AWPer", "lurk", "Suporte") para uma chave só. */
const roleId = (raw: string | undefined) => {
  const value = (raw ?? '').toLowerCase();
  if (value.startsWith('awp')) return 'awper';
  if (value.startsWith('igl') || value.includes('leader')) return 'igl';
  if (value.startsWith('entry')) return 'entry';
  if (value.startsWith('sup')) return 'support';
  if (value.startsWith('lurk')) return 'lurker';
  return 'rifler';
};

interface SlotFill { team: string; slotRole: string; nick: string; country: string | null; birthYear: number | null; /** Função nova, quando o usuário indicou outra. */ role?: string }
const FILLS = (rawFills as unknown as { fills: SlotFill[] }).fills;

/** Troca nomes gerados pelas sugestões do usuário, só quando o jogador está livre (não joga em outro time, não foi
 *  resolvido para outro time e não é uma promessa curada). A vaga certa é a da mesma função. */
function applyFills(orgs: Map<string, SceneOrg>) {
  const taken = new Set<string>();
  for (const org of orgs.values()) for (const member of org.roster) if (!member.generated) taken.add(member.nick.toLowerCase());
  for (const fill of FILLS) {
    const nick = fill.nick.toLowerCase();
    const org = orgs.get(teamKey(fill.team));
    if (!org || taken.has(nick) || isProspectNick(fill.nick) || staysIn(fill.nick, fill.team) === false) continue;
    const slots = org.roster.filter((member) => member.generated);
    const slot = slots.find((member) => roleId(member.roles[0]) === roleId(fill.slotRole)) ?? slots[0];
    if (!slot) continue;
    taken.add(nick);
    const member: SceneRosterMember = { nick: fill.nick, country: fill.country, birthDate: fill.birthYear ? `${fill.birthYear}-07-01` : null, roles: fill.role ? [roleId(fill.role)] : slot.roles, catalogBaseId: null, prospect: null };
    orgs.set(teamKey(fill.team), { ...org, roster: org.roster.map((other) => (other === slot ? member : other)) });
  }
}

/** Tira de cada time quem fica em outro e completa a vaga com a mesma função (nome gerado). Time que perde 4 ou
 *  5 é cópia de outro na coleta (Luminosity com a lineup do Monte): some, e o id aponta para onde o elenco foi. */
function applyStayRules(org: SceneOrg): SceneOrg | { duplicateOf: string; id: string } {
  const kept = org.roster.filter((member) => staysIn(member.nick, org.name) !== false);
  if (kept.length === org.roster.length) return org;
  const gone = org.roster.filter((member) => !kept.includes(member));
  if (org.roster.length >= 4 && gone.length >= 4) {
    const targets = new Map<string, number>();
    for (const member of gone) {
      const target = STAY_AT.get(member.nick.toLowerCase());
      if (target) targets.set(target, (targets.get(target) ?? 0) + 1);
    }
    return { id: org.id, duplicateOf: [...targets].sort((a, b) => b[1] - a[1])[0][0] };
  }
  return { ...org, roster: generatedRoster(org.name, orgNationOf(kept), [], kept, gone.map((member) => member.roles[0] ?? 'rifler')) };
}

/** Ranking real do catálogo do jogo: o melhor entre HLTV 2025 e 2026 (sourceRank). */
const WORLD_RANK: Map<string, number> = (() => {
  const ranks = new Map<string, number>();
  for (const team of rawTeams as Array<{ name?: string; year?: number; sourceRank?: number | null }>) {
    if (!team.name || !team.sourceRank || (team.year !== 2025 && team.year !== 2026)) continue;
    const key = teamKey(team.name);
    ranks.set(key, Math.min(ranks.get(key) ?? 999, team.sourceRank));
  }
  return ranks;
})();

/** Tier S: os 8 melhores do ranking real; tier 1: do 9º ao 16º (finalistas e semifinalistas de Major, top da HLTV). */
export const TIER_S_RANK = 8;
export const ELITE_RANK = 16;

/**
 * A cena coletada marca como nível 1 todo mundo que jogou o Major (36 times, de Vitality a Rare Atom) e tem
 * times duplicados ("Team Vitality" no 2, "Vitality" no 1). Aqui: um time por nome (fica o de nível mais alto),
 * nível 1 só para o top 16 do ranking real, o resto do Major desce para o 2, e a força segue o ranking.
 */
/** Região de um time: pelo país; sem país, pelo circuito dos campeonatos coletados (CCT South America…). */
function regionOfOrg(org: SceneOrg): Region {
  if (org.country) return regionOf(org.country);
  const names = org.tournaments.map((tournament) => tournament.name).join(' ');
  if (/South America/i.test(names)) return 'sa';
  if (/North America/i.test(names)) return 'na';
  if (/Oceania/i.test(names)) return 'oce';
  if (/Asia/i.test(names)) return 'asia';
  return 'eu';
}

/** Quanto o time já jogou de alto nível na coleta: o melhor tier de campeonato (S > A > B > C) e quantos jogou. */
const TOURNAMENT_TIER_SCORE: Record<string, number> = { S: 40, A: 30, B: 20, C: 10 };
const sceneScore = (org: SceneOrg) =>
  Math.max(0, ...org.tournaments.map((tournament) => TOURNAMENT_TIER_SCORE[tournament.tier] ?? 5)) + org.tournaments.length;

/**
 * Pirâmide por região: a coleta tem 71 times de CCT/GC na América do Sul para 8 no Challenger, e a Oceania tem 2
 * Challengers. Cada região ganha um mínimo de Tier 2 e Challenger, subindo os times da região que jogaram mais
 * alto (academias não sobem). A Europa já tem pirâmide cheia e não mexe.
 */
const REGION_FLOOR: Record<Region, { 2: number; 3: number }> = { sa: { 2: 8, 3: 16 }, na: { 2: 6, 3: 10 }, asia: { 2: 6, 3: 12 }, oce: { 2: 3, 3: 6 }, eu: { 2: 0, 3: 0 } };
function rebalanceTiers(orgs: SceneOrg[]): SceneOrg[] {
  const levels = new Map(orgs.map((org) => [org.id, org.level]));
  for (const region of Object.keys(REGION_FLOOR) as Region[]) {
    for (const level of [2, 3] as const) {
      const here = orgs.filter((org) => org.region === region && levels.get(org.id) === level).length;
      const candidates = orgs
        .filter((org) => org.region === region && levels.get(org.id) === level + 1 && !/academy|junior|talent|nxt/i.test(org.name))
        .sort((a, b) => sceneScore(b) - sceneScore(a) || a.name.localeCompare(b.name));
      for (const org of candidates.slice(0, Math.max(0, REGION_FLOOR[region][level] - here))) levels.set(org.id, level);
    }
  }
  return orgs.map((org) => {
    const level = levels.get(org.id)!;
    return level === org.level ? org : { ...org, level, power: ORG_BASE_POWER[level] };
  });
}

const normalized = (() => {
  const byKey = new Map<string, SceneOrg>();
  const alias = new Map<string, string>();
  // Times coletados sem elenco: a planilha do usuário, ou jogadores gerados (país pelo circuito que jogaram).
  reserveNicks(scene.orgs.flatMap((org) => org.roster.map((member) => member.nick)));
  // O gerador não cria sósia de ninguém real: cena, catálogo inteiro (lendas incluídas), sugestões e promessas.
  reserveLookalikes([
    ...scene.orgs.flatMap((org) => org.roster.map((member) => member.nick)),
    ...(rawPlayers as Array<{ nickname?: string }>).flatMap((player) => (player.nickname ? [player.nickname] : [])),
    ...FILLS.map((fill) => fill.nick)
  ]);
  setStayRule(staysIn);
  const collected = scene.orgs.map((org): SceneOrg => {
    if (org.roster.length >= 5) return org;
    const country = org.country ?? countryFromTournaments(org);
    return { ...org, country, roster: sheetRosterFor(org.name) ?? generatedRoster(org.name, country, [], org.roster) };
  });
  // Os times do guia de campeonatos que a coleta não trouxe, com a planilha de elencos do usuário.
  const collectedKeys = new Set(collected.map((org) => teamKey(org.name)));
  const extras = extraSceneOrgs((name) => collectedKeys.has(teamKey(name)));
  const duplicates: Array<{ id: string; duplicateOf: string }> = [];
  for (const resolved of [...collected, ...extras].map(applyStayRules)) {
    if ('duplicateOf' in resolved) { duplicates.push(resolved); continue; }
    const org = resolved;
    const key = teamKey(org.name);
    const kept = byKey.get(key);
    if (!kept) { byKey.set(key, org); continue; }
    const [winner, loser] = org.level < kept.level ? [org, kept] : [kept, org];
    byKey.set(key, winner);
    alias.set(loser.id, winner.id);
  }
  for (const duplicate of duplicates) {
    const target = byKey.get(duplicate.duplicateOf);
    if (target) alias.set(duplicate.id, target.id);
  }
  applyFills(byKey);
  const orgs = [...byKey.values()].map((org): SceneOrg => {
    const rank = WORLD_RANK.get(teamKey(org.name)) ?? null;
    const elite = rank !== null && rank <= ELITE_RANK;
    const level = elite ? (rank! <= TIER_S_RANK ? 0 : 1) : org.level === 1 ? 2 : org.level;
    const power = elite ? 92.5 - rank! * 0.5 : level === 2 && rank !== null ? Math.max(78, 84 - (rank - ELITE_RANK) * 0.4) : ORG_BASE_POWER[level];
    return { ...org, level, worldRank: rank, power: Math.round(power * 10) / 10, region: regionOfOrg(org) };
  });
  return { orgs: rebalanceTiers(orgs), alias };
})();

export const sceneOrgs = normalized.orgs;
const orgsById = new Map(sceneOrgs.map((org) => [org.id, org]));
/** Busca por id; ids de times duplicados (saves antigos) caem no time que ficou. */
export const sceneOrgById = {
  get: (id: string): SceneOrg | undefined => orgsById.get(id) ?? orgsById.get(normalized.alias.get(id) ?? ''),
  has: (id: string): boolean => orgsById.has(id) || normalized.alias.has(id)
};
export const calibration = rawCalibration as unknown as AgingCalibration;

export const orgsByLevel = (level: number): SceneOrg[] => sceneOrgs.filter((org) => org.level === level);
export const sceneCountries = [...new Set(sceneOrgs.map((org) => org.country).filter((country): country is string => Boolean(country)))].sort();


/** Como a função do jogo casa com as funções escritas na Liquipedia (infobox roles). */
export const ROLE_ALIASES: Record<PlayerRole, string[]> = {
  awper: ['awp', 'awper', 'sniper'],
  rifler: ['rifler', 'rifle'],
  entry: ['entry', 'entry fragger', 'aggressive'],
  igl: ['igl', 'in-game leader', 'captain'],
  lurker: ['lurk', 'lurker'],
  support: ['support', 'suporte']
};

const ROLES = Object.keys(ROLE_ALIASES) as PlayerRole[];

/** Overall do jogador no catálogo (o ano mais recente), para pôr a força real dele em quadra. */
const CATALOG_OVERALL: Map<string, number> = (() => {
  const latest = new Map<string, { year: number; overall: number }>();
  for (const player of rawPlayers as Array<{ baseId?: string; overall?: number; year?: number }>) {
    const baseId = player.baseId?.toLowerCase();
    if (!baseId || typeof player.overall !== 'number') continue;
    const year = player.year ?? 0;
    const current = latest.get(baseId);
    if (!current || year >= current.year) latest.set(baseId, { year, overall: player.overall });
  }
  return new Map([...latest].map(([baseId, entry]) => [baseId, entry.overall]));
})();

/** Primeiro ano do jogador no catálogo (estreia no topo), por baseId. */
const CATALOG_FIRST_YEAR: Map<string, number> = (() => {
  const first = new Map<string, number>();
  for (const player of rawPlayers as Array<{ baseId?: string; year?: number }>) {
    const baseId = player.baseId?.toLowerCase();
    if (!baseId || !player.year) continue;
    first.set(baseId, Math.min(first.get(baseId) ?? 9999, player.year));
  }
  return first;
})();

/** Mediana real de idade de estreia no topo (calibração da carreira). */
const ENTRY_AGE = 22;

/**
 * Ano de nascimento: o da coleta (Liquipedia) ou, sem ele, uma ESTIMATIVA pela estreia no catálogo (estreia
 * aos 22, a mediana real). FalleN estreia em 2013 no catálogo, o que dá 1991, o ano real. Sem nenhum dos dois, null.
 */
export function memberBirthYear(member: SceneRosterMember): number | null {
  if (member.birthDate) return Number(member.birthDate.slice(0, 4));
  const first = member.catalogBaseId ? CATALOG_FIRST_YEAR.get(member.catalogBaseId.toLowerCase()) : undefined;
  return first ? first - ENTRY_AGE : null;
}

/** País do time: o de 3+ jogadores do elenco (time nacional, ex. MongolZ, TYLOO); misto = null (internacional). */
export function orgNation(roster: SceneRosterMember[]): string | null {
  const counts = new Map<string, number>();
  for (const member of roster) if (member.country) counts.set(member.country, (counts.get(member.country) ?? 0) + 1);
  const [country, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return country && count >= 3 ? country : null;
}

/** Faz sentido o jogador desse país ir para esse time? Time nacional só leva do próprio país; misto aceita todos. */
export function nationFits(roster: SceneRosterMember[], country: string | null | undefined): boolean {
  const nation = orgNation(roster);
  return !nation || !country || nation === country;
}

export function memberCatalogOverall(member: SceneRosterMember): number | null {
  return member.catalogBaseId ? CATALOG_OVERALL.get(member.catalogBaseId.toLowerCase()) ?? null : null;
}

/** Grafia do nick no catálogo do jogo (ZywOo, apEX), por baseId. */
const CATALOG_NICK: Map<string, string> = new Map(
  (rawPlayers as Array<{ baseId?: string; nickname?: string }>).filter((player) => player.baseId && player.nickname).map((player) => [player.baseId!.toLowerCase(), player.nickname!])
);

/** O nick como o jogo escreve: a coleta às vezes vem em minúsculas ("zywoo"); o catálogo corrige a grafia. */
export function memberNick(member: SceneRosterMember): string {
  const catalog = member.catalogBaseId ? CATALOG_NICK.get(member.catalogBaseId.toLowerCase()) : undefined;
  return catalog && catalog.toLowerCase() === member.nick.toLowerCase() ? catalog : member.nick;
}

/** Função do jogador no catálogo do jogo (o ano mais recente), para quem a coleta da cena trouxe sem função. */
const CATALOG_ROLE: Map<string, PlayerRole> = (() => {
  const latest = new Map<string, { year: number; role: PlayerRole }>();
  for (const player of rawPlayers as Array<{ baseId?: string; role?: string; year?: number }>) {
    const baseId = player.baseId?.toLowerCase();
    const role = player.role?.split('-')[0] as PlayerRole | undefined;
    if (!baseId || !role || !ROLES.includes(role)) continue;
    const year = player.year ?? 0;
    const current = latest.get(baseId);
    if (!current || year >= current.year) latest.set(baseId, { year, role });
  }
  return new Map([...latest].map(([baseId, entry]) => [baseId, entry.role]));
})();

/** As funções conhecidas de um jogador da cena: as da coleta (na ordem) ou, sem nenhuma, a do catálogo. */
export function memberRoles(member: SceneRosterMember): PlayerRole[] {
  const fromScene = member.roles
    .map((listed) => ROLES.find((role) => ROLE_ALIASES[role].includes(listed.toLowerCase().trim())))
    .filter((role): role is PlayerRole => Boolean(role));
  if (fromScene.length) return [...new Set(fromScene)];
  const fromCatalog = member.catalogBaseId ? CATALOG_ROLE.get(member.catalogBaseId.toLowerCase()) : undefined;
  return fromCatalog ? [fromCatalog] : [];
}

/** O elenco nas posições do motor (IGL, AWPer, Entry, Lurker, Suporte) pela função real de cada um; quem não
 *  tem função conhecida completa as posições que sobrarem, na ordem do elenco. */
export function rosterBySlot(org: SceneOrg, slots: readonly PlayerRole[]): Array<SceneRosterMember | undefined> {
  const placed: Array<SceneRosterMember | undefined> = slots.map(() => undefined);
  const used = new Set<SceneRosterMember>();
  const place = (match: (member: SceneRosterMember, slot: PlayerRole) => boolean) => {
    slots.forEach((slot, index) => {
      if (placed[index]) return;
      const member = org.roster.find((candidate) => !used.has(candidate) && match(candidate, slot));
      if (member) { placed[index] = member; used.add(member); }
    });
  };
  place((member, slot) => memberRoles(member)[0] === slot); // função principal
  place((member, slot) => memberRoles(member).includes(slot)); // função secundária
  place(() => true); // o resto, na ordem do elenco
  return placed;
}
