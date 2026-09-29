import { collectionPlayerById, collectionPlayers } from './collection-pool';
import { playerCountryOf } from './collection-countries';
import { CHAMPION_TEAM_IDS } from './major-champions';
import { RARITIES, rarityOf, type Rarity } from './collection-rules';
import { datasetRolesOf } from './collection-lineup';
import type { LineupSlotRole, Player } from '../types';

/**
 * Trade-Up de cartas (aba "Contratos" da loja), no modelo oficial do CS2: o jogador entrega 5 CARTAS REPETIDAS da
 * MESMA raridade — qualquer mistura de países/organizações — e recebe 1 carta cuja raridade sai de uma tabela visível
 * (na maioria +1, com chance de manter, piorar ou dar o pulo duplo) e cuja COLEÇÃO sai da composição da entrega:
 * cada uma das 5 cartas vale 20% do peso, e o resultado vem da organização da carta sorteada (3 Vitality em 5 = 60%
 * de peso da Vitality), caindo para o pool do país e depois para o pool geral quando a coleção não tem a raridade.
 * Tudo é mostrado antes de confirmar — pesos, % de raridade e as cartas candidatas, com os milagres (ZywOo) visíveis.
 * Trade-ups consomem cópias reais extras; uma cópia escalada fica reservada no elenco.
 * Puro e dentro da fronteira online; server e cliente chamam as MESMAS funções.
 */

/** Cartas repetidas entregues por trade-up. */
export const TRADE_INPUTS = 5;
/**
 * % de cada degrau de raridade, relativo à raridade entregue (down = -1, same, up = +1, double = +2).
 * Degraus impossíveis (abaixo de common, acima de goat) saem da roleta e o resto é renormalizado.
 */
export const TRADE_RARITY_WEIGHTS: Readonly<Record<'down' | 'same' | 'up' | 'double', number>> = { down: 10, same: 20, up: 60, double: 10 };

export type TradeStepKey = keyof typeof TRADE_RARITY_WEIGHTS;

/** Países do bloco CIS (códigos flag-icons), para a Lenda CIS. */
export const CIS_COUNTRIES: readonly string[] = ['ru', 'ua', 'kz', 'by', 'md', 'ge', 'am', 'az'];

/** O que qualifica uma carta doadora para uma Lenda. */
export type ContractTheme =
  | { kind: 'country'; countries: readonly string[] }
  | { kind: 'role'; role: LineupSlotRole }
  | { kind: 'major' };

export interface LendaDef {
  id: string;
  theme: ContractTheme;
  /** A carta entregue no resgate, garantida. */
  targetId: string;
}

export const LENDAS: readonly LendaDef[] = [
  { id: 'lenda-francesa', theme: { kind: 'country', countries: ['fr'] }, targetId: 'zywoo-2025' },
  { id: 'lenda-brasileira', theme: { kind: 'country', countries: ['br'] }, targetId: 'fallen-luminosity-2016' },
  { id: 'lenda-dinamarquesa', theme: { kind: 'country', countries: ['dk'] }, targetId: 'device-2018' },
  { id: 'lenda-cis', theme: { kind: 'country', countries: CIS_COUNTRIES }, targetId: 's1mple-2021' }
];

export const lendaById = new Map(LENDAS.map((def) => [def.id, def]));

/** Máximo de doadores por entrega parcial da Lenda. */
export const LENDA_DELIVERY_MAX = 50;
/** Fragmentos do tema que completam uma Lenda. */
export const LENDA_TARGET = 25;

export function isPlayerInTheme(theme: ContractTheme, player: Player): boolean {
  switch (theme.kind) {
    case 'country':
      return theme.countries.includes(playerCountryOf(player) ?? '');
    case 'role':
      return datasetRolesOf(player).includes(theme.role);
    case 'major':
      return CHAMPION_TEAM_IDS.has(player.teamId ?? '');
  }
}

