import type { GameMode } from './types';

/** PRO and Dinastia choose identity after all five players; other queues choose before rolling. */
export const needsStyleBeforeDraft = (mode: GameMode | null): boolean => mode !== 'pro' && mode !== 'dynasty';
