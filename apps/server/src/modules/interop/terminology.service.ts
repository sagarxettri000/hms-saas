import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * ICD-11 terminology service (§79.2). Centralized lookup/search/validation —
 * diagnosis lists are never embedded in individual screens. Historical
 * diagnoses stay pinned to the terminology version recorded at coding time
 * (§79.3): new codes append versions, old rows are never rewritten.
 */

export interface IcdValidationResult {
  valid: boolean;
  code: string;
  display?: string;
  version?: string;
  reason?: string;
}

@Injectable()
export class TerminologyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve the currently effective ICD-11 version for a tenant. */
  async activeVersion(tenantId: string): Promise<string> {
    const latest = await this.prisma.icdCode.findFirst({
      where: { tenantId },
      orderBy: { effectiveFrom: "desc" },
      select: { version: true },
    });
    if (!latest) throw new NotFoundException("No ICD-11 terminology loaded — import a version first");
    return latest.version;
  }

  /** Import codes as a NEW terminology version (never overwrites history, §79.3). */
  async importVersion(
    tenantId: string,
    data: {
      version: string;
      codes: Array<{ code: string; display: string; chapterRef?: string; synonyms?: string[]; language?: string }>;
      createdBy?: string;
    },
  ) {
    if (!data.version?.trim()) throw new ConflictException("Terminology version is required");
    const existing = await this.prisma.icdCode.findFirst({
      where: { tenantId, version: data.version },
    });
    if (existing) {
      throw new ConflictException(`ICD-11 version ${data.version} already imported — use a new version identifier`);
    }
    await this.prisma.icdCode.createMany({
      data: data.codes.map((c) => ({
        tenantId,
        code: c.code,
        display: c.display,
        chapterRef: c.chapterRef,
        synonyms: c.synonyms ?? [],
        language: c.language ?? "en",
        version: data.version,
      })),
    });
    return { version: data.version, imported: data.codes.length };
  }

  async lookup(tenantId: string, code: string, version?: string) {
    const entry = await this.prisma.icdCode.findFirst({
      where: {
        tenantId,
        code,
        ...(version ? { version } : {}),
      },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!entry) throw new NotFoundException(`ICD-11 code ${code} not found${version ? ` in version ${version}` : ""}`);
    return entry;
  }

  async search(tenantId: string, query: string, opts: { version?: string; limit?: number } = {}) {
    const limit = Math.min(opts.limit ?? 20, 100);
    return this.prisma.icdCode.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(opts.version ? { version: opts.version } : {}),
        OR: [
          { display: { contains: query, mode: "insensitive" as any } },
          { code: { contains: query, mode: "insensitive" as any } },
          { synonyms: { array_contains: query } as any },
        ],
      },
      orderBy: { code: "asc" },
      take: limit,
    });
  }

  /**
   * Validate a code against a terminology version (§79.2). Deprecated codes
   * report valid=false with the deprecation reason — never silently accepted.
   */
  async validate(tenantId: string, code: string, version?: string): Promise<IcdValidationResult> {
    const entry = await this.prisma.icdCode.findFirst({
      where: { tenantId, code, ...(version ? { version } : {}) },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!entry) {
      return { valid: false, code, reason: `Code not found in terminology${version ? ` version ${version}` : ""}` };
    }
    if (!entry.isActive || (entry.deprecatedAt && entry.deprecatedAt <= new Date())) {
      return { valid: false, code, display: entry.display, version: entry.version, reason: "Code is deprecated/inactive" };
    }
    return { valid: true, code, display: entry.display, version: entry.version };
  }

  /**
   * Attach an ICD-11 code to an existing diagnosis (§79.1). The diagnosis row
   * records the terminology version used — later version changes never
   * rewrite it (§79.3).
   */
  async codeDiagnosis(
    tenantId: string,
    diagnosisId: string,
    data: { icd11Code: string; certainty?: string; onsetDate?: Date; codedBy?: string },
  ) {
    const dx = await this.prisma.diagnosis.findFirst({ where: { id: diagnosisId, tenantId } });
    if (!dx) throw new NotFoundException("Diagnosis not found");

    const validation = await this.validate(tenantId, data.icd11Code);
    if (!validation.valid) {
      throw new ConflictException(`ICD-11 validation failed: ${validation.reason}`);
    }
    return this.prisma.diagnosis.update({
      where: { id: diagnosisId },
      data: {
        icd11Code: validation.code,
        icd11Display: validation.display,
        icd11Version: validation.version,
        ...(data.certainty ? { certainty: data.certainty } : {}),
        ...(data.onsetDate ? { onsetDate: data.onsetDate } : {}),
      },
    });
  }
}
