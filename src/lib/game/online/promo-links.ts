import { browser } from '$app/environment';
import { authFetch } from './account';

/**
 * Links promocionais (stories): `/online/promo/CODIGO` guarda o código aqui até o login terminar; o `conta` manda o
 * código junto do pedido de link (ele viaja na linha do magic link no servidor) e quem já está logado resgata direto.
 */
const PENDING_KEY = 'cs13a0:online:promo-link';
const PENDING_TTL_MS = 7 * 24 * 60 * 60_000;

export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export interface PromoLinkInfo {
  code: string;
  coins: number;
  total: number;
  remaining: number;
  newAccountsOnly: boolean;
  expiresAt: string | null;
  active: boolean;
}

export type PromoRedeemStatus = 'granted' | 'invalid' | 'expired' | 'sold_out' | 'already' | 'not_new';
export type PromoRedeemResult =
  | { status: 'granted'; code: string; coins: number; wallet: number }
  | { status: Exclude<PromoRedeemStatus, 'granted'>; code: string };

export interface PromoLinkAdminRow extends PromoLinkInfo {
  id: string;
  uses: number;
  createdAt: string;
  /** Campanha antiga do mesmo código, substituída por uma nova. */
  archived: boolean;
}

export const normalizePromoCode = (raw: string | null | undefined): string | null => {
  const code = (raw ?? '').trim().toUpperCase();
  return PROMO_CODE_PATTERN.test(code) ? code : null;
};

export function rememberPromo(code: string) {
  if (!browser) return;
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ code, expires: Date.now() + PENDING_TTL_MS })); } catch { /* storage opcional */ }
}

export function peekPromo(): string | null {
  if (!browser) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as { code?: string; expires?: number } | null;
    if (!stored || !(stored.expires && stored.expires > Date.now())) return null;
    return normalizePromoCode(stored.code);
  } catch { return null; }
}

export function consumePromo() {
  if (!browser) return;
  try { localStorage.removeItem(PENDING_KEY); } catch { /* storage opcional */ }
}

export const promoLinkUrl = (code: string, origin = browser ? window.location.origin : 'https://www.cs13a0.com') => `${origin}/online/promo/${code}`;

export const fetchPromoLink = (serverUrl: string, code: string) =>
  authFetch<{ link: PromoLinkInfo }>(serverUrl, `/promo-links/${encodeURIComponent(code)}`).then((result) => result.link);

export const redeemPromoLink = (serverUrl: string, code: string) =>
  authFetch<{ promo: PromoRedeemResult }>(serverUrl, '/promo-links/redeem', { body: { code } }).then((result) => result.promo);

export const listPromoLinksAdmin = (serverUrl: string) =>
  authFetch<{ links: PromoLinkAdminRow[] }>(serverUrl, '/admin/promo-links').then((result) => result.links);

export const createPromoLinkAdmin = (serverUrl: string, input: { code: string; bonusCoins: number; maxUses: number; newAccountsOnly: boolean; expiresAt: string | null }) =>
  authFetch<{ link: PromoLinkAdminRow }>(serverUrl, '/admin/promo-links', { body: input }).then((result) => result.link);

export const disablePromoLinkAdmin = (serverUrl: string, code: string) =>
  authFetch<{ disabled: boolean }>(serverUrl, `/admin/promo-links/${encodeURIComponent(code)}/disable`, { body: {} }).then((result) => result.disabled);
