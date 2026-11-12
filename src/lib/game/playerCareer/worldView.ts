// src/lib/game/playerCareer/worldView.ts
// A tela Mundo em dados puros: até onde a sua temporada já andou (o relógio), os resultados do circuito do mundo sem
// spoiler, os campeonatos de Major, Tier S e Tier A, o ranking de times, as trocas da temporada e o top de jogadores
// parcial. O componente CareerWorld.svelte só desenha o que sai daqui. Nada aqui simula: só lê o cache do circuito.
import { MONTH_LABEL, TIER_LABEL, type EventTier, type Region } from './calendar';
import { circuitClock, worldEventsOf, worldResult, type CircuitClock, type WorldEvent, type WorldEventResult } from './circuit';
import { sceneOrgById, sceneOrgs } from './data';
import { evpsOf, orgOf, type PlayerCareerState, type TournamentResult } from './engine';
import { teamRanking, type RankedTeam } from './ranking';
import { teamTierTitle, type TeamTier } from './tiers';
import { seatMovesOf, worldHistory, yearOfSeason } from './world';

export type CareerClock = CircuitClock;

/**
 * Até onde o mundo já andou: o relógio do circuito (circuit.ts circuitClock), o mês anterior ao seu próximo campeonato.
 * É o mesmo relógio que o circuito usa para calcular os campeonatos do mundo, então a tela nunca mostra (nem espera)
 * resultado que o circuito ainda não alcançou. Sem calendário, o fim da temporada anterior (ou o mês 0 da primeira);
 * tudo jogado, 12.
 */
export const careerClock = (state: Pick<PlayerCareerState, 'seasonNumber' | 'calendar' | 'history'>): CareerClock => circuitClock(state);

/** De onde a tela lê o circuito do mundo: os eventos da temporada e o resultado guardado (nunca calcula na hora). */
export interface WorldSource {
  events(season: number): WorldEvent[];
  result(event: WorldEvent): WorldEventResult | null;
}

const pastEvents = new Map<string, WorldEvent[]>();
const PAST_EVENTS_LIMIT = 64;

/** A fonte de verdade é o circuit.ts. Temporada fechada não muda, então a lista de eventos dela fica guardada. */
export function circuitSource(state: PlayerCareerState): WorldSource {
  return {
    events(season) {
      if (season >= state.seasonNumber) return worldEventsOf(state, season);
      const key = `${state.seed}:${season}`;
      const cached = pastEvents.get(key);
      if (cached) return cached;
      const list = worldEventsOf(state, season);
      pastEvents.set(key, list);
      if (pastEvents.size > PAST_EVENTS_LIMIT) pastEvents.delete(pastEvents.keys().next().value as string);
      return list;
    },
    result: (event) => worldResult(state, event)
  };
}

const ORG_ID_BY_NAME = new Map(sceneOrgs.map((org) => [org.name.toLowerCase(), org.id] as const));

/** Id do time pelo nome (os seus resultados guardam o campeão pelo nome). */
export const orgIdOfName = (name: string): string | null => ORG_ID_BY_NAME.get(name.toLowerCase()) ?? null;

export interface CareerResult { season: number; orgId: string; result: TournamentResult }

/** Todos os seus campeonatos com resultado, com a temporada e o time em que você estava. */
export function careerResults(state: Pick<PlayerCareerState, 'history' | 'calendar' | 'seasonNumber' | 'orgId'>): CareerResult[] {
  return [
    ...state.history.flatMap((log) => log.tournaments.map((result) => ({ season: log.seasonNumber, orgId: log.orgId, result }))),
    ...(state.calendar ?? []).flatMap((entry) => (entry.result ? [{ season: state.seasonNumber, orgId: state.orgId, result: entry.result }] : []))
  ];
}

/** Chave de um campeonato na temporada pelo nome. O seu calendário guarda o nome com o ano ("IEM Cologne Major 2026") e
 *  o circuito do mundo sem ele ("IEM Cologne Major"): o ano da temporada no fim do nome sai da chave. */
