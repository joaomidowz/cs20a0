import type { Coach, Player } from '../types';

/**
 * Pack and coin rules of the online collection, shared by the server (source of truth) and the client (previews and
 * odds shown in the shop). Pure: no data imports, so it stays inside the online boundary.
 */
export type PackTier = 'basic' | 'funcao' | 'coach' | 'time' | 'prata' | 'ouro' | 'supremo' | 'global' | 'era' | 'diamante' | 'icone';
/** Daily promotion: four fixed cards of the day, the same for every account, each sold once per account at a discount. */
export type PromoTier = 'promo_elite' | 'promo_superstar' | 'promo_legend' | 'promo_coach';
export type Rarity = 'common' | 'rare' | 'elite' | 'superstar' | 'legend' | 'goat';
export type RarityOdds = Readonly<Record<Rarity, number>>;
export type TeamPackRarity = 'standard' | 'elite' | 'legendary';

export const RARITIES: readonly Rarity[] = ['common', 'rare', 'elite', 'superstar', 'legend', 'goat'];
export const PACK_TIERS: readonly PackTier[] = ['basic', 'funcao', 'coach', 'time', 'prata', 'ouro', 'supremo', 'global', 'era', 'diamante', 'icone'];
export const PROMO_TIERS: readonly PromoTier[] = ['promo_elite', 'promo_superstar', 'promo_legend', 'promo_coach'];
/** Discount of each daily offer, in whole percent over the card's coin value. */
export const PROMO_DISCOUNT: Readonly<Record<PromoTier, number>> = { promo_elite: 30, promo_superstar: 25, promo_legend: 25, promo_coach: 30 };
export const isPromoTier = (tier: string): tier is PromoTier => (PROMO_TIERS as readonly string[]).includes(tier);
/** Price of a daily offer: the card value minus the discount, in whole coins (integers only). The server charges exactly this. */
export const promoFinalPrice = (originalPrice: number, tier: PromoTier): number => originalPrice - Math.floor((originalPrice * PROMO_DISCOUNT[tier]) / 100);
/** Packs sold for coins, in shop order (the basic pack is the daily grant). */
export const BUYABLE_TIERS: readonly Exclude<PackTier, 'basic'>[] = ['funcao', 'coach', 'time', 'prata', 'era', 'ouro', 'diamante', 'icone'];
export const CARDS_PER_PACK = 3;
export const DAILY_BASIC_PACKS = 3;
/** Free packs per account besides the daily basic ones: one Prata per ISO week and one Ouro per month, both in Brasília time. */
export type FreePackTier = 'prata' | 'ouro';
export const FREE_PACK_TIERS: readonly FreePackTier[] = ['prata', 'ouro'];
export const isFreePackTier = (tier: string): tier is FreePackTier => (FREE_PACK_TIERS as readonly string[]).includes(tier);

const odds = (common: number, rare: number, elite: number, superstar: number, legend: number, goat: number): RarityOdds => ({ common, rare, elite, superstar, legend, goat });
const same = (row: RarityOdds): RarityOdds[] => Array.from({ length: CARDS_PER_PACK }, () => row);
/**
 * Odds per rarity for each card of a pack, in percent (each row sums to 100). Premium packs guarantee their first
 * card (Diamante a Legend, 6% of it a GOAT; Ícone a GOAT) and their other two cards are Elite or better. Legend and GOAT
 * odds of the premium packs are ~40% below what they were, moved to Superstar and Elite: a GOAT should feel like a miracle.
 */
