import { authFetch } from './account';

/** Support desk client. The server identifies a logged player by the session; `email` is only read when logged out. */
export type ContactCategory = 'purchase' | 'account' | 'bug' | 'suggestion' | 'other';
export type RatingField = 'overall' | 'firepower' | 'entry' | 'awp' | 'igl' | 'support' | 'clutch' | 'consistency' | 'mental' | 'experience' | 'role' | 'team' | 'nationality' | 'photo' | 'name' | 'other';
export const NUMERIC_RATING_FIELDS: ReadonlyArray<RatingField> = ['overall', 'firepower', 'entry', 'awp', 'igl', 'support', 'clutch', 'consistency', 'mental', 'experience'];

const clean = <T extends Record<string, unknown>>(body: T) => Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined && value !== '')) as Partial<T>;

export const sendContact = (serverUrl: string, body: { category: ContactCategory; email?: string; name?: string; paymentRef?: string; message: string; website?: string }) =>
  authFetch<{ ticketId: string }>(serverUrl, '/support/contact', { method: 'POST', body: clean(body) });

export const sendRatingReport = (serverUrl: string, body: { playerId: string; field: RatingField; suggested: string; reason: string; source?: string; email?: string; website?: string }) =>
  authFetch<{ ticketId: string }>(serverUrl, '/support/rating', { method: 'POST', body: clean(body) });
