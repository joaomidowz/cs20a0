import { z } from 'zod';
import { escapeMailHtml, type Mailer } from '../auth/mailer';
import type { Db } from '../db/client';
import { collectionPlayerById, collectionTeamById } from '../../src/lib/game/online/collection-pool';

/**
 * Support desk: a contact form (purchases, account, bugs) and a rating report form (a card's overall or role looks
 * wrong). Every ticket is stored first and e-mailed after, so a mail outage never loses one; the inbox replies
 * straight to the player through Reply-To.
 */
export interface SupportDeps {
  db: Db;
  mailer: Mailer;
  /** Inbox that receives the tickets. */
  to: string;
}

export const CONTACT_CATEGORIES = ['purchase', 'account', 'bug', 'suggestion', 'other'] as const;
export const RATING_FIELDS = ['overall', 'firepower', 'entry', 'awp', 'igl', 'support', 'clutch', 'consistency', 'mental', 'experience', 'role', 'team', 'nationality', 'photo', 'name', 'other'] as const;
/** Fields whose current value is a 0–99 attribute on the card. */
const NUMERIC_FIELDS = new Set(['overall', 'firepower', 'entry', 'awp', 'igl', 'support', 'clutch', 'consistency', 'mental', 'experience']);
export const MAX_TICKETS_PER_DAY = 10;

const email = z.string().trim().toLowerCase().email().max(254);
/** Hidden field: humans leave it empty, form-filling bots do not. */
const honeypot = z.string().max(0).optional();

export const contactSchema = z.object({
  category: z.enum(CONTACT_CATEGORIES),
  email: email.optional(),
  name: z.string().trim().max(40).optional(),
  /** Mercado Pago transaction number, when the problem is a purchase. */
  paymentRef: z.string().trim().regex(/^[\w-]{0,40}$/).optional(),
  message: z.string().trim().min(10).max(2000),
  website: honeypot
});

export const ratingSchema = z.object({
  playerId: z.string().trim().min(1).max(80),
  field: z.enum(RATING_FIELDS),
  suggested: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(10).max(1000),
  source: z.string().trim().url().max(300).optional().or(z.literal('')),
  email: email.optional(),
  website: honeypot
});

export class SupportError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const CATEGORY_LABEL: Record<(typeof CONTACT_CATEGORIES)[number], string> = { purchase: 'Compra', account: 'Conta', bug: 'Bug', suggestion: 'Sugestão', other: 'Outro' };
const FIELD_LABEL: Record<(typeof RATING_FIELDS)[number], string> = {
  overall: 'Overall', firepower: 'Firepower / mira', entry: 'Entry', awp: 'AWP', igl: 'IGL', support: 'Suporte', clutch: 'Clutch', consistency: 'Consistência', mental: 'Mental', experience: 'Experiência',
  role: 'Função principal', team: 'Time', nationality: 'Nacionalidade', photo: 'Foto', name: 'Nome / nick', other: 'Outro'
};

type Line = [label: string, value: string];
const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ').slice(0, 80);

function renderMail(title: string, lines: Line[], body: string): { text: string; html: string } {
  const text = [...lines.map(([label, value]) => `${label}: ${value}`), '', body].join('\n');
  const rows = lines.map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#7d878d;font:700 12px Arial,sans-serif;white-space:nowrap;vertical-align:top;">${escapeMailHtml(label)}</td><td style="padding:4px 0;color:#1d2327;font:400 13px Arial,sans-serif;">${escapeMailHtml(value)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid #dde1e4;"><tr><td style="padding:20px 24px;">
<p style="margin:0 0 4px;font:700 11px Arial,sans-serif;color:#5b8a00;letter-spacing:2px;text-transform:uppercase;">cs13a0 · suporte</p>
<h1 style="margin:0 0 16px;font:900 20px Arial,sans-serif;color:#1d2327;">${escapeMailHtml(title)}</h1>
<table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
<div style="margin-top:16px;padding:14px;background:#f4f5f6;font:400 14px/1.6 Arial,sans-serif;color:#1d2327;white-space:pre-wrap;">${escapeMailHtml(body)}</div>
<p style="margin:16px 0 0;font:400 11px Arial,sans-serif;color:#7d878d;">Responda este e-mail para falar direto com o jogador.</p>
</td></tr></table></body></html>`;
  return { text, html };
}

async function withinDailyLimit(db: Db, address: string) {
  const [{ n }] = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM support_tickets WHERE email = $1 AND created_at > now() - interval '1 day'`, [address]);
  if (Number(n) >= MAX_TICKETS_PER_DAY) throw new SupportError(429, 'RATE_LIMITED', 'Muitas mensagens hoje; tente amanhã');
}

async function store(db: Db, kind: 'contact' | 'rating', userId: string | null, address: string, payload: unknown, subject: string, mail: { text: string; html: string }) {
  const [ticket] = await db.query<{ id: string }>(
    'INSERT INTO support_tickets (kind, user_id, email, payload) VALUES ($1, $2, $3, $4) RETURNING id::text',
    [kind, userId, address, JSON.stringify({ ...payload as object, subject, text: mail.text, html: mail.html })]
  );
  return ticket.id;
}

