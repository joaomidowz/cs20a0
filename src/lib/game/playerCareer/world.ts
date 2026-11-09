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
import { announcedRetirementYear, calibration, coreCountryOf, keepsIdentity, memberBirthYear, memberCatalogOverall, memberNick, memberRoles, ORG_BASE_POWER, sceneOrgById, sceneOrgs, type SceneOrg, type SceneRosterMember } from './data';
import type { CareerMember } from './engine';

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

/** Quanto um veterano do mundo perde por ano, no mínimo (a mesma régua da sua carreira). */
export const veteranDecline = (age: number): number => (age >= 38 ? 3 : age >= 35 ? 2 : age >= 29 ? 1 : 0);

/**
 * O que a curva do mundo não tira do veterano e a régua da carreira tira, somado até a idade: a curva calibrada fica
 * em ~0 aos 29-30 e −1 dos 31 em diante, e a régua pede −1 dos 29 aos 34, −2 dos 35 aos 37 e −3 dos 38 em diante.
 * Aplicado só na leitura do elenco (a história do mundo continua a mesma).
 */
export function veteranGap(age: number): number {
  let gap = 0;
  for (let at = 29; at <= age; at += 1) gap += at <= 30 ? 1 : at <= 34 ? 0 : at <= 37 ? 1 : 2;
  return gap;
}

/** Cache pelo próprio mapa de elencos: o mundo da seed e cada registro de vagas têm o seu mapa, então registrar
 *  vagas novas nunca devolve o desgaste calculado para as vagas antigas (a sessão fica igual ao recarregar). */
const agedRead = new WeakMap<Map<string, SceneRosterMember[]>, Map<string, SceneRosterMember[]>>();
/** Os elencos com o desgaste de veterano no número. */
function withVeteranGap(season: number, rosters: Map<string, SceneRosterMember[]>): Map<string, SceneRosterMember[]> {
  const cached = agedRead.get(rosters);
  if (cached) return cached;
  const year = yearOfSeason(season);
  const adjusted = new Map([...rosters].map(([id, roster]) => [id, roster.map((member) => {
    const born = memberBirthYear(member);
    if (born === null || member.overall === undefined) return member;
    const gap = veteranGap(year - born);
    return gap > 0 ? { ...member, overall: Math.max(40, member.overall - gap) } : member;
  })]));
  agedRead.set(rosters, adjusted);
  return adjusted;
}

/** Ano real da temporada N da carreira (a 1 é 2026). */
export const yearOfSeason = (season: number) => 2025 + season;

/** Quem anunciou a aposentadoria e ainda não parou: chance mínima de parar a cada virada. */
export const ANNOUNCED_RETIRE_CHANCE = 0.7;

/** Chance de pendurar na virada da temporada: nada antes dos 33, sobe 12 pontos por ano, certo aos 38. */
export const npcRetireChance = (age: number): number => (age >= 38 ? 1 : age >= 33 ? 0.15 + (age - 33) * 0.12 : 0);

const SYLLABLES = ['ka', 'zo', 'ri', 'vex', 'lu', 'dra', 'ny', 'xo', 'ten', 'mi', 'zer', 'ko', 'sa', 'fy', 'ru', 'ghost', 'nik', 'lo', 'bru', 'tz'];

const rollNick = (rng: () => number) => {
  const parts = 2 + Math.floor(rng() * 2);
  return Array.from({ length: parts }, () => SYLLABLES[Math.floor(rng() * SYLLABLES.length)]).join('') + (rng() < 0.3 ? String(Math.floor(rng() * 9) + 1) : '');
};

/** Jovem da base que sobe para fechar o elenco (nick gerado; jogador fictício do mundo da carreira). O nick nunca
 *  repete o de alguém em `taken` (todos os elencos da virada): a busca e as vagas acham o jogador pelo nick. */
