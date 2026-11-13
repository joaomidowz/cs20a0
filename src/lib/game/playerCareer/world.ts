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
import { announcedRetirementYear, calibration, coreCountryOf, initialBenches, initialFreeAgents, keepsIdentity, memberBirthYear, memberCatalogOverall, memberNick, memberRoles, ORG_BASE_POWER, sceneOrgById, sceneOrgs, type SceneOrg, type SceneRosterMember } from './data';
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

/** Quem está fora dos 5 titulares: no banco de um time ou sem time (free agent), desde que temporada. */
export interface BenchEntry {
  member: SceneRosterMember;
  since: number;
  /** Free agent: o nível do último time (onde ele procura vaga). */
  level?: number;
}

/** O que aconteceu com quem estava no banco ou sem time na virada. */
export interface SceneBenchMove {
  season: number;
  nick: string;
  /** promoted: voltou a ser titular · benched: perdeu a vaga e foi para o banco · signed: outro time contratou do banco ·
   *  released: dispensado, virou free agent · faSigned: free agent contratado · retired: pendurou fora dos titulares ·
   *  contractEnd: o contrato acabou, o time não renovou e ele virou free agent (swappedNick: quem entrou). */
  kind: 'promoted' | 'benched' | 'signed' | 'released' | 'faSigned' | 'retired' | 'contractEnd';
  orgId: string | null;
  orgName: string | null;
  /** De onde saiu (contratado do banco de outro time). */
  fromId?: string;
  fromName?: string;
  /** Quem perdeu a vaga para ele (foi para o banco). */
  swappedNick?: string;
}

/** Contrato de um titular do mundo: com que time e até que temporada (estimado pela seed; o real não é público). */
export interface NpcContract {
  orgId: string;
  until: number;
}

interface WorldSeason {
  rosters: Map<string, SceneRosterMember[]>;
  /** Contrato de cada titular (chave: memberKey). Só metadado: os elencos não dependem dele quando o banco está desligado. */
  contracts: Map<string, NpcContract>;
  /** Banco de cada time (fora dos 5 titulares). */
  benches: Map<string, BenchEntry[]>;
  /** Sem time: dispensados que esperam proposta. */
  freeAgents: BenchEntry[];
  benchMoves: SceneBenchMove[];
  transfers: SceneTransfer[];
  retirements: SceneRetirement[];
  debuts: SceneDebut[];
  /** Overall e teto por jogador (chave estável: nick + catálogo + nascimento). */
  dev: Map<string, MemberDev>;
  /** Overall da temporada anterior, para mostrar quem subiu. */
  previousOverall: Map<string, number>;
}

interface CuratedProspect {
  nick: string;
  /** Link HLTV da promessa; null quando o arquivo não tem (nocries). */
  hltv: string | null;
  /** Idade em 2026. */
  age: number;
  /** Nascimento real, quando a promessa tem (nocries); sem ele, 1º de março do ano que a idade dá. */
  birthDate?: string;
  role: string;
  overall: number;
  potentialRange: [number, number];
  developmentRate: number;
  region: string;
  country: string | null;
  referenceTeam: string | null;
  /** Nota do dono sobre a origem do jogador (só texto, não muda nada no jogo). */
  note?: string;
}
const PROSPECTS = (rawProspects as unknown as { prospects: CuratedProspect[] }).prospects;
/** Promessa da base real (curada), com ou sem link HLTV. */
const isCurated = (member: SceneRosterMember): boolean => Boolean(member.curated || member.hltv);
/** Nascimento da promessa: o real quando o arquivo tem; senão, pela idade de 2026. */
const curatedBirthDate = (kid: CuratedProspect, year: number): string => kid.birthDate ?? `${year - (kid.age + (year - 2026))}-03-01`;
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

/**
 * Desde que temporada o banco se mexe (volta ao titular, troca de time, dispensa, free agent) em cada carreira. O mundo
 * é recalculado da seed e não fica no save: ligar o banco numa temporada já vista reescreveria os elencos que o jogador
 * já viu. Por isso a regra liga numa temporada guardada no save (carreira nova: 2; save antigo: a seguinte à de
 * quando ele abriu esta versão). Sem registro (simulação, testes), o banco só aparece e não se mexe.
 */
