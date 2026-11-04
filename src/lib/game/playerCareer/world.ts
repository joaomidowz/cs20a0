// src/lib/game/playerCareer/world.ts
// O mundo gira: a cada temporada da sua carreira os OUTROS times também trocam jogadores. Trocas entre times de
// níveis vizinhos, na mesma função (o mais forte tende a subir), sorteadas pela seed da carreira e acumuladas
// temporada a temporada. Elencos, adversários, a vaga que você toma e as ofertas leem o elenco da temporada.
import { createSeededRng } from '../simulation';
import { memberCatalogOverall, memberNick, memberRoles, sceneOrgById, sceneOrgs, type SceneOrg, type SceneRosterMember } from './data';

export interface SceneTransfer {
  season: number;
  nick: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  /** Quem fez o caminho contrário na troca. */
  swappedNick: string;
}

interface WorldSeason {
  rosters: Map<string, SceneRosterMember[]>;
  transfers: SceneTransfer[];
}

/** Trocas por temporada no mundo todo (cerca de 1 a cada 10 times). */
export const TRANSFERS_PER_SEASON = 18;

const cache = new Map<string, WorldSeason>();

const strength = (member: SceneRosterMember, org: SceneOrg) => memberCatalogOverall(member) ?? org.power ?? 70;

/** O mundo na temporada N da carreira (a 1 é a cena coletada, sem trocas). */
export function sceneWorld(seed: string, season: number): WorldSeason {
  const key = `${seed}:${season}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (season <= 1) {
    const base = { rosters: new Map(sceneOrgs.map((org) => [org.id, org.roster])), transfers: [] };
    cache.set(key, base);
    return base;
  }
  const previous = sceneWorld(seed, season - 1);
  const rosters = new Map([...previous.rosters].map(([id, roster]) => [id, [...roster]]));
  const rng = createSeededRng(`${seed}:world:${season}`);
  const transfers: SceneTransfer[] = [];
  const moved = new Set<string>();
  for (let attempt = 0; attempt < TRANSFERS_PER_SEASON * 4 && transfers.length < TRANSFERS_PER_SEASON; attempt += 1) {
    const from = sceneOrgs[Math.floor(rng() * sceneOrgs.length)];
    const fromRoster = rosters.get(from.id) ?? [];
    const player = fromRoster[Math.floor(rng() * fromRoster.length)];
    if (!player || moved.has(player.nick)) continue;
    const role = memberRoles(player)[0] ?? null;
    const targets = sceneOrgs.filter((org) => org.id !== from.id && Math.abs(org.level - from.level) <= 1);
    const to = targets[Math.floor(rng() * targets.length)];
    if (!to) continue;
    const toRoster = rosters.get(to.id) ?? [];
    const partner = toRoster.find((member) => !moved.has(member.nick) && (role ? memberRoles(member)[0] === role : !memberRoles(member).length));
    if (!partner) continue;
    // A coleta já lista alguns jogadores em dois elencos (trocas de 2026): nunca cria duplicata nova.
    if (toRoster.some((member) => member.nick === player.nick) || fromRoster.some((member) => member.nick === partner.nick)) continue;
    // Subir de nível exige ser o melhor dos dois; senão a troca não sai.
    if (to.level < from.level && strength(player, from) < strength(partner, to)) continue;
    if (from.level < to.level && strength(partner, to) < strength(player, from)) continue;
    rosters.set(from.id, fromRoster.map((member) => (member === player ? partner : member)));
    rosters.set(to.id, toRoster.map((member) => (member === partner ? player : member)));
    moved.add(player.nick);
    moved.add(partner.nick);
    transfers.push({ season, nick: memberNick(player), fromId: from.id, fromName: from.name, toId: to.id, toName: to.name, swappedNick: memberNick(partner) });
  }
  const world = { rosters, transfers };
  cache.set(key, world);
  return world;
}

/** O elenco do time na temporada N da carreira. */
export function rosterIn(seed: string, season: number, orgId: string): SceneRosterMember[] {
  return sceneWorld(seed, season).rosters.get(sceneOrgById.get(orgId)?.id ?? orgId) ?? sceneOrgById.get(orgId)?.roster ?? [];
}

/** O time como ele está na temporada N (mesmo time, elenco atualizado pelas trocas). */
export function orgIn(seed: string, season: number, orgId: string): SceneOrg | undefined {
  const org = sceneOrgById.get(orgId);
  return org ? { ...org, roster: rosterIn(seed, season, org.id) } : undefined;
}

/** As trocas mais chamativas da temporada: times de tier mais alto primeiro. */
export function headlineTransfers(seed: string, season: number, limit = 6): SceneTransfer[] {
  const levelOf = (id: string) => sceneOrgById.get(id)?.level ?? 9;
  return [...sceneWorld(seed, season).transfers]
    .sort((a, b) => Math.min(levelOf(a.fromId), levelOf(a.toId)) - Math.min(levelOf(b.fromId), levelOf(b.toId)))
    .slice(0, limit);
}
