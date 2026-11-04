// src/lib/game/playerCareer/world.ts
// O mundo gira: a cada temporada da sua carreira os OUTROS times também trocam jogadores. Trocas entre times de
// níveis vizinhos, na mesma função (o mais forte tende a subir), sorteadas pela seed da carreira e acumuladas
// temporada a temporada. Elencos, adversários, a vaga que você toma e as ofertas leem o elenco da temporada.
// E todo mundo envelhece pelo MESMO motor de idade do seu jogador: o jovem cresce rumo ao teto (se render), o
// veterano cai. As promessas curadas (career-prospects.game.json) estreiam na base e podem virar estrela ou não.
import rawProspects from '$lib/data/cs/career-prospects.game.json';
import { applyAging } from '../career/aging';
import { createSeededRng } from '../simulation';
import { regionOf } from './calendar';
import { calibration, memberBirthYear, memberCatalogOverall, memberNick, memberRoles, nationFits, ORG_BASE_POWER, orgNation, sceneOrgById, sceneOrgs, type SceneOrg, type SceneRosterMember } from './data';

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

/** Promessa que estreou num time (vinda da base real curada). */
export interface SceneDebut {
  season: number;
  nick: string;
  orgId: string;
  orgName: string;
  age: number;
  overall: number;
}

/** Desenvolvimento de cada jogador do mundo: overall da temporada, teto oculto e ritmo. */
interface MemberDev { overall: number; potential: number; rate: number }

interface WorldSeason {
  rosters: Map<string, SceneRosterMember[]>;
  transfers: SceneTransfer[];
  retirements: SceneRetirement[];
  debuts: SceneDebut[];
  /** Overall e teto por jogador (chave estável: nick + catálogo + nascimento). */
  dev: Map<string, MemberDev>;
  /** Overall da temporada anterior, para mostrar quem subiu. */
  previousOverall: Map<string, number>;
}

interface CuratedProspect { nick: string; hltv: string; age: number; role: string; overall: number; potentialRange: [number, number]; developmentRate: number; region: string; country: string | null; referenceTeam: string | null }
const PROSPECTS = (rawProspects as unknown as { prospects: CuratedProspect[] }).prospects;
const PROSPECT_REGION: Record<string, ReturnType<typeof regionOf>[]> = { Europe: ['eu'], 'North America': ['na'], 'South America': ['sa'], Asia: ['asia'], Oceania: ['oce'] };

export const memberKey = (member: SceneRosterMember) => `${member.nick.toLowerCase()}:${member.catalogBaseId ?? ''}:${member.birthDate ?? ''}`;

/** Folga até o teto pela idade: aos 16-19 até +22, aos 24+ quase nada (quem já chegou, chegou). */
function headroom(age: number | null, rng: () => number): number {
  if (age === null) return Math.round(rng() * 2);
  if (age <= 19) return 6 + Math.round(rng() * 16);
  if (age <= 21) return 4 + Math.round(rng() * 10);
  if (age <= 23) return 1 + Math.round(rng() * 6);
  if (age <= 26) return Math.round(rng() * 3);
  return 0;
}

/** Ano real da temporada N da carreira (a 1 é 2026). */
export const yearOfSeason = (season: number) => 2025 + season;

/** Chance de pendurar na virada da temporada: nada antes dos 33, sobe 12 pontos por ano, certo aos 38. */
export const npcRetireChance = (age: number): number => (age >= 38 ? 1 : age >= 33 ? 0.15 + (age - 33) * 0.12 : 0);

const SYLLABLES = ['ka', 'zo', 'ri', 'vex', 'lu', 'dra', 'ny', 'xo', 'ten', 'mi', 'zer', 'ko', 'sa', 'fy', 'ru', 'ghost', 'nik', 'lo', 'bru', 'tz'];

