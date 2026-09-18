import { Injectable, Logger, Optional } from "@nestjs/common";
import * as net from "net";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { buildAtnaXml, ATNA_CODES } from "../../common/audit/atna";
import {
  buildRadiologyOruReport,
  frameMllp,
  MLLP_EOB,
} from "./hl7-outbound-builder";

export interface Hl7OutboundConfig {
  enabled: boolean;
  host?: string;
  port?: number;
  receivingApplication?: string;
  receivingFacility?: string;
}

const CONFIG_PROVIDER = "hl7-outbound";

export interface OutboundSendResult {
  orderId: string;
  sent: boolean;
  skipped?: boolean;
  ack?: string;
  error?: string;
}

/**
 * Outbound HL7 relay: emits ORU^R01 report messages to configured RIS/PACS
 * MLLP endpoints whenever a radiology report is written or verified.
 */
@Injectable()
export class Hl7OutboundService {
  private readonly logger = new Logger(Hl7OutboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async getConfig(tenantId: string): Promise<Hl7OutboundConfig> {
    const row = await this.prisma.integrationSetting.findUnique({
      where: { tenantId_provider: { tenantId, provider: CONFIG_PROVIDER } },
    });
    return (row?.config as unknown as Hl7OutboundConfig) ?? { enabled: false };
  }

  async setConfig(tenantId: string, config: Hl7OutboundConfig) {
    await this.prisma.integrationSetting.upsert({
      where: { tenantId_provider: { tenantId, provider: CONFIG_PROVIDER } },
      create: {
        tenantId,
        provider: CONFIG_PROVIDER,
        config: config as any,
        enabled: config.enabled ?? false,
      },
      update: { config: config as any, enabled: config.enabled ?? false },
    });
    return { saved: true, config };
  }

  /** Build + transmit an ORU^R01 report for one radiology order over MLLP. */
  async sendRadiologyReport(
    tenantId: string,
    orderId: string,
    userId?: string,
  ): Promise<OutboundSendResult> {
    const order = await this.prisma.radiologyOrder.findFirst({
      where: { id: orderId, tenantId },
      include: {
        patient: {
          select: {
            mrn: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            gender: true,
          },
        },
      },
    });
    if (!order) return { orderId, sent: false, error: "Order not found" };

    const config = await this.getConfig(tenantId);
    if (!config.enabled || !config.host || !config.port) {
      return { orderId: order.id, sent: false, skipped: true };
    }

    const message = buildRadiologyOruReport(
      {
        patient: order.patient,
        order: order as any,
        report: order as any,
        receivingApplication: config.receivingApplication,
        receivingFacility: config.receivingFacility,
      },
      { controlId: `ORU.${order.orderNumber}.${Date.now()}` },
    );

    const ack = await this.sendMllp(config.host, config.port, message);
    const acked = /MSA\|AA/.test(ack);
    const result: OutboundSendResult = {
      orderId: order.id,
      sent: acked,
      ack: acked ? ack : undefined,
      ...(!acked
        ? { error: `Non-AA acknowledgement: ${ack.slice(0, 80)}` }
        : {}),
    };
    if (!acked)
      this.logger.warn(`Outbound ORU not acknowledged for order ${order.id}`);
    else this.logger.debug(`Outbound ORU acknowledged for order ${order.id}`);
    this.recordAtnaExport(tenantId, userId, order, config, acked);
    return result;
  }

  /** Fire-and-forget variant for report finalization hooks. */
  async sendRadiologyReportQuiet(
    tenantId: string,
    orderId: string,
    userId?: string,
  ): Promise<void> {
    try {
      await this.sendRadiologyReport(tenantId, orderId, userId);
    } catch (err) {
      this.logger.warn(
        `Outbound ORU failed silently: ${(err as Error).message}`,
      );
    }
  }

  private recordAtnaExport(
    tenantId: string,
    userId: string | undefined,
    order: { id: string; orderNumber: string; accessionNumber?: string | null },
    config: Hl7OutboundConfig,
    acked: boolean,
  ) {
    if (!this.audit) return;
    try {
      const xml = buildAtnaXml({
        outcome: acked ? "0" : "12",
        action: "E",
        eventIdCode: ATNA_CODES.EVENT_EXPORT,
        eventIdLabel: "Export",
        eventTypeCode: ATNA_CODES.EVENT_EXPORT,
        eventTypeLabel: "HL7 ORU report relayed to RIS/PACS",
        initiator: {
          userId: userId || "SYSTEM",
          name: userId || "Automated system",
          role: ATNA_CODES.ROLE_PERSON,
          roleLabel: "User",
        },
        participant: {
          name: `${config.host}:${config.port}`,
          role: ATNA_CODES.ROLE_DESTINATION,
          roleLabel: "Destination",
        },
        objects: [
          {
            id: order.orderNumber,
            role: ATNA_CODES.ROLE_PROCEDURE,
            roleLabel: "Procedure",
            description:
              `HL7 ORU^R01 ${order.accessionNumber ? `(accession ${order.accessionNumber})` : ""}`.trim(),
          },
        ],
      });
      void this.audit.log(tenantId, userId, "HL7_MESSAGE", order.id, "EXPORT", {
        atna: { xml },
      });
    } catch (err) {
      this.logger.warn(
        `ATNA HL7 outbound audit failed: ${(err as Error).message}`,
      );
    }
  }

  private sendMllp(
    host: string,
    port: number,
    message: string,
    timeoutMs = 10000,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host, port });
      let received = Buffer.alloc(0);
      let finished = false;

      const done = (fn: () => void) => {
        if (finished) return;
        finished = true;
        fn();
        socket.destroy();
      };

      const timer = setTimeout(() => {
        done(() => reject(new Error(`MLLP timeout after ${timeoutMs}ms`)));
      }, timeoutMs);

      socket.on("error", (err) => {
        clearTimeout(timer);
        done(() => reject(new Error(`MLLP connection failed: ${err.message}`)));
      });

      socket.on("connect", () => {
        socket.write(frameMllp(message));
      });

      socket.on("data", (chunk: Buffer) => {
        received = Buffer.concat([received, chunk]);
        const eob = received.indexOf(MLLP_EOB);
        if (eob >= 0) {
          clearTimeout(timer);
          const ack = received
            .subarray(1, eob - 1)
            .toString("utf8")
            .trim();
          done(() => resolve(ack));
        }
      });
    });
  }
}