function prospect(rng: () => number, country: string | null, role: string | null, year: number, level: number, dev: Map<string, MemberDev>, taken: Set<string>): SceneRosterMember {
  let nick = rollNick(rng);
  for (let tries = 0; tries < 8 && taken.has(nick.toLowerCase()); tries += 1) nick = rollNick(rng);
  while (taken.has(nick.toLowerCase())) nick += String(Math.floor(rng() * 9) + 1);
  taken.add(nick.toLowerCase());
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

/** O elenco com `incoming` no lugar de `out` (a mesma posição): é este elenco que a regra de identidade conta. */
const swapIn = (roster: SceneRosterMember[], out: SceneRosterMember, incoming: SceneRosterMember) => roster.map((member) => (member === out ? incoming : member));

/** Os nicks de todos os elencos (minúsculos), para o jovem gerado não repetir ninguém. */
const nicksOf = (rosters: Map<string, SceneRosterMember[]>) => new Set([...rosters.values()].flatMap((roster) => roster.map((member) => member.nick.toLowerCase())));

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
      // A história do mundo (quem envelhece, troca, aposenta, estreia) NÃO muda com ajustes de balanço: ela é
      // recalculada da seed a cada vez, então mexer aqui reescreveria o elenco de saves que já existem. O desgaste de
      // veterano entra só na leitura (rostersOf), no número que vai para a carta e para o motor.
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

/** O mundo na temporada N da carreira (a 1 é a cena coletada, sem trocas). Evolui pelo nível BASE do catálogo
 *  (`org.level`), nunca pelo nível desta carreira (a fonte única de tiers.ts): aposentadoria, trocas entre níveis
 *  vizinhos, olheiros e a vaga de quem cede o lugar a você dependem só da seed, então uma temporada não depende do
 *  resultado da outra (D6). Quem mostra o mundo na tela é que passa o nível de hoje (headlineTransfers). */
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
  const taken = nicksOf(rosters);
  // 1) Aposentadorias: veterano sai; entra o melhor da mesma função de um time de baixo (só se o time mantém a
  //    identidade com ele dentro), e esse time sobe um jovem da base do país do núcleo dele.
  for (const org of sceneOrgs) {
    for (const member of [...(rosters.get(org.id) ?? [])]) {
      const born = memberBirthYear(member);
      if (born === null) continue;
      const age = year - born;
      // Quem anunciou que para tem 70% ou mais de pendurar a cada virada (FalleN ainda pode jogar mais um ano).
      const announced = announcedRetirementYear(member);
      const chance = announced !== null && year >= announced ? Math.max(ANNOUNCED_RETIRE_CHANCE, npcRetireChance(age)) : npcRetireChance(age);
      if (rng() >= chance) continue;
      // O elenco de agora (pode já ter quem entrou no lugar de outro veterano nesta virada).
      const roster = rosters.get(org.id) ?? [];
      const role = memberRoles(member)[0] ?? null;
      const donors = sceneOrgs.filter((candidate) => candidate.level === org.level + 1 || candidate.level === org.level + 2);
      let replacement: SceneRosterMember | null = null;
      for (let tries = 0; tries < 6 && !replacement; tries += 1) {
        const donor = donors[Math.floor(rng() * donors.length)];
        if (!donor) break;
        const donorRoster = rosters.get(donor.id) ?? [];
        const candidate = donorRoster.find((other) => (role ? memberRoles(other)[0] === role : true) && !roster.includes(other) && keepsIdentity(org.id, roster, swapIn(roster, member, other)));
        if (!candidate) continue;
        replacement = candidate;
        rosters.set(donor.id, swapIn(donorRoster, candidate, prospect(rng, coreCountryOf(donor.id, donorRoster, candidate.country), role, year, donor.level, dev, taken)));
      }
      replacement ??= prospect(rng, coreCountryOf(org.id, roster, member.country), role, year, org.level, dev, taken);
      rosters.set(org.id, swapIn(roster, member, replacement));
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
    // Os dois times mantêm a identidade contando o elenco DEPOIS da troca (3+ do país do núcleo, 3+ sul-americanos).
    const toAfter = swapIn(toRoster, partner, player);
    const fromAfter = swapIn(fromRoster, player, partner);
    if (!keepsIdentity(to.id, toRoster, toAfter) || !keepsIdentity(from.id, fromRoster, fromAfter)) continue;
    // A coleta já lista alguns jogadores em dois elencos (trocas de 2026): nunca cria duplicata nova.
    if (toRoster.some((member) => member.nick === player.nick) || fromRoster.some((member) => member.nick === partner.nick)) continue;
    // Subir de nível exige ser o melhor dos dois; senão a troca não sai.
    if (to.level < from.level && strength(player, from) < strength(partner, to)) continue;
    if (from.level < to.level && strength(partner, to) < strength(player, from)) continue;
    rosters.set(from.id, fromAfter);
    rosters.set(to.id, toAfter);
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
    // Já está na cena (gtw na RED Canids Academy, rkzinho no Players): vira promessa ali mesmo, sem cópia.
    const already = [...rosters].find(([, roster]) => roster.some((member) => member.nick.toLowerCase() === kid.nick.toLowerCase()));
    if (already) {
      const [orgId, roster] = already;
      const [low, high] = kid.potentialRange;
      rosters.set(orgId, roster.map((member) => {
        if (member.nick.toLowerCase() !== kid.nick.toLowerCase()) return member;
        const current = dev.get(memberKey(member));
        dev.set(memberKey(member), { overall: current?.overall ?? kid.overall, potential: Math.max(current?.overall ?? kid.overall, low + Math.round(rng() * (high - low))), rate: kid.developmentRate });
        return { ...member, prospect: true, hltv: kid.hltv };
      }));
      continue;
    }
    const age = kid.age + (year - 2026);
    const member: SceneRosterMember = { nick: kid.nick, country: kid.country, birthDate: `${year - age}-03-01`, roles: [kid.role], catalogBaseId: null, prospect: true, hltv: kid.hltv };
    // Sai o mais fraco da função cujo lugar a promessa pode ocupar sem o time perder a identidade.
    const outIn = (org: SceneOrg): SceneRosterMember | undefined => {
      const roster = rosters.get(org.id) ?? [];
      const sameRole = roster.filter((other) => memberRoles(other)[0] === kid.role);
      const options = (sameRole.length ? sameRole : roster).filter((other) => !other.hltv);
      return [...options]
        .sort((a, b) => (a.overall ?? memberCatalogOverall(a) ?? 0) - (b.overall ?? memberCatalogOverall(b) ?? 0))
        .find((other) => keepsIdentity(org.id, roster, swapIn(roster, other, member)));
    };
    const reference = kid.referenceTeam ? sceneOrgs.find((org) => org.name.toLowerCase() === kid.referenceTeam!.toLowerCase() && org.level >= 3) : undefined;
    const regions = PROSPECT_REGION[kid.region] ?? ['eu'];
    const pool = sceneOrgs.filter((org) => org.level >= 3 && org.level <= 4 && regions.includes(regionOf(org.country)));
    // O time de referência real primeiro; senão um sorteado da região e, se ele não pode, o próximo da lista.
    let org = reference && outIn(reference) ? reference : undefined;
    if (!org && pool.length) {
      const start = Math.floor(rng() * pool.length);
      org = pool.map((_, index) => pool[(start + index) % pool.length]).find((candidate) => outIn(candidate) !== undefined);
    }
    if (!org) continue;
    const roster = rosters.get(org.id) ?? [];
    const out = outIn(org);
    if (!out) continue;
    // O teto sai da faixa do olheiro: nesta carreira ele pode virar estrela, ou parar no meio do caminho.
    const [low, high] = kid.potentialRange;
    const potential = low + Math.round(rng() * (high - low));
    dev.set(memberKey(member), { overall: kid.overall, potential, rate: kid.developmentRate });
    rosters.set(org.id, swapIn(roster, out, { ...member, overall: kid.overall }));
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
      const toAfter = swapIn(toRoster, weakest, member);
      const fromAfter = swapIn(fromRoster, member, weakest);
      if (!keepsIdentity(to.id, toRoster, toAfter) || !keepsIdentity(org.id, fromRoster, fromAfter)) continue;
      if (toRoster.some((other) => other.nick === member.nick) || fromRoster.some((other) => other.nick === weakest.nick)) continue;
      rosters.set(org.id, fromAfter);
      rosters.set(to.id, toAfter);
      transfers.push({ season, nick: memberNick(member), fromId: org.id, fromName: org.name, toId: to.id, toName: to.name, swappedNick: memberNick(weakest) });
      promoted += 1;
      break;
    }
  }
}

