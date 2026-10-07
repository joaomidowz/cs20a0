import { browser } from '$app/environment';
import { writable } from 'svelte/store';

/** Session token of the logged user (magic link), kept only in this browser. */
const SESSION_KEY = 'cs13a0:online:session';

export interface AccountUser {
  id: string;
  email: string;
  displayName: string | null;
  teamName: string | null;
  verifiedAt: string | null;
  createdAt: string;
  /** Pode administrar links promocionais (e-mail em ADMIN_EMAILS). */
  admin?: boolean;
}

/** Resultado do link promocional que viajou com o login, quando houve um (ver `promo-links.ts`). */
export type LoginPromoResult =
  | { status: 'granted'; code: string; coins: number; wallet: number }
  | { status: 'invalid' | 'expired' | 'sold_out' | 'already' | 'not_new'; code: string };

export class AccountError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const read = (): string | null => {
  if (!browser) return null;
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
};
const write = (value: string | null) => {
  if (!browser) return;
  try { value ? localStorage.setItem(SESSION_KEY, value) : localStorage.removeItem(SESSION_KEY); } catch { /* storage optional */ }
};

export const sessionToken = writable<string | null>(read());
export const accountUser = writable<AccountUser | null>(null);
sessionToken.subscribe(write);

let currentToken: string | null = read();
sessionToken.subscribe((value) => { currentToken = value; });

/** JSON request to the online server; adds the Bearer session when there is one and turns error bodies into AccountError. */
export async function authFetch<T = unknown>(serverUrl: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(new URL(path, serverUrl), {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', ...(currentToken ? { authorization: `Bearer ${currentToken}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    // A request that never settles would freeze whatever awaits it (the rewards panel polls with it): give up instead.
    signal: AbortSignal.timeout(12_000)
  });
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; message?: string } & T;
  if (!response.ok) {
    if (response.status === 401) { sessionToken.set(null); accountUser.set(null); }
    throw new AccountError(response.status, payload.error ?? 'REQUEST_FAILED', payload.message ?? payload.error ?? `HTTP ${response.status}`);
  }
  return payload;
}

export const requestMagicLink = (serverUrl: string, email: string, promo: string | null = null) =>
  authFetch<{ devLink?: string; devCode?: string }>(serverUrl, '/auth/request', { body: { email, ...(promo ? { promo } : {}) } });

export async function verifyMagicLink(serverUrl: string, token: string, promo: string | null = null): Promise<{ user: AccountUser; promo?: LoginPromoResult }> {
  const result = await authFetch<{ sessionToken: string; user: AccountUser; promo?: LoginPromoResult }>(serverUrl, '/auth/verify', { body: { token, ...(promo ? { promo } : {}) } });
  sessionToken.set(result.sessionToken);
  accountUser.set(result.user);
  return { user: result.user, promo: result.promo };
}

/** Typed fallback for where the link cannot open the right app (phone e-mail apps, installed PWA). */
export async function verifyMagicCode(serverUrl: string, email: string, code: string, promo: string | null = null): Promise<{ user: AccountUser; promo?: LoginPromoResult }> {
  const result = await authFetch<{ sessionToken: string; user: AccountUser; promo?: LoginPromoResult }>(serverUrl, '/auth/verify', { body: { email, code, ...(promo ? { promo } : {}) } });
  sessionToken.set(result.sessionToken);
  accountUser.set(result.user);
  return { user: result.user, promo: result.promo };
}

/** Loads the profile of the stored session; a stale token clears itself. */
export async function loadAccount(serverUrl: string): Promise<AccountUser | null> {
  if (!currentToken) { accountUser.set(null); return null; }
  try {
    const result = await authFetch<{ user: AccountUser }>(serverUrl, '/me');
    accountUser.set(result.user);
    return result.user;
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) return null;
    throw error;
  }
}

export async function logoutAccount(serverUrl: string) {
  try { await authFetch(serverUrl, '/auth/logout', { body: {} }); } catch { /* the session is dropped locally anyway */ }
  sessionToken.set(null);
  accountUser.set(null);
}

export const saveProfile = (serverUrl: string, profile: { displayName: string; teamName: string }) =>
  authFetch(serverUrl, '/me/profile', { method: 'PUT', body: profile });
