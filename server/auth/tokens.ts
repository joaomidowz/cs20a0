import { createHash, randomBytes } from 'node:crypto';
import { DISPOSABLE_DOMAINS } from './disposable';

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** One account per mailbox: lowercase, no `+tag`, no dots in the local part of gmail. */
export function normalizeEmail(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (value.length > 254 || !EMAIL_PATTERN.test(value)) return null;
  const [rawLocal, domain] = value.split('@');
  let local = rawLocal.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') local = local.replace(/\./g, '');
  if (!local) return null;
  return `${local}@${domain === 'googlemail.com' ? 'gmail.com' : domain}`;
}

export const isDisposable = (email: string) => DISPOSABLE_DOMAINS.has(email.split('@')[1] ?? '');
