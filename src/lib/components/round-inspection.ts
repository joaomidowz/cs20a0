import type { RoundDetail, RoundScore } from '$lib/game/types';

export type RoundInspection = {
  number: number;
  score: Pick<RoundScore, 'a' | 'b'>;
  winner: 'a' | 'b';
  overtime: boolean;
  detail?: RoundDetail;
};