/** Quem cedeu a vaga para você não fica parado: assina com um time do mesmo nível (ou um abaixo) que joga na
 *  mesma função, trocando com o mais fraco dela. O trocado vira o reserva do seu time (e volta a jogar quando você
 *  sai). A página registra as vagas da carreira; sem registro (simulação, testes) o mundo é só o da seed. */
export interface SeatMove { season: number; nick: string; fromId: string; fromName: string; toId: string; toName: string; standIn: string }

const seatRegistry = new Map<string, { seats: string; members: string; moves: SeatMove[]; careerMembers: CareerMember[] }>();
const overlaid = new Map<string, Map<number, Map<string, SceneRosterMember[]>>>();
/** Elencos com os membros da carreira por cima, por seed e temporada (refeitos a cada registro novo). */
const placed = new Map<string, Map<number, Map<string, SceneRosterMember[]>>>();
const sameNick = (member: SceneRosterMember, nick: string) => memberNick(member).toLowerCase() === nick.toLowerCase();

function seatMove(seed: string, seat: { orgId: string; nick: string; season?: number }): SeatMove | null {
  const season = Math.max(1, seat.season ?? 1);
  const world = sceneWorld(seed, season);
  const from = sceneOrgById.get(seat.orgId);
  const leaving = from ? (world.rosters.get(from.id) ?? []).find((member) => sameNick(member, seat.nick)) : undefined;
  if (!from || !leaving) return null;
  const role = memberRoles(leaving)[0] ?? null;
  const power = strength(leaving, from);
  const fromRoster = world.rosters.get(from.id) ?? [];
  const rng = createSeededRng(`${seed}:seat-move:${from.id}:${seat.nick.toLowerCase()}:${season}`);
  for (const level of [from.level, from.level + 1, from.level - 1]) {
    const options = sceneOrgs.flatMap((org) => {
      if (org.id === from.id || org.level !== level) return [];
      const roster = world.rosters.get(org.id) ?? [];
      const weakest = roster.filter((member) => (role ? memberRoles(member)[0] === role : true)).sort((a, b) => strength(a, org) - strength(b, org))[0];
      if (!weakest || strength(weakest, org) >= power || roster.some((member) => sameNick(member, seat.nick))) return [];
      // Quem vem para o seu time no lugar dele também passa pela regra de identidade (dos dois lados).
      const fits = keepsIdentity(org.id, roster, swapIn(roster, weakest, leaving)) && keepsIdentity(from.id, fromRoster, swapIn(fromRoster, leaving, weakest));
      return fits ? [{ org, weakest }] : [];
    });
    if (!options.length) continue;
    const { org, weakest } = options[Math.floor(rng() * options.length)];
    return { season, nick: memberNick(leaving), fromId: from.id, fromName: from.name, toId: org.id, toName: org.name, standIn: memberNick(weakest) };
  }
  return null;
}