export function eventKey(season: number, name: string): string {
  const year = ` ${yearOfSeason(season)}`;
  const bare = name.endsWith(year) ? name.slice(0, -year.length) : name;
  return `${season}:${bare.toLowerCase()}`;
}

/** Campeonatos seus com campeão conhecido: o resultado do mundo do mesmo campeonato não conta de novo. */
export function coveredEventKeys(state: Pick<PlayerCareerState, 'history' | 'calendar' | 'seasonNumber' | 'orgId'>): Set<string> {
  return new Set(careerResults(state)
    .filter(({ result }) => !result.skipped && (result.placement === 'Campeão' || Boolean(result.champion)))
    .map(({ season, result }) => eventKey(season, result.name)));
}

/**
 * Os resultados do circuito do mundo que você já pode ver: as temporadas passadas inteiras e a atual até o mês do
 * relógio. O campeonato que ainda não chegou nem é lido do cache. O que você jogou e já tem campeão fica de fora.
 */
export function seenWorldResults(state: PlayerCareerState, source: WorldSource = circuitSource(state)): WorldEventResult[] {
  const clock = careerClock(state);
  const covered = coveredEventKeys(state);
  const seen: WorldEventResult[] = [];
  const keys = new Set<string>();
  for (let season = 1; season <= clock.season; season += 1) {
    for (const event of source.events(season)) {
      if (season === clock.season && event.month > clock.month) continue;
      if (covered.has(eventKey(season, event.name))) continue;
      const result = source.result(event);
      if (!result || keys.has(result.key)) continue;
      keys.add(result.key);
      seen.push(result);
    }
  }
  return seen;
}

/** A tela mostra os campeonatos grandes do mundo: Major, Tier S e Tier A. */
export const WORLD_VIEW_TIERS: readonly EventTier[] = ['Major', 'S', 'A'];

export interface WorldTeamRef { orgId: string | null; name: string; mine: boolean }
export type WorldEventStatus = 'done' | 'computing' | 'upcoming';

export interface WorldEventRow {
  key: string;
  name: string;
  tier: EventTier;
  tierLabel: string;
  month: number;
  monthLabel: string;
  status: WorldEventStatus;
  /** Quem entra: convidados pelo ranking e vagas de qualificatória, numa frase. */
  field: string;
  /** Está no seu calendário: o campeonato em si ou a qualificatória dele. */
  mine: 'event' | 'qualifier' | null;
  myPlacement: string | null;
  champion: WorldTeamRef | null;
  runnerUp: WorldTeamRef | null;
  mvp: EventStarRef | null;
  /** Os 4 melhores depois do MVP, pelo rating. */
  evps: EventStarRef[];
}

/** MVP ou EVP de um campeonato, com o time para o escudo. */
export interface EventStarRef { nick: string; team: string; orgId: string | null; rating: number; you: boolean }

export interface WorldEventsView {
  season: number;
  year: number;
  month: number;
  /** Já aconteceram (o mais recente primeiro), inclusive os que o circuito ainda calcula em segundo plano. */
  done: WorldEventRow[];
  upcoming: WorldEventRow[];
  computing: number;
}

function teamRef(state: PlayerCareerState, orgId: string): WorldTeamRef {
  const mine = orgId === state.orgId;
  return { orgId: sceneOrgById.has(orgId) ? orgId : null, name: mine ? orgOf(state.orgId).name : sceneOrgById.get(orgId)?.name ?? orgId, mine };
}

function teamByName(state: PlayerCareerState, name: string): WorldTeamRef {
  const mine = name === orgOf(state.orgId).name;
  const orgId = mine ? state.orgId : orgIdOfName(name);
  return { orgId: orgId && sceneOrgById.has(orgId) ? orgId : null, name, mine };
}

/** "8 times: 6 convidados pelo ranking e 2 da qualificatória". */
export function fieldLabel(event: Pick<WorldEvent, 'invites' | 'qualifierSlots'>): string {
  const total = event.invites + event.qualifierSlots;
  return event.qualifierSlots > 0
    ? `${total} times: ${event.invites} convidados pelo ranking e ${event.qualifierSlots} da qualificatória`
    : `${total} times convidados pelo ranking`;
}

