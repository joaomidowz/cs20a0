// src/lib/game/playerCareer/qualifiers.ts
// Qualificatórias jogáveis (D8). Os campeonatos grandes do mundo reservam vagas de qualificatória por região
// (circuit.ts QUALIFIER_SLOTS); o resto é convite pelo ranking. Com o seu time abaixo do nível do campeonato, a
// qualificatória da sua região entra no seu calendário antes dele; passou, o campeonato entra na sua temporada. As
// qualificatórias de quem não é você são simuladas série a série pela força dos times (o motor completo fica para os
// campeonatos do circuito, D6). Qualificatória não é título, nem MVP, nem entra na média ou no histórico.
import { createSeededRng } from '../simulation';
import { regionOf, worldCircuitOf, type EventTier, type Region } from './calendar';
import { sceneOrgById } from './data';
import type { CalendarEntry, PlayerCareerState, TournamentResult } from './engine';
import { canonicalOrgId, skipsEvent, worldEventByKey, worldEventByName, worldEventsOf, worldInvites, type WorldEvent, type WorldInvites } from './circuit';
import { homeLevelOf } from './tiers';
import { worldOrgIn, yearOfSeason } from './world';

export type QualifierRegion = 'eu' | 'sa' | 'na' | 'apac';
export const QUALIFIER_REGION_LABEL: Record<QualifierRegion, string> = { eu: 'Europa', sa: 'América do Sul', na: 'América do Norte', apac: 'Ásia e Oceania' };
/** Ásia e Oceania disputam a mesma qualificatória, como no guia de campeonatos. */
export const qualifierRegionOf = (region: Region | undefined): QualifierRegion => (region === 'asia' || region === 'oce' ? 'apac' : region ?? 'eu');

/** Formato da qualificatória: mata-mata de 8, quartas em MD1, semi e final em MD3. */
export const QUALIFIER_FORMAT = { quarterfinal: 1, semifinal: 3, final: 3 } as const;

/** Qualificatórias a mais por temporada pelo nível do seu time (não contam na faixa de campeonatos, EVENT_RANGE):
 *  Tier A (nível 2) 3, Tier B (nível 3) 2; Tier S, Tier C e lan house nenhuma. */
export const EXTRA_QUALIFIERS: Record<number, number> = { 0: 0, 1: 0, 2: 3, 3: 2, 4: 0, 5: 0 };

/** Nível que entra direto pelo calendário: Major e campeonato Tier S pedem o nível 0 (Tier S com o selo Elite);
 *  campeonato Tier A pede o nível 1 (o resto do Tier S). */
const REQUIRED_LEVEL: Record<EventTier, number> = { Major: 0, S: 0, A: 1, B: 2, C: 3 };
/** O tier da entrada da qualificatória (prêmio e rótulo): a de Major e de Tier S vale como Tier B; a de Tier A, Tier C. */
const QUALIFIER_TIER: Record<EventTier, EventTier> = { Major: 'B', S: 'B', A: 'C', B: 'C', C: 'C' };

/** O tipo da entrada do calendário: save antigo, sem `kind`, é campeonato. */
export const entryKind = (entry: Pick<CalendarEntry, 'kind'>): 'event' | 'qualifier' => entry.kind ?? 'event';

/** As vagas de qualificatória por região: Major 2 por região; suíça de 16, 1 por região; mata-mata de 8, 1 da Europa e
 *  1 que reveza entre América do Sul, América do Norte e Ásia/Oceania. Soma sempre o `qualifierSlots` do campeonato. */
export function qualifierRegions(event: WorldEvent): Partial<Record<QualifierRegion, number>> {
  if (event.format === 'major') return { eu: 2, sa: 2, na: 2, apac: 2 };
  if (event.format === 'swiss16') return { eu: 1, sa: 1, na: 1, apac: 1 };
  return { eu: 1, [(['sa', 'na', 'apac'] as const)[event.index % 3]]: 1 };
}

const orgRegion = (orgId: string): QualifierRegion => qualifierRegionOf(sceneOrgById.get(orgId)?.region);

