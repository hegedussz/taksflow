import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Valódi küldés SMTP-n (fejlesztéskor a docker compose Mailpit szolgáltatására). */
export class SmtpMailer implements Mailer {
  private readonly transport: ReturnType<typeof nodemailer.createTransport>;

  constructor(url: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** SMTP nélkül a leveleket csak naplózzuk. */
export class LogMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    console.log(`[e-mail] címzett: ${message.to} | tárgy: ${message.subject}`);
  }
}

/** Tesztekhez: a leveleket memóriában gyűjti. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}
