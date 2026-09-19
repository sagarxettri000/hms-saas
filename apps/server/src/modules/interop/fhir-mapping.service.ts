import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * FHIR mapping registry (§78.2). Operational HMS data remains the source of
 * truth; mappings are versioned metadata describing how source entities map
 * to FHIR resources. The existing inline mappers in fhir.service.ts keep
 * producing resources — this registry records WHICH mapping version applies,
 * satisfies §78.2's "store the mapping version" requirement, and gives the
 * national-spec evolution path a data-driven home.
 */

@Injectable()
export class FhirMappingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Register a mapping version entry (upsert per entity/resource/element). */
  async upsertMapping(
    tenantId: string,
    data: {
      sourceEntity: string;
      sourceField?: string;
      fhirResource: string;
      fhirElement?: string;
      transformRule?: any;
      terminologyMap?: any;
      mappingVersion: string;
      effectiveTo?: Date;
      createdBy?: string;
    },
  ) {
    const existing = await this.prisma.fhirMapping.findFirst({
      where: {
        tenantId,
        sourceEntity: data.sourceEntity,
        sourceField: data.sourceField ?? null,
        fhirResource: data.fhirResource,
        fhirElement: data.fhirElement ?? null,
        mappingVersion: data.mappingVersion,
      },
    });
    if (existing) {
      return this.prisma.fhirMapping.update({
        where: { id: existing.id },
        data: {
          transformRule: data.transformRule,
          terminologyMap: data.terminologyMap,
          effectiveTo: data.effectiveTo ?? existing.effectiveTo,
        },
      });
    }
    return this.prisma.fhirMapping.create({ data: { tenantId, ...data } });
  }

  /** Effective mappings for a source entity (newest version first). */
  async resolve(tenantId: string, sourceEntity: string, at: Date = new Date()) {
    const mappings = await this.prisma.fhirMapping.findMany({
      where: {
        tenantId,
        sourceEntity,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }],
      },
      orderBy: { mappingVersion: "desc" },
    });
    if (mappings.length === 0) {
      throw new NotFoundException(`No FHIR mapping registered for ${sourceEntity}`);
    }
    return mappings;
  }

  /** Register the export of a FHIR resource with its validation result (§78.3). */
  async recordExport(
    tenantId: string,
    data: {
      fhirResource: string;
      sourceEntity: string;
      sourceEntityId: string;
      mappingVersion?: string;
      validationOk: boolean;
      validationErrors?: string[];
      patientId?: string;
      createdBy?: string;
    },
  ) {
    return this.prisma.interopTransaction.create({
      data: {
        tenantId,
        destination: "FHIR_EXCHANGE",
        purpose: "FHIR_EXCHANGE",
        sourceModule: "fhir",
        sourceEntity: data.sourceEntity,
        sourceEntityId: data.sourceEntityId,
        idempotencyKey: `fhir-export:${data.fhirResource}:${data.sourceEntity}:${data.sourceEntityId}:${new Date().toISOString()}`,
        payload: { resourceType: data.fhirResource, validationOk: data.validationOk },
        mappingVersion: data.mappingVersion,
        patientId: data.patientId,
        status: data.validationOk ? "PENDING" : "VALIDATION_FAILED",
        failureClass: data.validationOk ? null : "VALIDATION",
        lastError: data.validationErrors?.join("; "),
        createdBy: data.createdBy,
      },
    });
  }
}
