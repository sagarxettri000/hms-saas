import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST;
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    }
  }

  get isConfigured(): boolean {
    return !!this.transporter;
  }

  async send(opts: MailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(`SMTP not configured; email not sent to ${opts.to}`);
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || "HMS SaaS <no-reply@hms.local>",
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      return true;
    } catch (err) {
      this.logger.error(`Failed to send email: ${(err as Error).message}`);
      return false;
    }
  }
}