type Podium = Pick<WorldEventRow, 'champion' | 'runnerUp' | 'mvp' | 'evps'>;
const NO_PODIUM: Podium = { champion: null, runnerUp: null, mvp: null, evps: [] };

/** Um jogador dos melhores do campeonato com o time (o seu nick é você). */
function starOf(state: PlayerCareerState, player: { nick: string; orgId: string; rating: number }): EventStarRef {
  const team = teamRef(state, player.orgId);
  return { nick: player.nick, team: team.name, orgId: team.orgId, rating: player.rating, you: player.nick.toLowerCase() === state.nick.toLowerCase() };
}

function podiumFromWorld(state: PlayerCareerState, result: WorldEventResult): Podium {
  return {
    champion: teamRef(state, result.champion),
    runnerUp: result.runnerUp ? teamRef(state, result.runnerUp) : null,
    mvp: result.mvp
      ? { ...starOf(state, result.mvp), you: result.userPlayed && result.mvp.nick.toLowerCase() === state.nick.toLowerCase() }
      : null,
    evps: evpsOf(result.topPlayers, result.mvp?.nick).map((player) => ({ ...starOf(state, player), you: result.userPlayed && player.nick.toLowerCase() === state.nick.toLowerCase() }))
  };
}

/** O MVP e os EVPs do seu campeonato (você pelo nick da carreira). */
export function eventStarsOf(state: PlayerCareerState, result: TournamentResult): Pick<Podium, 'mvp' | 'evps'> {
  return {
    mvp: result.mvp ? { nick: result.mvp.you ? state.nick : result.mvp.nick, team: result.mvp.team, orgId: teamByName(state, result.mvp.team).orgId, rating: result.mvp.rating, you: Boolean(result.mvp.you) } : null,
    evps: evpsOf(result.topPlayers, result.mvp?.you ? state.nick : result.mvp?.nick).map((player) => starOf(state, player))
  };
}

/** O seu campeonato sem resultado do mundo no cache: o pódio sai do que você jogou (campeão, final e MVP). */
function podiumFromYou(state: PlayerCareerState, result: TournamentResult): Podium {
  const final = result.bracket?.find((line) => line.phase === 'final');
  return {
    champion: result.champion ? teamByName(state, result.champion) : null,
    runnerUp: final ? teamByName(state, final.aWon ? final.b : final.a) : null,
    ...eventStarsOf(state, result)
  };
}

/**
 * Os campeonatos grandes do mundo na temporada: os que já aconteceram com campeão, vice e MVP (ou carregando, se o
 * circuito ainda calcula) e os próximos com mês e chave. Sem spoiler: o que não chegou no seu calendário, ou é seu e
 * você ainda não jogou, fica em Próximos e o cache nem é lido.
 */
export function worldEventsView(state: PlayerCareerState, source: WorldSource = circuitSource(state)): WorldEventsView {
  const clock = careerClock(state);
  const calendar = state.calendar ?? [];
  const done: WorldEventRow[] = [];
  const upcoming: WorldEventRow[] = [];
  for (const event of source.events(clock.season)) {
    if (!WORLD_VIEW_TIERS.includes(event.tier)) continue;
    const key = eventKey(event.season, event.name);
    const entry = calendar.find((item) => item.kind !== 'qualifier' && eventKey(clock.season, item.name) === key) ?? null;
    const qualifier = calendar.find((item) => item.kind === 'qualifier' && item.qualifiesFor === event.key) ?? null;
    const row = {
      key: event.key,
      name: event.name,
      tier: event.tier,
      tierLabel: TIER_LABEL[event.tier],
      month: event.month,
      monthLabel: MONTH_LABEL[event.month - 1] ?? `Mês ${event.month}`,
      field: fieldLabel(event),
      mine: entry ? ('event' as const) : qualifier ? ('qualifier' as const) : null,
      myPlacement: entry?.result ? entry.result.placement : null
    };
    // O seu campeonato jogado já aconteceu (vem do save); o resto só depois do relógio do circuito.
    if (entry ? entry.status !== 'PLAYED' : event.month > clock.month) {
      upcoming.push({ ...row, status: 'upcoming', ...NO_PODIUM });
      continue;
    }
    const result = source.result(event);
    if (result) done.push({ ...row, status: 'done', ...podiumFromWorld(state, result) });
    else if (entry?.result?.champion) done.push({ ...row, status: 'done', ...podiumFromYou(state, entry.result) });
    else done.push({ ...row, status: 'computing', ...NO_PODIUM });
  }
  done.sort((a, b) => b.month - a.month || a.name.localeCompare(b.name));
  upcoming.sort((a, b) => a.month - b.month || a.name.localeCompare(b.name));
  return { season: clock.season, year: yearOfSeason(clock.season), month: clock.month, done, upcoming, computing: done.filter((row) => row.status === 'computing').length };
}

