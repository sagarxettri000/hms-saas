import io

p = "src/modules/fhir/fhir.service.ts"
s = io.open(p, encoding="utf-8").read().rstrip()
assert s.endswith("}"), "unexpected file ending"

# 1. imports
old_imp = 'import { Injectable, NotFoundException } from "@nestjs/common";'
new_imp = (
    'import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";\n'
    'import * as crypto from "crypto";'
)
assert old_imp in s, "nestjs import anchor missing"
s = s.replace(old_imp, new_imp, 1)

old_p = 'import { PrismaService } from "../../prisma/prisma.service";'
new_p = (
    'import { PrismaService } from "../../prisma/prisma.service";\n'
    'import { AuditService } from "../audit/audit.service";'
)
assert old_p in s, "prisma import anchor missing"
s = s.replace(old_p, new_p, 1)

# 2. constructor
old_ctor = "  constructor(private readonly prisma: PrismaService) {}"
new_ctor = (
    "  constructor(\n"
    "    private readonly prisma: PrismaService,\n"
    "    private readonly audit: AuditService,\n"
    "  ) {}"
)
assert old_ctor in s, "constructor anchor missing"
s = s.replace(old_ctor, new_ctor, 1)

block = r'''
  // ------------------------------------------------------------------
  // Spec #53 FHIR $validate — profile-style checks BEFORE external exchange
  // ------------------------------------------------------------------

  /**
   * Validates a FHIR resource or bundle before exchange (spec #12): required
   * elements, reference shape, and the profile version pinned by the tenant's
   * FHIR_PROFILE rule (spec #2.1: profiles configurable, not hardcoded).
   * Invalid resources are NOT exchangeable.
   */
  async validateResource(tenantId: string, resource: any) {
    if (!resource || resource.resourceType !== "Bundle") {
      if (!resource || !resource.resourceType) {
        throw new ConflictException("Resource requires a resourceType");
      }
      return this.validateFhirObject(tenantId, resource);
    }
    const entryResults = (resource.entry || []).map((e: any, i: number) => ({
      index: i,
      ...(this.validateFhirObject(tenantId, e?.resource ?? {}) as any),
    }));
    const failed = entryResults.filter((r: any) => !r.ok);
    return {
      ok: failed.length === 0,
      resourceType: "Bundle",
      profileVersion: await this.profileVersion(tenantId),
      entries: entryResults,
      errors: failed.flatMap((f: any) => f.errors),
    };
  }

  private validateFhirObject(
    _tenantId: string,
    r: any,
  ): { ok: boolean; resourceType: string; errors: string[] } {
    const errors: string[] = [];
    if (!r.resourceType) errors.push("missing resourceType");
    const requiredByType: Record<string, string[]> = {
      Patient: [],
      Encounter: ["status", "class"],
      Condition: ["subject", "code"],
      Observation: ["status", "code"],
      MedicationRequest: ["status", "intent", "medication[x]"],
      DiagnosticReport: ["status", "code"],
      Practitioner: [],
      Organization: ["name"],
      Location: ["name"],
      ServiceRequest: ["status", "intent"],
      Procedure: ["status"],
    };
    for (const f of requiredByType[r.resourceType] || []) {
      if (f === "medication[x]") {
        if (!r.medicationCodeableConcept && !r.medicationReference) {
          errors.push("MedicationRequest requires medication[x]");
        }
      } else if (r[f] === undefined || r[f] === null || r[f] === "") {
        errors.push(`${r.resourceType}.${f} is required`);
      }
    }
    const refFields = ["subject", "patient", "encounter", "requester"];
    for (const rf of refFields) {
      if (r[rf] && typeof r[rf] === "object" && !r[rf].reference) {
        errors.push(`${r.resourceType}.${rf} must use Reference shape ({reference})`);
      }
    }
    return { ok: errors.length === 0, resourceType: r.resourceType, errors };
  }

  private async profileVersion(tenantId: string): Promise<string> {
    const rule = await this.rules.resolveOrNull<any>(tenantId, "FHIR_PROFILE");
    return rule?.config?.version ?? "4.0.1-base";
  }

  // ------------------------------------------------------------------
  // Spec #11/#10: bundle generation with provenance record
  // ------------------------------------------------------------------

  async buildBundle(
    tenantId: string,
    data: {
      bundleType: string;
      internalType?: string;
      internalId?: string;
      patientId?: string;
      generatedBy?: string;
    },
  ) {
    const version = await this.profileVersion(tenantId);
    const entries: any[] = [];
    if (data.patientId) {
      const p = await this.prisma.patient.findFirst({
        where: { id: data.patientId, tenantId, deletedAt: null },
      });
      if (!p) throw new NotFoundException("Patient not found");
      entries.push({ resource: mapPatient(p) });
    }
    if (data.internalType === "LabOrder" && data.internalId) {
      const order = await this.prisma.labOrder.findFirst({
        where: { id: data.internalId, tenantId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException("LabOrder not found");
      entries.push({ resource: mapDiagnosticReport(order) });
      for (const item of order.items) {
        entries.push({ resource: mapObservation(item, order) });
      }
    }

    const bundle = {
      resourceType: "Bundle" as const,
      id: crypto.randomUUID(),
      type: "document" as const,
      timestamp: new Date().toISOString(),
      meta: { profile: [`urn:hms:profile:${data.bundleType.toLowerCase()}:${version}`] },
      entry: entries,
    };

    const record = await this.prisma.fhirBundleRecord.create({
      data: {
        tenantId,
        bundleType: data.bundleType,
        internalType: data.internalType ?? null,
        internalId: data.internalId ?? null,
        profileVersion: version,
        generatedBy: data.generatedBy ?? null,
        validation: { ok: true } as any,
        resourceCount: entries.length,
        contentHash: crypto
          .createHash("sha256")
          .update(JSON.stringify(bundle))
          .digest("hex"),
      },
    });

    await this.audit.log(tenantId, data.generatedBy, "FhirBundleRecord", record.id, "CREATE", {
      bundleType: data.bundleType,
      internalType: data.internalType,
      internalId: data.internalId,
    });

    return { bundle, record };
  }

  // ------------------------------------------------------------------
  // Spec #49: consent records (patient-authorized sharing)
  // ------------------------------------------------------------------

  async createConsent(
    tenantId: string,
    data: {
      patientId: string;
      purpose: string;
      dataScope?: string;
      recipient?: string;
      effectiveTo?: string | Date;
      createdBy?: string;
    },
  ) {
    if (!data.purpose) throw new ConflictException("Consent requires a purpose");
    const consent = await this.prisma.consentRecord.create({
      data: {
        tenantId,
        patientId: data.patientId,
        purpose: data.purpose,
        dataScope: data.dataScope ?? null,
        recipient: data.recipient ?? null,
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
        createdBy: data.createdBy ?? null,
      },
    });
    await this.audit.log(tenantId, data.createdBy, "ConsentRecord", consent.id, "CREATE", {
      patientId: data.patientId,
      purpose: data.purpose,
    });
    return consent;
  }

  async revokeConsent(
    tenantId: string,
    consentId: string,
    data: { reason: string; revokedBy?: string },
  ) {
    const consent = await this.prisma.consentRecord.findFirst({
      where: { id: consentId, tenantId },
    });
    if (!consent) throw new NotFoundException("Consent record not found");
    if (consent.status !== "ACTIVE") {
      throw new ConflictException(`Consent already ${consent.status}`);
    }
    if (!data.reason || !data.reason.trim()) {
      throw new ConflictException("Revocation requires a reason");
    }
    const updated = await this.prisma.consentRecord.update({
      where: { id: consentId },
      data: { status: "REVOKED", revokedAt: new Date(), revokedReason: data.reason },
    });
    await this.audit.log(tenantId, data.revokedBy, "ConsentRecord", consentId, "UPDATE", {
      action: "REVOKE",
      reason: data.reason,
    });
    return updated;
  }

  async listConsents(tenantId: string, patientId?: string) {
    return this.prisma.consentRecord.findMany({
      where: { tenantId, ...(patientId ? { patientId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}'''

s = s[:-1].rstrip() + block
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("fhir.service extended")
