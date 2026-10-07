import type { Db, Tx } from '../db/client';
import type { Mailer } from './mailer';
import { WELCOME_COINS } from '../../src/lib/game/online/collection-rules';
import { hashToken, isDisposable, newCode, newToken, normalizeEmail } from './tokens';
import { normalizePromoCode, redeemPromoLink, type PromoRedeemResult } from '../promo-links/service';

export const MAGIC_LINK_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** "Online now" for the presence chip: any authenticated request inside this window (getSession bumps last_seen_at). */
export const PRESENCE_WINDOW_SECONDS = 5 * 60;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  teamName: string | null;
  verifiedAt: string | null;
  createdAt: string;
  /** E-mail na lista ADMIN_EMAILS: pode criar links promocionais. */
  admin: boolean;
}

export type AuthErrorCode = 'INVALID_EMAIL' | 'DISPOSABLE_EMAIL' | 'INVALID_TOKEN' | 'INVALID_CODE' | 'UNAUTHORIZED';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string = code) {
    super(message);
  }
}

type UserRow = { id: string; email: string; display_name: string | null; team_name: string | null; verified_at: Date | null; created_at: Date };

const toUser = (row: UserRow, admins: ReadonlySet<string> = new Set()): AuthUser => ({
  id: row.id,
  email: row.email,
  admin: admins.has(row.email),
  displayName: row.display_name,
  teamName: row.team_name,
  verifiedAt: row.verified_at ? row.verified_at.toISOString() : null,
  createdAt: row.created_at.toISOString()
});

export interface AuthDeps {
  db: Db;
  mailer: Mailer;
  siteUrl: string;
  now?: () => number;
  /** E-mails (já normalizados) com acesso de administração; vazio = ninguém. */
  adminEmails?: ReadonlySet<string>;
}

export interface VerifiedSession {
  sessionToken: string;
  user: AuthUser;
  /** Resultado do link promocional que viajou com o login, quando houve um. */
  promo?: PromoRedeemResult;
}