export type RankTrend = 'up' | 'down' | 'same';

export interface WorldRankingRow {
  orgId: string;
  name: string;
  rank: number;
  points: number;
  pointsLabel: string;
  delta: number;
  trend: RankTrend;
  deltaLabel: string;
  tier: TeamTier;
  tierLabel: string;
  region: Region;
  regionLabel: string;
  regionName: string;
  mine: boolean;
  /** A linha do seu time fora do top, depois de um respiro. */
  gap: boolean;
}

export interface RankingView { rows: WorldRankingRow[]; total: number; mineRank: number | null }

export const REGION_SHORT: Record<Region, string> = { sa: 'SA', na: 'NA', eu: 'EU', asia: 'Ásia', oce: 'OCE' };
export const REGION_NAME: Record<Region, string> = { sa: 'América do Sul', na: 'América do Norte', eu: 'Europa', asia: 'Ásia', oce: 'Oceania' };

/** `RankedTeam.delta` do ranking.ts: posições ganhas desde a leitura anterior (positivo subiu). */
export const trendOf = (delta: number): RankTrend => (delta > 0 ? 'up' : delta < 0 ? 'down' : 'same');
const deltaLabelOf = (delta: number) => (delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '=');

/** O ranking de times na tela: o top (30 por padrão) e, se o seu time está fora, ele no fim depois de um respiro. */
export function rankingView(ranked: RankedTeam[], userOrgId: string, limit = 30): RankingView {
  const row = (team: RankedTeam, gap: boolean): WorldRankingRow => ({
    orgId: team.orgId,
    name: team.name,
    rank: team.rank,
    points: team.points,
    pointsLabel: Math.round(team.points).toLocaleString('pt-BR'),
    delta: team.delta,
    trend: trendOf(team.delta),
    deltaLabel: deltaLabelOf(team.delta),
    tier: team.tier,
    tierLabel: teamTierTitle(team.level),
    region: team.region,
    regionLabel: REGION_SHORT[team.region],
    regionName: REGION_NAME[team.region],
    mine: team.orgId === userOrgId,
    gap
  });
  const sorted = [...ranked].sort((a, b) => a.rank - b.rank);
  const rows = sorted.slice(0, limit).map((team) => row(team, false));
  const mine = sorted.find((team) => team.orgId === userOrgId) ?? null;
  if (mine && !rows.some((item) => item.mine)) rows.push(row(mine, true));
  return { rows, total: sorted.length, mineRank: mine?.rank ?? null };
}

export type WorldMoveKind = 'vaga' | 'troca' | 'banco' | 'aposentadoria' | 'estreia';
export interface WorldMoveLine {
  key: string;
  nick: string;
  /** O time que aparece no escudo da linha (para onde ele foi, ou onde estava). */
  orgId: string | null;
  orgName: string;
  detail: string;
  note: string;
  /** Melhor posição no ranking entre os times da linha: o topo vem primeiro. */
  rank: number;
}
export interface WorldMoveGroup { kind: WorldMoveKind; label: string; lines: WorldMoveLine[] }