/** Registra as vagas que a carreira tomou e os membros criados nela (a página chama a cada mudança; repetir é de
 *  graça). Sem registro (simulação, testes) o mundo é só o da seed. */
export function registerSeats(seed: string, seats: ReadonlyArray<{ orgId: string; nick: string; season?: number }>, careerMembers: ReadonlyArray<CareerMember> = []) {
  const seatSignature = seats.map((seat) => `${seat.orgId}:${seat.nick}:${seat.season ?? 1}`).join('|');
  const memberSignature = careerMembers.map((member) => `${member.orgId}:${member.slot}:${member.since}:${member.nick}:${member.role}:${member.overall}`).join('|');
  const current = seatRegistry.get(seed);
  if (current?.seats === seatSignature && current.members === memberSignature) return;
  placed.delete(seed);
  if (current?.seats === seatSignature) {
    seatRegistry.set(seed, { ...current, members: memberSignature, careerMembers: [...careerMembers] });
    return;
  }
  const moves: SeatMove[] = [];
  for (const seat of seats) {
    const move = seatMove(seed, seat);
    if (move && !moves.some((other) => other.nick.toLowerCase() === move.nick.toLowerCase())) moves.push(move);
  }
  seatRegistry.set(seed, { seats: seatSignature, members: memberSignature, moves, careerMembers: [...careerMembers] });
  overlaid.delete(seed);
}