/** Jovem da base que sobe para fechar o elenco (nick gerado; jogador fictício do mundo da carreira). */
function prospect(rng: () => number, country: string | null, role: string | null, year: number, level: number, dev: Map<string, MemberDev>): SceneRosterMember {
  const parts = 2 + Math.floor(rng() * 2);
  const nick = Array.from({ length: parts }, () => SYLLABLES[Math.floor(rng() * SYLLABLES.length)]).join('') + (rng() < 0.3 ? String(Math.floor(rng() * 9) + 1) : '');
  const member: SceneRosterMember = { nick, country, birthDate: `${year - 18}-06-01`, roles: role ? [role] : [], catalogBaseId: null, prospect: true };
  // Começa abaixo da faixa do time que o subiu; o teto é sorteado (pode estourar ou travar).
  const overall = Math.max(45, (ORG_BASE_POWER[Math.min(4, level)] ?? 66) - 4 - Math.round(rng() * 6));
  dev.set(memberKey(member), { overall, potential: Math.min(97, overall + headroom(18, rng)), rate: 0.9 + rng() * 0.3 });
  return { ...member, overall };
}

/** Trocas por temporada no mundo todo (cerca de 1 a cada 10 times). */
export const TRANSFERS_PER_SEASON = 18;

const cache = new Map<string, WorldSeason>();
/** Mundos guardados (cada um tem o desenvolvimento de ~1300 jogadores): uma carreira usa poucos; a simulação, milhares. */
const CACHE_LIMIT = 256;
function remember(key: string, world: WorldSeason) {
  cache.set(key, world);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

const strength = (member: SceneRosterMember, org: SceneOrg) => member.overall ?? memberCatalogOverall(member) ?? org.power ?? 70;

/** O mundo da temporada 1: a cena coletada, com o teto oculto de cada um sorteado pela seed da carreira. */
function baseWorld(seed: string): WorldSeason {
  const dev = new Map<string, MemberDev>();
  const year = yearOfSeason(1);
  for (const org of sceneOrgs) {
    const base = org.power ?? ORG_BASE_POWER[org.level] ?? 66;
    for (const member of org.roster) {
      const key = memberKey(member);
      if (dev.has(key)) continue;
      const rng = createSeededRng(`${seed}:dev:${key}`);
      const born = memberBirthYear(member);
      const overall = memberCatalogOverall(member) ?? Math.round(base);
      dev.set(key, { overall, potential: Math.min(99, overall + headroom(born === null ? null : year - born, rng)), rate: 0.85 + rng() * 0.35 });
    }
  }
  return { rosters: new Map(sceneOrgs.map((org) => [org.id, org.roster])), transfers: [], retirements: [], debuts: [], dev, previousOverall: new Map() };
}

/** Um ano a mais para todo mundo: o motor de idade do jogador, com a forma da temporada sorteada (quem rende
 *  abaixo de 1.00 quase não cresce: é daí que sai a promessa que não vingou). */
function ageWorld(seed: string, season: number, rosters: Map<string, SceneRosterMember[]>, previous: Map<string, MemberDev>): Map<string, MemberDev> {
  const dev = new Map(previous);
  const year = yearOfSeason(season);
  const seen = new Set<string>();
  for (const roster of rosters.values()) {
    for (const member of roster) {
      const key = memberKey(member);
      if (seen.has(key)) continue;
      seen.add(key);
      const current = dev.get(key);
      const born = memberBirthYear(member);
      if (!current || born === null) continue;
      const rng = createSeededRng(`${seed}:form:${season}:${key}`);
      const aged = applyAging({
        entity: { id: key, age: year - 1 - born, overall: current.overall, truePotential: current.potential, developmentRate: current.rate, runRating: 0.95 + rng() * 0.12 },
        calibration,
        seasonKey: `${seed}:world:${season}`
      });
      dev.set(key, { ...current, overall: aged.entity.overall });
    }
  }
  return dev;
}

/** Cada membro do elenco carrega o overall da temporada. */
const withOverall = (rosters: Map<string, SceneRosterMember[]>, dev: Map<string, MemberDev>) =>
  new Map([...rosters].map(([id, roster]) => [id, roster.map((member) => {
    const overall = dev.get(memberKey(member))?.overall;
    return overall === undefined || overall === member.overall ? member : { ...member, overall };
  })]));

/** O mundo na temporada N da carreira (a 1 é a cena coletada, sem trocas). */
export function sceneWorld(seed: string, season: number): WorldSeason {
  const key = `${seed}:${season}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (season <= 1) {
    const base = baseWorld(seed);
    remember(key, base);
    return base;
  }
  const previous = sceneWorld(seed, season - 1);
  const rosters = new Map([...previous.rosters].map(([id, roster]) => [id, [...roster]]));
  const rng = createSeededRng(`${seed}:world:${season}`);
  const transfers: SceneTransfer[] = [];
  const retirements: SceneRetirement[] = [];
  const debuts: SceneDebut[] = [];
  const year = yearOfSeason(season);
  // 0) Todo mundo fica um ano mais velho (cresce ou cai) antes do mercado.
  const dev = ageWorld(seed, season, rosters, previous.dev);
  for (const [id, roster] of withOverall(rosters, dev)) rosters.set(id, roster);
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
        rosters.set(donor.id, donorRoster.map((other) => (other === candidate ? prospect(rng, orgNation(donorRoster) ?? candidate.country, role, year, donor.level, dev) : other)));
      }
      replacement ??= prospect(rng, orgNation(roster) ?? member.country, role, year, org.level, dev);
      rosters.set(org.id, (rosters.get(org.id) ?? roster).map((other) => (other === member ? replacement! : other)));
      retirements.push({ season, nick: memberNick(member), orgName: org.name, age, replacement: memberNick(replacement) });
    }
  }
  // 2) Na primeira virada, as promessas curadas estreiam na base da região (ou no time de referência real).
  if (season === 2) placeProspects(seed, season, rosters, dev, debuts, year);
  // 3) Olheiros: o jovem que estourou toma a vaga do mais fraco da mesma função um degrau acima.
  promoteRisers(rng, rosters, transfers, season);
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
  const previousOverall = new Map([...previous.dev].map(([memberId, entry]) => [memberId, entry.overall]));
  const world = { rosters, transfers, retirements, debuts, dev, previousOverall };
  remember(key, world);
  return world;
}

/** As 19 promessas curadas entram no lugar do mais fraco da função num time da região (CCT/GC ou Challenger). */
function placeProspects(seed: string, season: number, rosters: Map<string, SceneRosterMember[]>, dev: Map<string, MemberDev>, debuts: SceneDebut[], year: number) {
  for (const kid of PROSPECTS) {
    const rng = createSeededRng(`${seed}:prospect:${kid.nick}`);
    const reference = kid.referenceTeam ? sceneOrgs.find((org) => org.name.toLowerCase() === kid.referenceTeam!.toLowerCase() && org.level >= 3) : undefined;
    const regions = PROSPECT_REGION[kid.region] ?? ['eu'];
    const pool = sceneOrgs.filter((org) => org.level >= 3 && org.level <= 4 && regions.includes(regionOf(org.country)) && nationFits(rosters.get(org.id) ?? [], kid.country));
    const org = reference ?? pool[Math.floor(rng() * pool.length)];
    if (!org) continue;
    const roster = rosters.get(org.id) ?? [];
    const sameRole = roster.filter((member) => memberRoles(member)[0] === kid.role);
    const options = (sameRole.length ? sameRole : roster).filter((member) => !member.hltv);
    const out = [...options].sort((a, b) => (a.overall ?? memberCatalogOverall(a) ?? 0) - (b.overall ?? memberCatalogOverall(b) ?? 0))[0];
    if (!out) continue;
    const age = kid.age + (year - 2026);
    const member: SceneRosterMember = { nick: kid.nick, country: kid.country, birthDate: `${year - age}-03-01`, roles: [kid.role], catalogBaseId: null, prospect: true, hltv: kid.hltv };
    // O teto sai da faixa do olheiro: nesta carreira ele pode virar estrela, ou parar no meio do caminho.
    const [low, high] = kid.potentialRange;
    const potential = low + Math.round(rng() * (high - low));
    dev.set(memberKey(member), { overall: kid.overall, potential, rate: kid.developmentRate });
    rosters.set(org.id, roster.map((other) => (other === out ? { ...member, overall: kid.overall } : other)));
    debuts.push({ season, nick: kid.nick, orgId: org.id, orgName: org.name, age, overall: kid.overall });
  }
}

/** Quem tem até 23 anos e já joga mais que o pior da função no degrau de cima sobe (até 10 por temporada). */
function promoteRisers(rng: () => number, rosters: Map<string, SceneRosterMember[]>, transfers: SceneTransfer[], season: number) {
  const byId = new Map(sceneOrgs.map((org) => [org.id, org]));
  const year = yearOfSeason(season);
  const risers: Array<{ org: SceneOrg; member: SceneRosterMember }> = [];
  for (const [id, roster] of rosters) {
    const org = byId.get(id);
    if (!org || org.level === 0) continue;
    for (const member of roster) {
      const born = memberBirthYear(member);
      if (born !== null && year - born <= 23 && member.overall !== undefined) risers.push({ org, member });
    }
  }
  risers.sort((a, b) => (b.member.overall ?? 0) - (a.member.overall ?? 0));
  let promoted = 0;
  for (const { org, member } of risers) {
    if (promoted >= 10) break;
    const role = memberRoles(member)[0];
    const fromRoster = rosters.get(org.id) ?? [];
    if (!fromRoster.includes(member)) continue;
    const targets = sceneOrgs.filter((candidate) => candidate.level === org.level - 1);
    const offset = Math.floor(rng() * Math.max(1, targets.length));
    for (let index = 0; index < targets.length; index += 1) {
      const to = targets[(index + offset) % targets.length];
      const toRoster = rosters.get(to.id) ?? [];
      const weakest = toRoster.filter((other) => memberRoles(other)[0] === role).sort((a, b) => strength(a, to) - strength(b, to))[0];
      if (!weakest || strength(member, org) < strength(weakest, to) + 2) continue;
      if (!nationFits(toRoster.filter((other) => other !== weakest), member.country) || !nationFits(fromRoster.filter((other) => other !== member), weakest.country)) continue;
      if (toRoster.some((other) => other.nick === member.nick) || fromRoster.some((other) => other.nick === weakest.nick)) continue;
      rosters.set(org.id, fromRoster.map((other) => (other === member ? weakest : other)));
      rosters.set(to.id, toRoster.map((other) => (other === weakest ? member : other)));
      transfers.push({ season, nick: memberNick(member), fromId: org.id, fromName: org.name, toId: to.id, toName: to.name, swappedNick: memberNick(weakest) });
      promoted += 1;
      break;
    }
  }
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

export interface RisingProspect {
  nick: string;
  age: number;
  overall: number;
  /** Quanto subiu desde a temporada anterior. */
  delta: number;
  orgName: string;
  level: number;
  /** Promessa da base real (identidade curada, link HLTV). */
  curated: boolean;
}

/** As promessas da cena na temporada N: até 21 anos, as curadas primeiro, depois quem mais subiu. */
export function risingProspects(seed: string, season: number, limit = 4): RisingProspect[] {
  if (season <= 1) return [];
  const world = sceneWorld(seed, season);
  const year = yearOfSeason(season);
  const byId = new Map(sceneOrgs.map((org) => [org.id, org]));
  const list: RisingProspect[] = [];
  const seen = new Set<string>();
  for (const [orgId, roster] of world.rosters) {
    const org = byId.get(orgId);
    if (!org) continue;
    for (const member of roster) {
      const born = memberBirthYear(member);
      const key = memberKey(member);
      if (born === null || year - born > 21 || seen.has(key) || member.overall === undefined) continue;
      seen.add(key);
      const before = world.previousOverall.get(key);
      list.push({ nick: memberNick(member), age: year - born, overall: member.overall, delta: before === undefined ? 0 : member.overall - before, orgName: org.name, level: org.level, curated: Boolean(member.hltv) });
    }
  }
  return list.sort((a, b) => Number(b.curated) - Number(a.curated) || b.overall - a.overall || b.delta - a.delta).slice(0, limit);
}

/** Quem estreou vindo da base real na virada para a temporada N. */
export const sceneDebuts = (seed: string, season: number): SceneDebut[] => (season <= 1 ? [] : sceneWorld(seed, season).debuts);

