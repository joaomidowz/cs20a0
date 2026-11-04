// src/lib/game/playerCareer/engine.ts
// Motor do modo Carreira de Jogador (RPG): criação, temporadas na pirâmide real (lan house → GC/CCT → tier 2 →
// Major), mercado de ofertas, envelhecimento pelo motor calibrado (career/aging.ts) e veredito de aposentadoria.
// Assimetrias de função seguem o desenho do artifact (AWPer rating alto/oscila; IGL rating menor mas time mais
// forte) e os pesos do worldGen. Tudo determinístico por seed da carreira.
import { createSeededRng } from '../simulation';
import { applyAging, type AgingEntity } from '../career/aging';
import { calibration, memberNick, memberRoles, ORG_BASE_POWER, sceneOrgById, sceneOrgs, type SceneOrg } from './data';

export type PlayerRole = 'awper' | 'rifler' | 'entry' | 'igl' | 'lurker' | 'support';

/** Origem do jogador criado: define idade de entrada, começo, teto e ritmo — a distribuição de desfechos
 *  (flop no C/B, salto pro tier 1, pico GOAT) é medida por simulação em playerCareerSimulation.test.ts. */
export type PlayerArchetype = 'prodigio' | 'talento-bruto' | 'solido' | 'tardio';

export interface ArchetypeMeta {
  label: string;
  blurb: string;
  entryAge: [number, number];
  startOverall: [number, number];
  potential: [number, number];
  devRate: [number, number];
}

export const ARCHETYPES: Record<PlayerArchetype, ArchetypeMeta> = {
  prodigio: {
    label: 'Prodígio',
    blurb: 'Entra aos 16 chamando atenção. Teto de estrela, mas é quem mais trava se não entregar.',
    entryAge: [16, 16], startOverall: [65, 70], potential: [86, 97], devRate: [0.85, 1.3]
  },
  'talento-bruto': {
    label: 'Talento bruto',
    blurb: 'Chega cru e longe do topo. Pode explodir mais tarde.',
    entryAge: [16, 17], startOverall: [57, 62], potential: [80, 94], devRate: [0.85, 1.25]
  },
  solido: {
    label: 'Player sólido',
    blurb: 'Carreira estável no circuito. Chegar ao tier 1 é raro.',
    entryAge: [17, 18], startOverall: [64, 69], potential: [70, 82], devRate: [0.9, 1.05]
  },
  tardio: {
    label: 'Estreia tardia',
    blurb: 'Chega mais velho e pronto. Janela curta: sobe logo ou fica no challenger.',
    entryAge: [19, 20], startOverall: [68, 73], potential: [76, 90], devRate: [1.0, 1.15]
  }
};

/** Trade-offs de função: viés de rating, oscilação e o quanto carrega o time (filosofia do artifact + ROLE_WEIGHTS). */
export const ROLE_META: Record<PlayerRole, { label: string; ratingBias: number; variance: number; teamImpact: number; blurb: string }> = {
  awper: { label: 'AWPer', ratingBias: 0.08, variance: 0.16, teamImpact: 0, blurb: 'Rating alto, oscila mais. Carrega o time nos dias bons.' },
  rifler: { label: 'Rifler', ratingBias: 0.02, variance: 0.08, teamImpact: 0, blurb: 'Duelo em qualquer distância. Joga onde o time precisar.' },
  entry: { label: 'Entry fragger', ratingBias: -0.05, variance: 0.10, teamImpact: 0, blurb: 'Abre os bombs. Morre primeiro, rating mais baixo.' },
  igl: { label: 'IGL', ratingBias: -0.10, variance: 0.07, teamImpact: 3, blurb: 'Faz a call. Rating menor, time bem mais forte.' },
  lurker: { label: 'Lurker', ratingBias: 0.0, variance: 0.05, teamImpact: 0, blurb: 'Joga sozinho no outro lado do mapa. Consistente.' },
  support: { label: 'Suporte', ratingBias: -0.04, variance: 0.06, teamImpact: 1, blurb: 'Flash, smoke e trade. Pouco holofote, muito título.' }
};