const MOVE_LABEL: Record<WorldMoveKind, string> = { vaga: 'Sua vaga', troca: 'Trocas', banco: 'Banco e sem time', aposentadoria: 'Aposentadorias', estreia: 'Estreias da base' };
const UNRANKED = 999;

/** O mercado da temporada: quem abriu a vaga para você, as trocas, as aposentadorias e as estreias da base. */
export function worldMovesView(state: PlayerCareerState): WorldMoveGroup[] {
  const season = state.seasonNumber;
  const rankOf = new Map(teamRanking(state, careerClock(state)).map((team) => [team.orgId, team.rank] as const));
  const best = (...ids: Array<string | null>) => Math.min(...ids.map((id) => (id ? rankOf.get(id) ?? UNRANKED : UNRANKED)));
  const history = worldHistory(state.seed, season);
  const groups: Array<[WorldMoveKind, WorldMoveLine[]]> = [
    ['vaga', seatMovesOf(state.seed).filter((move) => move.season === season).map((move) => ({
      key: `vaga:${move.nick}`, nick: move.nick, orgId: move.toId, orgName: move.toName,
      detail: `${move.fromName} → ${move.toName}`, note: `Abriu a vaga para você. Troca com ${move.standIn}.`, rank: best(move.fromId, move.toId)
    }))],
    ['troca', history.transfers.map((move) => ({
      key: `troca:${move.nick}:${move.fromId}`, nick: move.nick, orgId: move.toId, orgName: move.toName,
      detail: `${move.fromName} → ${move.toName}`, note: `Troca com ${move.swappedNick}.`, rank: best(move.fromId, move.toId)
    }))],
    ['banco', history.benchMoves.map((move) => {
      const detail: Record<typeof move.kind, string> = {
        promoted: `Banco → titular da ${move.orgName}`,
        benched: `Titular → banco da ${move.orgName}`,
        signed: `Banco da ${move.fromName} → ${move.orgName}`,
        released: `${move.fromName} → sem time`,
        faSigned: `Sem time → ${move.orgName}`,
        retired: move.orgName ? `Banco da ${move.orgName}` : 'Sem time'
      };
      const note: Record<typeof move.kind, string> = {
        promoted: `Voltou ao time${move.swappedNick ? ` no lugar do ${move.swappedNick}` : ''}.`,
        benched: 'Perdeu a vaga e foi para o banco.',
        signed: `Contratado do banco${move.swappedNick ? `; ${move.swappedNick} vai para o banco` : ''}.`,
        released: 'Dispensado: virou free agent.',
        faSigned: `Free agent contratado${move.swappedNick ? `; ${move.swappedNick} vai para o banco` : ''}.`,
        retired: 'Pendurou o mouse fora dos titulares.'
      };
      return {
        key: `banco:${move.kind}:${move.nick}:${move.orgId ?? move.fromId ?? ''}`, nick: move.nick, orgId: move.orgId ?? move.fromId ?? null, orgName: move.orgName ?? move.fromName ?? 'Sem time',
        detail: detail[move.kind], note: note[move.kind], rank: best(move.orgId, move.fromId ?? null)
      };
    })],
    ['aposentadoria', history.retirements.map((move) => {
      const orgId = orgIdOfName(move.orgName);
      return {
        key: `aposentadoria:${move.nick}:${move.orgName}`, nick: move.nick, orgId, orgName: move.orgName,
        detail: `${move.orgName} · ${move.age} anos`, note: `Pendurou o mouse. Entra ${move.replacement}.`, rank: best(orgId)
      };
    })],
    ['estreia', history.debuts.map((move) => ({
      key: `estreia:${move.nick}:${move.orgId}`, nick: move.nick, orgId: move.orgId, orgName: move.orgName,
      detail: `${move.orgName} · ${move.age} anos`, note: `Veio da base com overall ${move.overall}.`, rank: best(move.orgId)
    }))]
  ];
  return groups
    .filter(([, lines]) => lines.length)
    .map(([kind, lines]) => ({ kind, label: MOVE_LABEL[kind], lines: lines.sort((a, b) => a.rank - b.rank || a.nick.localeCompare(b.nick)) }));
}
