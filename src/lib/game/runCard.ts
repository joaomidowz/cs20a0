import { getRunSummary } from './runStats';
import type { DynastyMajorSummary, MajorRun, Player } from './types';
import type { PublicSelfResult } from './online/contracts';

export interface RunCardReport {
  champion: boolean;
  placement: string;
  seriesWon: number;
  seriesLost: number;
  mapsWon: number;
  mapsLost: number;
}

export function buildOfflineRunCardReport(run: MajorRun): RunCardReport {
  const summary = getRunSummary(run);
  return {
    champion: run.champion,
    placement: run.placement,
    seriesWon: summary.seriesWon,
    seriesLost: summary.seriesLost,
    mapsWon: summary.mapsWon,
    mapsLost: summary.mapsLost
  };
}

export function buildOnlineRunCardReport(result: PublicSelfResult, championId: string | null, participantId: string): RunCardReport {
  return {
    champion: championId === participantId,
    placement: result.campaign.placement,
    seriesWon: result.campaign.seriesWon,
    seriesLost: result.campaign.seriesLost,
    mapsWon: result.campaign.mapsWon,
    mapsLost: result.campaign.mapsLost
  };
}

export interface LineageEntry {
  majorNumber: number;
  placement: string;
  champion: boolean;
  lineup: string[];
}

/** One line per Dinastia Major for the share card: where the lineup finished and who played it. */
export function buildDynastyLineage(history: DynastyMajorSummary[], playerById: Map<string, Player>): LineageEntry[] {
  return history.map((item) => ({
    majorNumber: item.majorNumber,
    placement: item.placement,
    champion: item.placement === 'placementChampion',
    lineup: item.lineup.map((selected) => playerById.get(selected.playerId)?.nickname ?? selected.playerId)
  }));
}
