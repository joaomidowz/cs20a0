// src/lib/game/playerCareer/cards.ts
// A carta da Carreira de Jogador sobe de raridade com o overall, na mesma escada do modo online
// (common → rare → elite → superstar → legend → goat). É SÓ apresentação: o `rarity` dos jogadores do
// motor continua 'rare' porque a simulação dá bônus de força a legend/goat (simulation.ts) — trocar ali
// mudaria o balanceamento da carreira.

export type CareerRarity = 'common' | 'rare' | 'elite' | 'superstar' | 'legend' | 'goat';

/** Overall mínimo de cada raridade, de baixo pra cima: Lenda é 97-98 e GOAT é só o 99. */
export const CAREER_RARITY_STEPS: ReadonlyArray<{ rarity: CareerRarity; from: number }> = [
  { rarity: 'common', from: 0 },
  { rarity: 'rare', from: 70 },
  { rarity: 'elite', from: 77 },
  { rarity: 'superstar', from: 83 },
  { rarity: 'legend', from: 97 },
  { rarity: 'goat', from: 99 }
];

export const CAREER_RARITY_LABEL: Record<CareerRarity, string> = {
  common: 'Comum',
  rare: 'Raro',
  elite: 'Elite',
  superstar: 'Craque',
  legend: 'Lenda',
  goat: 'GOAT'
};

export interface CareerRarityInfo {
  rarity: CareerRarity;
  /** A próxima raridade e quanto overall falta; null no topo (GOAT). */
  next: { rarity: CareerRarity; at: number; missing: number } | null;
  /** 0–1: quanto do degrau atual já foi percorrido (barra de progresso da sua carta). */
  progress: number;
}

export function careerRarity(overall: number): CareerRarityInfo {
  const value = Number.isFinite(overall) ? overall : 0;
  let index = 0;
  for (let step = 0; step < CAREER_RARITY_STEPS.length; step += 1) {
    if (value >= CAREER_RARITY_STEPS[step].from) index = step;
  }
  const current = CAREER_RARITY_STEPS[index];
  const upcoming = CAREER_RARITY_STEPS[index + 1] ?? null;
  if (!upcoming) return { rarity: current.rarity, next: null, progress: 1 };
  // O primeiro degrau começa no piso real da carreira (60), não no zero, pra barra ter sentido.
  const floor = index === 0 ? 60 : current.from;
  const progress = Math.max(0, Math.min(1, (value - floor) / (upcoming.from - floor)));
  return { rarity: current.rarity, next: { rarity: upcoming.rarity, at: upcoming.from, missing: upcoming.from - value }, progress };
}
