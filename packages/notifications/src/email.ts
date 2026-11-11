/**
 * Envío de email detrás de una interfaz propia (directrices, secciones 3.1 y 18.3).
 * Cambiar de proveedor (Resend → Amazon SES) = agregar otro EmailSender.
 */
export type EmailAttachment = { filename: string; content: string; contentType: string };
export type EmailMessage = { to: string; subject: string; html: string; text: string; attachments?: EmailAttachment[] };

const base64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export class EmailError extends Error {}

/** Resend (producción). Requiere RESEND_API_KEY y un remitente verificado. */
export class ResendSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(m: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [m.to],
        subject: m.subject,
        html: m.html,
        text: m.text,
        attachments: m.attachments?.map((a) => ({ filename: a.filename, content: base64(a.content), content_type: a.contentType })),
      }),
    });
    if (!res.ok) throw new EmailError(`Resend respondió ${res.status}`);
  }
}

/** Mailpit (desarrollo y tests): los emails se ven en su bandeja local. */
export class MailpitSender implements EmailSender {
  constructor(
    private readonly baseUrl: string,
    private readonly from: string,
  ) {}
  async send(m: EmailMessage): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        From: { Email: this.from },
        To: [{ Email: m.to }],
        Subject: m.subject,
        HTML: m.html,
        Text: m.text,
        Attachments: m.attachments?.map((a) => ({ Filename: a.filename, Content: base64(a.content), ContentType: a.contentType })),
      }),
    });
    if (!res.ok) throw new EmailError(`Mailpit respondió ${res.status}`);
  }
}

/** Sin proveedor configurado: no envía, solo registra en el log del servidor. */
export class LogSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(m: EmailMessage): Promise<void> {
    this.sent.push(m);
    console.info(`[email no enviado: falta proveedor] para=${m.to} asunto="${m.subject}"`);
  }
}

/** Elige el proveedor según las variables de entorno. */
export function emailSenderFromEnv(env: Record<string, string | undefined> = process.env): EmailSender {
  const from = env.EMAIL_FROM ?? 'Agenda <onboarding@resend.dev>';
  if (env.RESEND_API_KEY) return new ResendSender(env.RESEND_API_KEY, from);
  if (env.MAILPIT_URL) return new MailpitSender(env.MAILPIT_URL, 'agenda@localhost');
  return new LogSender();
}