export const seatMovesOf = (seed: string): SeatMove[] => seatRegistry.get(seed)?.moves ?? [];

/** Os elencos da temporada com as trocas das suas vagas por cima (quem saiu está no time novo), sem os membros da
 *  carreira: a base do seu time (que lê os membros do save) e da força dos times. */
const agedSeatRostersOf = (seed: string, season: number) => withVeteranGap(season, seatRostersOf(seed, season));

/** Os elencos que o mundo mostra: as trocas das suas vagas e os membros criados na sua carreira nas posições deles. */
function rostersOf(seed: string, season: number): Map<string, SceneRosterMember[]> {
  const aged = agedSeatRostersOf(seed, season);
  const members = seatRegistry.get(seed)?.careerMembers ?? [];
  if (!members.length) return aged;
  const bySeason = placed.get(seed) ?? new Map<number, Map<string, SceneRosterMember[]>>();
  placed.set(seed, bySeason);
  const cached = bySeason.get(season);
  if (cached) return cached;
  const rosters = placeCareerMembers(aged, members, season);
  bySeason.set(season, rosters);
  return rosters;
}

/** Os membros da carreira nas posições deles, a partir da temporada em que entraram. Quem cobre uma posição herda
 *  as funções de quem estava nela: joga a mesma posição no motor (a função natural dele fica no save). */
export function placeCareerMembers(rosters: Map<string, SceneRosterMember[]>, members: ReadonlyArray<CareerMember>, season: number): Map<string, SceneRosterMember[]> {
  const active = members.filter((member) => member.since <= season);
  if (!active.length) return rosters;
  const next = new Map(rosters);
  for (const member of active) {
    const id = sceneOrgById.get(member.orgId)?.id ?? member.orgId;
    const roster = next.get(id);
    const covered = roster?.[member.slot];
    if (!roster || !covered) continue;
    const roles = memberRoles(covered);
    const made: SceneRosterMember = { nick: member.nick, country: member.country, birthDate: `${member.born}-07-01`, roles: roles.length ? roles : [member.role], catalogBaseId: null, prospect: null, overall: member.overall, careerMade: true };
    next.set(id, roster.map((other, index) => (index === member.slot ? made : other)));
  }
  return next;
}

/** O elenco do mundo do time na temporada (com as trocas das vagas, sem os membros da carreira). */
export function worldRosterIn(seed: string, season: number, orgId: string): SceneRosterMember[] {
  return agedSeatRostersOf(seed, season).get(sceneOrgById.get(orgId)?.id ?? orgId) ?? sceneOrgById.get(orgId)?.roster ?? [];
}

/** A posição (índice no elenco) de um jogador do mundo no time, procurando da temporada `season` para trás: as trocas
 *  do mundo põem quem chega no mesmo índice de quem sai. -1 se ele nunca esteve no time. */
export function slotOfNick(seed: string, season: number, orgId: string, nick: string): number {
  for (let at = season; at >= 1; at -= 1) {
    const index = worldRosterIn(seed, at, orgId).findIndex((member) => sameNick(member, nick));
    if (index >= 0) return index;
  }
  return -1;
}

/** O time do mundo em que o jogador está na temporada (sem os membros da carreira); null se em nenhum. */
export function worldOrgOfNick(seed: string, season: number, nick: string): string | null {
  for (const [orgId, roster] of agedSeatRostersOf(seed, season)) if (roster.some((member) => sameNick(member, nick))) return orgId;
  return null;
}