const benchStart = new Map<string, number>();
const benchActive = (seed: string, season: number) => season >= (benchStart.get(seed) ?? Infinity);

/**
 * Desde que temporada o fim de contrato dos jogadores do mundo tira gente dos times (trava própria, pela mesma razão do
 * banco): um save que já jogava com o banco ligado não pode ver as temporadas dele mudarem quando os contratos chegaram.
 * Vale só onde o banco também vale.
 */
const contractStart = new Map<string, number>();
const contractsActive = (seed: string, season: number) => benchActive(seed, season) && season >= (contractStart.get(seed) ?? Infinity);

/**
 * Regras do mundo, versão 2 (2026-11-13): o fim de contrato nunca tira os 3 melhores do time (estrela não fica sem
 * renovação) e o free agent forte é disputado pelos times de cima. Liga numa temporada guardada no save (carreira nova:
 * 2; save de antes: a seguinte), para não reescrever temporada já jogada.
 */
const rulesStart = new Map<string, number>();
const rulesV2 = (seed: string, season: number) => season >= (rulesStart.get(seed) ?? Infinity);

/** Jogadores do mundo que a sua carreira contratou (sem time → seu reserva ou seu time): o mundo não os oferece mais a
 *  ninguém a partir da temporada seguinte à contratação. */
const careerTaken = new Map<string, string>();

/** Trocar a trava descarta os mundos e elencos guardados dessa seed. */
function forgetWorld(seed: string) {
  for (const key of [...cache.keys()]) if (key.startsWith(`${seed}:`)) cache.delete(key);
  // As vagas e os membros foram calculados sobre o mundo antigo: o próximo registro refaz.
  seatRegistry.delete(seed);
  overlaid.delete(seed);
  placed.delete(seed);
}

/** A página registra a temporada do save em que as regras v2 do mundo passam a valer. */
export function registerWorldRules(seed: string, from: number | undefined) {
  const current = rulesStart.get(seed);
  if (from === undefined ? current === undefined : current === from) return;
  if (from === undefined) rulesStart.delete(seed);
  else rulesStart.set(seed, from);
  forgetWorld(seed);
}

/** A página registra quem a carreira tirou do mercado do mundo (nick e temporada da contratação). */
export function registerCareerTaken(seed: string, taken: ReadonlyArray<{ nick: string; since: number }>) {
  const signature = [...taken].map((entry) => `${entry.nick.toLowerCase()}@${entry.since}`).sort().join('|');
  if ((careerTaken.get(seed) ?? '') === signature) return;
  if (signature) careerTaken.set(seed, signature);
  else careerTaken.delete(seed);
  forgetWorld(seed);
}

/** Os nicks que a carreira já tinha tirado do mercado antes desta temporada. */
function takenBefore(seed: string, season: number): Set<string> {
  const signature = careerTaken.get(seed);
  if (!signature) return new Set();
  return new Set(signature.split('|').map((entry) => entry.split('@')).filter(([, since]) => Number(since) < season).map(([nick]) => nick));
}

/** A página registra a temporada do save em que os contratos do mundo passam a valer. */
export function registerContractStart(seed: string, from: number | undefined) {
  const current = contractStart.get(seed);
  if (from === undefined ? current === undefined : current === from) return;
  if (from === undefined) contractStart.delete(seed);
  else contractStart.set(seed, from);
  forgetWorld(seed);
}

