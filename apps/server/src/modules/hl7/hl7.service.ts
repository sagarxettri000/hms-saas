import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import * as net from "net";
import * as tls from "tls";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../../prisma/prisma.service";
import { buildAckMessage, parseHl7Message, parseHl7Timestamp } from "./hl7.parser";
import {
  Hl7Action,
  Hl7ListenerConfig,
  Hl7ProcessOptions,
  Hl7ProcessResult,
  Hl7Segment,
  ParsedHl7Message,
} from "./hl7.types";

@Injectable()
export class Hl7Service implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Hl7Service.name);
  private mllpServer?: net.Server | tls.Server;
  private mllpConfig?: Hl7ListenerConfig;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // MLLP listeners are opt-in per tenant via IntegrationSetting (provider "hl7").
    // Nothing is bound at boot.
  }

  onModuleDestroy() {
    void this.stopMllpListener();
  }

  async startMllpListener(tenantId: string, config: Hl7ListenerConfig): Promise<void> {
    await this.stopMllpListener();
    if (!config.enabled) {
      this.mllpConfig = { enabled: false };
      return;
    }

    const host = config.host || "0.0.0.0";
    const port = Number(config.port) || 2575;

    const createHandler = (socket: net.Socket | tls.TLSSocket) => {
      socket.on("data", (chunk: Buffer) => this.handleMllpFrame(tenantId, chunk, socket));
      socket.on("error", (err: Error) => this.logger.warn(`MLLP socket error: ${err.message}`));
    };

    const server = config.tls?.enabled
      ? tls.createServer(
          {
            cert: config.tls.certPath
              ? fs.readFileSync(config.tls.certPath)
              : path.join(process.cwd(), "certs", "hl7-server.crt"),
            key: config.tls.keyPath
              ? fs.readFileSync(config.tls.keyPath)
              : path.join(process.cwd(), "certs", "hl7-server.key"),
            ...(config.tls.caPath
              ? { ca: fs.readFileSync(config.tls.caPath), requestCert: true }
              : {}),
            rejectUnauthorized: config.tls.rejectUnauthorized ?? false,
          },
          createHandler,
        )
      : net.createServer(createHandler);

    this.mllpServer = server;
    this.mllpConfig = { host, port, enabled: true, tls: config.tls };

    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.removeListener("error", reject);
          const proto = config.tls?.enabled ? "MLLPS (TLS)" : "MLLP";
          this.logger.log(`HL7 ${proto} listener on ${host}:${port}`);
          resolve();
        });
      });
    } catch (err) {
      this.mllpServer = undefined;
      this.mllpConfig = undefined;
      throw err;
    }
  }

  async stopMllpListener(): Promise<void> {
    const server = this.mllpServer;
    this.mllpServer = undefined;
    this.mllpConfig = undefined;
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      this.logger.log("HL7 MLLP listener stopped");
    }
  }

  isMllpRunning(): boolean {
    return Boolean(this.mllpServer && this.mllpConfig?.enabled);
  }

  isMllpTlsEnabled(): boolean {
    return Boolean(this.mllpServer && this.mllpConfig?.tls?.enabled);
  }

  private handleMllpFrame(tenantId: string, chunk: Buffer, socket: net.Socket | tls.TLSSocket) {
    const SOB = 0x0b;
    const EOB = 0x1c;
    const CR = 0x0d;
    if (chunk[0] !== SOB) return;
    const eob = chunk.indexOf(EOB);
    if (eob < 2) return;
    const frame = chunk.subarray(1, eob - 1).toString("utf8").trim();
    if (!frame) return;

    this.processMessage(frame, { tenantId }).then(
      () => {
        let ack: string;
        try {
          ack = buildAckMessage(parseHl7Message(frame), "HMS");
        } catch {
          ack = "MSH|^~\\&|HMS|||||\rMSA|AR|0\r";
        }
        socket.write(
          Buffer.concat([Buffer.from([SOB]), Buffer.from(ack, "utf8"), Buffer.from([EOB, CR])]),
        );
      },
      (err: Error) => this.logger.error(`HL7 processing failed: ${err.message}`),
    );
  }

  async processMessage(raw: string, options: Hl7ProcessOptions = {}): Promise<Hl7ProcessResult> {
    const parsed = parseHl7Message(raw);
    const key = `${parsed.messageType}^${parsed.eventType}`;
    const tenantId = options.tenantId;
    const actions: Hl7Action[] = [];

    if (!tenantId) {
      actions.push({ type: "ERROR", detail: "No tenant context" });
      return {
        accepted: false,
        messageType: parsed.messageType,
        eventType: parsed.eventType,
        messageControlId: parsed.messageControlId,
        version: parsed.version,
        actions,
      };
    }

    try {
      if (key.startsWith("ADT")) {
        actions.push(...(await this.handleAdt(parsed, tenantId, options.userId)));
      } else if (key === "ORM^O01") {
        actions.push(...(await this.handleOrm(parsed, tenantId)));
      } else if (key === "ORU^R01") {
        actions.push(...(await this.handleOru(parsed, tenantId)));
      } else if (key === "SIU^S12" || key === "SIU^S13") {
        actions.push(...(await this.handleSiu(parsed, tenantId)));
      } else {
        actions.push({ type: "IGNORED", detail: key });
      }
    } catch (err) {
      this.logger.error(`event ${key} (${parsed.messageControlId}) failed: ${(err as Error).message}`);
      actions.push({ type: "ERROR", detail: (err as Error).message });
    }

    return {
      accepted: actions.every((a) => a.type !== "ERROR"),
      messageType: parsed.messageType,
      eventType: parsed.eventType,
      messageControlId: parsed.messageControlId,
      version: parsed.version,
      tenantId,
      actions,
    };
  }

  // ---- ADT ^A01/A04/A05/A08/A31 (register / admit / update patient) ----

  private async handleAdt(
    parsed: ParsedHl7Message,
    tenantId: string,
    userId?: string,
  ): Promise<Hl7Action[]> {
    const pid = parsed.segment("PID");
    if (!pid) return [{ type: "IGNORED", detail: "ADT without PID" }];

    const existing = await this.findPatientByPid(tenantId, pid);
    const ref = this.patientReference(pid);
    const nameField = pid.field(4)[0] ?? [];
    const addressField = pid.field(10)[0] ?? [];
    const maritalCode = (pid.component(15) ?? "").toUpperCase();

    const maritalStatus =
      maritalCode === "S"
        ? "SINGLE"
        : maritalCode === "M"
          ? "MARRIED"
          : maritalCode === "D" || maritalCode === "W"
            ? "DIVORCED"
            : maritalCode === "WIDOW"
              ? "WIDOWED"
              : undefined;

    const data = {
      ...(nameField[0] ? { lastName: nameField[0] } : {}),
      ...(nameField[1] ? { firstName: nameField[1] } : {}),
      ...(nameField[2] ? { middleName: nameField[2] } : {}),
      ...(parseHl7Timestamp(pid.text(6)) ? { dateOfBirth: parseHl7Timestamp(pid.text(6)) } : {}),
      ...(ref.gender ? { gender: ref.gender } : {}),
      ...(pid.field(12)?.[0]?.[0] ? { phone: pid.field(12)![0][0] } : {}),
      ...(addressField[0] ? { addressLine1: addressField[0] } : {}),
      ...(addressField[2] ? { city: addressField[2] } : {}),
      ...(addressField[3] ? { province: addressField[3] } : {}),
      ...(addressField[4] ? { postalCode: addressField[4] } : {}),
      ...(addressField[5] && addressField[5] !== "US" ? { country: addressField[5] } : {}),
      ...(maritalStatus ? { maritalStatus } : {}),
    };

    if (existing) {
      const patient = await this.prisma.patient.update({
        where: { id: existing.id },
        data: data as any,
      });
      return [
        {
          type: "PATIENT_UPSERTED",
          entityId: patient.id,
          created: false,
          detail: `${patient.firstName} ${patient.lastName} (${patient.mrn})`,
        },
      ];
    }

    const mrn = ref.mrn || (await this.generateMrn(tenantId));
    const patient = await this.prisma.patient.create({
      data: {
        tenantId,
        mrn,
        firstName: (data.firstName as string) ?? "",
        middleName: data.middleName as string | undefined,
        lastName: (data.lastName as string) ?? "",
        dateOfBirth: data.dateOfBirth as Date | undefined,
        gender: data.gender as any,
        phone: data.phone as string | undefined,
        city: data.city as string | undefined,
        province: data.province as string | undefined,
        postalCode: data.postalCode as string | undefined,
        country: (data.country as string | undefined) ?? "Nepal",
        maritalStatus: data.maritalStatus as any,
        status: "ACTIVE",
        createdBy: userId,
      },
    });
    return [
      {
        type: "PATIENT_UPSERTED",
        entityId: patient.id,
        created: true,
        detail: `${patient.firstName} ${patient.lastName} (${patient.mrn})`,
      },
    ];
  }

  // ---- ORM ^O01 (order entry) -> radiology order ----

  private async handleOrm(parsed: ParsedHl7Message, tenantId: string): Promise<Hl7Action[]> {
    const patientId = await this.resolveOrCreatePatient(parsed, tenantId);
    const obr = parsed.segment("OBR");
    const orc = parsed.segment("ORC");
    if (!obr) return [{ type: "ERROR", detail: "ORM without OBR" }];

    const { modality, procedureText } = this.classifyObr(obr);
    const control = orc?.text(0) ?? "NW";
    const status =
      ["SC", "SN", "OC", "OR"].includes(control)
        ? "SCHEDULED"
        : control === "IP"
          ? "IN_PROGRESS"
          : "ORDERED";

    const order = await this.prisma.radiologyOrder.create({
      data: {
        tenantId,
        patientId,
        orderNumber: await this.generateOrderNumber(tenantId, "RAD"),
        modality: modality as any,
        bodyPart: procedureText ?? undefined,
        status: status as any,
        clinicalHistory: obr.text(19) ?? undefined,
      },
    });

    return [
      {
        type: "RADIOLOGY_ORDER_CREATED",
        entityId: order.id,
        created: true,
        detail: `${order.orderNumber} (${modality})`,
      },
    ];
  }

  // ---- SIU ^S12/S13 (schedule) -> scheduled radiology order ----

  private async handleSiu(parsed: ParsedHl7Message, tenantId: string): Promise<Hl7Action[]> {
    const patientId = await this.resolveOrCreatePatient(parsed, tenantId);
    const sch = parsed.segment("SCH");
    const ail = parsed.segment("AIL");
    const actionCode = parsed.segment("ORC")?.text(0) ?? "SC";

    const start = parseHl7Timestamp(sch?.field(10)?.[0]?.[0]);
    const procedureField = sch?.field(5)[0] ?? [];
    const procedureText = procedureField[1] ?? procedureField[0];
    const location = ail ? [ail.text(2), ail.text(3)].filter(Boolean).join(" / ") : undefined;

    const status = ["CN", "DC", "CA", "XR", "HD"].includes(actionCode) ? "ORDERED" : "SCHEDULED";

    const order = await this.prisma.radiologyOrder.create({
      data: {
        tenantId,
        patientId,
        orderNumber: await this.generateOrderNumber(tenantId, "RAD"),
        modality: (procedureText ? this.classifyProcedureText(procedureText) : "OTHERS") as any,
        bodyPart: procedureText ?? undefined,
        status: status as any,
        scheduledAt: start ?? new Date(),
        clinicalHistory: location ?? undefined,
      },
    });

    return [
      {
        type: "RADIOLOGY_ORDER_SCHEDULED",
        entityId: order.id,
        created: true,
        detail: [location, procedureText].filter(Boolean).join(" - "),
      },
    ];
  }

  // ---- ORU ^R01 (results) -> radiology report or lab results ----

  private async handleOru(parsed: ParsedHl7Message, tenantId: string): Promise<Hl7Action[]> {
    const patientId = await this.resolveOrCreatePatient(parsed, tenantId);
    const obr = parsed.segment("OBR");
    const obxs = parsed.allSegments("OBX");
    if (!obr) return [{ type: "ERROR", detail: "ORU without OBR" }];

    const { isRadiology } = this.classifyObr(obr);
    if (isRadiology) return this.applyRadiologyResult(tenantId, patientId, obr, obxs);
    return this.applyLabResult(tenantId, patientId, obr, obxs);
  }

  private async applyRadiologyResult(
    tenantId: string,
    patientId: string,
    obr: Hl7Segment,
    obxs: Hl7Segment[],
  ): Promise<Hl7Action[]> {
    const refs = [obr.text(1), obr.text(2)].filter((r): r is string => Boolean(r));

    let order: { id: string } | null = refs.length
      ? await this.prisma.radiologyOrder.findFirst({
          where: { tenantId, patientId, orderNumber: { in: refs } },
          select: { id: true },
        })
      : null;

    if (!order) {
      order = await this.prisma.radiologyOrder.findFirst({
        where: { tenantId, patientId, status: { notIn: ["REPORTED", "VERIFIED"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
    }

    const lines = obxs
      .map((o) => {
        const label = o.component(2, 0, 1) ?? "Result";
        const value = o.component(4, 0, 0);
        return value ? `${label}: ${value}` : undefined;
      })
      .filter(Boolean)
      .join("\n");

    let entityId: string;
    let created = false;

    if (order) {
      await this.prisma.radiologyOrder.update({
        where: { id: order.id },
        data: {
          findings: lines || undefined,
          report: lines || undefined,
          status: "REPORTED",
          reportedAt: new Date(),
        },
      });
      entityId = order.id;
    } else {
      const createdOrder = await this.prisma.radiologyOrder.create({
        data: {
          tenantId,
          patientId,
          orderNumber: await this.generateOrderNumber(tenantId, "RAD"),
          modality: "OTHERS",
          status: "REPORTED",
          findings: lines || undefined,
          report: lines || undefined,
          reportedAt: new Date(),
        },
      });
      entityId = createdOrder.id;
      created = true;
    }

    return [
      {
        type: "RADIOLOGY_ORDER_REPORTED",
        entityId,
        created,
        detail: lines ? `${lines.split("\n").length} result line(s)` : "no OBX content",
      },
    ];
  }

  private async applyLabResult(
    tenantId: string,
    patientId: string,
    obr: Hl7Segment,
    obxs: Hl7Segment[],
  ): Promise<Hl7Action[]> {
    const refs = [obr.text(1), obr.text(2)].filter((r): r is string => Boolean(r));

    let order: { id: string } | null = refs.length
      ? await this.prisma.labOrder.findFirst({
          where: { tenantId, patientId, orderNumber: { in: refs } },
          select: { id: true },
        })
      : null;

    if (!order) {
      order = await this.prisma.labOrder.findFirst({
        where: { tenantId, patientId, status: { notIn: ["REPORTED", "VERIFIED", "APPROVED"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
    }

    let orderId: string;
    let created = false;
    if (order) {
      orderId = order.id;
    } else {
      const createdOrder = await this.prisma.labOrder.create({
        data: {
          tenantId,
          patientId,
          orderNumber: await this.generateOrderNumber(tenantId, "LAB"),
          status: "REPORTED",
          reportedAt: new Date(),
        },
      });
      orderId = createdOrder.id;
      created = true;
    }

    await this.prisma.labOrder.update({
      where: { id: orderId },
      data: { status: "REPORTED", reportedAt: new Date() },
    });

    for (const o of obxs) {
      const testName = o.component(2, 0, 1) ?? o.component(2, 0, 0) ?? "Test";
      const result = o.component(4, 0, 0);
      const unit = o.component(5, 0, 0);
      const referenceRange = o.component(6, 0, 0);
      const flags = o.field(7)[0] ?? [];
      const isAbnormal = flags.some((f) => ["L", "H", "LL", "HH", "A"].includes(f));

      await this.prisma.labOrderItem.create({
        data: {
          tenantId,
          labOrderId: orderId,
          testName,
          result: result ?? undefined,
          unit: unit ?? undefined,
          referenceRange: referenceRange ?? undefined,
          isAbnormal: isAbnormal || undefined,
          status: "RESULT_READY",
        },
      });
    }

    return [{ type: "LAB_ORDER_REPORTED", entityId: orderId, created, detail: `${obxs.length} OBX item(s)` }];
  }

  // ---- shared helpers ----

  private async findPatientByPid(tenantId: string, pid: Hl7Segment) {
    for (const rep of pid.field(2)) {
      const candidate = (rep[0] ?? "").trim();
      if (!candidate) continue;
      const found = await this.prisma.patient.findFirst({
        where: { tenantId, deletedAt: null, OR: [{ mrn: candidate }, { hospitalNumber: candidate }] },
      });
      if (found) return found;
    }
    return null;
  }

  private async resolveOrCreatePatient(parsed: ParsedHl7Message, tenantId: string): Promise<string> {
    const pid = parsed.segment("PID");
    if (pid) {
      const existing = await this.findPatientByPid(tenantId, pid);
      if (existing) return existing.id;
    }

    const ref = this.patientReference(pid);
    if (!ref.firstName && !ref.lastName && !ref.mrn) {
      throw new Error("PID has no patient identifiers");
    }

    const mrn = ref.mrn || (await this.generateMrn(tenantId));
    const patient = await this.prisma.patient.create({
      data: {
        tenantId,
        mrn,
        firstName: ref.firstName ?? "",
        middleName: ref.middleName,
        lastName: ref.lastName ?? "",
        dateOfBirth: ref.dateOfBirth,
        gender: ref.gender as any,
        phone: ref.phone,
        status: "ACTIVE",
      },
    });
    return patient.id;
  }

  private patientReference(pid: Hl7Segment | undefined): {
    mrn: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    dateOfBirth?: Date;
    gender?: string;
    phone?: string;
  } {
    const nameField = pid?.field(4)[0] ?? [];
    const genderCode = (pid?.component(7) ?? "").toUpperCase();
    return {
      mrn: pid?.field(2)[0]?.[0]?.trim() ?? "",
      firstName: nameField[1],
      middleName: nameField[2],
      lastName: nameField[0],
      dateOfBirth: parseHl7Timestamp(pid?.text(6)),
      gender:
        genderCode === "M" ? "MALE" : genderCode === "F" ? "FEMALE" : genderCode === "O" || genderCode === "U" ? "OTHER" : undefined,
      phone: pid?.field(12)?.[0]?.[0],
    };
  }

  private classifyObr(obr: Hl7Segment): { modality: string; procedureText?: string; isRadiology: boolean } {
    const universal = obr.field(3)[0] ?? [];
    const code = (universal[0] ?? "").toUpperCase();
    const text = universal[1] ?? "";
    const modality = this.classifyProcedureText(code || text);
    return { modality, procedureText: text || undefined, isRadiology: modality !== "OTHERS" };
  }

  private classifyProcedureText(raw: string | undefined): string {
    const code = (raw ?? "").toUpperCase();
    if (/^(CR|DX|XR|XA|RF|MG|RAD)/.test(code)) return "XRAY";
    if (/^(CT|CAT)/.test(code)) return "CT";
    if (/^(MR|MRI|NMR)/.test(code)) return "MRI";
    if (/^(US|USS|ULTRASON|SONO)/.test(code)) return "ULTRASOUND";
    if (/^(ECG|EKG)/.test(code)) return "ECG";
    if (/^(ECHO|EC|TEE|TTE)/.test(code)) return "ECHO";
    return "OTHERS";
  }

  private async generateMrn(tenantId: string): Promise<string> {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    const latest = await this.prisma.patient.findFirst({
      where: { tenantId, mrn: { startsWith: `NBM-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { mrn: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.mrn.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `NBM-${ymd}-${String(seq).padStart(4, "0")}`;
  }

  private async generateOrderNumber(tenantId: string, prefix: "RAD" | "LAB"): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const model = prefix === "RAD" ? this.prisma.radiologyOrder : this.prisma.labOrder;
    const latest = await (model as any).findFirst({
      where: { tenantId, orderNumber: { startsWith: `${prefix}-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { orderNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.orderNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `${prefix}-${ymd}-${String(seq).padStart(4, "0")}`;
  }
}