/** Creates the user on first request; the response never tells whether the e-mail already existed. */
export async function requestMagicLink(deps: AuthDeps, rawEmail: string, ip: string, promo: string | null = null): Promise<{ devLink?: string; devCode?: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new AuthError('INVALID_EMAIL', 'E-mail inválido');
  if (isDisposable(email)) throw new AuthError('DISPOSABLE_EMAIL', 'E-mail descartável não é aceito');
  const now = deps.now?.() ?? Date.now();
  const token = newToken();
  const code = newCode();
  await deps.db.tx(async (tx) => {
    const [user] = await tx.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1)
       ON CONFLICT ((lower(email))) DO UPDATE SET email = users.email
       RETURNING id`,
      [email]
    );
    // O código promocional viaja na linha do link: no celular o e-mail abre em outro navegador, sem o localStorage de quem clicou.
    await tx.query('INSERT INTO magic_links (token_hash, user_id, expires_at, ip, code_hash, promo_code) VALUES ($1, $2, $3, $4, $5, $6)', [hashToken(token), user.id, new Date(now + MAGIC_LINK_TTL_MS), ip, hashToken(code), normalizePromoCode(promo)]);
  });
  const link = `${deps.siteUrl.replace(/\/$/, '')}/online/conta?token=${token}`;
  if (deps.mailer.devLink) return { devLink: link, devCode: code };
  await deps.mailer.send(email, link, code);
  return {};
}

/** Burns the link (single use, 15 min) and opens a 30-day session. */
export async function verifyMagicLink(deps: AuthDeps, token: string, promo: string | null = null): Promise<VerifiedSession> {
  const now = deps.now?.() ?? Date.now();
  const session = newToken();
  return deps.db.tx(async (tx) => {
    const [link] = await tx.query<{ user_id: string; promo_code: string | null }>(
      'UPDATE magic_links SET used_at = $2 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 RETURNING user_id, promo_code',
      [hashToken(token), new Date(now)]
    );
    if (!link) throw new AuthError('INVALID_TOKEN', 'Link inválido ou expirado');
    return grantSession(tx, link.user_id, now, session, deps, promo ?? link.promo_code);
  });
}

/** Same 15-minute, single-use window as the link, but typed by hand — works where the link cannot open the right app. */
export async function verifyMagicCode(deps: AuthDeps, rawEmail: string, code: string, promo: string | null = null): Promise<VerifiedSession> {
  const email = normalizeEmail(rawEmail);
  if (!email || !/^\d{6}$/.test(code)) throw new AuthError('INVALID_CODE', 'Código inválido ou expirado');
  const now = deps.now?.() ?? Date.now();
  const session = newToken();
  return deps.db.tx(async (tx) => {
    // The typed code burns its own row; sibling codes from repeat requests stay valid for their window, like the links.
    const [link] = await tx.query<{ user_id: string; promo_code: string | null }>(
      `UPDATE magic_links l SET used_at = $4 FROM users u
       WHERE u.id = l.user_id AND u.email = $1 AND l.code_hash = $2 AND l.used_at IS NULL AND l.expires_at > $3
       RETURNING l.user_id, l.promo_code`,
      [email, hashToken(code), new Date(now), new Date(now)]
    );
    if (!link) throw new AuthError('INVALID_CODE', 'Código inválido ou expirado');
    return grantSession(tx, link.user_id, now, session, deps, promo ?? link.promo_code);
  });
}

/** Session + wallet + welcome coins, once per account; shared by the link and the typed code. The promo code, if any, is redeemed in the same transaction. */
async function grantSession(tx: Tx, userId: string, now: number, session: string, deps: Pick<AuthDeps, 'adminEmails'>, promo: string | null): Promise<VerifiedSession> {
  const [before] = await tx.query<{ verified_at: Date | null }>('SELECT verified_at FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const firstLogin = !before.verified_at;
  const [user] = await tx.query<UserRow>(
    'UPDATE users SET verified_at = COALESCE(verified_at, $2), last_seen_at = $2 WHERE id = $1 RETURNING id, email, display_name, team_name, verified_at, created_at',
    [userId, new Date(now)]
  );
  await tx.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashToken(session), user.id, new Date(now + SESSION_TTL_MS)]);
  await tx.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
  await tx.query('INSERT INTO lineup_slot_unlocks (user_id, slot_index) VALUES ($1, 0), ($1, 1) ON CONFLICT DO NOTHING', [user.id]);
  if (firstLogin) {
    // Welcome coins, once per account: the ledger row doubles as the guard against paying twice.
    const [paid] = await tx.query(`SELECT 1 FROM ledger WHERE user_id = $1 AND reason = 'welcome'`, [user.id]);
    if (!paid) {
      await tx.query(`INSERT INTO ledger (user_id, delta, reason, ref_id) VALUES ($1, $2, 'welcome', 'welcome')`, [user.id, WELCOME_COINS]);
      await tx.query('UPDATE wallets SET coins = coins + $2, updated_at = now() WHERE user_id = $1', [user.id, WELCOME_COINS]);
    }
  }
  // Link promocional: só contas novas quando o código exige; o resultado volta na resposta e nunca derruba o login.
  const promoResult = promo ? await redeemPromoLink(tx, user.id, promo, now, { firstLogin }) : undefined;
  return { sessionToken: session, user: toUser(user, deps.adminEmails), ...(promoResult ? { promo: promoResult } : {}) };
}

export async function getSession(deps: Pick<AuthDeps, 'db' | 'now' | 'adminEmails'>, sessionToken: string): Promise<AuthUser | null> {
  const now = deps.now?.() ?? Date.now();
  const [row] = await deps.db.query<UserRow>(
    `SELECT u.id, u.email, u.display_name, u.team_name, u.verified_at, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [hashToken(sessionToken), new Date(now)]
  );
  if (!row) return null;
  void deps.db.query('UPDATE users SET last_seen_at = $2 WHERE id = $1', [row.id, new Date(now)]).catch(() => {});
  return toUser(row, deps.adminEmails);
}

export async function logout(deps: Pick<AuthDeps, 'db'>, sessionToken: string) {
  await deps.db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(sessionToken)]);
}

/** Accounts seen inside the window; the /presence poll is itself authenticated, so watching the chip keeps you counted. */
export async function onlineUserCount(db: Db, windowSeconds: number): Promise<number> {
  const [row] = await db.query<{ count: number }>('SELECT count(*)::int AS count FROM users WHERE last_seen_at > now() - make_interval(secs => $1)', [windowSeconds]);
  return row?.count ?? 0;
}

export async function setProfile(deps: Pick<AuthDeps, 'db'>, userId: string, profile: { displayName: string; teamName: string }) {
  await deps.db.query('UPDATE users SET display_name = $2, team_name = $3 WHERE id = $1', [userId, profile.displayName, profile.teamName]);
}
