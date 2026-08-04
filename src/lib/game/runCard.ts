import { getRunSummary } from './runStats';
import type { MajorRun } from './types';
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
