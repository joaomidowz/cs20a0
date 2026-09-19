// Provably fair do upgrader (commit-reveal). O servidor publica SHA-256(serverSeed) antes do giro; o sorteio é
// HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`), e a seed revelada depois deixa qualquer um refazer a conta.
// Aqui ficam só as partes puras e a verificação com crypto.subtle (navegador e Node); o servidor calcula com node:crypto.

import { cardCoinValue } from './card-value';
import { collectionCoaches, collectionPlayers } from './collection-pool';
import { rarityOf } from './collection-rules';

/** Hex digits of the HMAC that make the roll: 13 hex = 52 bits, exact in a double. */
export const FAIR_ROLL_HEX = 13;
export const FAIR_CLIENT_SEED_MAX = 64;

/** Suffix of the HMAC message: '' is the main draw; on a loss ':refund' picks the consolation branch and ':refund-pick' the card. */
export type FairSuffix = '' | 'refund' | 'refund-pick';

/** HMAC message of the main draw; the consolation draws on a loss use the same message plus ':refund' / ':refund-pick'. */
export const fairMessage = (clientSeed: string, nonce: number, suffix: FairSuffix = '') => `${clientSeed}:${nonce}${suffix ? `:${suffix}` : ''}`;

/** First 13 hex digits of an HMAC over 16^13: a number in [0, 1). */
export const rollFromHex = (hex: string): number => parseInt(hex.slice(0, FAIR_ROLL_HEX), 16) / 16 ** FAIR_ROLL_HEX;

/** Index in [0, size) from a roll in [0, 1). */
export const rollIndex = (roll: number, size: number): number => Math.min(size - 1, Math.floor(roll * size));

/** Loss: chance that the consolation card is a random Common (otherwise a card worth about 20% of the stake). */
export const CONSOLATION_COMMON_CHANCE = 0.7;
/** Loss: the "value" consolation is worth at most this share of the staked value (80% less). */
export const CONSOLATION_VALUE_RATIO = 0.2;
/** Loss: the "value" consolation is drawn among this many cards closest to (and not above) that value. */
export const CONSOLATION_NEAREST = 5;

export type ConsolationKind = 'common' | 'value';
export interface Consolation {
  card: string;
  kind: ConsolationKind;
}

type PoolCard = { id: string; value: number; common: boolean };
let poolCache: PoolCard[] | null = null;
/** Every collection card (players and coaches), sorted by id: the same order in the browser and on the server. */
const consolationPool = (): PoolCard[] =>
  (poolCache ??= [...collectionPlayers, ...collectionCoaches]
    .map((card) => ({ id: card.id, value: cardCoinValue(card.id), common: rarityOf(card) === 'common' }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));

/**
 * The downgraded card handed out on a loss; never one of the staked cards nor the target. The ':refund' roll picks the
 * branch: below 0.7 a random Common; otherwise the cards worth at most 20% of the stake, the CONSOLATION_NEAREST closest
 * to that value, one drawn by the ':refund-pick' roll (a Common when no card is that cheap).
 */
export function consolationCard(branchRoll: number, pickRoll: number, stake: readonly string[], target: string): Consolation {
  const excluded = new Set([...stake, target]);
  const pool = consolationPool().filter((card) => !excluded.has(card.id));
  const commons = pool.filter((card) => card.common);
  const common = (): Consolation => {
    const list = commons.length ? commons : pool;
    return { card: list[rollIndex(pickRoll, list.length)].id, kind: 'common' };
  };
  if (branchRoll < CONSOLATION_COMMON_CHANCE) return common();
  const limit = stake.reduce((sum, id) => sum + cardCoinValue(id), 0) * CONSOLATION_VALUE_RATIO;
  const nearest = pool
    .filter((card) => card.value > 0 && card.value <= limit)
    .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, CONSOLATION_NEAREST);
  if (!nearest.length) return common();
  return { card: nearest[rollIndex(pickRoll, nearest.length)].id, kind: 'value' };
}

/** Needle angle for a roll: the win arc runs clockwise from the top over chance × 360°. */
export const rollDegrees = (roll: number): number => roll * 360;

export const isValidClientSeed = (value: string) => value.length >= 1 && value.length <= FAIR_CLIENT_SEED_MAX;

const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const encode = (text: string) => new TextEncoder().encode(text);

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encode(text)));
}

export async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', cryptoKey, encode(message)));
}

/** Browser-side roll, the same number the server draws with node:crypto. */
export async function fairRoll(serverSeed: string, clientSeed: string, nonce: number, suffix: FairSuffix = ''): Promise<number> {
  return rollFromHex(await hmacHex(serverSeed, fairMessage(clientSeed, nonce, suffix)));
}

export interface FairReveal {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  roll: number;
  chance: number;
  won: boolean;
  /** On a loss, with the round's stake and target: the consolation card is checked too. */
  stake?: readonly string[];
  target?: string;
  consolation?: string | null;
}

/** Browser-side consolation card of a lost round, the same the server hands out. */
export async function fairConsolation(serverSeed: string, clientSeed: string, nonce: number, stake: readonly string[], target: string): Promise<Consolation> {
  const [branch, pick] = await Promise.all([fairRoll(serverSeed, clientSeed, nonce, 'refund'), fairRoll(serverSeed, clientSeed, nonce, 'refund-pick')]);
  return consolationCard(branch, pick, stake, target);
}

/**
 * Checks a revealed round: the seed matches the hash published before the spin (`committedHash`), the roll is the HMAC
 * of the seeds, and the outcome is roll < chance. On a loss with the stake given, the consolation card must match too.
 */
export async function verifyFair(reveal: FairReveal, committedHash: string = reveal.serverSeedHash): Promise<boolean> {
  const hash = await sha256Hex(reveal.serverSeed);
  if (hash !== committedHash || hash !== reveal.serverSeedHash) return false;
  const roll = await fairRoll(reveal.serverSeed, reveal.clientSeed, reveal.nonce);
  if (roll !== reveal.roll || (roll < reveal.chance) !== reveal.won) return false;
  if (reveal.won || !reveal.stake || reveal.target === undefined) return true;
  const consolation = await fairConsolation(reveal.serverSeed, reveal.clientSeed, reveal.nonce, reveal.stake, reveal.target);
  return consolation.card === reveal.consolation;
}
