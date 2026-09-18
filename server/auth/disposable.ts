/** Short list of throwaway mailbox domains; a hit blocks the magic link (multi-account farming). */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  '10minutemail.com', '10minutemail.net', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'sharklasers.com',
  'mailinator.com', 'maildrop.cc', 'yopmail.com', 'yopmail.fr', 'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tempmailo.com',
  'getnada.com', 'dispostable.com', 'trashmail.com', 'trashmail.me', 'mohmal.com', 'fakeinbox.com', 'throwawaymail.com',
  'mailnesia.com', 'emailondeck.com', 'mytemp.email', 'tempr.email', 'discard.email', 'spamgourmet.com', 'mintemail.com',
  'burnermail.io', 'inboxkitten.com', 'harakirimail.com', 'mailsac.com', 'tmpmail.org', 'tmpmail.net', 'moakt.com', 'crazymailing.com'
]);
