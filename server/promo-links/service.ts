import type { Db, Tx } from '../db/client';
import { applyLedger } from '../collection/service';

/**
 * Links promocionais (dono, 2026-10-07): um código solto nos stories dá coins a quem entra por ele, limitado aos N
 * primeiros. O bônus soma ao saldo (contas novas já recebem as boas-vindas); cada código decide se vale também para
 * contas antigas. Nada aqui lança para fora do fluxo de login: um código ruim nunca derruba a sessão.
 */
export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export interface PromoLinkInfo {
  code: string;
  coins: number;
  total: number;
  remaining: number;
  newAccountsOnly: boolean;
  expiresAt: string | null;
  /** Ainda dá para resgatar: tem vaga e não expirou. */
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
  /** Campanha antiga do mesmo código, substituída por uma nova: fica só como histórico. */
  archived: boolean;
}

type PromoRow = { id: string; code: string; bonus_coins: number; max_uses: number; uses: number; new_accounts_only: boolean; expires_at: Date | null; created_at: Date; archived: boolean };
const COLUMNS = 'id, code, bonus_coins, max_uses, uses, new_accounts_only, expires_at, created_at, archived';
const toAdminRow = (row: PromoRow, now: number): PromoLinkAdminRow => ({ ...toInfo(row, now), id: row.id, uses: row.uses, createdAt: row.created_at.toISOString(), archived: row.archived });

/** Maiúsculas e só o alfabeto do código; null quando não serve. */
export function normalizePromoCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase();
  return PROMO_CODE_PATTERN.test(code) ? code : null;
}

const toInfo = (row: PromoRow, now: number): PromoLinkInfo => {
  const expired = row.expires_at !== null && row.expires_at.getTime() <= now;
  const remaining = Math.max(0, row.max_uses - row.uses);
  return {
    code: row.code,
    coins: row.bonus_coins,
    total: row.max_uses,
    remaining,
    newAccountsOnly: row.new_accounts_only,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    active: !expired && remaining > 0 && !row.archived
  };
};

/** Visão pública do código: prêmio e vagas, nunca quem resgatou. */
export async function getPromoLink(db: Pick<Db, 'query'>, rawCode: string, now: number): Promise<PromoLinkInfo | null> {
  const code = normalizePromoCode(rawCode);
  if (!code) return null;
  const [row] = await db.query<PromoRow>(`SELECT ${COLUMNS} FROM promo_links WHERE code = $1 AND NOT archived`, [code]);
  return row ? toInfo(row, now) : null;
}

/**
 * Resgate dentro da transação de quem chama (login ou rota própria). A vaga é decidida por um único UPDATE condicional,
 * então duas pessoas disputando a última vaga nunca levam as duas.
 */
export async function redeemPromoLink(tx: Tx, userId: string, rawCode: string, now: number, options: { firstLogin: boolean }): Promise<PromoRedeemResult> {
  const code = normalizePromoCode(rawCode);
  if (!code) return { status: 'invalid', code: (rawCode ?? '').toUpperCase().slice(0, 32) };
  const [row] = await tx.query<PromoRow>(`SELECT ${COLUMNS} FROM promo_links WHERE code = $1 AND NOT archived FOR UPDATE`, [code]);
  if (!row) return { status: 'invalid', code };
  if (row.expires_at !== null && row.expires_at.getTime() <= now) return { status: 'expired', code };
  if (row.new_accounts_only && !options.firstLogin) return { status: 'not_new', code };
  // "Já resgatou" é por campanha: o mesmo código numa campanha nova vale de novo.
  const [already] = await tx.query('SELECT 1 FROM promo_link_redemptions WHERE link_id = $1 AND user_id = $2', [row.id, userId]);
  if (already) return { status: 'already', code };
  const [claimed] = await tx.query<{ bonus_coins: number }>('UPDATE promo_links SET uses = uses + 1 WHERE id = $1 AND uses < max_uses RETURNING bonus_coins', [row.id]);
  if (!claimed) return { status: 'sold_out', code };
  await tx.query('INSERT INTO promo_link_redemptions (link_id, code, user_id, coins, redeemed_at) VALUES ($1, $2, $3, $4, $5)', [row.id, code, userId, claimed.bonus_coins, new Date(now)]);
  const wallet = await applyLedger(tx, userId, claimed.bonus_coins, 'promo_link', code);
  return { status: 'granted', code, coins: claimed.bonus_coins, wallet };
}

export interface CreatePromoLinkInput {
  code: string;
  bonusCoins: number;
  maxUses: number;
  newAccountsOnly: boolean;
  expiresAt: string | null;
}

export class PromoLinkError extends Error {
  constructor(readonly status: number, readonly code: string, message = code) {
    super(message);
  }
}

/**
 * Cria a campanha. O mesmo código pode voltar quando a campanha viva já acabou (expirada, desativada ou esgotada): a antiga
 * é arquivada e a nova nasce com as vagas zeradas; só um código ativo barra a criação.
 */
export async function createPromoLink(db: Pick<Db, 'tx'>, input: CreatePromoLinkInput, adminUserId: string, now: number): Promise<PromoLinkAdminRow> {
  const code = normalizePromoCode(input.code);
  if (!code) throw new PromoLinkError(400, 'INVALID_CODE', 'Código: 3 a 32 caracteres, letras, números, _ ou -');
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now)) throw new PromoLinkError(400, 'INVALID_EXPIRY', 'Validade precisa estar no futuro');
  return db.tx(async (tx) => {
    const [live] = await tx.query<PromoRow>(`SELECT ${COLUMNS} FROM promo_links WHERE code = $1 AND NOT archived FOR UPDATE`, [code]);
    if (live) {
      if (toInfo(live, now).active) throw new PromoLinkError(409, 'CODE_TAKEN', 'Esse código ainda está ativo: desative-o ou espere expirar para usá-lo de novo');
      await tx.query('UPDATE promo_links SET archived = true WHERE id = $1', [live.id]);
    }
    const [row] = await tx.query<PromoRow>(
      `INSERT INTO promo_links (code, bonus_coins, max_uses, new_accounts_only, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [code, input.bonusCoins, input.maxUses, input.newAccountsOnly, expiresAt, adminUserId]
    );
    return toAdminRow(row, now);
  });
}

export async function listPromoLinks(db: Pick<Db, 'query'>, now: number): Promise<PromoLinkAdminRow[]> {
  const rows = await db.query<PromoRow>(`SELECT ${COLUMNS} FROM promo_links ORDER BY archived ASC, created_at DESC LIMIT 200`);
  return rows.map((row) => toAdminRow(row, now));
}

/** Desativar = expirar agora; o histórico de resgates fica. */
export async function disablePromoLink(db: Pick<Db, 'query'>, rawCode: string, now: number): Promise<boolean> {
  const code = normalizePromoCode(rawCode);
  if (!code) return false;
  const rows = await db.query('UPDATE promo_links SET expires_at = $2 WHERE code = $1 AND NOT archived AND (expires_at IS NULL OR expires_at > $2) RETURNING code', [code, new Date(now)]);
  return rows.length > 0;
}