export interface TournamentResult {
  name: string;
  placement: string; // Estreia · Quartas · Semis · Vice · Campeão
  rating: number; // rating do kill feed real do motor (Rating 3.0)
  seriesWins: number;
  seriesLosses: number;
}

/** Um campeonato da temporada, disputado um a um no motor de Major. */
export interface CalendarEntry {
  index: number;
  name: string;
  status: 'UPCOMING' | 'PLAYED';
  result?: TournamentResult;
}

/** O que o save guarda de um evento em andamento: a chave e as séries já fechadas (rebuild determinístico). */
export interface LiveEventSave {
  eventIndex: number;
  played: Record<string, unknown>;
}

/** Atributos que o treino entre campeonatos pode acumular de bônus (efeitos da Dinastia, dynasty/training.ts). */
export type TrainedAttribute = 'firepower' | 'support' | 'clutch' | 'entry' | 'mental' | 'consistency' | 'igl' | 'awp';
export type TrainedBonus = Partial<Record<TrainedAttribute, number>>;

export interface CareerOffer {
  orgId: string;
  orgName: string;
  orgLevel: number;
  salaryUsd: number;
}

/** Corte ou proposta no meio da temporada, esperando a sua decisão. */
export interface PendingMove {
  kind: 'cut' | 'poach';
  /** Média de rating dos últimos campeonatos que motivou a mudança. */
  average: number;
  reason: string;
  offers: CareerOffer[];
}

export interface SeasonLog {
  seasonNumber: number;
  year: number;
  orgId: string;
  orgName: string;
  orgLevel: number;
  tournaments: TournamentResult[];
  seasonRating: number;
  overallBefore: number;
  overallAfter: number;
  titles: number;
  injury: string | null;
  agingNote: string | null;
  /** Trocas de time durante a temporada (cortes, propostas aceitas). */
  moves?: string[];
}

export interface CareerVerdict {
  seasons: number;
  titles: number;
  bestOverall: number;
  topOrgName: string | null;
  topOrgLevel: number;
  bestSeasonRating: number;
  line: string;
}

export interface SeatTaken { orgId: string; orgName: string; nick: string; viaRole: boolean }

export interface StartingOption {
  orgId: string; // 'lan-house' ou id real da cena
  name: string;
  level: number;
  country: string | null;
  density: number;
  rosterPreview: string[];
  seat: SeatTaken | null; // vaga que você toma ao assinar (só nos times reais)
  kind: 'real' | 'lan-house';
}

export interface PlayerCareerState {
  version: 1;
  seed: string;
  nick: string;
  country: string;
  role: PlayerRole;
  archetype: PlayerArchetype;
  age: number;
  overall: number;
  truePotential: number;
  developmentRate: number;
  orgId: string; // 'lan-house' até o primeiro contrato
  /** True depois do primeiro sorteio consumido (mesmo quem ficou na lan house) — o sorteio nunca reabre. */
  drawDone: boolean;
  seasonNumber: number;
  year: number;
  history: SeasonLog[];
  calendar: CalendarEntry[] | null;
  liveEvent: LiveEventSave | null;
  pendingDraw: StartingOption[] | null;
  seatsTaken: SeatTaken[];
  pendingOffers: CareerOffer[] | null;
  /** Como jogar a temporada: todos ao vivo, 1 a cada 2 (o outro simulado) ou simular até a final. */
  playMode?: 'all' | 'every2' | 'finals';
  /** Moral 0-100 (60 = normal): puxa o Mental da sua carta pra cima ou pra baixo. */
  morale?: number;
  /** Forma −3..+3: vale só no próximo campeonato (overall em quadra) e zera depois dele. */
  form?: number;
  /** Seguidores (stream, vídeos, entrevistas). */
  fame?: number;
  /** Conversas com o coach na janela atual (até 3) e o que ele indicou treinar. */
  coachTalk?: { window: string; count: number; tips: TrainedAttribute[] };
  /** Corte ou proposta esperando decisão (entre campeonatos). */
  pendingMove?: PendingMove | null;
  /** Trocas de time da temporada em andamento (vão para o SeasonLog). */
  seasonMoves?: string[];
  /** Fim de temporada ruim: a org não renova (sem "Ficar" na janela de mercado). */
  released?: boolean;
  /** Relacionamento (0-100) com cada parceiro, por id estável (org:função) — sinergia do elenco. */
  relationships: Record<string, number>;
  /** Conversas desta janela entre campeonatos (zera quando um evento é jogado). */
  talks: Record<string, number>;
  /** Bônus acumulado de treino por atributo (aplicado por cima da carta derivada do overall). */
  trained: TrainedBonus;
  /** Janela (temporada:evento) do último treino — um treino por janela. */
  trainedWindow: string | null;
  /** Treinos feitos na carreira: a cada 3, overall +1 (se abaixo do teto). */
  trainCount: number;
  status: 'ACTIVE' | 'RETIRED';
  verdict: CareerVerdict | null;
}