/** A página registra a temporada do save; trocar o valor descarta os mundos e elencos guardados dessa seed. */
export function registerBenchStart(seed: string, from: number | undefined) {
  const current = benchStart.get(seed);
  if (from === undefined ? current === undefined : current === from) return;
  if (from === undefined) benchStart.delete(seed);
  else benchStart.set(seed, from);
  forgetWorld(seed);
}
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
  const startBenches = initialBenches();
  const startFree = initialFreeAgents();
  // Quem começa sem time ganha o desenvolvimento na base do último nível dele (rng por jogador, como todo mundo).
  for (const { member, level } of startFree) {
    const key = memberKey(member);
    if (dev.has(key)) continue;
    const rng = createSeededRng(`${seed}:dev:${key}`);
    const born = memberBirthYear(member);
    const overall = memberCatalogOverall(member) ?? Math.round(ORG_BASE_POWER[level] ?? 66);
    dev.set(key, { overall, potential: Math.min(99, overall + headroom(born === null ? null : year - born, rng)), rate: 0.85 + rng() * 0.35 });
  }
  for (const org of sceneOrgs) {
    const base = org.power ?? ORG_BASE_POWER[org.level] ?? 66;
    // O banco ganha o mesmo desenvolvimento (rng por jogador: não mexe no de mais ninguém).
    for (const member of [...org.roster, ...(startBenches.get(org.id) ?? [])]) {
      const key = memberKey(member);
      if (dev.has(key)) continue;
      const rng = createSeededRng(`${seed}:dev:${key}`);
      const born = memberBirthYear(member);
      const overall = memberCatalogOverall(member) ?? Math.round(base);
      dev.set(key, { overall, potential: Math.min(99, overall + headroom(born === null ? null : year - born, rng)), rate: 0.85 + rng() * 0.35 });
    }
  }
  const withDev = (member: SceneRosterMember) => {
    const overall = dev.get(memberKey(member))?.overall;
    return overall === undefined || overall === member.overall ? member : { ...member, overall };
  };
  const benches = new Map([...startBenches].map(([orgId, members]) => [orgId, members.map((member) => ({ member: withDev(member), since: 1 }))]));
  const freeAgents = startFree.map(({ member, level }) => ({ member: withDev(member), since: 1, level }));
  const rosters = new Map(sceneOrgs.map((org) => [org.id, org.roster]));
  return { rosters, contracts: signContracts(seed, 1, rosters, new Map(), true), benches, freeAgents, benchMoves: [], transfers: [], retirements: [], debuts: [], dev, previousOverall: new Map() };
}

/** Um ano a mais para todo mundo: o motor de idade do jogador, com a forma da temporada sorteada (quem rende
 *  abaixo de 1.00 quase não cresce: é daí que sai a promessa que não vingou). */
