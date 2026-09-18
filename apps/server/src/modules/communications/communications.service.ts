import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import * as nodemailer from "nodemailer";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SmsPayload {
  to: string;
  message: string;
}

@Injectable()
export class CommunicationsService {
  private readonly logger = new Logger(CommunicationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getIntegration(tenantId: string, provider: string) {
    if (!tenantId) return null;
    const setting = await this.prisma.integrationSetting.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!setting || !setting.enabled) return null;
    return setting.config as Record<string, any>;
  }

  async sendEmail(tenantId: string, payload: EmailPayload): Promise<boolean> {
    const config = await this.getIntegration(tenantId, "SMTP_EMAIL");
    if (!config?.host) {
      this.logger.warn(
        `[${tenantId}] SMTP not configured or disabled; email not sent to ${payload.to}`,
      );
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: Number(config.port) || 587,
      secure: config.secure === true,
      auth:
        config.user && config.password
          ? { user: config.user, pass: config.password }
          : undefined,
    });

    try {
      await transporter.sendMail({
        from: config.fromEmail
          ? `${config.fromName || ""} <${config.fromEmail}>`.trim()
          : `HMS SaaS <no-reply@hms.local>`,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `[${tenantId}] Email send failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async sendSms(tenantId: string, payload: SmsPayload): Promise<boolean> {
    const config = await this.getIntegration(tenantId, "SMS_GATEWAY");
    if (!config?.apiKey) {
      this.logger.warn(
        `[${tenantId}] SMS gateway not configured or disabled; SMS not sent to ${payload.to}`,
      );
      return false;
    }

    try {
      const provider = String(config.provider || "generic").toLowerCase();
      if (provider === "twilio") {
        return await this.sendTwilio(config, payload);
      }
      if (provider === "msg91") {
        return await this.sendMsg91(config, payload);
      }
      return await this.sendGeneric(config, payload);
    } catch (err) {
      this.logger.error(
        `[${tenantId}] SMS send failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private async sendTwilio(config: Record<string, any>, payload: SmsPayload) {
    const accountSid = config.accountSid || config.apiKey;
    const authToken = config.apiSecret || config.apiKey;
    const from = config.senderId;
    if (!accountSid || !authToken || !from) return false;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: payload.to,
      From: from,
      Body: payload.message,
    });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    return res.ok;
  }

  private async sendMsg91(config: Record<string, any>, payload: SmsPayload) {
    const authKey = config.apiKey;
    const senderId = config.senderId || "HMSAAS";
    const url = `https://api.msg91.com/api/v5/send`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authkey: authKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: senderId,
        route: "4",
        sms: [
          {
            message: payload.message,
            to: [payload.to.replace(/\D/g, "")],
          },
        ],
      }),
    });
    return res.ok;
  }

  private async sendGeneric(config: Record<string, any>, payload: SmsPayload) {
    const endpoint = config.endpoint;
    if (!endpoint) {
      this.logger.warn("Generic SMS gateway needs an endpoint URL");
      return false;
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: payload.to,
        message: payload.message,
        senderId: config.senderId,
        apiKey: config.apiKey,
      }),
    });
    return res.ok;
  }
}