const LAN_HOUSE = { id: 'lan-house', name: 'Lan House do Bairro', level: 5 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Eventos por temporada conforme o nível — densidade REAL: tier baixo joga muito mais (Alka 2026: 9). */
export const eventsFor = (orgId: string): number => {
  const org = sceneOrgById.get(orgId);
  if (!org) return 6; // lan house: o grind mensal do circuito
  if (org.level === 4) return clamp(org.calendarDensity || 8, 7, 9);
  return ({ 1: 4, 2: 5, 3: 6 })[org.level] ?? 6;
};

/** Valor de mercado do jogador pela fórmula de valuation do jogo (dinastia): 50k×1.09^(ovr−60), piso 30k. */
export const marketValueUsd = (overall: number) => Math.max(30_000, Math.round((50_000 * Math.pow(1.09, overall - 60)) / 1000) * 1000);

/** Quem você desloca ao assinar: o jogador da SUA função no elenco real; sem função casada, o primeiro genérico. */
export function seatToTake(org: SceneOrg, role: PlayerRole): SeatTaken {
  // Função da coleta ou, se ela veio vazia, a do catálogo do jogo (ZywOo é AWPer mesmo sem role na Liquipedia).
  const byRole = org.roster.find((member) => memberRoles(member)[0] === role) ?? org.roster.find((member) => memberRoles(member).includes(role));
  const generic = org.roster.find((member) => !memberRoles(member).length);
  const chosen = byRole ?? generic ?? org.roster[0];
  return { orgId: org.id, orgName: org.name, nick: chosen ? memberNick(chosen) : 'a definir', viaRole: Boolean(byRole) };
}

/** Sorteio inicial: 3 orgs reais do nível CCT/GC (preferindo o país do jogador) + a opção Lan House. */
export function drawStartingOptions(seed: string, country: string, role: PlayerRole): StartingOption[] {
  const rng = createSeededRng(`${seed}:draw`);
  const level4 = sceneOrgs.filter((org) => org.level === 4);
  const sameCountry = level4.filter((org) => org.country?.toLowerCase() === country.toLowerCase());
  const pool = sameCountry.length >= 3 ? sameCountry : [...sameCountry, ...level4.filter((org) => !sameCountry.includes(org))];
  const picked: SceneOrg[] = [];
  while (picked.length < 3 && picked.length < pool.length) {
    const candidate = pool[Math.floor(rng() * pool.length)];
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  const options: StartingOption[] = picked.map((org) => ({
    orgId: org.id,
    name: org.name,
    level: org.level,
    country: org.country,
    density: eventsFor(org.id),
    rosterPreview: org.roster.slice(0, 5).map((member) => memberNick(member)),
    seat: seatToTake(org, role),
    kind: 'real'
  }));
  options.push({
    orgId: LAN_HOUSE.id,
    name: LAN_HOUSE.name,
    level: LAN_HOUSE.level,
    country: country,
    density: eventsFor(LAN_HOUSE.id),
    rosterPreview: [],
    seat: null,
    kind: 'lan-house'
  });
  return options;
}

export function createPlayerCareer(input: { nick: string; country: string; role: PlayerRole; archetype?: PlayerArchetype; seed?: string }): PlayerCareerState {
  const seed = input.seed ?? `pc-${Date.now().toString(36)}`;
  const rng = createSeededRng(`${seed}:create`);
  const archetype = input.archetype ?? 'prodigio';
  const meta = ARCHETYPES[archetype];
  const roll = ([min, max]: [number, number]) => min + Math.floor(rng() * (max - min + 1));
  const rollFraction = ([min, max]: [number, number]) => min + rng() * (max - min);
  return {
    version: 1,
    seed,
    nick: input.nick.trim().slice(0, 16) || 'cascavel',
    country: input.country,
    role: input.role,
    archetype,
    age: roll(meta.entryAge),
    overall: roll(meta.startOverall), // ninguém nasce pronto; o arquétipo define o começo
    truePotential: roll(meta.potential), // o teto é oculto e a carreira revela
    developmentRate: Number(rollFraction(meta.devRate).toFixed(2)),
    orgId: LAN_HOUSE.id,
    drawDone: false,
    seasonNumber: 1,
    year: 2026,
    history: [],
    calendar: null,
    liveEvent: null,
    pendingDraw: drawStartingOptions(seed, input.country, input.role),
    seatsTaken: [],
    relationships: {},
    talks: {},
    trained: {},
    trainedWindow: null,
    trainCount: 0,
    morale: 60,
    form: 0,
    fame: 0,
    pendingOffers: null,
    status: 'ACTIVE',
    verdict: null
  };
}

/** Assina com uma das opções do sorteio (ou fica na lan house) e toma a vaga da sua função. */
export function chooseStartingOrg(state: PlayerCareerState, orgId: string): PlayerCareerState {
  const option = state.pendingDraw?.find((candidate) => candidate.orgId === orgId);
  if (!option) return state;
  return {
    ...state,
    orgId: option.orgId,
    pendingDraw: null,
    drawDone: true,
    seatsTaken: option.seat ? [option.seat] : []
  };
}

/** Saves antigos (sem sorteio) voltam ao sorteio apenas se a carreira de fato não começou — assinado,
 *  com temporada aberta ou evento em andamento NUNCA reabre o sorteio (o reload não apaga a escolha). */
export function ensureDraw(state: PlayerCareerState): PlayerCareerState {
  // Sorteio pendente junto de temporada/evento/histórico é resíduo do bug do reload: a escolha já foi feita.
  if (state.pendingDraw && (state.calendar || state.liveEvent || state.history.length)) {
    return { ...state, pendingDraw: null };
  }
  if (state.pendingDraw || state.history.length || state.status !== 'ACTIVE') return state;
  if (state.drawDone || state.calendar || state.liveEvent || state.seatsTaken.length) return state;
  return { ...state, pendingDraw: drawStartingOptions(state.seed, state.country, state.role) };
}

export const orgOf = (orgId: string) => (orgId === LAN_HOUSE.id ? LAN_HOUSE : sceneOrgById.get(orgId) ?? { id: orgId, name: orgId, level: 5 });

const tournamentNameFor = (index: number, level: number, total: number) => {
  if (level >= 4) return index % 2 === 0 ? `Circuito GC/CCT · Etapa ${index + 1}` : `CCT South America · Series ${index + 1}`;
  if (level === 3) return `Challenger/Contenders · Etapa ${index + 1}`;
  if (level === 2) return `Tier 2 Invite · Etapa ${index + 1}`;
  return index === total - 1 ? 'MAJOR' : `Tier 1 Invitational · Etapa ${index + 1}`;
};

/** Abre a temporada: calendário com a densidade real do nível — cada campeonato disputado no motor de Major. */
export function startSeason(state: PlayerCareerState): PlayerCareerState {
  if (state.status !== 'ACTIVE' || state.pendingDraw || state.calendar) return state;
  const count = eventsFor(state.orgId);
  const calendar: CalendarEntry[] = Array.from({ length: count }, (_, index) => ({
    index,
    name: tournamentNameFor(index, orgOf(state.orgId).level, count),
    status: 'UPCOMING'
  }));
  return { ...state, calendar };
}

/** Registra o resultado de um campeonato jogado no motor (rating vem do kill feed real). */
export function recordEventResult(state: PlayerCareerState, index: number, result: TournamentResult): PlayerCareerState {
  if (!state.calendar) return state;
  const calendar = state.calendar.map((entry) => (entry.index === index ? { ...entry, status: 'PLAYED' as const, result } : entry));
  // Campeonato jogado: a janela de conversas fecha, o treino libera de novo.
  // A forma da semana valia só para este campeonato.
  return { ...state, calendar, liveEvent: null, talks: {}, form: 0 };
}

/** Fecha a temporada: lesão, aging calibrado e janela de mercado. */
export function finishSeason(state: PlayerCareerState): PlayerCareerState {
  if (state.status !== 'ACTIVE' || !state.calendar || state.calendar.some((entry) => entry.status !== 'PLAYED')) return state;
  const rng = createSeededRng(`${state.seed}:season:${state.seasonNumber}`);
  const org = orgOf(state.orgId);
  const results = state.calendar.flatMap((entry) => (entry.result ? [entry.result] : []));
  const titles = results.filter((result) => result.placement === 'Campeão').length;
  const seasonRating = results.length ? Number((results.reduce((sum, result) => sum + result.rating, 0) / results.length).toFixed(2)) : 0.9;

  // Lesão (Fase 5 em versão mínima): ~10%/temporada, contundiu no meio do calendário.
  const injured = rng() < 0.1;
  const injury = injured ? (rng() < 0.5 ? 'Tendinite no punho' : 'Lombalgia') : null;

  const before = state.overall;
  const aged = applyAging({
    entity: { id: `${state.seed}:me`, age: state.age, overall: state.overall, truePotential: state.truePotential, developmentRate: state.developmentRate, runRating: seasonRating - (injured ? 0.03 : 0) },
    calibration,
    seasonKey: `${state.seed}:season:${state.seasonNumber}`
  });
  const eventNote = aged.events[0];
  const agingNote = eventNote
    ? eventNote.type === 'GROWTH' ? `Evoluiu para ${eventNote.to} de overall`
      : eventNote.type === 'DECLINE' ? `Caiu para ${eventNote.to} de overall`
      : eventNote.type === 'PLATEAU' ? 'Manteve o nível' : 'Pendurou o mouse'
    : null;

  const log: SeasonLog = {
    seasonNumber: state.seasonNumber,
    year: state.year,
    orgId: org.id,
    orgName: org.name,
    orgLevel: org.level,
    tournaments: results,
    seasonRating,
    overallBefore: before,
    overallAfter: aged.entity.overall,
    titles,
    injury,
    agingNote,
    ...(state.seasonMoves?.length ? { moves: state.seasonMoves } : {})
  };

  const offers = buildOffers(state, seasonRating, titles, rng);
  // Temporada ruim sem título numa org real: não renovam. Sem "Ficar"; sobram as ofertas ou a Lan House.
  const released = org.id !== LAN_HOUSE.id && titles === 0 && seasonRating < decentRatingFor(state.role, org.level) - 0.12;
  return {
    ...state,
    age: aged.entity.age,
    overall: aged.entity.overall,
    seasonNumber: state.seasonNumber + 1,
    year: state.year + 1,
    history: [...state.history, log],
    calendar: null,
    pendingOffers: offers.length ? offers : released ? [] : null,
    pendingMove: null,
    seasonMoves: [],
    released
  };
}

function offerFrom(candidate: SceneOrg, state: PlayerCareerState, bump = 0): CareerOffer {
  return {
    orgId: candidate.id,
    orgName: candidate.name,
    orgLevel: candidate.level,
    salaryUsd: Math.round(Math.max(400, marketValueUsd(state.overall) * (0.08 + candidate.level * 0.02) * (1 + bump)))
  };
}

/** Rating esperado no nível: sobe com o circuito e acompanha o viés da função (entry/IGL rendem menos). */
export const decentRatingFor = (role: PlayerRole, level: number) => (({ 1: 0.97, 2: 0.95, 3: 0.93, 4: 0.90, 5: 0.90 })[level] ?? 0.93) + ROLE_META[role].ratingBias;
/** Régua de estrela para subir ao nível: degrau por degrau, a porta do tier 1 é a mais dura. */
export const starRatingFor = (role: PlayerRole, targetLevel: number) => (({ 4: 1.0, 3: 1.06, 2: 1.12, 1: 1.22 })[targetLevel] ?? 1.12) + ROLE_META[role].ratingBias;

function buildOffers(state: PlayerCareerState, seasonRating: number, titles: number, rng: () => number): CareerOffer[] {
  const org = orgOf(state.orgId);
  const isLanHouse = org.id === LAN_HOUSE.id;
  const decentFor = (level: number) => decentRatingFor(state.role, level);
  const decent = seasonRating >= decentFor(org.level) || titles >= 1;
  // A subida é DEGRAU por degrau e a régua cresce E acompanha a função (1.15 de entry ≠ 1.15 de AWPer).
  // A porta do tier 1 (2→1) é a mais dura: só pico alto sustenta a régua — lógica de VRS/ambiência.
  const starBarFor = (targetLevel: number) => starRatingFor(state.role, targetLevel);
  const offers: CareerOffer[] = [];
  const takeFrom = (pool: SceneOrg[], bump = 0, tries = 4) => {
    for (let i = 0; i < tries && offers.length < 3; i += 1) {
      const candidate = pool[Math.floor(rng() * pool.length)];
      if (!candidate || candidate.id === org.id || offers.some((offer) => offer.orgId === candidate.id)) continue;
      offers.push(offerFrom(candidate, state, bump));
    }
  };

  if (isLanHouse) {
    // Caminho pra fora do circuito amador: brilhou na lan house → CCT/GC assina.
    if (titles >= 1 || seasonRating >= starBarFor(4)) takeFrom(sceneOrgs.filter((candidate) => candidate.level === 4), 0.04, 6);
    return offers;
  }
  const target = org.level - 1;
  const upgrades = target >= 1 ? sceneOrgs.filter((candidate) => candidate.level === target) : [];
  const laterals = sceneOrgs.filter((candidate) => candidate.level === org.level && candidate.id !== org.id);
  const downgrades = sceneOrgs.filter((candidate) => candidate.level > org.level && candidate.level <= 4);
  // Título abre a porta de saída do C/B (campeão de CCT chama atenção); acima disso, só a régua de rating.
  const starred = seasonRating >= starBarFor(target) || (org.level >= 3 && titles >= 3);
  if (starred) takeFrom(upgrades, 0.04, 6);
  if (decent || starred) takeFrom(laterals, 0, 3);
  if (seasonRating < decentFor(org.level) - 0.08) takeFrom(downgrades, 0, 2); // ano ruim: porta de saída pra não travar.
  return offers;}

export function acceptOffer(state: PlayerCareerState, orgId: string): PlayerCareerState {
  const offer = state.pendingOffers?.find((candidate) => candidate.orgId === orgId);
  if (!offer) return state;
  const org = sceneOrgById.get(orgId);
  const seat = org ? seatToTake(org, state.role) : null;
  return { ...state, orgId, pendingOffers: null, ...(seat ? { seatsTaken: [...state.seatsTaken, seat] } : {}) };
}

export function stayAtOrg(state: PlayerCareerState): PlayerCareerState {
  if (state.released) return state;
  return { ...state, pendingOffers: null };
}

/** Dispensado (ou por escolha): volta a grindar na lan house. */
export function goToLanHouse(state: PlayerCareerState): PlayerCareerState {
  const from = orgOf(state.orgId).name;
  return { ...state, orgId: LAN_HOUSE.id, pendingOffers: null, released: false, seasonMoves: [...(state.seasonMoves ?? []), `${from} → Lan House`] };
}

/** Média dos últimos campeonatos jogados na temporada (os mais recentes pesam a decisão do time). */
export function recentRating(state: PlayerCareerState, last = 3): { average: number; played: number } | null {
  const played = (state.calendar ?? []).filter((entry) => entry.result);
  if (!played.length) return null;
  const recent = played.slice(-last);
  return { average: Number((recent.reduce((sum, entry) => sum + (entry.result?.rating ?? 0), 0) / recent.length).toFixed(2)), played: played.length };
}

/**
 * Depois de cada campeonato (com mais pela frente): o time pode te cortar se a fase está ruim e o clima pesa,
 * e um time de cima pode te chamar se você está voando. Seeded: a mesma carreira, a mesma decisão.
 */
export function midSeasonCheck(state: PlayerCareerState, relationshipAverage = 55): PlayerCareerState {
  const org = orgOf(state.orgId);
  if (state.status !== 'ACTIVE' || state.pendingMove || org.id === LAN_HOUSE.id || !state.calendar) return state;
  if (!state.calendar.some((entry) => entry.status === 'UPCOMING')) return state;
  const recent = recentRating(state);
  if (!recent || recent.played < 2) return state;
  const rng = createSeededRng(`${state.seed}:move:${state.seasonNumber}:${recent.played}`);
  const decent = decentRatingFor(state.role, org.level);
  const pickFrom = (pool: SceneOrg[], count: number, bump: number): CareerOffer[] => {
    const offers: CareerOffer[] = [];
    for (let tries = 0; tries < count * 3 && offers.length < count; tries += 1) {
      const candidate = pool[Math.floor(rng() * pool.length)];
      if (!candidate || candidate.id === org.id || offers.some((offer) => offer.orgId === candidate.id)) continue;
      offers.push(offerFrom(candidate, state, bump));
    }
    return offers;
  };
  const morale = state.morale ?? 60;
  const struggling = recent.average < decent - 0.10;
  const tense = morale < 50 || relationshipAverage < 45 || recent.average < decent - 0.18;
  if (struggling && tense && rng() < 0.55) {
    const laterals = sceneOrgs.filter((candidate) => candidate.level === org.level && candidate.id !== org.id);
    const lower = sceneOrgs.filter((candidate) => candidate.level > org.level && candidate.level <= 4);
    const offers = [...pickFrom(laterals, 1, -0.05), ...pickFrom(lower.length ? lower : laterals, 2, 0)];
    return {
      ...state,
      pendingMove: {
        kind: 'cut',
        average: recent.average,
        reason: `Média ${recent.average.toFixed(2)} nos últimos ${Math.min(3, recent.played)} campeonatos. O ${org.name} esperava ${decent.toFixed(2)}.`,
        offers
      }
    };
  }
  const target = org.level - 1;
  if (target >= 1 && recent.average >= starRatingFor(state.role, target) && rng() < 0.4) {
    const offers = pickFrom(sceneOrgs.filter((candidate) => candidate.level === target), 1, 0.06);
    if (offers.length) {
      return {
        ...state,
        pendingMove: {
          kind: 'poach',
          average: recent.average,
          reason: `Média ${recent.average.toFixed(2)} nos últimos ${Math.min(3, recent.played)} campeonatos chamou atenção.`,
          offers
        }
      };
    }
  }
  return state;
}

/** Troca de time no meio da temporada: os jogados ficam, os que faltam viram o calendário da org nova. */
function moveMidSeason(state: PlayerCareerState, orgId: string, note: string): PlayerCareerState {
  const calendar = state.calendar ?? [];
  const played = calendar.filter((entry) => entry.status === 'PLAYED');
  const remainingShare = calendar.length ? (calendar.length - played.length) / calendar.length : 1;
  const level = orgOf(orgId).level;
  const remaining = Math.max(1, Math.round(eventsFor(orgId) * remainingShare));
  const total = played.length + remaining;
  const next: CalendarEntry[] = Array.from({ length: remaining }, (_, offset) => {
    const index = played.length + offset;
    return { index, name: tournamentNameFor(index, level, total), status: 'UPCOMING' as const };
  });
  const target = sceneOrgById.get(orgId);
  const seat = target ? seatToTake(target, state.role) : null;
  return {
    ...state,
    orgId,
    calendar: [...played, ...next],
    liveEvent: null,
    pendingMove: null,
    seasonMoves: [...(state.seasonMoves ?? []), note],
    ...(seat ? { seatsTaken: [...state.seatsTaken, seat] } : {})
  };
}

/** Aceita a oferta do corte/proposta (ou 'lan-house' quando cortado). */
export function acceptMove(state: PlayerCareerState, orgId: string): PlayerCareerState {
  const move = state.pendingMove;
  if (!move) return state;
  const from = orgOf(state.orgId).name;
  if (orgId === LAN_HOUSE.id) {
    if (move.kind !== 'cut') return state;
    return moveMidSeason(state, LAN_HOUSE.id, `Cortado do ${from} → Lan House`);
  }
  const offer = move.offers.find((candidate) => candidate.orgId === orgId);
  if (!offer) return state;
  return moveMidSeason(state, orgId, `${move.kind === 'cut' ? 'Cortado do' : 'Saiu do'} ${from} → ${offer.orgName}`);
}

/** Recusa a proposta de um time de cima: o elenco atual gosta (moral +4). Corte não dá pra recusar. */
export function declineMove(state: PlayerCareerState): PlayerCareerState {
  if (!state.pendingMove || state.pendingMove.kind !== 'poach') return state;
  return { ...state, pendingMove: null, morale: Math.min(100, (state.morale ?? 60) + 4) };
}

export function retire(state: PlayerCareerState): PlayerCareerState {
  if (state.status === 'RETIRED') return state;
  const best = state.history.reduce((acc, log) => (log.seasonRating > acc ? log.seasonRating : acc), 0);
  const topLog = state.history.reduce<SeasonLog | null>((acc, log) => (!acc || log.orgLevel < acc.orgLevel ? log : acc), null);
  const titles = state.history.reduce((sum, log) => sum + log.titles, 0);
  const bestOverall = Math.max(state.overall, ...state.history.map((log) => log.overallAfter));
  const line = topLog && topLog.orgLevel <= 1
    ? 'Do lan house ao Major: carreira de filme.'
    : topLog && topLog.orgLevel <= 2 ? 'Pisou no tier 1 e deixou nome.' : topLog && topLog.orgLevel <= 3 ? 'Carreira sólida no circuito challenger.' : 'Guerreiro do circuito. O bairro se lembra.';
  return {
    ...state,
    status: 'RETIRED',
    pendingOffers: null,
    verdict: { seasons: state.history.length, titles, bestOverall, topOrgName: topLog?.orgName ?? null, topOrgLevel: topLog?.orgLevel ?? 9, bestSeasonRating: best, line }
  };
}

/** Elenco da org envelhecido deterministicamente até a temporada atual (para exibir o mundo girando). */
export function agedRosterPreview(orgId: string, seasons: number): Array<{ nick: string; age: number | null; overall: number | null }> {
  const org = sceneOrgById.get(orgId);
  if (!org) return [];
  const entities: AgingEntity[] = org.roster
    .filter((member) => member.birthDate)
    .map((member) => ({
      id: member.nick,
      age: 2026 - Number(member.birthDate!.slice(0, 4)),
      overall: ORG_BASE_POWER[org.level] ?? 60
    }));
  let current = entities;
  for (let season = 1; season <= seasons; season += 1) {
    const result = advanceRosterLight(current, `${org.id}:season:${season}`);
    current = result;
  }
  return current.map((entity) => ({ nick: entity.id, age: entity.age, overall: entity.overall }));
}

function advanceRosterLight(entities: AgingEntity[], seasonKey: string): AgingEntity[] {
  return entities.map((entity) => applyAging({ entity, calibration, seasonKey }).entity);
}
