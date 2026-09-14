import { getRoundFlash } from './roundPresentation';
import type { Language, RoundDetail } from './types';

/** Ignore initial/restored frames and skipped batches; celebrate only a newly committed round. */
export function createOfflineMomentTracker() {
  let previous: { seriesId: string; map: number; round: number } | null = null;
  return (seriesId: string, map: number, round: number, detail: RoundDetail | null, language: Language) => {
    const next = { seriesId, map, round };
    const contiguous = previous !== null && previous.seriesId === seriesId &&
      ((previous.map === map && round === previous.round + 1) || (map === previous.map + 1 && round === 1));
    previous = next;
    if (!contiguous || !detail || detail.number !== round) return null;
    const flash = getRoundFlash(language, detail);
    return flash && (flash.kind === 'ace' || flash.kind === 'clutch' || flash.kind === 'comeback') ? flash : null;
  };
}
