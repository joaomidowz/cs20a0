/** Sends the magic link. In dev (`AUTH_DEV_LINK=1`) nothing is sent: the link comes back in the HTTP response. */
export interface Mailer {
  readonly devLink: boolean;
  send(to: string, link: string): Promise<void>;
}

export function createDevMailer(): Mailer {
  return { devLink: true, send: async () => {} };
}

export function createResendMailer(apiKey: string, from: string): Mailer {
  return {
    devLink: false,
    async send(to, link) {
      // Lazy import keeps the bundle startup cheap when the dev mailer is used.
      const { Resend } = await import('resend');
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from,
        to,
        subject: 'Seu link de acesso ao cs13a0',
        text: `Entre no cs13a0 com este link (vale 15 minutos, uso único):\n\n${link}\n\nSe não foi você, ignore este e-mail.`
      });
      if (error) throw new Error(`Resend: ${error.message}`);
    }
  };
}