function ageWorld(seed: string, season: number, rosters: Map<string, SceneRosterMember[]>, previous: Map<string, MemberDev>, outside: SceneRosterMember[] = []): Map<string, MemberDev> {
  const dev = new Map(previous);
  const year = yearOfSeason(season);
  const seen = new Set<string>();
  // Quem está no banco ou sem time envelhece igual (rng por jogador: a ordem não muda o de ninguém).
  for (const roster of [...rosters.values(), outside]) {
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
  const key = `${seed}:${season}:${benchStart.get(seed) ?? '-'}:${contractStart.get(seed) ?? '-'}:${rulesStart.get(seed) ?? '-'}:${careerTaken.get(seed) ?? '-'}`;
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
  const benches = new Map([...previous.benches].map(([id, entries]) => [id, [...entries]]));
  // Quem a sua carreira contratou numa temporada anterior saiu do mercado do mundo.
  const gone = takenBefore(seed, season);
  let freeAgents = previous.freeAgents.filter((entry) => !gone.has(entry.member.nick.toLowerCase()));
  const benchMoves: SceneBenchMove[] = [];
  const active = benchActive(seed, season);
  const contractsOn = contractsActive(seed, season);
  // 0) Todo mundo fica um ano mais velho (cresce ou cai) antes do mercado.
  const outside = [...[...benches.values()].flat(), ...freeAgents].map((entry) => entry.member);
  const dev = ageWorld(seed, season, rosters, previous.dev, outside);
  for (const [id, roster] of withOverall(rosters, dev)) rosters.set(id, roster);
  const refresh = (entry: BenchEntry): BenchEntry => {
    const overall = dev.get(memberKey(entry.member))?.overall;
    return overall === undefined || overall === entry.member.overall ? entry : { ...entry, member: { ...entry.member, overall } };
  };
  for (const [id, entries] of benches) benches.set(id, entries.map(refresh));
  freeAgents = freeAgents.map(refresh);
  const taken = nicksOf(rosters);
  // Com o banco ligado, o jovem gerado também não pode repetir o nick de quem está no banco ou sem time.
  if (contractsOn) for (const entry of [...[...benches.values()].flat(), ...freeAgents]) taken.add(entry.member.nick.toLowerCase());
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
      let replacement: SceneRosterMember | null = active ? fromOutside(org, roster, member, role, benches, freeAgents, benchMoves, season) : null;
      if (replacement) freeAgents = freeAgents.filter((entry) => entry.member !== replacement);
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
  // 4) O banco e os sem time (só nas temporadas em que a regra está ligada para esta carreira).
  if (active) {
    // 4a) Fim de contrato: quem terminou o contrato na temporada passada e o time não renovou vira free agent.
    const v2 = rulesV2(seed, season);
    if (contractsOn) freeAgents = contractMarket(seed, season, year, rosters, previous.rosters, previous.contracts, benches, freeAgents, benchMoves, dev, taken, v2);
    freeAgents = benchMarket(seed, season, year, rosters, benches, freeAgents, benchMoves, v2);
  }
  const previousOverall = new Map([...previous.dev].map(([memberId, entry]) => [memberId, entry.overall]));
  // 5) Contratos: quem segue no mesmo time mantém o dele; quem chegou (ou renovou) assina um novo nesta temporada.
  const contracts = signContracts(seed, season, rosters, previous.contracts, false);
  const world = { rosters, contracts, benches, freeAgents, benchMoves, transfers, retirements, debuts, dev, previousOverall };
  remember(key, world);
  return world;
}

/** Regras v2: daqui para cima o time sempre renova. */
const STAR_RENEWAL = 90;
/** Chance de o time não renovar com quem terminou o contrato (base; o mais fraco do time e o veterano saem mais). */
const NPC_LEAVE_CHANCE = 0.05;
const NPC_LEAVE_WEAKEST = 0.07;
const NPC_LEAVE_VETERAN = 0.05;

/** Duração do contrato de um titular do mundo: jovem assina mais longo, veterano mais curto (rng por jogador). */
function npcContractYears(seed: string, key: string, season: number, age: number | null): number {
  const rng = createSeededRng(`${seed}:npc-contract:${key}:${season}`);
  if (age === null) return 1 + Math.floor(rng() * 3);
  if (age <= 21) return rng() < 0.7 ? 3 : 2;
  if (age <= 27) return rng() < 0.5 ? 2 : rng() < 0.5 ? 3 : 1;
  if (age <= 31) return rng() < 0.6 ? 1 : 2;
  return 1;
}

/**
 * Os contratos da temporada: quem segue no mesmo time com contrato em dia mantém o dele; quem chegou, renovou ou não
 * tinha assina um novo a partir de `season`. Na temporada 1 (a cena de 2026) cada um já está no meio de um contrato:
 * o que falta é sorteado (1 a 3 temporadas). Só metadado: não muda elenco nem consome o rng do mundo.
 */
function signContracts(seed: string, season: number, rosters: Map<string, SceneRosterMember[]>, previous: Map<string, NpcContract>, start: boolean): Map<string, NpcContract> {
  const year = yearOfSeason(season);
  const contracts = new Map<string, NpcContract>();
  for (const [orgId, roster] of rosters) {
    for (const member of roster) {
      const key = memberKey(member);
      const before = previous.get(key);
      if (before && before.orgId === orgId && before.until >= season) {
        contracts.set(key, before);
        continue;
      }
      const born = memberBirthYear(member);
      const years = npcContractYears(seed, key, season, born === null ? null : year - born);
      // Na cena de 2026 o contrato já está correndo: falta de 1 até a duração toda.
      const left = start ? 1 + Math.floor(createSeededRng(`${seed}:npc-contract-left:${key}`)() * years) : years;
      contracts.set(key, { orgId, until: season + left - 1 });
    }
  }
  return contracts;
}

/**
 * Fim de contrato no mundo (só com o banco ligado, rng próprio): quem terminou o contrato na temporada passada renova na
 * maioria das vezes; senão sai como free agent e o time põe no lugar o melhor sem time da função, alguém do banco ou um
 * jovem da base. Se ninguém mantém a identidade do time, ele renova.
 */
function contractMarket(seed: string, season: number, year: number, rosters: Map<string, SceneRosterMember[]>, before: Map<string, SceneRosterMember[]>, contracts: Map<string, NpcContract>, benches: Map<string, BenchEntry[]>, freeAgents: BenchEntry[], moves: SceneBenchMove[], dev: Map<string, MemberDev>, taken: Set<string>, v2 = false): BenchEntry[] {
  const rng = createSeededRng(`${seed}:contract-market:${season}`);
  let free = [...freeAgents];
  for (const org of sceneOrgs) {
    const roster = rosters.get(org.id) ?? [];
    // Só quem já estava no time na temporada passada: quem chegou nesta virada assina contrato novo.
    const stayed = new Set((before.get(org.id) ?? []).map((member) => memberKey(member)));
    const ranked = [...roster].sort((left, right) => strength(left, org) - strength(right, org));
    const weakest = ranked[0];
    // Regras v2: os 3 melhores do time e qualquer estrela (90+) sempre renovam (estrela não fica sem contrato).
    const core = v2 ? new Set([...ranked.slice(-3), ...ranked.filter((member) => strength(member, org) >= STAR_RENEWAL)]) : new Set<SceneRosterMember>();
    for (const member of [...roster]) {
      const contract = contracts.get(memberKey(member));
      if (!contract || contract.orgId !== org.id || contract.until !== season - 1 || member.careerMade || !stayed.has(memberKey(member)) || core.has(member)) continue;
      const born = memberBirthYear(member);
      const age = born === null ? null : year - born;
      const chance = NPC_LEAVE_CHANCE + (member === weakest ? NPC_LEAVE_WEAKEST : 0) + (age !== null && age >= 30 ? NPC_LEAVE_VETERAN : 0);
      if (rng() >= chance) continue;
      const current = rosters.get(org.id) ?? [];
      const role = memberRoles(member)[0] ?? null;
      const fits = (candidate: SceneRosterMember) => (role ? memberRoles(candidate)[0] === role : true) && keepsIdentity(org.id, current, swapIn(current, member, candidate));
      // O melhor sem time da função (do nível vizinho), depois o banco do próprio time, depois um jovem da base.
      // Quem acabou de ficar sem time nesta virada espera a próxima janela (nada de o mesmo time recontratar quem saiu).
      const freeOne = free.filter((entry) => entry.since !== season && Math.abs((entry.level ?? org.level) - org.level) <= 1 && fits(entry.member)).sort((left, right) => strength(right.member, org) - strength(left.member, org))[0];
      const benchOne = (benches.get(org.id) ?? []).find((entry) => fits(entry.member));
      let incoming: SceneRosterMember | null = freeOne?.member ?? benchOne?.member ?? null;
      if (freeOne) free = free.filter((entry) => entry !== freeOne);
      else if (benchOne) benches.set(org.id, (benches.get(org.id) ?? []).filter((entry) => entry !== benchOne));
      else {
        const kid = prospect(rng, coreCountryOf(org.id, current, member.country), role, year, org.level, dev, taken);
        incoming = fits(kid) ? kid : null;
      }
      if (!incoming) continue; // ninguém mantém a identidade: renova
      rosters.set(org.id, swapIn(current, member, incoming));
      free.push({ member, since: season, level: org.level });
      moves.push({ season, nick: memberNick(member), kind: 'contractEnd', orgId: org.id, orgName: org.name, swappedNick: memberNick(incoming) });
    }
  }
  return free;
}

/** Quanto a mais o reserva precisa render para tomar a vaga do titular da função. */
const RECLAIM_MARGIN = 1;
/** Chance por virada de o reserva melhor que o titular voltar ao time. */
const RECLAIM_CHANCE = 0.5;
/** Chance por virada de outro time contratar quem está no banco. */
const SIGN_CHANCE = 0.35;
/** Chance por virada de o banco virar dispensa (e depois de 2 temporadas parado, a dispensa é certa). */
const RELEASE_CHANCE = 0.25;
const RELEASE_AFTER = 2;
/** Chance por virada de um free agent achar time. */
const FA_SIGN_CHANCE = 0.45;
/** A partir dessa idade quem está sem time pendura mais cedo. */
const FA_RETIRE_AGE = 30;
/** Quantos cabem no banco de um time; quem passa disso é dispensado. */
const BENCH_LIMIT = 2;

/** Na aposentadoria, o time olha primeiro para o próprio banco e depois para os sem time da mesma função. */
function fromOutside(org: SceneOrg, roster: SceneRosterMember[], leaving: SceneRosterMember, role: string | null, benches: Map<string, BenchEntry[]>, freeAgents: BenchEntry[], moves: SceneBenchMove[], season: number): SceneRosterMember | null {
  const fits = (entry: BenchEntry) => (role ? memberRoles(entry.member)[0] === role : true) && keepsIdentity(org.id, roster, swapIn(roster, leaving, entry.member));
  const own = (benches.get(org.id) ?? []).find(fits);
  if (own) {
    benches.set(org.id, (benches.get(org.id) ?? []).filter((entry) => entry !== own));
    moves.push({ season, nick: memberNick(own.member), kind: 'promoted', orgId: org.id, orgName: org.name, swappedNick: memberNick(leaving) });
    return own.member;
  }
  const free = freeAgents.filter((entry) => Math.abs((entry.level ?? org.level) - org.level) <= 1).find(fits);
  if (!free) return null;
  moves.push({ season, nick: memberNick(free.member), kind: 'faSigned', orgId: org.id, orgName: org.name, swappedNick: memberNick(leaving) });
  return free.member;
}

/**
 * A virada do banco, com rng próprio (o mercado principal não muda de ordem): quem está no banco se aposenta, volta ao
 * time se rende mais que o titular da função, é contratado por outro time do mesmo nível ou vizinho (o titular que perde
 * a vaga vai para o banco de lá) ou é dispensado e vira free agent. O free agent acha time do mesmo jeito ou pendura.
 */
/** Regras v2: free agent desse nível é disputado (quase sempre acha time, e time de cima). */
const STAR_FREE_AGENT = 85;
const STAR_FA_SIGN_CHANCE = 0.9;

function benchMarket(seed: string, season: number, year: number, rosters: Map<string, SceneRosterMember[]>, benches: Map<string, BenchEntry[]>, freeAgents: BenchEntry[], moves: SceneBenchMove[], v2 = false): BenchEntry[] {
  const rng = createSeededRng(`${seed}:bench:${season}`);
  const ageOf = (member: SceneRosterMember) => {
    const born = memberBirthYear(member);
    return born === null ? null : year - born;
  };
  // O empurrão extra de quem está sem time só vale para quem já passou dos 30 (jovem sem time espera proposta).
  const retires = (member: SceneRosterMember, extra = 0) => {
    const age = ageOf(member);
    return age !== null && rng() < Math.min(1, npcRetireChance(age) + (age >= FA_RETIRE_AGE ? extra : 0));
  };
  /** O titular mais fraco da função no time (e se a troca mantém a identidade dele). */
  const weakestFor = (orgId: string, member: SceneRosterMember) => {
    const org = sceneOrgById.get(orgId);
    const roster = rosters.get(orgId) ?? [];
    const role = memberRoles(member)[0] ?? null;
    if (!org || roster.some((other) => sameNick(other, memberNick(member)))) return null;
    // A vaga da mesma função; se o time não tem ninguém nela, disputa com quem não tem função definida na coleta.
    const sameRole = roster.filter((other) => (role ? memberRoles(other)[0] === role : true) && !other.careerMade);
    const same = sameRole.length ? sameRole : roster.filter((other) => !memberRoles(other).length && !other.careerMade);
    const weakest = [...same].sort((left, right) => strength(left, org) - strength(right, org))[0];
    if (!weakest || strength(member, org) < strength(weakest, org) + RECLAIM_MARGIN) return null;
    return keepsIdentity(orgId, roster, swapIn(roster, weakest, member)) ? { org, roster, weakest } : null;
  };
  const bench = (orgId: string, member: SceneRosterMember) => benches.set(orgId, [...(benches.get(orgId) ?? []), { member, since: season }]);
  const signInto = (target: { org: SceneOrg; roster: SceneRosterMember[]; weakest: SceneRosterMember }, member: SceneRosterMember) => {
    rosters.set(target.org.id, swapIn(target.roster, target.weakest, member));
    bench(target.org.id, target.weakest);
    moves.push({ season, nick: memberNick(target.weakest), kind: 'benched', orgId: target.org.id, orgName: target.org.name });
  };
  let free = [...freeAgents];
  for (const org of sceneOrgs) {
    for (const entry of [...(benches.get(org.id) ?? [])]) {
      if (entry.since === season) continue; // acabou de chegar ao banco nesta virada
      const leave = () => benches.set(org.id, (benches.get(org.id) ?? []).filter((other) => other !== entry));
      if (retires(entry.member)) {
        leave();
        moves.push({ season, nick: memberNick(entry.member), kind: 'retired', orgId: org.id, orgName: org.name });
        continue;
      }
      const back = weakestFor(org.id, entry.member);
      if (back && rng() < RECLAIM_CHANCE) {
        leave();
        signInto(back, entry.member);
        moves.push({ season, nick: memberNick(entry.member), kind: 'promoted', orgId: org.id, orgName: org.name, swappedNick: memberNick(back.weakest) });
        continue;
      }
      if (rng() < SIGN_CHANCE) {
        const targets = sceneOrgs.filter((other) => other.id !== org.id && Math.abs(other.level - org.level) <= 1);
        const pickTarget = targets[Math.floor(rng() * targets.length)];
        const target = pickTarget ? weakestFor(pickTarget.id, entry.member) : null;
        if (target) {
          leave();
          signInto(target, entry.member);
          moves.push({ season, nick: memberNick(entry.member), kind: 'signed', orgId: target.org.id, orgName: target.org.name, fromId: org.id, fromName: org.name, swappedNick: memberNick(target.weakest) });
          continue;
        }
      }
      if (season - entry.since >= RELEASE_AFTER || rng() < RELEASE_CHANCE) {
        leave();
        free.push({ member: entry.member, since: season, level: org.level });
        moves.push({ season, nick: memberNick(entry.member), kind: 'released', orgId: null, orgName: null, fromId: org.id, fromName: org.name });
      }
    }
  }
  const next: BenchEntry[] = [];
  for (const entry of free) {
    if (entry.since === season) {
      next.push(entry);
      continue;
    }
    // Sem time pendura mais cedo (e quem ficou 2 temporadas sem proposta, mais ainda).
    if (retires(entry.member, season - entry.since >= RELEASE_AFTER ? 0.3 : 0.1)) {
      moves.push({ season, nick: memberNick(entry.member), kind: 'retired', orgId: null, orgName: null });
      continue;
    }
    const star = v2 && (entry.member.overall ?? memberCatalogOverall(entry.member) ?? 0) >= STAR_FREE_AGENT;
    if (rng() < (star ? STAR_FA_SIGN_CHANCE : FA_SIGN_CHANCE)) {
      const level = entry.level ?? 3;
      // Estrela sem time: os times de cima (do nível dele para cima) disputam; o primeiro em que ele é titular leva.
      const targets = star ? sceneOrgs.filter((org) => org.level <= level + 1) : sceneOrgs.filter((org) => Math.abs(org.level - level) <= 1);
      const order = star ? [...targets].map((org) => ({ org, roll: rng() })).sort((left, right) => left.org.level - right.org.level || left.roll - right.roll).map((item) => item.org) : [];
      const pickTarget = star ? undefined : targets[Math.floor(rng() * targets.length)];
      const target = star ? order.map((org) => weakestFor(org.id, entry.member)).find(Boolean) ?? null : pickTarget ? weakestFor(pickTarget.id, entry.member) : null;
      if (target) {
        signInto(target, entry.member);
        moves.push({ season, nick: memberNick(entry.member), kind: 'faSigned', orgId: target.org.id, orgName: target.org.name, swappedNick: memberNick(target.weakest) });
        continue;
      }
    }
    next.push(entry);
  }
  // Banco cheio (depois de todas as contratações da virada, que mandam o titular que perdeu a vaga para o banco): quem
  // está lá há mais tempo é dispensado.
  for (const org of sceneOrgs) {
    const crowd = benches.get(org.id) ?? [];
    if (crowd.length <= BENCH_LIMIT) continue;
    const out = [...crowd].sort((left, right) => left.since - right.since).slice(0, crowd.length - BENCH_LIMIT);
    benches.set(org.id, crowd.filter((entry) => !out.includes(entry)));
    for (const entry of out) {
      next.push({ member: entry.member, since: season, level: org.level });
      moves.push({ season, nick: memberNick(entry.member), kind: 'released', orgId: null, orgName: null, fromId: org.id, fromName: org.name });
    }
  }
  return next;
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
        // A cena sem nascimento nem função (k0gaSs na Spirit Academy, do ranking da HLTV): vale a da promessa curada,
        // senão o garoto não tem idade para crescer.
        const curated: SceneRosterMember = {
          ...member,
          birthDate: member.birthDate ?? curatedBirthDate(kid, year),
          roles: member.roles.length ? member.roles : [kid.role],
          prospect: true,
          curated: true,
          ...(kid.hltv ? { hltv: kid.hltv } : {})
        };
        dev.set(memberKey(curated), { overall: current?.overall ?? kid.overall, potential: Math.max(current?.overall ?? kid.overall, low + Math.round(rng() * (high - low))), rate: kid.developmentRate });
        return curated;
      }));
      continue;
    }
    const age = kid.age + (year - 2026);
    const member: SceneRosterMember = { nick: kid.nick, country: kid.country, birthDate: curatedBirthDate(kid, year), roles: [kid.role], catalogBaseId: null, prospect: true, curated: true, ...(kid.hltv ? { hltv: kid.hltv } : {}) };
    // Sai o mais fraco da função cujo lugar a promessa pode ocupar sem o time perder a identidade.
    const outIn = (org: SceneOrg): SceneRosterMember | undefined => {
      const roster = rosters.get(org.id) ?? [];
      const sameRole = roster.filter((other) => memberRoles(other)[0] === kid.role);
      const options = (sameRole.length ? sameRole : roster).filter((other) => !isCurated(other));
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
  return { transfers: world.transfers, retirements: world.retirements, debuts: world.debuts, benchMoves: world.benchMoves };
};