export type LendaDonorProblem = 'OK' | 'BAD_COUNT' | 'BAD_DONOR';

/** Doadores de uma entrega parcial da Lenda: do 1 ao máximo, cópias do tema inclusive repetidas. */
export function checkLendaDonors(def: LendaDef, donorIds: readonly string[]): LendaDonorProblem {
  if (!donorIds.length || donorIds.length > LENDA_DELIVERY_MAX) return 'BAD_COUNT';
  const players = donorIds.map((id) => collectionPlayerById.get(id) ?? null);
  return players.every((player) => player && isPlayerInTheme(def.theme, player)) ? 'OK' : 'BAD_DONOR';
}

// ——————————————————————————————————————— Trade-Up: raridade de saída ———————————————————————————————————————

export interface TradeLadderStep {
  step: TradeStepKey;
  /** Raridade de saída deste degrau (a entregue +/- 1 ou 2, presa entre common e goat). */
  tier: Rarity;
  /** Peso do degrau já renormalizado para somar 1 entre os degraus possíveis. */
  mass: number;
  /** Limite cumulativo em [0, 1]: vence o primeiro degrau cujo upTo contém o roll. */
  upTo: number;
}

export interface TradeLadder {
  steps: readonly TradeLadderStep[];
  inputTier: Rarity;
}

const STEP_OFFSET: Readonly<Record<TradeStepKey, number>> = { down: -1, same: 0, up: 1, double: 2 };

/** A roleta de raridades da entrega: pesos fixos e visíveis, renormalizados entre os degraus que existem. */
export function tradeLadder(inputTier: Rarity): TradeLadder {
  const base = RARITIES.indexOf(inputTier);
  const candidates: Array<{ step: TradeStepKey; tier: Rarity; weight: number }> = [];
  for (const step of ['down', 'same', 'up', 'double'] as const) {
    const index = base + STEP_OFFSET[step];
    if (index < 0 || index >= RARITIES.length) continue;
    candidates.push({ step, tier: RARITIES[index], weight: TRADE_RARITY_WEIGHTS[step] });
  }
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let upTo = 0;
  const steps = candidates.map((candidate) => {
    const mass = candidate.weight / total;
    upTo += mass;
    return { step: candidate.step, tier: candidate.tier, mass, upTo };
  });
  return { steps, inputTier };
}

/** O degrau de um roll: o primeiro cujo limite cumulativo contém o roll. */
export const tradeTierOf = (ladder: TradeLadder, roll: number): TradeLadderStep =>
  ladder.steps.find((step) => roll < step.upTo) ?? ladder.steps[ladder.steps.length - 1];

// ——————————————————————————————————————— Trade-Up: entrada e pools ———————————————————————————————————————

export type TradeInputProblem = 'OK' | 'BAD_COUNT' | 'BAD_DONOR' | 'BAD_RARITY';
export interface TradeInputCheck {
  ok: boolean;
  code: TradeInputProblem;
  /** Quando OK, a raridade comum das 5 cartas. */
  rarity: Rarity | null;
}

/**
 * A entrega: cinco cópias, todas da MESMA raridade (países e repetições livres — tendo 5× da mesma
 * carta, pode mandar as cinco). O estoque de cada carta é conferido pelo servidor na transação.
 */
export function checkTradeInputs(inputIds: readonly string[]): TradeInputCheck {
  if (inputIds.length !== TRADE_INPUTS) return { ok: false, code: 'BAD_COUNT', rarity: null };
  const players = inputIds.map((id) => collectionPlayerById.get(id) ?? null);
  if (players.some((player) => !player)) return { ok: false, code: 'BAD_DONOR', rarity: null };
  const rarity = rarityOf(players[0]!);
  return players.every((player) => rarityOf(player!) === rarity)
    ? { ok: true, code: 'OK', rarity }
    : { ok: false, code: 'BAD_RARITY', rarity: null };
}

