// Provably fair do upgrader (commit-reveal). O servidor publica SHA-256(serverSeed) antes do giro; o sorteio é
// HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`), e a seed revelada depois deixa qualquer um refazer a conta.
// Aqui ficam só as partes puras e a verificação com crypto.subtle (navegador e Node); o servidor calcula com node:crypto.

/** Hex digits of the HMAC that make the roll: 13 hex = 52 bits, exact in a double. */
export const FAIR_ROLL_HEX = 13;
export const FAIR_CLIENT_SEED_MAX = 64;

/** HMAC message of the main draw; the refund card on a loss uses the same message plus ':refund'. */
export const fairMessage = (clientSeed: string, nonce: number, suffix: '' | 'refund' = '') => `${clientSeed}:${nonce}${suffix ? `:${suffix}` : ''}`;

/** First 13 hex digits of an HMAC over 16^13: a number in [0, 1). */
export const rollFromHex = (hex: string): number => parseInt(hex.slice(0, FAIR_ROLL_HEX), 16) / 16 ** FAIR_ROLL_HEX;

/** Which of the staked cards comes back on a loss, from the ':refund' roll. */
export const refundIndex = (refundRoll: number, stakeSize: number): number => Math.min(stakeSize - 1, Math.floor(refundRoll * stakeSize));

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
export async function fairRoll(serverSeed: string, clientSeed: string, nonce: number, suffix: '' | 'refund' = ''): Promise<number> {
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
}

/**
 * Checks a revealed round: the seed matches the hash published before the spin (`committedHash`), the roll is the HMAC
 * of the seeds, and the outcome is roll < chance.
 */
export async function verifyFair(reveal: FairReveal, committedHash: string = reveal.serverSeedHash): Promise<boolean> {
  const hash = await sha256Hex(reveal.serverSeed);
  if (hash !== committedHash || hash !== reveal.serverSeedHash) return false;
  const roll = await fairRoll(reveal.serverSeed, reveal.clientSeed, reveal.nonce);
  return roll === reveal.roll && (roll < reveal.chance) === reveal.won;
}