export const PACK_SLOTS: Readonly<Record<PackTier, readonly RarityOdds[]>> = {
  basic: same(odds(78, 17, 4.2, 0.58, 0.2, 0.02)),
  funcao: same(odds(10, 35, 38, 14, 2.5, 0.5)),
  coach: same(odds(10, 35, 38, 14, 2.5, 0.5)),
  time: same(odds(10, 35, 38, 14, 2.5, 0.5)),
  prata: same(odds(55, 30, 12, 2.5, 0.3, 0.2)),
  era: same(odds(10, 35, 38, 14, 2.5, 0.5)),
  ouro: same(odds(10, 35, 38, 14, 2.5, 0.5)),
  // Caixas do Major (patentes do CS): Supremo é metade do caminho Ouro→Diamante, Global 75% — a 1ª carta cai de
  // 100% Lenda+ (Diamante) para ~76% (Global) e ~52% (Supremo), e o resto da linha acompanha a interpolação.
  supremo: [odds(5, 17.5, 19, 7, 48, 3.5), odds(5, 17.5, 26, 29, 19, 3.5), odds(5, 17.5, 26, 29, 19, 3.5)],
  global: [odds(2.5, 8.75, 9.5, 3.5, 71, 4.75), odds(2.5, 8.75, 20, 36.5, 27.5, 4.75), odds(2.5, 8.75, 20, 36.5, 27.5, 4.75)],
  diamante: [odds(0, 0, 0, 0, 94, 6), odds(0, 0, 14, 44, 36, 6), odds(0, 0, 14, 44, 36, 6)],
  icone: [odds(0, 0, 0, 0, 0, 100), odds(0, 0, 12, 40, 36, 12), odds(0, 0, 12, 40, 36, 12)]
};

/** Coins; the basic pack is the daily grant and cannot be bought. */
export const PACK_PRICES: Readonly<Record<PackTier, number>> = { basic: 0, funcao: 10000, coach: 7500, time: 15000, prata: 5000, era: 10000, ouro: 12000, supremo: 0, global: 0, diamante: 50000, icone: 100000 };
/** Caixa de Time starts at 15k and rises with the best historical tier available for that organization. */
export const TEAM_PACK_PRICES: Readonly<Record<TeamPackRarity, number>> = { standard: 15000, elite: 30000, legendary: 50000 };

/** Chance of at least one card of `rarities` in a pack (for the shop). */
export function packChance(tier: PackTier, rarities: readonly Rarity[]): number {
  const miss = PACK_SLOTS[tier].reduce((product, row) => product * (1 - rarities.reduce((sum, rarity) => sum + row[rarity], 0) / 100), 1);
  return 1 - miss;
}

/** Direct sale back to the site pays this share of the card's displayed value. */
export const SELL_RATIO = 0.4;

/** Coin value of each rarity, the middle of its band: the upgrader and the trades compare cards by it. */
export const RARITY_BASE_VALUE: Readonly<Record<Rarity, number>> = { common: 2400, rare: 3600, elite: 6000, superstar: 12000, legend: 24000, goat: 100000 };
/** Lowest and highest value of each rarity, by overall (common and rare follow the Elite proportion, 90%..120% of the base). */
export const RARITY_VALUE_BAND: Readonly<Record<Rarity, readonly [number, number]>> = {
  common: [2160, 2880], rare: [3240, 4320], elite: [5400, 7200], superstar: [10800, 14400], legend: [21600, 30000], goat: [85000, 110000]
};
/** Overalls each rarity spans in the pool: the lowest gets the band floor, the middle the base, the highest the band top. */
const RARITY_OVERALL_SPAN: Readonly<Record<Rarity, readonly [number, number]>> = { common: [69, 80], rare: [78, 86], elite: [81, 87], superstar: [85, 92], legend: [90, 96], goat: [95, 99] };
const COACH_OVERALL_SPAN: readonly [number, number] = [68, 90];
/** Rounding step of each band: it divides both ends of the band, so a rounded value never leaves it. */
const RARITY_VALUE_STEP: Readonly<Record<Rarity, number>> = { common: 20, rare: 20, elite: 100, superstar: 100, legend: 100, goat: 1000 };
/** A coach is worth this share of a player of the same rarity. */
export const COACH_VALUE_RATIO = 0.8;

export const rarityOf = (player: Pick<Player, 'rarity'>): Rarity => {
  const value = (player.rarity ?? 'common').toLowerCase();
  return (RARITIES as readonly string[]).includes(value) ? (value as Rarity) : 'common';
};

/** Value inside the rarity band: floor..base over the lower half of the overall span, base..top over the upper half. */
function bandValue(rarity: Rarity, overall: number, span: readonly [number, number], scale = 1): number {
  const [floor, top] = RARITY_VALUE_BAND[rarity];
  const base = RARITY_BASE_VALUE[rarity];
  const position = Math.min(1, Math.max(0, (overall - span[0]) / (span[1] - span[0])));
  const raw = position < 0.5 ? floor + (base - floor) * position * 2 : base + (top - base) * (position - 0.5) * 2;
  const step = RARITY_VALUE_STEP[rarity];
  return Math.round((raw * scale) / step) * step;
}

