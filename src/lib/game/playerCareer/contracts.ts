// src/lib/game/playerCareer/contracts.ts
// Contrato do seu jogador: toda assinatura tem duração (1 a 3 temporadas), salário por mês e multa de rescisão. Sob
// contrato, o fim da temporada não abre o mercado: só aparece quem paga a multa (time de cima, quando você brilhou) e,
// numa temporada fraca, o seu time pode te vender. No último ano o time oferece renovação se você foi bem; senão você
// fica livre (free agent) e escolhe entre as propostas ou volta para a lan house.
import { createSeededRng } from '../simulation';

export interface CareerContract {
  orgId: string;
  /** Primeira e última temporada cobertas (inclusive). */
  from: number;
  until: number;
  /** Salário por mês, em US$ (cai no caixa no fim de cada temporada: 12 meses). */
  salaryUsd: number;
  /** Multa de rescisão na assinatura (quem quiser te tirar antes do fim paga o valor do momento, buyoutFor). */
  buyoutUsd: number;
}

/** Fatia do valor de mercado que vira salário no ano, por nível (0 elite … 4 Tier C): quanto mais alto o tier, mais o
 *  time paga. Um 90 no Tier S fica perto de US$ 19 mil/mês; um 69 no Tier C, perto de US$ 700. */
export const SALARY_SHARE: Record<number, number> = { 0: 0.45, 1: 0.35, 2: 0.25, 3: 0.15, 4: 0.08 };
/** Salário mínimo por mês. */
export const SALARY_FLOOR = 400;

/** Salário por mês da proposta: a fatia do valor de mercado do nível, dividida por 12. */
export const monthlySalary = (marketValue: number, level: number, bump = 0) =>
  Math.round(Math.max(SALARY_FLOOR, ((marketValue * (SALARY_SHARE[level] ?? SALARY_SHARE[4])) / 12) * (1 + bump)));

/** Contrato mais longo possível. */
export const CONTRACT_MAX_YEARS = 3;
/** Quanto abaixo do rating esperado o time ainda renova no último ano (com título, renova sempre). */
export const RENEW_MARGIN = 0.04;
/** Chance de o time aceitar vender você numa temporada fraca sob contrato (quando aparece quem pague a multa). */
export const SALE_CHANCE = 0.35;

/** Duração da proposta: jovem assina mais longo, veterano mais curto; time de cima segura mais quem está no auge. */
export function contractYears(seed: string, orgId: string, season: number, age: number, level: number): number {
  const rng = createSeededRng(`${seed}:contract:${orgId}:${season}`);
  const base = age <= 21 ? 3 : age <= 27 ? 2 : age <= 31 ? (rng() < 0.5 ? 2 : 1) : 1;
  const longer = base === 2 && level <= 1 && rng() < 0.4 ? 1 : 0;
  return Math.max(1, Math.min(CONTRACT_MAX_YEARS, base + longer));
}

/** Temporadas que ainda faltam a partir de `season` (contando ela). */
export const yearsLeft = (contract: Pick<CareerContract, 'until'>, season: number) => Math.max(0, contract.until - season + 1);

/** Multa de rescisão: o valor de mercado, mais caro quanto mais contrato falta. */
export const buyoutFor = (marketValue: number, years: number) => Math.round((marketValue * (0.75 + 0.25 * Math.max(0, years))) / 1000) * 1000;

/** O contrato ainda cobre a temporada seguinte à `season`? (No fim da temporada: false = último ano, vira livre.) */
export const coversNext = (contract: CareerContract | null | undefined, orgId: string, season: number) =>
  Boolean(contract && contract.orgId === orgId && contract.until > season);

/** Contrato novo a partir de `from`, com a duração da proposta. */
export function contractFrom(offer: { orgId: string; salaryUsd: number; years?: number }, from: number, marketValue: number): CareerContract {
  const years = Math.max(1, Math.min(CONTRACT_MAX_YEARS, offer.years ?? 1));
  return { orgId: offer.orgId, from, until: from + years - 1, salaryUsd: offer.salaryUsd, buyoutUsd: buyoutFor(marketValue, years) };
}
