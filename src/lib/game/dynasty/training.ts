import type { Player, TrainingAttribute, TrainingFocus } from '../types';

const effects: Record<TrainingFocus, Partial<Record<keyof Player, number>>> = {
  aim: { firepower: 2, consistency: 1 },
  utility: { support: 2, igl: 2 },
  clutch: { clutch: 3, mental: 1 },
  opening: { entry: 3, firepower: 1 },
  recovery: { mental: 2, consistency: 2 }
};

const growth: Partial<Record<TrainingFocus, TrainingAttribute>> = {
  aim: 'firepower', utility: 'support', clutch: 'clutch', opening: 'entry'
};

export function applyTraining(player: Player, focus: TrainingFocus): Player {
  const trained = { ...player };
  for (const [key, bonus] of Object.entries(effects[focus]) as Array<[keyof Player, number]>) {
    const current = typeof player[key] === 'number' ? player[key] as number : 0;
    (trained as unknown as Record<string, unknown>)[key] = Math.min(99, current + bonus);
  }
  return trained;
}

export function suggestTraining(players: Player[]): TrainingFocus {
  if (!players.length) return 'aim';
  const average = (key: keyof Player) => players.reduce((sum, player) => sum + (typeof player[key] === 'number' ? player[key] as number : 0), 0) / players.length;
  const candidates: Array<[TrainingFocus, number]> = [
    ['aim', average('firepower')], ['utility', average('support')], ['clutch', average('clutch')], ['opening', average('entry')], ['recovery', average('mental')]
  ];
  return candidates.sort((left, right) => left[1] - right[1])[0][0];
}

export const trainingGrowth = (focus: TrainingFocus, attribute: keyof Player): number => growth[focus] === attribute ? 1 : 0;
export const permanentTrainingAttribute = (focus: TrainingFocus): TrainingAttribute | null => growth[focus] ?? null;