/** A região de qualificatória do seu time (lan house: a do seu país). */
export function userQualifierRegion(state: PlayerCareerState): QualifierRegion {
  const org = sceneOrgById.get(state.orgId);
  return qualifierRegionOf(org?.region ?? regionOf(org?.country ?? state.country));
}

/** A chave da qualificatória da região: os 8 melhores do ranking do mês anterior daquela região que não foram
 *  convidados nem pularam o campeonato; com você, você e os 7 melhores. Na ordem do ranking. */
export function qualifierField(state: PlayerCareerState, event: WorldEvent, region: QualifierRegion, withUser: boolean, invites: WorldInvites = worldInvites(state, event, withUser)): string[] {
  const taken = new Set(invites.invited);
  const field: string[] = [];
  for (const [rank, orgId] of invites.order.entries()) {
    if (field.length >= (withUser ? 7 : 8)) break;
    if (orgId === invites.userOrg || taken.has(orgId) || orgRegion(orgId) !== region || skipsEvent(state, event, orgId, rank)) continue;
    field.push(orgId);
  }
  if (!withUser) return field;
  const position = new Map(invites.order.map((orgId, index) => [orgId, index]));
  return [...field, invites.userOrg].sort((a, b) => (position.get(a) ?? invites.order.length) - (position.get(b) ?? invites.order.length));
}

/** Qualificatória sem você: mata-mata de 8 (1º x 8º, 4º x 5º, 2º x 7º, 3º x 6º) série a série pela força dos times. */
function simulatedWinners(state: PlayerCareerState, event: WorldEvent, region: QualifierRegion, slots: number, invites: WorldInvites): string[] {
  const field = qualifierField(state, event, region, false, invites);
  if (field.length < 8) return field.slice(0, slots);
  const power = (orgId: string) => worldOrgIn(state.seed, event.season, orgId)?.power ?? 70;
  const rng = createSeededRng(`${state.seed}:world:${event.key}:qualifier:${region}`);
  const play = (a: string, b: string) => (rng() < 1 / (1 + Math.exp(-(power(a) - power(b)) / 4)) ? a : b);
  const seeded = [field[0], field[7], field[3], field[4], field[1], field[6], field[2], field[5]];
  const quarter = [0, 2, 4, 6].map((index) => play(seeded[index], seeded[index + 1]));
  const semi = [play(quarter[0], quarter[1]), play(quarter[2], quarter[3])];
  const champion = play(semi[0], semi[1]);
  return slots >= 2 ? [champion, champion === semi[0] ? semi[1] : semi[0]] : [champion];
}

/** A sua qualificatória jogada deste campeonato (temporada atual), com a chave gravada. */
function playedQualifier(state: PlayerCareerState, event: WorldEvent): CalendarEntry | null {
  if (event.season !== state.seasonNumber) return null;
  return (state.calendar ?? []).find((entry) => entryKind(entry) === 'qualifier' && entry.qualifiesFor === event.key && entry.status === 'PLAYED' && Boolean(entry.result?.placements?.length)) ?? null;
}

/** Quem passou em cada qualificatória regional do campeonato: a da sua região sai do que você jogou; as outras (e a
 *  sua, quando você não jogou), simuladas. Nunca repete um convidado. */
export function qualifierWinners(state: PlayerCareerState, event: WorldEvent, invites: WorldInvites): string[] {
  const own = playedQualifier(state, event);
  const ownPlaces = own?.result?.placements ?? [];
  const ownRegion = ownPlaces.map((place) => place.orgId).find((orgId) => orgId !== canonicalOrgId(own?.result?.orgId ?? state.orgId) && sceneOrgById.get(orgId));
  const winners: string[] = [];
  for (const [region, slots] of Object.entries(qualifierRegions(event)) as Array<[QualifierRegion, number]>) {
    const passed = own && ownRegion && orgRegion(ownRegion) === region
      ? [...ownPlaces].sort((a, b) => a.place - b.place).map((place) => canonicalOrgId(place.orgId)).filter((orgId) => !invites.invited.includes(orgId)).slice(0, slots)
      : simulatedWinners(state, event, region, slots, invites);
    for (const orgId of passed) if (!winners.includes(orgId) && !invites.invited.includes(orgId)) winners.push(orgId);
  }
  return winners;
}

