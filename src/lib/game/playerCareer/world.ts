// src/lib/game/playerCareer/world.ts
// O mundo gira: a cada temporada da sua carreira os OUTROS times também trocam jogadores. Trocas entre times de
// níveis vizinhos, na mesma função (o mais forte tende a subir), sorteadas pela seed da carreira e acumuladas
// temporada a temporada. Elencos, adversários, a vaga que você toma e as ofertas leem o elenco da temporada.
import { createSeededRng } from '../simulation';
import { memberBirthYear, memberCatalogOverall, memberNick, memberRoles, nationFits, orgNation, sceneOrgById, sceneOrgs, type SceneOrg, type SceneRosterMember } from './data';

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

export interface SceneRetirement {
  season: number;
  nick: string;
  orgName: string;
  age: number;
  /** Quem entrou no lugar (subiu de um time de baixo ou da base). */
  replacement: string;
}

interface WorldSeason {
  rosters: Map<string, SceneRosterMember[]>;
  transfers: SceneTransfer[];
  retirements: SceneRetirement[];
}

/** Ano real da temporada N da carreira (a 1 é 2026). */
export const yearOfSeason = (season: number) => 2025 + season;

/** Chance de pendurar na virada da temporada: nada antes dos 33, sobe 12 pontos por ano, certo aos 38. */
export const npcRetireChance = (age: number): number => (age >= 38 ? 1 : age >= 33 ? 0.15 + (age - 33) * 0.12 : 0);

const SYLLABLES = ['ka', 'zo', 'ri', 'vex', 'lu', 'dra', 'ny', 'xo', 'ten', 'mi', 'zer', 'ko', 'sa', 'fy', 'ru', 'ghost', 'nik', 'lo', 'bru', 'tz'];

/** Jovem da base que sobe para fechar o elenco (nick gerado; jogador fictício do mundo da carreira). */
function prospect(rng: () => number, country: string | null, role: string | null, year: number): SceneRosterMember {
  const parts = 2 + Math.floor(rng() * 2);
  const nick = Array.from({ length: parts }, () => SYLLABLES[Math.floor(rng() * SYLLABLES.length)]).join('') + (rng() < 0.3 ? String(Math.floor(rng() * 9) + 1) : '');
  return { nick, country, birthDate: `${year - 18}-06-01`, roles: role ? [role] : [], catalogBaseId: null, prospect: true };
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
    const base = { rosters: new Map(sceneOrgs.map((org) => [org.id, org.roster])), transfers: [], retirements: [] };
    cache.set(key, base);
    return base;
  }
  const previous = sceneWorld(seed, season - 1);
  const rosters = new Map([...previous.rosters].map(([id, roster]) => [id, [...roster]]));
  const rng = createSeededRng(`${seed}:world:${season}`);
  const transfers: SceneTransfer[] = [];
  const retirements: SceneRetirement[] = [];
  const year = yearOfSeason(season);
  // 1) Aposentadorias: veterano sai; entra o melhor da mesma função de um time de baixo (mesmo país, se o time
  //    for nacional), e esse time sobe um jovem da base.
  for (const org of sceneOrgs) {
    const roster = rosters.get(org.id) ?? [];
    for (const member of [...roster]) {
      const born = memberBirthYear(member);
      if (born === null) continue;
      const age = year - born;
      if (rng() >= npcRetireChance(age)) continue;
      const role = memberRoles(member)[0] ?? null;
      const donors = sceneOrgs.filter((candidate) => candidate.level === org.level + 1 || candidate.level === org.level + 2);
      let replacement: SceneRosterMember | null = null;
      for (let tries = 0; tries < 6 && !replacement; tries += 1) {
        const donor = donors[Math.floor(rng() * donors.length)];
        if (!donor) break;
        const donorRoster = rosters.get(donor.id) ?? [];
        const candidate = donorRoster.find((other) => (role ? memberRoles(other)[0] === role : true) && nationFits(roster.filter((m) => m !== member), other.country) && !roster.includes(other));
        if (!candidate) continue;
        replacement = candidate;
        rosters.set(donor.id, donorRoster.map((other) => (other === candidate ? prospect(rng, orgNation(donorRoster) ?? candidate.country, role, year) : other)));
      }
      replacement ??= prospect(rng, orgNation(roster) ?? member.country, role, year);
      rosters.set(org.id, (rosters.get(org.id) ?? roster).map((other) => (other === member ? replacement! : other)));
      retirements.push({ season, nick: memberNick(member), orgName: org.name, age, replacement: memberNick(replacement) });
    }
  }
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
    // Time nacional só contrata do próprio país (MongolZ com mongóis, TYLOO com chineses); misto aceita todos.
    if (!nationFits(toRoster.filter((member) => member !== partner), player.country) || !nationFits(fromRoster.filter((member) => member !== player), partner.country)) continue;
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
  const world = { rosters, transfers, retirements };
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

/** Quem pendurou o mouse no mundo na virada para a temporada N (mais velhos e de tier alto primeiro). */
export function headlineRetirements(seed: string, season: number, limit = 4): SceneRetirement[] {
  return [...sceneWorld(seed, season).retirements].sort((a, b) => b.age - a.age).slice(0, limit);
}
