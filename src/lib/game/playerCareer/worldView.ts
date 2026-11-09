// src/lib/game/playerCareer/worldView.ts
// A tela Mundo em dados puros: até onde a sua temporada já andou (o relógio), os resultados do circuito do mundo sem
// spoiler, os campeonatos de Major, Tier S e Tier A, o ranking de times, as trocas da temporada e o top de jogadores
// parcial. O componente CareerWorld.svelte só desenha o que sai daqui. Nada aqui simula: só lê o cache do circuito.
import { circuitClock, worldEventsOf, worldResult, type CircuitClock, type WorldEvent, type WorldEventResult } from './circuit';
import { sceneOrgs } from './data';
import type { PlayerCareerState, TournamentResult } from './engine';
import { yearOfSeason } from './world';

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