/** Este campeonato pede qualificatória do seu time? Abaixo do nível dele (REQUIRED_LEVEL) e com vaga para a sua região. */
function needsQualifier(state: PlayerCareerState, event: WorldEvent, region: QualifierRegion): boolean {
  return homeLevelOf(state, state.orgId) > REQUIRED_LEVEL[event.tier] && (qualifierRegions(event)[region] ?? 0) > 0;
}

/** Uma entrada do calendário que é campeonato do mundo acima do seu nível (a extra da temporada nunca é uma dessas). */
export function needsQualifierFor(state: PlayerCareerState, entry: Pick<CalendarEntry, 'name'>): boolean {
  const event = worldEventByName(state, state.seasonNumber, entry.name);
  return Boolean(event && sceneOrgById.get(state.orgId) && needsQualifier(state, event, userQualifierRegion(state)));
}

const mainName = (event: WorldEvent) => `${event.name} ${yearOfSeason(event.season)}`;

/** A entrada da qualificatória no calendário, no mês do campeonato. */
function qualifierEntry(event: WorldEvent, region: QualifierRegion): CalendarEntry {
  return {
    index: 0, name: `${mainName(event)} · qualificatória ${QUALIFIER_REGION_LABEL[region]}`, status: 'UPCOMING', month: event.month,
    tier: QUALIFIER_TIER[event.tier], format: 'bracket8', finalBestOf: 3, location: QUALIFIER_REGION_LABEL[region],
    kind: 'qualifier', qualifiesFor: event.key
  };
}

/** A entrada do campeonato grande, como o calendário do circuito escreve (engine.ts calendarFor). */
export function mainEntryOf(event: WorldEvent): CalendarEntry {
  const template = worldCircuitOf(yearOfSeason(event.season))[event.index];
  return {
    index: 0, name: mainName(event), status: 'UPCOMING', month: template.month, tier: template.tier, format: template.format, finalBestOf: template.finalBestOf,
    ...(template.organizer ? { organizer: template.organizer } : {}),
    ...(template.location ? { location: template.location } : {}),
    ...(template.prizePool ? { prizePool: template.prizePool } : {}),
    ...(template.note ? { note: template.note } : {}),
    kind: 'event'
  };
}

/**
 * As qualificatórias da temporada do seu time. `state.calendar` é o calendário sorteado (sem qualificatória):
 * - os campeonatos do mundo dele acima do seu nível e com vaga para a sua região viram qualificatória (no lugar deles);
 * - a mais (EXTRA_QUALIFIERS): Tier A (nível 2), os Majors fora do calendário, 1 Tier S e 1 Tier A; Tier B (nível 3), os
 *   Majors e 1 Tier A. Tier C (nível 4, CCT/GC) já joga a "Qualificatória aberta do Major" como campeonato da tabela
 *   dele; Tier S e lan house: nenhuma a mais.
 */
export function qualifierEntriesFor(state: PlayerCareerState, season: number): CalendarEntry[] {
  const level = homeLevelOf(state, state.orgId);
  if (!sceneOrgById.get(state.orgId) || level >= 5) return [];
  const region = userQualifierRegion(state);
  const events = worldEventsOf(state, season);
  const inCalendar = new Set((state.calendar ?? []).filter((entry) => entryKind(entry) === 'event').map((entry) => entry.name));
  const gated = events.filter((event) => inCalendar.has(mainName(event)) && needsQualifier(state, event, region));
  const open = events.filter((event) => !inCalendar.has(mainName(event)) && needsQualifier(state, event, region));
  const rng = createSeededRng(`${state.seed}:qualifiers:${season}:${canonicalOrgId(state.orgId)}`);
  const pick = (tier: EventTier, count: number) => {
    const pool = open.filter((event) => event.tier === tier);
    const chosen: WorldEvent[] = [];
    while (chosen.length < count && pool.length) chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return chosen;
  };
  const extras = level === 2 ? [...pick('Major', 2), ...pick('S', 1), ...pick('A', 1)]
    : level === 3 ? [...pick('Major', 2), ...pick('A', 1)]
    : [];
  return [...gated, ...extras.slice(0, EXTRA_QUALIFIERS[level] ?? 0)]
    .sort((a, b) => a.month - b.month || a.index - b.index)
    .map((event) => qualifierEntry(event, region));
}