/** Coin value of a card: its rarity price, varied by overall inside the rarity band. Selling and duplicates pay a small share of it. */
export function coinValue(player: Pick<Player, 'overall' | 'rarity'>): number {
  const rarity = rarityOf(player);
  return bandValue(rarity, player.overall ?? RARITY_OVERALL_SPAN[rarity][0], RARITY_OVERALL_SPAN[rarity]);
}

export const sellValue = (player: Pick<Player, 'overall' | 'rarity' | 'role' | 'badges'>) => Math.floor(coinValue(player) * SELL_RATIO);

/**
 * Coins for finishing a run with the collection lineup, by placement in the 16-team field. The playoffs pay double
 * what they used to (2026-09-20): reaching them is the hard part, and it is how an account that spends nothing grows.
 * Going out before the playoffs pays the same as before.
 */
export const PLACEMENT_COINS: Readonly<Record<string, number>> = { placementChampion: 1700, placementRunnerUp: 1050, placement3to4: 700, placement5to8: 420 };
/** Everyone knocked out before the playoffs (Swiss stage or earlier). */
export const ELIMINATED_COINS = 100;

/** Coins for finishing a run with the collection lineup; halved when the run did not count for the season. */
export function matchReward(placement: string, ranked: boolean): number {
  const base = PLACEMENT_COINS[placement] ?? ELIMINATED_COINS;
  return ranked ? base : Math.floor(base / 2);
}

/**
 * Crate sealed for a ranked Major, by final placement, following the CS:GO rank ladder (Prata → Ouro → Supremo →
 * Global): 5º–8º a Prata, 3º–4º an Ouro, vice a Supremo (~half a Diamante) and the champion a Global (~75% of one).
 * Knocked out before the playoffs pays the daily basic crate. Stage 1/2 exits never happen online (single Swiss);
 * they map to the basic crate as a fallback.
 */
export const MAJOR_PACK_BY_PLACEMENT: Readonly<Record<string, PackTier>> = {
  placementChampion: 'global',
  placementRunnerUp: 'supremo',
  placement3to4: 'ouro',
  placement5to8: 'prata',
  placementStage3: 'basic',
  placementStage2: 'basic',
  placementStage1: 'basic'
};

/** Sem retroatividade (dono, 2026-09-22): só major terminado depois do deploy do recurso lacra caixa —
 * o histórico inteiro de runs passadas nunca vira pilha de caixa. Instante fixo no código, de propósito. */
export const MAJOR_PACK_CUTOFF = '2026-09-22T18:20:00.000Z';

/**
 * Season points by placement with four or more humans in the run. 2026-09-22 reshape (dono): the champion earns a bit
 * more and a Swiss exit — knocked out before the quarterfinals — now costs points instead of paying one.
 */
export const PLACEMENT_POINTS: Readonly<Record<string, number>> = { placementChampion: 12, placementRunnerUp: 7, placement3to4: 5, placement5to8: 3 };
export const ELIMINATED_POINTS = -2;
/** Humans in the run for full points; three score half (rounded up), two a third (rounded), one alone scores nothing. */
export const FULL_POINTS_LOBBY = 4;
/** Every ranked run scores (FACEIT style, no more top-10 cut): the first runs of the day worth full, later ones decay to half — volume grinds inflate slowly, going deep still pays. */
export const FULL_SCORE_RUNS_PER_DAY = 10;
export const DECAYED_RUN_FACTOR = 0.5;

/** Match awards repeat inside a Major (several perfect series, several top-10 players): together they add at most this. */
export const AWARD_POINTS_CAP = 3;

/**
 * Boost de farm (2026-09-22, redesenho): item consumível da loja — cada item resolve 10 majors solo instantâneas com
 * a lineup salva (coins pela metade, zero pontos de temporada). Estoque livre (compra quantos quiser); o USO tem teto
 * diário para não virar impressora de coins nos times 96+ (medido: ~15k de lucro por item no campo normal).
 */
export const BOOST_ITEM_PRICE = 4_500;
export const BOOST_RUNS_PER_ITEM = 10;
export const BOOST_DAILY_RUN_CAP = 50;

export function seasonPoints(placement: string, lobbySize: number, stage3Wins = 0): number {
  const full = PLACEMENT_POINTS[placement] ?? (ELIMINATED_POINTS + Math.max(0, Math.min(2, stage3Wins)));
  if (lobbySize >= FULL_POINTS_LOBBY) return full;
  if (lobbySize === 3) return Math.ceil(full / 2);
  if (lobbySize === 2) return Math.round(full / 3);
  return 0;
}

