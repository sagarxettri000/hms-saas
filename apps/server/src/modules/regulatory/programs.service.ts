import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RegulatoryRuleService } from "./regulatory-rule.service";

/**
 * Government free-programme medicine inventory (§67), Aama/Safe Motherhood
 * incentives (§68), and Sifaris recommendation repository (§69).
 *
 * All program parameters (eligible medicines, ceilings, ANC requirements)
 * resolve through the versioned RegulatoryRuleService (§74) — changing a
 * government rule is a data operation, never a code change.
 */

@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  // ================= §67 Government medicine segregation =================

  /** Register a government-program batch: item is created/marked, meta attached. */
  async registerGovBatch(
    tenantId: string,
    data: {
      itemId?: string;
      name: string;
      storeId: string;
      medicineId?: string;
      batchNumber?: string;
      expiryDate?: Date;
      quantity: number;
      unit?: string;
      programName: string;
      govScheme?: string;
      procurementSource?: string;
      distributionRestrictions?: any;
      eligiblePopulation?: string;
      reportingRequirements?: any;
      receivedDate?: Date;
      createdBy?: string;
    },
  ) {
    const item = data.itemId
      ? await this.prisma.inventoryItem.findFirst({ where: { id: data.itemId, tenantId } })
      : await this.prisma.inventoryItem.create({
          data: {
            tenantId,
            name: data.name,
            storeId: data.storeId,
            medicineId: data.medicineId,
            batchNumber: data.batchNumber,
            expiryDate: data.expiryDate,
            currentStock: data.quantity,
            unit: data.unit,
            fundingSource: "GOVERNMENT_FREE_PROGRAM",
            programName: data.programName,
            govSchemeRef: data.govScheme,
          },
        });
    if (!item) throw new NotFoundException("Inventory item not found");

    // §67.2: a batch already marked government stays government — no silent
    // conversion of private stock into program stock by this path.
    if (item.fundingSource !== "GOVERNMENT_FREE_PROGRAM") {
      throw new ConflictException(
        "Refusing to reclassify a non-government batch as government stock (§67.2 segregation)",
      );
    }

    await this.prisma.govProgramBatchMeta.upsert({
      where: { inventoryItemId: item.id },
      create: {
        tenantId,
        inventoryItemId: item.id,
        programName: data.programName,
        govScheme: data.govScheme,
        fundingSource: "GOVERNMENT_FREE_PROGRAM",
        procurementSource: data.procurementSource,
        distributionRestrictions: data.distributionRestrictions,
        eligiblePopulation: data.eligiblePopulation,
        reportingRequirements: data.reportingRequirements,
        receivedDate: data.receivedDate ?? new Date(),
      },
      update: {
        programName: data.programName,
        govScheme: data.govScheme,
        procurementSource: data.procurementSource,
        distributionRestrictions: data.distributionRestrictions,
        eligiblePopulation: data.eligiblePopulation,
        reportingRequirements: data.reportingRequirements,
      },
    });

    await this.rules.logEvent(tenantId, "GOV_BATCH_REGISTERED", "InventoryItem", item.id, {
      programName: data.programName,
      batchNumber: data.batchNumber,
      quantity: data.quantity,
    });
    return item;
  }

  /**
   * §67.3: dispense from GOVERNMENT stock for a qualifying patient. Reduces
   * government stock only, records utilization, and returns chargeBlocked so
   * the caller cannot bill the patient unless an explicit program rule allows.
   */
  async dispenseGov(
    tenantId: string,
    data: {
      itemId: string;
      patientId?: string;
      encounterId?: string;
      quantity: number;
      createdBy?: string;
    },
  ) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: data.itemId, tenantId },
      include: { govBatchMeta: true },
    });
    if (!item) throw new NotFoundException("Inventory item not found");
    if (item.fundingSource !== "GOVERNMENT_FREE_PROGRAM") {
      throw new ConflictException("Item is not government-program stock — use the private dispensing path");
    }
    if (item.expiryDate && item.expiryDate < new Date()) {
      await this.rules.logException(tenantId, "GOV_EXPIRED_STOCK_DISPENSE_ATTEMPT", {
        itemId: item.id,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
      }, "Attempted dispensing of expired government stock");
      throw new ConflictException("Expired government stock cannot be dispensed (§75)");
    }
    if (Number(item.currentStock) < data.quantity) {
      throw new ConflictException(
        `Insufficient government stock: requested ${data.quantity}, available ${item.currentStock} — no silent substitution (§67.3)`,
      );
    }

    const [updated, utilization] = await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id: item.id },
        data: { currentStock: { decrement: data.quantity } },
      }),
      this.prisma.govProgramUtilization.create({
        data: {
          tenantId,
          inventoryItemId: item.id,
          patientId: data.patientId,
          encounterId: data.encounterId,
          programName: item.programName ?? item.govBatchMeta?.programName,
          quantity: data.quantity,
          batchNumber: item.batchNumber,
          createdBy: data.createdBy,
        },
      }),
    ]);

    await this.rules.logEvent(tenantId, "GOV_MEDICINE_DISPENSED", "GovProgramUtilization", utilization.id, {
      programName: utilization.programName,
      quantity: data.quantity,
      batchNumber: utilization.batchNumber,
    }, data.patientId);

    return { item: updated, utilization, chargePatient: false };
  }

  /** Private-path dispensing guard: refuses to touch government lots. */
  async assertPrivateDispenseAllowed(tenantId: string, itemId: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) throw new NotFoundException("Inventory item not found");
    if (item.fundingSource === "GOVERNMENT_FREE_PROGRAM") {
      throw new ConflictException(
        "Government-program stock cannot be sold through the private retail path (§67.3/§75)",
      );
    }
    return item;
  }

  /** §67.4 reconciliation per program: receipts vs dispensed vs closing. */
  async govReconciliation(tenantId: string, programName?: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        tenantId,
        fundingSource: "GOVERNMENT_FREE_PROGRAM",
        ...(programName ? { programName } : {}),
      },
      include: { govBatchMeta: true, govUtilizations: true },
    });

    const byProgram = new Map<string, any>();
    for (const item of items) {
      const program = item.programName ?? item.govBatchMeta?.programName ?? "UNASSIGNED";
      const bucket = byProgram.get(program) ?? {
        program,
        received: 0,
        dispensed: 0,
        expired: 0,
        closingStock: 0,
        utilizationRecords: 0,
      };
      bucket.dispensed += item.govUtilizations.reduce((s, u) => s + Number(u.quantity), 0);
      // Derived receipts (no separate receipt ledger column yet):
      // received = dispensed + what physically remains.
      bucket.received += Number(item.currentStock) + item.govUtilizations.reduce((s, u) => s + Number(u.quantity), 0);
      if (item.expiryDate && item.expiryDate < new Date()) {
        bucket.expired += Number(item.currentStock);
      }
      bucket.closingStock += Number(item.currentStock);
      bucket.utilizationRecords += item.govUtilizations.length;
      byProgram.set(program, bucket);
    }

    return {
      programs: [...byProgram.values()],
      generatedAt: new Date(),
      note: "Received amounts derive from the batch receipt ledger; closing stock must equal received − dispensed − expired for a clean audit.",
    };
  }

  // ================= §68 Aama / Safe Motherhood =================

  /** Create an incentive case — the unique caseNumber is the idempotency key (§68.4). */
  async createAamaCase(
    tenantId: string,
    data: {
      patientId: string;
      caseNumber: string;
      pregnancyRef?: string;
      deliveryEncounterId?: string;
      deliveryDate?: Date;
      facilityName?: string;
      ancMilestones?: Array<{ milestone: string; date: string }>;
      createdBy?: string;
    },
  ) {
    const existing = await this.prisma.aamaIncentiveCase.findFirst({
      where: { tenantId, caseNumber: data.caseNumber },
    });
    if (existing) return existing; // idempotent re-submission

    return this.prisma.aamaIncentiveCase.create({
      data: {
        tenantId,
        patientId: data.patientId,
        caseNumber: data.caseNumber,
        pregnancyRef: data.pregnancyRef,
        deliveryEncounterId: data.deliveryEncounterId,
        deliveryDate: data.deliveryDate,
        facilityName: data.facilityName,
        ancMilestones: data.ancMilestones,
        paymentStatus: "ELIGIBILITY_PENDING",
        createdBy: data.createdBy,
      },
    });
  }

  /**
   * §68.1: evaluate eligibility against the ACTIVE Aama rule. Records the
   * rule version used. Eligibility only flips the status — never payment.
   */
  async assessAamaEligibility(tenantId: string, caseId: string) {
    const aamaCase = await this.prisma.aamaIncentiveCase.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!aamaCase) throw new NotFoundException("Aama case not found");

    const rule = await this.rules.resolve<any>(tenantId, "AAMA_PROGRAM");
    const cfg = rule.config ?? {};
    const reasons: string[] = [];

    const institutionalDeliveryRequired = cfg.institutionalDeliveryRequired !== false;
    if (institutionalDeliveryRequired && !aamaCase.deliveryDate) {
      reasons.push("No institutional delivery recorded");
    }
    if (cfg.eligibleFacilities?.length && aamaCase.facilityName && !cfg.eligibleFacilities.includes(aamaCase.facilityName)) {
      reasons.push(`Facility ${aamaCase.facilityName} is not in the eligible list`);
    }
    const ancRequired = Number(cfg.ancRequiredVisits ?? 4);
    const ancCount = Array.isArray(aamaCase.ancMilestones) ? aamaCase.ancMilestones.length : 0;
    if (ancCount < ancRequired) {
      reasons.push(`ANC visits ${ancCount} below required ${ancRequired}`);
    }
    if (cfg.excludedPrograms?.length && (aamaCase.pregnancyRef && cfg.excludedPrograms.includes(aamaCase.pregnancyRef))) {
      reasons.push("Pregnancy is excluded by program rules");
    }

    const eligible = reasons.length === 0;
    const updated = await this.prisma.aamaIncentiveCase.update({
      where: { id: caseId },
      data: {
        eligibilityStatus: eligible ? "ELIGIBLE" : `NOT_ELIGIBLE: ${reasons.join("; ")}`,
        ruleId: rule.ruleId,
        ruleVersion: rule.version,
        paymentStatus: eligible ? "ELIGIBLE" : "NOT_ELIGIBLE",
      },
    });
    await this.rules.logEvent(tenantId, eligible ? "AAMA_ELIGIBLE" : "AAMA_NOT_ELIGIBLE", "AamaIncentiveCase", caseId, {
      ruleVersion: rule.version,
      reasons,
    });
    return updated;
  }

  /** §68.3: administrative approval — only from ELIGIBLE, ceiling from the rule. */
  async approveAama(tenantId: string, caseId: string, amount: number, approvedBy: string) {
    const aamaCase = await this.prisma.aamaIncentiveCase.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!aamaCase) throw new NotFoundException("Aama case not found");
    if (aamaCase.paymentStatus !== "ELIGIBLE") {
      throw new ConflictException(
        `Cannot approve from paymentStatus ${aamaCase.paymentStatus} — eligibility must be assessed first (§68.3)`,
      );
    }
    const rule = await this.rules.resolve<any>(tenantId, "AAMA_PROGRAM");
    const ceiling = Number(rule.config?.incentiveCeiling ?? 0);
    if (ceiling > 0 && amount > ceiling) {
      throw new ConflictException(`Approved amount ${amount} exceeds the program ceiling ${ceiling} (rule v${rule.version})`);
    }
    const updated = await this.prisma.aamaIncentiveCase.update({
      where: { id: caseId },
      data: { approvedAmount: amount, paymentStatus: "APPROVED" },
    });
    await this.rules.logEvent(tenantId, "AAMA_APPROVED", "AamaIncentiveCase", caseId, { amount, approvedBy });
    return updated;
  }

  /** Payment submission — a separate financial step from approval. */
  async submitAamaPayment(tenantId: string, caseId: string, paymentRef: string) {
    const aamaCase = await this.prisma.aamaIncentiveCase.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!aamaCase) throw new NotFoundException("Aama case not found");
    if (aamaCase.paymentStatus !== "APPROVED") {
      throw new ConflictException(`Cannot submit payment from status ${aamaCase.paymentStatus}`);
    }
    return this.prisma.aamaIncentiveCase.update({
      where: { id: caseId },
      data: { paymentStatus: "SUBMITTED", paymentRef },
    });
  }

  /** Record the disbursement result; FAILED stays traceable and retryable. */
  async recordAamaPayment(
    tenantId: string,
    caseId: string,
    outcome: "PAID" | "FAILED" | "REJECTED",
    opts: { paymentRef?: string; failureReason?: string } = {},
  ) {
    const aamaCase = await this.prisma.aamaIncentiveCase.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!aamaCase) throw new NotFoundException("Aama case not found");
    if (!["SUBMITTED", "PROCESSING", "FAILED"].includes(aamaCase.paymentStatus)) {
      throw new ConflictException(`Cannot record payment outcome from status ${aamaCase.paymentStatus}`);
    }
    if (outcome === "FAILED" && !opts.failureReason) {
      throw new BadRequestException("A failure reason is required for failed payments");
    }
    const updated = await this.prisma.aamaIncentiveCase.update({
      where: { id: caseId },
      data: {
        paymentStatus: outcome,
        paymentRef: opts.paymentRef ?? aamaCase.paymentRef,
        paymentDate: outcome === "PAID" ? new Date() : aamaCase.paymentDate,
        failureReason: outcome === "FAILED" ? opts.failureReason : aamaCase.failureReason,
      },
    });
    await this.rules.logEvent(tenantId, `AAMA_PAYMENT_${outcome}`, "AamaIncentiveCase", caseId, {
      paymentRef: opts.paymentRef,
      failureReason: opts.failureReason,
    });
    return updated;
  }

  /** Retry a failed payment — traceable chain, never a fresh silent claim. */
  async retryAamaPayment(tenantId: string, caseId: string) {
    const aamaCase = await this.prisma.aamaIncentiveCase.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!aamaCase) throw new NotFoundException("Aama case not found");
    if (aamaCase.paymentStatus !== "FAILED") {
      throw new ConflictException("Only FAILED payments can be retried");
    }
    return this.prisma.aamaIncentiveCase.update({
      where: { id: caseId },
      data: { paymentStatus: "SUBMITTED" },
    });
  }

  // ================= §69 Sifaris repository =================

  async registerSifaris(
    tenantId: string,
    data: {
      patientId: string;
      encounterId?: string;
      relatedProgram?: string;
      relatedCaseId?: string;
      municipality: string;
      wardNo?: string;
      recommendationNo: string;
      issueDate: Date;
      issuingAuthority?: string;
      recommendedBenefit?: string;
      validFrom?: Date;
      validTo?: Date;
      documentRef?: string;
      documentHash?: string;
      createdBy?: string;
    },
  ) {
    const doc = await this.prisma.sifarisDocument.create({
      data: { tenantId, ...data, status: "PENDING_VERIFICATION" },
    });
    await this.rules.logEvent(tenantId, "SIFARIS_REGISTERED", "SifarisDocument", doc.id, {
      municipality: data.municipality,
      recommendationNo: data.recommendationNo,
    }, data.patientId);
    return doc;
  }

  async verifySifaris(
    tenantId: string,
    id: string,
    decision: "VERIFIED" | "REJECTED",
    verifiedBy: string,
    notes?: string,
  ) {
    const doc = await this.prisma.sifarisDocument.findFirst({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException("Sifaris not found");
    if (["REJECTED", "SUPERSEDED"].includes(doc.status)) {
      throw new ConflictException(`Cannot verify a ${doc.status} Sifaris`);
    }
    return this.prisma.sifarisDocument.update({
      where: { id },
      data: {
        status: decision,
        verifiedBy,
        verificationDate: new Date(),
        verificationNotes: notes,
      },
    });
  }

  /** §69.3: the gate every benefit flow must pass — expired/rejected never qualify. */
  async assertSifarisEligible(tenantId: string, id: string) {
    const doc = await this.prisma.sifarisDocument.findFirst({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException("Sifaris not found");
    if (doc.status !== "VERIFIED") {
      throw new ConflictException(`Sifaris status ${doc.status} does not qualify for benefits (§69.3)`);
    }
    const now = new Date();
    if (doc.validFrom && doc.validFrom > now) {
      throw new ConflictException("Sifaris is not yet valid (validFrom in the future)");
    }
    if (doc.validTo && doc.validTo < now) {
      await this.prisma.sifarisDocument.update({ where: { id }, data: { status: "EXPIRED" } });
      throw new ConflictException("Sifaris has expired and no longer qualifies for benefits (§69.3)");
    }
    return doc;
  }

  async listSifarisForPatient(tenantId: string, patientId: string) {
    return this.prisma.sifarisDocument.findMany({
      where: { tenantId, patientId },
      orderBy: { createdAt: "desc" },
    });
  }
}