/** Quantas cópias da carta a entrega pede. */
export const unitsOf = (inputIds: readonly string[], playerId: string): number =>
  inputIds.reduce((sum, id) => (id === playerId ? sum + 1 : sum), 0);

/** A "coleção" de uma carta: a organização do time-ano (vitality-2025 → vitality). */
export const orgOf = (player: Player): string => (player.teamId ?? '').replace(/-\d{4}$/, '') || '?';
export const countryOf = (player: Player): string => playerCountryOf(player) ?? '??';

let orgBuckets: Map<string, Player[]> | null = null;
const orgPoolOf = (org: string): readonly Player[] =>
  (orgBuckets ??= (() => {
    const map = new Map<string, Player[]>();
    for (const player of collectionPlayers) {
      const key = orgOf(player);
      const bucket = map.get(key);
      if (bucket) bucket.push(player);
      else map.set(key, [player]);
    }
    return map;
  })()).get(org) ?? [];

let countryBuckets: Map<string, Player[]> | null = null;
const countryPoolOf = (country: string): readonly Player[] =>
  (countryBuckets ??= (() => {
    const map = new Map<string, Player[]>();
    for (const player of collectionPlayers) {
      const key = countryOf(player);
      const bucket = map.get(key);
      if (bucket) bucket.push(player);
      else map.set(key, [player]);
    }
    return map;
  })()).get(country) ?? [];

let byRarityAll: Record<Rarity, Player[]> | null = null;
const rarityPoolOf = (tier: Rarity): readonly Player[] =>
  (byRarityAll ??= Object.fromEntries(RARITIES.map((rarity) => [rarity, collectionPlayers.filter((player) => rarityOf(player) === rarity)])) as Record<Rarity, Player[]>)[tier];

/** Uma carta da entrega com os pools que ela alimenta. */
export interface TradeSource {
  id: string;
  player: Player;
  org: string;
  country: string;
  orgPool: readonly Player[];
  countryPool: readonly Player[];
}

export const tradeSources = (inputIds: readonly string[]): TradeSource[] =>
  inputIds.map((id) => {
    const player = collectionPlayerById.get(id)!;
    const org = orgOf(player);
    return { id, player, org, country: countryOf(player), orgPool: orgPoolOf(org), countryPool: countryPoolOf(countryOf(player)) };
  });

export type TradeScope = 'org' | 'country' | 'any';

/**
 * A carta do trade-up: 1 das 5 entregas sorteada (cada uma vale 20%) decide a coleção; dentro dela sai uma carta da
 * raridade do degrau, preferindo as que a conta ainda não tem (esgotou a coleção, cai para o pool do país; depois,
 * para o pool geral da raridade — nunca falta carta). Se já tiver a carta, ganha outra cópia.
 */
export function pickTradeCard(sources: readonly TradeSource[], tier: Rarity, sourceIndex: number, pickRoll: number, owned: ReadonlySet<string>): { id: string; scope: TradeScope } {
  const source = sources[Math.min(sources.length - 1, Math.max(0, sourceIndex))];
  const preferFresh = (pool: readonly Player[]): readonly Player[] => {
    const fresh = pool.filter((player) => !owned.has(player.id));
    return fresh.length ? fresh : pool;
  };
  const inTier = (pool: readonly Player[]) => pool.filter((player) => rarityOf(player) === tier);
  const fromOrg = preferFresh(inTier(source.orgPool));
  if (fromOrg.length) return { id: fromOrg[Math.min(fromOrg.length - 1, Math.floor(pickRoll * fromOrg.length))].id, scope: 'org' };
  const fromCountry = preferFresh(inTier(source.countryPool));
  if (fromCountry.length) return { id: fromCountry[Math.min(fromCountry.length - 1, Math.floor(pickRoll * fromCountry.length))].id, scope: 'country' };
  const fromAny = preferFresh(rarityPoolOf(tier));
  return { id: fromAny[Math.min(fromAny.length - 1, Math.floor(pickRoll * fromAny.length))].id, scope: 'any' };
}