/**
 * Prêmio em coins pela colocação final na Season (1º ao 16º), pago uma única vez no fechamento do mês:
 * 1º 150k, 2º 100k, 3º 75k, 4º 60k, 5º–8º 45k, 9º–12º 30k, 13º–16º 20k — 765k por season no total.
 * O índice 0 é o campeão.
 */
export const SEASON_PRIZES: readonly number[] = [
  150_000, 100_000, 75_000, 60_000,
  45_000, 45_000, 45_000, 45_000,
  30_000, 30_000, 30_000, 30_000,
  20_000, 20_000, 20_000, 20_000
];

/** A repeated card pays a small share: keeping this separate from direct sale prevents packs from printing coins. */
export const DUPLICATE_RATIO = 0.035;

/** Chance that one of the three cards of a pack is a coach instead of a player . */
export const COACH_CHANCE: Readonly<Record<PackTier, number>> = { basic: 0.08, funcao: 0, coach: 1, time: 0, prata: 0.12, ouro: 0.18, supremo: 0.16, global: 0.15, era: 0.12, diamante: 0.15, icone: 0.2 };

/** New accounts start with this; paid once on the first verified login. */
export const WELCOME_COINS = 10_000;

/**
 * Vagas de lineup: duas grátis por conta e até três extras compradas uma única vez cada (15.000 coins).
 * Cada vaga guarda um time completo e independente (as cartas podem repetir entre vagas — repetir carta não
 * muda poder, só preparação); o jogo usa a vaga ATIVA ao entrar em fila ou sala.
 */
export const LINEUP_SLOTS_FREE = 2;
export const LINEUP_SLOTS_MAX = 5;
export const LINEUP_SLOT_PRICE = 15_000;

/** Coin value of a coach card: COACH_VALUE_RATIO of a player of the same rarity, varied by the coach overall. */
export function coachCoinValue(coach: Pick<Coach, 'overall' | 'rarity'>): number {
  return bandValue(rarityOf(coach), coach.overall, COACH_OVERALL_SPAN, COACH_VALUE_RATIO);
}

export const coachSellValue = (coach: Pick<Coach, 'overall' | 'rarity'>) => Math.floor(coachCoinValue(coach) * SELL_RATIO);

/** Upgrader: at most this many cards staked at once. */
export const UPGRADER_MAX_STAKE = 6;
/** Upgrader: the chance never goes above this, however much is staked (the cap of the lower rarities). */
export const UPGRADER_MAX_CHANCE = 0.75;
/** Upgrader: cap of the chance by the rarity of the target (a coach uses its own rarity). */
export const UPGRADER_RARITY_CAP: Readonly<Record<Rarity, number>> = { common: 0.75, rare: 0.75, elite: 0.75, superstar: 0.75, legend: 0.25, goat: 0.1 };
/** Upgrader: a target this many rarities (or more) above the best staked card... */
export const UPGRADER_REACH_STEPS = 2;
/** ...has its chance multiplied by this, after the cap. */
export const UPGRADER_REACH_PENALTY = 0.5;
/** Upgrader: share of the staked value that turns into chance (the house keeps the rest). */
export const UPGRADER_EDGE = 0.9;

/**
 * Chance of turning cards worth `stakeValue` coins into one worth `targetValue`: stake/target × UPGRADER_EDGE, capped by
 * the target rarity (UPGRADER_RARITY_CAP), then halved when the target is UPGRADER_REACH_STEPS or more rarities above the
 * best staked card. Server and client call this same function.
 */
export function upgradeChance(stakeValue: number, targetValue: number, targetRarity: Rarity, stakeRarities: readonly Rarity[]): number {
  if (targetValue <= 0 || stakeValue <= 0) return 0;
  const capped = Math.min(UPGRADER_RARITY_CAP[targetRarity], (stakeValue / targetValue) * UPGRADER_EDGE);
  const best = Math.max(...stakeRarities.map((rarity) => RARITIES.indexOf(rarity)));
  return RARITIES.indexOf(targetRarity) - best >= UPGRADER_REACH_STEPS ? capped * UPGRADER_REACH_PENALTY : capped;
}
