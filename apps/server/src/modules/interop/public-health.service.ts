import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { InteropGatewayService } from "./interop-gateway.service";
import { RegulatoryRuleService } from "../regulatory/regulatory-rule.service";

/**
 * Public-health surveillance (§80) and vital events / civil registration (§81),
 * both flowing through the unified interop gateway (§84).
 */

@Injectable()
export class PublicHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: InteropGatewayService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  // ================= §80 Surveillance =================

  async upsertSurveillanceRule(
    tenantId: string,
    data: {
      diseaseName: string;
      icd11Code?: string;
      triggerIcd10?: string;
      triggerLabTest?: string;
      reportability?: string;
      urgency: string;
      requiredFields?: string[];
      caseDefinition?: string;
      destination?: string;
      effectiveTo?: Date;
      createdBy?: string;
    },
  ) {
    const latest = await this.prisma.surveillanceRule.findFirst({
      where: { tenantId, diseaseName: data.diseaseName },
      orderBy: { ruleVersion: "desc" },
    });
    const ruleVersion = (latest?.ruleVersion ?? 0) + 1;
    const rule = await this.prisma.surveillanceRule.create({
      data: {
        tenantId,
        diseaseName: data.diseaseName,
        icd11Code: data.icd11Code,
        triggerIcd10: data.triggerIcd10,
        triggerLabTest: data.triggerLabTest,
        reportability: data.reportability ?? "MANDATORY",
        urgency: data.urgency,
        requiredFields: data.requiredFields,
        caseDefinition: data.caseDefinition,
        destination: data.destination ?? "EWARS",
        ruleVersion,
        effectiveTo: data.effectiveTo ?? null,
      },
    });
    // §80.2: a new rule version supersedes the old one.
    if (latest) {
      await this.prisma.surveillanceRule.update({
        where: { id: latest.id },
        data: { isActive: false, effectiveTo: rule.effectiveFrom },
      });
    }
    await this.rules.logEvent(tenantId, "SURVEILLANCE_RULE_PUBLISHED", "SurveillanceRule", rule.id, {
      diseaseName: data.diseaseName,
      urgency: data.urgency,
      ruleVersion,
    });
    return rule;
  }

  /**
   * §80.1/§80.3: evaluate a diagnosis against active rules. A match creates
   * a surveillance transaction via the gateway (idempotent per diagnosis),
   * recording the trigger origin. Minimum-necessary payload only (§80.4).
   */
  async evaluateDiagnosis(
    tenantId: string,
    data: {
      diagnosisId: string;
      patientId: string;
      encounterId?: string;
      icd10Code?: string;
      icd11Code?: string;
      diagnosisName: string;
      origin: "AUTOMATIC" | "CLINICIAN" | "LABORATORY" | "PUBLIC_HEALTH_OFFICER";
      createdBy?: string;
    },
  ) {
    const rules = await this.prisma.surveillanceRule.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
    });
    const matched = rules.filter((r) =>
      (r.triggerIcd10 && data.icd10Code && r.triggerIcd10 === data.icd10Code) ||
      (r.icd11Code && data.icd11Code && r.icd11Code === data.icd11Code) ||
      (data.diagnosisName && r.diseaseName &&
        data.diagnosisName.toLowerCase().includes(r.diseaseName.toLowerCase())),
    );
    const created = [];
    for (const rule of matched) {
      const { txn, deduplicated } = await this.gateway.enqueue(tenantId, {
        destination: rule.destination,
        purpose: "SURVEILLANCE",
        sourceModule: "encounters",
        sourceEntity: "Diagnosis",
        sourceEntityId: data.diagnosisId,
        payload: {
          disease: rule.diseaseName,
          condition: data.diagnosisName,
          patientRef: data.patientId, // minimum necessary (§80.4): a reference, not the chart
          classification: rule.urgency,
          trigger: {
            origin: data.origin,
            ruleId: rule.id,
            ruleVersion: rule.ruleVersion,
          },
        },
        payloadVersion: "1.0",
        ruleVersion: rule.ruleVersion,
        patientId: data.patientId,
        encounterId: data.encounterId,
        lineage: {
          chain: ["Diagnosis", "SurveillanceRule", "InteropTransaction"],
          diagnosisId: data.diagnosisId,
          ruleId: rule.id,
          ruleVersion: rule.ruleVersion,
        },
        createdBy: data.createdBy,
      });
      created.push({ ...txn, deduplicated });
    }
    return { matched: matched.map((m) => m.diseaseName), transactions: created };
  }

  // ================= §81 Vital events =================

  /**
   * §81.1 birth event with duplicate prevention: one BIRTH event per patient;
   * an idempotent re-registration returns the original (§81.1).
   */
  async registerBirth(
    tenantId: string,
    data: {
      patientId: string;
      eventDateTime: Date;
      location?: string;
      facilityName?: string;
      motherName?: string;
      newbornSex?: string;
      birthWeightGrams?: number;
      deliveryType?: string;
      attendingClinician?: string;
      createdBy?: string;
    },
  ) {
    const existing = await this.prisma.vitalEvent.findFirst({
      where: { tenantId, patientId: data.patientId, eventType: "BIRTH" },
    });
    if (existing) return { event: existing, duplicatePrevented: true };

    const event = await this.prisma.vitalEvent.create({
      data: {
        tenantId,
        patientId: data.patientId,
        eventType: "BIRTH",
        eventDateTime: data.eventDateTime,
        location: data.location,
        facilityName: data.facilityName,
        motherName: data.motherName,
        newbornSex: data.newbornSex,
        birthWeightGrams: data.birthWeightGrams,
        deliveryType: data.deliveryType,
        attendingClinician: data.attendingClinician,
        createdBy: data.createdBy,
      },
    });
    await this.rules.logEvent(tenantId, "BIRTH_REGISTERED", "VitalEvent", event.id, {
      facilityName: data.facilityName,
    }, data.patientId);
    return { event, duplicatePrevented: false };
  }

  /**
   * §81.2 death event. Clinical documentation first; certification and civil
   * registration are separate explicit steps.
   */
  async registerDeath(
    tenantId: string,
    data: {
      patientId: string;
      eventDateTime: Date;
      location?: string;
      facilityName?: string;
      certifyingClinician?: string;
      immediateCause?: string;
      underlyingCause?: string;
      contributingConditions?: string[];
      causeOfDeathIcd11?: string;
      createdBy?: string;
    },
  ) {
    const event = await this.prisma.vitalEvent.create({
      data: {
        tenantId,
        patientId: data.patientId,
        eventType: "DEATH",
        eventDateTime: data.eventDateTime,
        location: data.location,
        facilityName: data.facilityName,
        certifyingClinician: data.certifyingClinician,
        immediateCause: data.immediateCause,
        underlyingCause: data.underlyingCause,
        contributingConditions: data.contributingConditions,
        causeOfDeathIcd11: data.causeOfDeathIcd11,
        createdBy: data.createdBy,
      },
    });
    await this.rules.logEvent(tenantId, "DEATH_DOCUMENTED", "VitalEvent", event.id, {
      hasCause: !!data.underlyingCause,
    }, data.patientId);
    return { event };
  }

  /** Certify a death (clinician sign-off) — prerequisite for registration. */
  async certifyDeath(tenantId: string, vitalEventId: string, certifyingClinician: string) {
    const event = await this.prisma.vitalEvent.findFirst({ where: { id: vitalEventId, tenantId } });
    if (!event) throw new NotFoundException("Vital event not found");
    if (event.eventType !== "DEATH") throw new ConflictException("Only DEATH events are certified");
    if (!event.underlyingCause && !event.immediateCause) {
      throw new ConflictException("Cause of death must be recorded before certification");
    }
    return this.prisma.vitalEvent.update({
      where: { id: vitalEventId },
      data: { certificationStatus: "CERTIFIED", certifyingClinician },
    });
  }

  /**
   * §81: clinical documentation ≠ legal registration. Submission to civil
   * registration goes through the gateway with full lineage (§88).
   */
  async submitVitalEvent(
    tenantId: string,
    vitalEventId: string,
    opts: { createdBy?: string; mappingVersion?: string } = {},
  ) {
    const event = await this.prisma.vitalEvent.findFirst({ where: { id: vitalEventId, tenantId } });
    if (!event) throw new NotFoundException("Vital event not found");
    if (event.eventType === "DEATH" && event.certificationStatus !== "CERTIFIED") {
      throw new ConflictException("Death must be certified before civil-registration submission");
    }
    if (event.eventType === "DEATH" && !event.causeOfDeathIcd11) {
      throw new ConflictException("Cause-of-death ICD-11 code is required before civil-registration submission");
    }
    if (["SUBMITTED", "ACKNOWLEDGED", "REGISTERED"].includes(event.registrationStatus)) {
      return { event, deduplicated: true };
    }

    const { txn } = await this.gateway.enqueue(tenantId, {
      destination: "CIVIL_REGISTRATION",
      purpose: "VITAL_EVENT",
      sourceModule: "public-health",
      sourceEntity: "VitalEvent",
      sourceEntityId: event.id,
      payload: {
        eventType: event.eventType,
        eventDateTime: event.eventDateTime,
        facilityName: event.facilityName,
        // minimum necessary for civil registration
        subjectRef: event.patientId,
        ...(event.eventType === "BIRTH"
          ? {
              motherName: event.motherName,
              newbornSex: event.newbornSex,
              birthWeightGrams: event.birthWeightGrams,
              deliveryType: event.deliveryType,
            }
          : {
              immediateCause: event.immediateCause,
              underlyingCause: event.underlyingCause,
              causeOfDeathIcd11: event.causeOfDeathIcd11,
              certifyingClinician: event.certifyingClinician,
            }),
      },
      payloadVersion: "1.0",
      mappingVersion: opts.mappingVersion,
      patientId: event.patientId,
      lineage: {
        chain: ["VitalEvent", "InteropTransaction"],
        vitalEventId: event.id,
        certificationStatus: event.certificationStatus,
      },
      createdBy: opts.createdBy,
    });

    const eventUpdated = await this.prisma.vitalEvent.update({
      where: { id: event.id },
      data: { registrationStatus: "SUBMITTED" },
    });
    await this.rules.logEvent(tenantId, event.eventType === "BIRTH" ? "BIRTH_SUBMITTED" : "DEATH_SUBMITTED", "VitalEvent", event.id, {
      transactionId: txn.id,
    }, event.patientId);
    return { event: eventUpdated, txn, deduplicated: false };
  }

  /** Record the civil-registration outcome (§81.4 immutable history via amendments). */
  async recordRegistration(
    tenantId: string,
    vitalEventId: string,
    outcome: { registered?: boolean; registrationRef?: string; rejected?: boolean; reason?: string },
  ) {
    const event = await this.prisma.vitalEvent.findFirst({ where: { id: vitalEventId, tenantId } });
    if (!event) throw new NotFoundException("Vital event not found");
    const amendments = Array.isArray(event.amendments) ? event.amendments : [];
    amendments.push({ at: new Date().toISOString(), outcome });
    return this.prisma.vitalEvent.update({
      where: { id: vitalEventId },
      data: {
        registrationStatus: outcome.registered ? "REGISTERED" : outcome.rejected ? "REJECTED" : "SUBMITTED",
        registrationRef: outcome.registrationRef ?? event.registrationRef,
        amendments,
      },
    });
  }

  /** §81.3 certificate metadata — a local document, never a registered certificate (§81.3). */
  async issueCertificate(
    tenantId: string,
    vitalEventId: string,
    data: { templateVersion: string; issuedBy?: string },
  ) {
    const event = await this.prisma.vitalEvent.findFirst({ where: { id: vitalEventId, tenantId } });
    if (!event) throw new NotFoundException("Vital event not found");
    if (event.eventType === "DEATH" && event.certificationStatus !== "CERTIFIED") {
      throw new ConflictException("Death certificate requires certification first");
    }
    return this.prisma.vitalEvent.update({
      where: { id: vitalEventId },
      data: {
        certificateRef: `CERT-${event.id.slice(-8).toUpperCase()}`,
        certificateTemplateVersion: data.templateVersion,
      },
    });
  }
}