/** Os elencos da temporada com as trocas das suas vagas (sem o desgaste de leitura). */
function seatRostersOf(seed: string, season: number): Map<string, SceneRosterMember[]> {
  const base = sceneWorld(seed, season).rosters;
  const moves = seatMovesOf(seed).filter((move) => move.season <= season);
  if (!moves.length) return base;
  const bySeason = overlaid.get(seed) ?? new Map<number, Map<string, SceneRosterMember[]>>();
  overlaid.set(seed, bySeason);
  const cached = bySeason.get(season);
  if (cached) return cached;
  const rosters = new Map(base);
  const find = (nick: string) => [...rosters].find(([, roster]) => roster.some((member) => sameNick(member, nick)));
  for (const move of moves) {
    const leaving = find(move.nick);
    const coming = find(move.standIn);
    if (!leaving || !coming || leaving[0] === coming[0]) continue;
    const [fromId, fromRoster] = leaving;
    const [toId, toRoster] = coming;
    const player = fromRoster.find((member) => sameNick(member, move.nick))!;
    const standIn = toRoster.find((member) => sameNick(member, move.standIn))!;
    const fromAfter = swapIn(fromRoster, player, standIn);
    const toAfter = swapIn(toRoster, standIn, player);
    // O mundo andou desde a troca: se nesta temporada ela tira a identidade de um dos times, ela não vale.
    if (!keepsIdentity(fromId, fromRoster, fromAfter) || !keepsIdentity(toId, toRoster, toAfter)) continue;
    rosters.set(fromId, fromAfter);
    rosters.set(toId, toAfter);
  }
  bySeason.set(season, rosters);
  return rosters;
}

/** O elenco do time na temporada N da carreira. */
export function rosterIn(seed: string, season: number, orgId: string): SceneRosterMember[] {
  return rostersOf(seed, season).get(sceneOrgById.get(orgId)?.id ?? orgId) ?? sceneOrgById.get(orgId)?.roster ?? [];
}

/** Todos os elencos da temporada (com as trocas das suas vagas): para a busca de jogador. */
export const worldRosters = (seed: string, season: number) => rostersOf(seed, season);
export const worldHistory = (seed: string, season: number) => {
  const world = sceneWorld(seed, season);
  return { transfers: world.transfers, retirements: world.retirements, debuts: world.debuts };
};

/** Média dos 5 melhores do elenco (a força que entra em quadra). */
function topFive(roster: SceneRosterMember[], org: SceneOrg): number | null {
  const values = roster.map((member) => strength(member, org)).sort((a, b) => b - a).slice(0, 5);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/**
 * A força do time na temporada N: a da coleta (2026, que já carrega o ranking real) mais o quanto o elenco de hoje
 * mudou em relação ao de 2026. Quem envelheceu ou perdeu estrela cai no ranking; quem contratou bem ou viu a base
 * crescer sobe. Na temporada 1 é exatamente a da coleta.
 */
export function orgPowerIn(seed: string, season: number, orgId: string): number | undefined {
  const org = sceneOrgById.get(orgId);
  if (!org || org.power === undefined || season <= 1) return org?.power;
  const start = topFive(org.roster, org);
  const now = topFive(worldRosterIn(seed, season, org.id), org);
  if (start === null || now === null) return org.power;
  return Math.round((org.power + (now - start)) * 10) / 10;
}

/** O time como ele está na temporada N (mesmo time, elenco atualizado pelas trocas e força pelo elenco de hoje). */
export function orgIn(seed: string, season: number, orgId: string): SceneOrg | undefined {
  const org = sceneOrgById.get(orgId);
  if (!org) return undefined;
  const power = orgPowerIn(seed, season, org.id);
  return { ...org, roster: rosterIn(seed, season, org.id), season, ...(power !== undefined ? { power } : {}) };
}

/** As trocas mais chamativas da temporada: times de tier mais alto primeiro. `levelOf` é o nível que a tela mostra
 *  (a página passa o nível de hoje, de tiers.ts); sem ele, o nível base do catálogo. */
export function headlineTransfers(seed: string, season: number, limit = 6, levelOf: (orgId: string) => number = (id) => sceneOrgById.get(id)?.level ?? 9): SceneTransfer[] {
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
  orgId: string;
  orgName: string;
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
      list.push({ nick: memberNick(member), age: year - born, overall: member.overall, delta: before === undefined ? 0 : member.overall - before, orgId: org.id, orgName: org.name, curated: Boolean(member.hltv) });
    }
  }
  return list.sort((a, b) => Number(b.curated) - Number(a.curated) || b.overall - a.overall || b.delta - a.delta).slice(0, limit);
}

/** Quem estreou vindo da base real na virada para a temporada N. */
export const sceneDebuts = (seed: string, season: number): SceneDebut[] => (season <= 1 ? [] : sceneWorld(seed, season).debuts);