/** O banco do time na temporada (fora dos 5 titulares), com o overall da temporada. */
export const benchIn = (seed: string, season: number, orgId: string): BenchEntry[] => sceneWorld(seed, season).benches.get(sceneOrgById.get(orgId)?.id ?? orgId) ?? [];

/** O contrato do jogador do mundo na temporada (até quando e com que time), ou null se ele não é titular. */
export const npcContractIn = (seed: string, season: number, member: SceneRosterMember): NpcContract | null => sceneWorld(seed, season).contracts.get(memberKey(member)) ?? null;

/** Quem está sem time na temporada (dispensados à espera de proposta). */
export const freeAgentsIn = (seed: string, season: number): BenchEntry[] => sceneWorld(seed, season).freeAgents;

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

/**
 * O time na temporada N como o circuito do mundo e o ranking o veem: o elenco da seed (com o desgaste de veterano), sem
 * as trocas das suas vagas. Assim o campeão de um campeonato do mundo depende só da seed e dos seus resultados, nunca
 * da ordem em que as vagas foram registradas na página.
 */
export function worldOrgIn(seed: string, season: number, orgId: string): SceneOrg | undefined {
  const org = sceneOrgById.get(orgId);
  if (!org) return undefined;
  const roster = withVeteranGap(season, sceneWorld(seed, season).rosters).get(org.id) ?? org.roster;
  const start = topFive(org.roster, org);
  const now = topFive(roster, org);
  const power = org.power === undefined || season <= 1 || start === null || now === null ? org.power : Math.round((org.power + (now - start)) * 10) / 10;
  return { ...org, roster, season, ...(power !== undefined ? { power } : {}) };
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
      list.push({ nick: memberNick(member), age: year - born, overall: member.overall, delta: before === undefined ? 0 : member.overall - before, orgId: org.id, orgName: org.name, curated: isCurated(member) });
    }
  }
  return list.sort((a, b) => Number(b.curated) - Number(a.curated) || b.overall - a.overall || b.delta - a.delta).slice(0, limit);
}

/** Quem estreou vindo da base real na virada para a temporada N. */
export const sceneDebuts = (seed: string, season: number): SceneDebut[] => (season <= 1 ? [] : sceneWorld(seed, season).debuts);

