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
        text: `Entre no cs13a0 com este link (vale 15 minutos, uso único):\n\n${link}\n\nSe não foi você, ignore este e-mail.\n\ncs13a0 — projeto independente, sem afiliação com Valve, HLTV, Liquipedia, organizações ou jogadores.`,
        html: magicLinkHtml(link)
      });
      if (error) throw new Error(`Resend: ${error.message}`);
    }
  };
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Dark, table-based and inline-styled: the only layout mail clients render consistently. The logo is text, so nothing is blocked as a remote image. */
export function magicLinkHtml(link: string): string {
  const href = escapeHtml(link);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>cs13a0</title></head>
<body style="margin:0;padding:0;background:#0b0e10;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e10;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#12171b;border:1px solid #232b31;">
<tr><td style="padding:26px 28px 18px;border-bottom:1px solid #232b31;">
  <span style="display:inline-block;background:#c8ff32;color:#0a0d08;font:900 20px/1 Arial,Helvetica,sans-serif;padding:6px 7px;letter-spacing:.5px;">CS</span><span style="font:900 22px/1 Arial,Helvetica,sans-serif;color:#f2f5f3;letter-spacing:1px;padding-left:8px;vertical-align:middle;">13A0</span>
</td></tr>
<tr><td style="padding:28px;">
  <p style="margin:0 0 8px;font:700 11px/1 Arial,Helvetica,sans-serif;color:#c8ff32;letter-spacing:2px;text-transform:uppercase;">Acesso à conta</p>
  <h1 style="margin:0 0 14px;font:900 28px/1.15 Arial,Helvetica,sans-serif;color:#f2f5f3;">Seu link de acesso</h1>
  <p style="margin:0 0 22px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#a9b3b9;">Clique no botão para entrar no cs13a0. Sem senha: o link vale <strong style="color:#f2f5f3;">15 minutos</strong> e funciona <strong style="color:#f2f5f3;">uma vez só</strong>.</p>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#c8ff32;">
    <a href="${href}" style="display:inline-block;padding:15px 28px;font:900 14px/1 Arial,Helvetica,sans-serif;color:#0a0d08;text-decoration:none;letter-spacing:1.5px;text-transform:uppercase;">Entrar no cs13a0</a>
  </td></tr></table>
  <p style="margin:22px 0 6px;font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#7d878d;">Se o botão não abrir, copie e cole este endereço no navegador:</p>
  <p style="margin:0;font:400 12px/1.5 'Courier New',monospace;color:#c8ff32;word-break:break-all;">${href}</p>
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #232b31;background:#0e1215;">
  <p style="margin:0 0 6px;font:400 12px/1.5 Arial,Helvetica,sans-serif;color:#7d878d;">Não pediu este e-mail? Pode ignorar: ninguém entra na sua conta sem clicar no link.</p>
  <p style="margin:0;font:400 11px/1.5 Arial,Helvetica,sans-serif;color:#5d676d;">cs13a0 · <a href="https://www.cs13a0.com" style="color:#7d878d;">cs13a0.com</a> · Projeto independente, sem afiliação, patrocínio ou endosso da Valve, HLTV, Liquipedia, organizações ou jogadores.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
