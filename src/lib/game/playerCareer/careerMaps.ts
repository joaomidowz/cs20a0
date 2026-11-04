// src/lib/game/playerCareer/careerMaps.ts
// Mapas na Carreira. O motor já sabe jogar com perfil de mapas (3 mapas preferidos com afinidade, que decidem o
// veto e dão bônus de força no mapa jogado); a Carreira usava um pool neutro, sem vantagem para ninguém. Aqui cada
// time ganha um perfil do pool do ano (mecânica declarada: a coleta não traz os map pools reais), fixo por time e
// ano, e o seu time soma o que você treinou. Só toca o contexto de mapas do campeonato da Carreira.
import type { CampaignMajorState } from '../campaign-major';
import { MAP_NAMES } from '../maps';
import type { MapAffinity, MapId } from '../types';

export interface MapRating { mapId: MapId; name: string; score: number; affinity: MapAffinity }

/** Nota do time num mapa (30-90), fixa por time e ano: pools mudam de um ano para o outro. */
function baseScore(orgId: string, year: number, mapId: MapId): number {
  let hash = 2166136261;
  for (const char of `${orgId}:${year}:${mapId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 30 + Math.round(((hash >>> 0) / 4294967296) * 60);
}

export const affinityOf = (score: number): MapAffinity => (score >= 80 ? '+++' : score >= 68 ? '++' : score >= 56 ? '+' : 'EVEN');

/** Treino máximo por mapa e quanto cada sessão soma. */
export const MAP_TRAIN_CAP = 30;
export const MAP_TRAIN_STEP = 8;

/** O perfil de mapas de um time no ano (do melhor para o pior). `training` soma o treino do seu time. */
export function mapProfile(orgId: string, year: number, pool: readonly MapId[], training: Partial<Record<MapId, number>> = {}): MapRating[] {
  return pool
    .map((mapId) => {
      const score = Math.min(99, baseScore(orgId, year, mapId) + (training[mapId] ?? 0));
      return { mapId, name: MAP_NAMES[mapId] ?? mapId, score, affinity: affinityOf(score) };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Dá a cada time do campeonato o seu perfil de mapas (o seu com o treino). O veto e o bônus de força passam a
 *  ler isso; a primeira série já aberta mantém o veto, mas o bônus vale nos mapas dela também. */
export function applyCareerMapProfiles(campaign: CampaignMajorState, userOrgId: string, year: number, pool: readonly MapId[], training: Partial<Record<MapId, number>>) {
  const strategies = campaign.engine.options.mapContext?.strategies;
  if (!strategies) return;
  for (const [teamId, strategy] of strategies) {
    const isUser = teamId === campaign.userTeamId || teamId === 'user';
    const profile = mapProfile(isUser ? userOrgId : teamId, year, pool, isUser ? training : {});
    strategy.selectedMaps = [profile[0].mapId, profile[1].mapId, profile[2].mapId];
    for (const rating of profile) strategy.affinities[rating.mapId] = rating.affinity;
  }
}