/** Sends the oldest unmailed tickets (the new one included). A failure leaves them for the next flush. */
export async function flushTickets(deps: SupportDeps, limit = 5): Promise<number> {
  const pending = await deps.db.query<{ id: string; email: string; payload: { subject: string; text: string; html: string } }>(
    `SELECT id::text, email, payload FROM support_tickets WHERE mailed_at IS NULL AND created_at > now() - interval '7 days' ORDER BY created_at LIMIT $1`,
    [limit]
  );
  let sent = 0;
  for (const ticket of pending) {
    try {
      await deps.mailer.deliver({ to: deps.to, subject: `[cs13a0 #${ticket.id}] ${ticket.payload.subject}`, text: ticket.payload.text, html: ticket.payload.html, replyTo: ticket.email });
      await deps.db.query('UPDATE support_tickets SET mailed_at = now() WHERE id = $1::bigint', [ticket.id]);
      sent += 1;
    } catch {
      console.warn(`support ticket #${ticket.id}: mail failed, will retry`);
      break;
    }
  }
  return sent;
}

export async function createContactTicket(deps: SupportDeps, input: z.infer<typeof contactSchema>, user: { id: string; email: string } | null): Promise<{ ticketId: string }> {
  const address = user?.email ?? input.email;
  if (!address) throw new SupportError(400, 'EMAIL_REQUIRED', 'Informe um e-mail para receber a resposta');
  await withinDailyLimit(deps.db, address);
  const lines: Line[] = [['Categoria', CATEGORY_LABEL[input.category]], ['E-mail', address], ['Conta', user ? `sim (${user.id})` : 'não logado']];
  if (input.name) lines.push(['Nome', oneLine(input.name)]);
  if (input.paymentRef) lines.push(['Transação MP', input.paymentRef]);
  if (user && input.category === 'purchase') {
    const purchases = await deps.db.query<{ id: string; product_id: string; status: string; external_id: string; created_at: Date; credited: boolean }>(
      `SELECT id::text, product_id, status, external_id, created_at, credited_at IS NOT NULL AS credited FROM purchases WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [user.id]
    );
    for (const purchase of purchases) {
      lines.push([`Compra #${purchase.id}`, `${purchase.product_id} · ${purchase.status}${purchase.credited ? ' · creditada' : ''} · MP ${purchase.external_id.startsWith('pending:') ? '—' : purchase.external_id} · ${purchase.created_at.toISOString().slice(0, 16).replace('T', ' ')}`]);
    }
    if (!purchases.length) lines.push(['Compras', 'nenhuma registrada']);
  }
  const subject = `${CATEGORY_LABEL[input.category]} · ${oneLine(input.message).slice(0, 60)}`;
  const mail = renderMail(`Suporte · ${CATEGORY_LABEL[input.category]}`, lines, input.message);
  const ticketId = await store(deps.db, 'contact', user?.id ?? null, address, { category: input.category, paymentRef: input.paymentRef ?? null }, subject, mail);
  await flushTickets(deps);
  return { ticketId };
}

export async function createRatingTicket(deps: SupportDeps, input: z.infer<typeof ratingSchema>, user: { id: string; email: string } | null): Promise<{ ticketId: string }> {
  const player = collectionPlayerById.get(input.playerId);
  if (!player) throw new SupportError(404, 'UNKNOWN_PLAYER', 'Jogador não encontrado');
  const address = user?.email ?? input.email;
  if (!address) throw new SupportError(400, 'EMAIL_REQUIRED', 'Informe um e-mail para receber a resposta');
  if (NUMERIC_FIELDS.has(input.field) && !/^\d{1,2}$/.test(input.suggested)) throw new SupportError(400, 'INVALID_VALUE', 'Sugira um número de 1 a 99');
  await withinDailyLimit(deps.db, address);
  const team = collectionTeamById.get(player.teamId ?? '');
  const current = NUMERIC_FIELDS.has(input.field)
    ? String((player as unknown as Record<string, number | null | undefined>)[input.field] ?? '—')
    : input.field === 'role' ? String(player.role ?? '—') : input.field === 'team' ? String(team?.name ?? player.teamId ?? '—') : '—';
  const nickname = player.nickname ?? player.id;
  const lines: Line[] = [
    ['Jogador', `${nickname} (${player.id})`],
    ['Ano', String(player.year ?? '—')],
    ['Time', String(team?.name ?? player.teamId ?? '—')],
    ['Campo', FIELD_LABEL[input.field]],
    ['Valor atual', current],
    ['Sugerido', oneLine(input.suggested)],
    ['Overall atual', String(player.overall ?? '—')],
    ['E-mail', address],
    ['Conta', user ? `sim (${user.id})` : 'não logado']
  ];
  if (input.source) lines.push(['Fonte', input.source]);
  const subject = `Overall · ${nickname} ${player.year ?? ''} · ${FIELD_LABEL[input.field]} ${current} → ${oneLine(input.suggested)}`;
  const mail = renderMail(`Reclamação de carta · ${nickname} ${player.year ?? ''}`, lines, input.reason);
  const ticketId = await store(deps.db, 'rating', user?.id ?? null, address, { playerId: player.id, field: input.field, current, suggested: input.suggested, source: input.source || null }, subject, mail);
  await flushTickets(deps);
  return { ticketId };
}
