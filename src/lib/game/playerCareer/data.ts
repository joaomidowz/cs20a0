// src/lib/game/playerCareer/data.ts
// Cena real 2026 + calibração real de aging, exportadas pelo Studio (export-career-player-data.mjs). O catálogo é
// read-only; a carreira do jogador vive no save. Países e elencos vêm da coleta Liquipedia (CC-BY-SA 3.0); o que
// não foi coletado é null — nunca estimado.
import rawScene from '$lib/data/cs/career-scene.game.json';
import rawCalibration from '$lib/data/cs/career-calibration.game.json';
import rawPlayers from '$lib/data/cs/players.game.json';
import type { AgingCalibration } from '../career/aging';
import type { PlayerRole } from './engine';

export interface SceneTournamentRef { name: string; tier: string; placement: string | null }
export interface SceneRosterMember {
  nick: string;
  country: string | null;
  birthDate: string | null;
  roles: string[];
  catalogBaseId: string | null;
  prospect: boolean | null;
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
}
interface SceneFile {
  referenceYear: number;
  summary: { orgs: number; rosterMembers: number; rosterMembersWithBirthDate: number; coveragePct: number };
  orgs: SceneOrg[];
}

export const scene = rawScene as unknown as SceneFile;
export const sceneOrgs = scene.orgs;
export const sceneOrgById = new Map(sceneOrgs.map((org) => [org.id, org]));
export const calibration = rawCalibration as unknown as AgingCalibration;

export const orgsByLevel = (level: number): SceneOrg[] => sceneOrgs.filter((org) => org.level === level);
export const sceneCountries = [...new Set(sceneOrgs.map((org) => org.country).filter((country): country is string => Boolean(country)))].sort();

/** Faixa de força base por nível da pirâmide (mecânica derivada; o elenco do catálogo ajusta quando existe). */
export const ORG_BASE_POWER: Record<number, number> = { 1: 88, 2: 82, 3: 74, 4: 66, 5: 58 };

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