/** O calendário com as qualificatórias: o campeonato acima do seu nível sai e a qualificatória dele entra no lugar; as a
 *  mais entram no mês do campeonato. Em ordem de mês (a qualificatória antes dos outros do mesmo mês), com índices a
 *  partir de `fromIndex`. `afterMonth`: troca no meio da temporada, só os meses que faltam. */
export function withQualifiers(state: PlayerCareerState, drawn: CalendarEntry[], fromIndex = 0, afterMonth = 0): CalendarEntry[] {
  const qualifiers = qualifierEntriesFor({ ...state, calendar: drawn }, state.seasonNumber).filter((entry) => (entry.month ?? 0) > afterMonth);
  const gated = new Set(qualifiers.flatMap((entry) => {
    const event = entry.qualifiesFor ? worldEventByKey(state, entry.qualifiesFor) : null;
    return event ? [mainName(event)] : [];
  }));
  return [...qualifiers, ...drawn.filter((entry) => !gated.has(entry.name))]
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => (a.entry.month ?? 0) - (b.entry.month ?? 0) || Number(entryKind(a.entry) === 'event') - Number(entryKind(b.entry) === 'event') || a.order - b.order)
    .map(({ entry }, offset) => ({ ...entry, index: fromIndex + offset }));
}

/** O nome do campeonato grande que a qualificatória vale ("IEM Cologne Major 2026"); fora disso, o nome da entrada. */
export function qualifierTargetName(state: PlayerCareerState, entry: Pick<CalendarEntry, 'name' | 'qualifiesFor'>): string {
  const event = entry.qualifiesFor ? worldEventByKey(state, entry.qualifiesFor) : null;
  return event ? mainName(event) : entry.name;
}

/** Passou na qualificatória (ou foi convidado): o campeonato grande entra logo depois dela e os índices andam um. */
export function applyQualifierResult(state: PlayerCareerState, entryIndex: number): PlayerCareerState {
  const calendar = state.calendar ?? [];
  const entry = calendar[entryIndex];
  if (!entry || entryKind(entry) !== 'qualifier' || entry.status !== 'PLAYED' || !entry.qualifiesFor) return state;
  if (entry.result?.placement !== 'Classificado' && entry.result?.placement !== 'Convidado') return state;
  const event = worldEventByKey(state, entry.qualifiesFor);
  if (!event || calendar.some((other) => other.name === mainName(event))) return state;
  const next = [...calendar.slice(0, entryIndex + 1), mainEntryOf(event), ...calendar.slice(entryIndex + 1)].map((item, index) => ({ ...item, index }));
  return { ...state, calendar: next };
}

/** A próxima entrada é uma qualificatória e o ranking do mês anterior já te convidou: ela se resolve sozinha
 *  ("Convidado") e o campeonato entra no calendário. Sem mudança, devolve o mesmo estado. */
export function resolveInvitedQualifier(state: PlayerCareerState): PlayerCareerState {
  const next = (state.calendar ?? []).find((entry) => entry.status === 'UPCOMING');
  if (!next || entryKind(next) !== 'qualifier' || !next.qualifiesFor) return state;
  const event = worldEventByKey(state, next.qualifiesFor);
  if (!event || !worldInvites(state, event, true).invited.includes(canonicalOrgId(state.orgId))) return state;
  const result: TournamentResult = { name: next.name, placement: 'Convidado', rating: 0, seriesWins: 0, seriesLosses: 0, skipped: true, ...(next.tier ? { tier: next.tier } : {}), orgId: state.orgId, ...(next.month ? { month: next.month } : {}) };
  const calendar = (state.calendar ?? []).map((entry) => (entry.index === next.index ? { ...entry, status: 'PLAYED' as const, result } : entry));
  return applyQualifierResult({ ...state, calendar }, next.index);
}
