import type { Db } from '../db/client';
import type { Mailer } from './mailer';
import { hashToken, isDisposable, newToken, normalizeEmail } from './tokens';

export const MAGIC_LINK_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  teamName: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export type AuthErrorCode = 'INVALID_EMAIL' | 'DISPOSABLE_EMAIL' | 'INVALID_TOKEN' | 'UNAUTHORIZED';

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string = code) {
    super(message);
  }
}

type UserRow = { id: string; email: string; display_name: string | null; team_name: string | null; verified_at: Date | null; created_at: Date };

const toUser = (row: UserRow): AuthUser => ({
  id: row.id,
  email: row.email,
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
}

/** Creates the user on first request; the response never tells whether the e-mail already existed. */
export async function requestMagicLink(deps: AuthDeps, rawEmail: string, ip: string): Promise<{ devLink?: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new AuthError('INVALID_EMAIL', 'E-mail inválido');
  if (isDisposable(email)) throw new AuthError('DISPOSABLE_EMAIL', 'E-mail descartável não é aceito');
  const now = deps.now?.() ?? Date.now();
  const token = newToken();
  await deps.db.tx(async (tx) => {
    const [user] = await tx.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ($1)
       ON CONFLICT ((lower(email))) DO UPDATE SET email = users.email
       RETURNING id`,
      [email]
    );
    await tx.query('INSERT INTO magic_links (token_hash, user_id, expires_at, ip) VALUES ($1, $2, $3, $4)', [hashToken(token), user.id, new Date(now + MAGIC_LINK_TTL_MS), ip]);
  });
  const link = `${deps.siteUrl.replace(/\/$/, '')}/online/conta?token=${token}`;
  if (deps.mailer.devLink) return { devLink: link };
  await deps.mailer.send(email, link);
  return {};
}

/** Burns the link (single use, 15 min) and opens a 30-day session. */
export async function verifyMagicLink(deps: AuthDeps, token: string): Promise<{ sessionToken: string; user: AuthUser }> {
  const now = deps.now?.() ?? Date.now();
  const session = newToken();
  return deps.db.tx(async (tx) => {
    const [link] = await tx.query<{ user_id: string }>(
      'UPDATE magic_links SET used_at = $2 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 RETURNING user_id',
      [hashToken(token), new Date(now)]
    );
    if (!link) throw new AuthError('INVALID_TOKEN', 'Link inválido ou expirado');
    const [user] = await tx.query<UserRow>(
      'UPDATE users SET verified_at = COALESCE(verified_at, $2), last_seen_at = $2 WHERE id = $1 RETURNING id, email, display_name, team_name, verified_at, created_at',
      [link.user_id, new Date(now)]
    );
    await tx.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashToken(session), user.id, new Date(now + SESSION_TTL_MS)]);
    await tx.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [user.id]);
    return { sessionToken: session, user: toUser(user) };
  });
}

export async function getSession(deps: Pick<AuthDeps, 'db' | 'now'>, sessionToken: string): Promise<AuthUser | null> {
  const now = deps.now?.() ?? Date.now();
  const [row] = await deps.db.query<UserRow>(
    `SELECT u.id, u.email, u.display_name, u.team_name, u.verified_at, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [hashToken(sessionToken), new Date(now)]
  );
  if (!row) return null;
  void deps.db.query('UPDATE users SET last_seen_at = $2 WHERE id = $1', [row.id, new Date(now)]).catch(() => {});
  return toUser(row);
}

export async function logout(deps: Pick<AuthDeps, 'db'>, sessionToken: string) {
  await deps.db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(sessionToken)]);
}

export async function setProfile(deps: Pick<AuthDeps, 'db'>, userId: string, profile: { displayName: string; teamName: string }) {
  await deps.db.query('UPDATE users SET display_name = $2, team_name = $3 WHERE id = $1', [userId, profile.displayName, profile.teamName]);
}
