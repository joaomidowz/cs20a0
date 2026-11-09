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
