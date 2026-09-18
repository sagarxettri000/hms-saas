import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const ADMIN = {
  resourceType: "Organization",
  identifier: [
    {
      system: "urn:ietf:rfc:3986",
      value: "urn:hms:tenant",
    },
  ],
  active: true,
  name: "HMS SaaS",
};

function mapGender(gender?: string | null): string {
  if (!gender) return "unknown";
  const map: Record<string, string> = {
    MALE: "male",
    FEMALE: "female",
    OTHER: "other",
    UNKNOWN: "unknown",
  };
  return map[gender] || "unknown";
}

function mapPatient(p: any) {
  const name: any = {
    family: p.lastName || "",
    given: [p.firstName, p.middleName].filter(Boolean),
  };
  const identifier: any[] = [];
  if (p.mrn) identifier.push({ system: "urn:hms:mrn", value: p.mrn });
  if (p.uid) identifier.push({ system: "urn:hms:uid", value: p.uid });
  if (p.nationalId)
    identifier.push({ system: "urn:nepal:nid", value: p.nationalId });

  const resource: any = {
    resourceType: "Patient",
    id: p.id,
    identifier,
    active: p.status === "ACTIVE",
    name: [name],
    gender: mapGender(p.gender),
    meta: {
      profile: ["http://hl7.org/fhir/StructureDefinition/Patient"],
    },
  };
  if (p.dateOfBirth)
    resource.birthDate = p.dateOfBirth.toISOString().slice(0, 10);
  if (p.phone || p.mobile) {
    resource.telecom = [];
    if (p.phone) resource.telecom.push({ system: "phone", value: p.phone });
    if (p.mobile)
      resource.telecom.push({
        system: "phone",
        value: p.mobile,
        use: "mobile",
      });
    if (p.email) resource.telecom.push({ system: "email", value: p.email });
  }
  if (p.addressLine1 || p.city || p.country) {
    resource.address = [
      {
        line: [p.addressLine1, p.addressLine2].filter(Boolean),
        city: p.city,
        district: p.district,
        state: p.province,
        country: p.country,
        postalCode: p.postalCode,
      },
    ];
  }
  if (p.bloodGroup) {
    resource.extension = [
      {
        url: "http://hl7.org/fhir/StructureDefinition/patient-bloodGroup",
        valueString: p.bloodGroup,
      },
    ];
  }
  return resource;
}

function mapObservation(item: any, labOrder: any) {
  const resource: any = {
    resourceType: "Observation",
    id: item.id,
    status: item.isCritical
      ? "final"
      : item.result !== null && item.result !== undefined
        ? "final"
        : item.resultValue !== null && item.resultValue !== undefined
          ? "final"
          : "preliminary",
    code: {
      coding: [
        {
          system: "urn:hms:lab-test",
          code: item.labTestId || item.testName,
          display: item.testName,
        },
      ],
      text: item.testName,
    },
    subject: {
      reference: `Patient/${labOrder.patientId}`,
    },
    effectiveDateTime: item.updatedAt || item.createdAt,
    meta: {
      profile: ["http://hl7.org/fhir/StructureDefinition/Observation"],
    },
  };

  if (item.resultValue !== null && item.resultValue !== undefined) {
    resource.valueQuantity = {
      value: Number(item.resultValue),
      unit: item.unit,
      system: "http://unitsofmeasure.org",
      code: item.unit,
    };
  } else if (item.result !== null && item.result !== undefined) {
    resource.valueString = item.result;
  }

  if (item.referenceRange) {
    resource.referenceRange = [
      {
        text: item.referenceRange,
      },
    ];
  }
  if (item.isAbnormal)
    resource.interpretation = [
      {
        coding: [{ system: "urn:hl7-org:v3", code: "A", display: "Abnormal" }],
      },
    ];
  if (item.isCritical)
    resource.interpretation = [
      {
        coding: [{ system: "urn:hl7-org:v3", code: "L", display: "Low" }],
        text: "Critical",
      },
    ];
  if (item.notes) resource.note = [{ text: item.notes }];

  return resource;
}

function mapDiagnosticReport(labOrder: any) {
  const results: any[] = [];
  if (labOrder.reportedAt) {
    results.push({
      title: "PDF Report",
      extension: [
        {
          url: "http://hl7.org/fhir/StructureDefinition/report-quality",
          valueString: "released",
        },
      ],
      relatedArtifact: [
        {
          type: "derived-from",
          label: "Original report",
        },
      ],
    });
  }

  return {
    resourceType: "DiagnosticReport",
    id: labOrder.id,
    status: labOrder.verifiedAt
      ? "final"
      : labOrder.reportedAt
        ? "final"
        : "preliminary",
    code: {
      text: labOrder.clinicalNote || "Laboratory panel",
    },
    subject: {
      reference: `Patient/${labOrder.patientId}`,
    },
    issued: labOrder.reportedAt || labOrder.updatedAt,
    performer: labOrder.doctorId
      ? [
          {
            reference: `Practitioner/${labOrder.doctorId}`,
          },
        ]
      : undefined,
    result:
      labOrder.items && labOrder.items.length
        ? labOrder.items.map((i: any) => ({
            reference: `Observation/${i.id}`,
          }))
        : undefined,
    meta: {
      profile: ["http://hl7.org/fhir/StructureDefinition/DiagnosticReport"],
    },
  };
}

@Injectable()
export class FhirService {
  constructor(private readonly prisma: PrismaService) {}

  async getPatient(tenantId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException(`Patient ${id} not found`);
    return mapPatient(patient);
  }

  async searchPatients(
    tenantId: string,
    query: {
      identifier?: string;
      name?: string;
      birthdate?: string;
      _count?: string;
    },
  ) {
    const where: any = { tenantId, deletedAt: null };
    const or: any[] = [];
    if (query.identifier) {
      or.push(
        { mrn: query.identifier },
        { uid: query.identifier },
        { nationalId: query.identifier },
      );
    }
    if (query.name) {
      const term = query.name;
      or.push(
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { middleName: { contains: term, mode: "insensitive" } },
      );
    }
    if (or.length) where.OR = or;
    if (query.birthdate) {
      where.dateOfBirth = new Date(query.birthdate);
    }

    const limit = Math.min(100, Number(query._count) || 20);
    const patients = await this.prisma.patient.findMany({
      where,
      take: limit,
    });

    return {
      resourceType: "Bundle",
      type: "searchset",
      total: patients.length,
      entry: patients.map((p) => ({
        fullUrl: `${ADMIN.identifier[0].value}/Patient/${p.id}`,
        resource: mapPatient(p),
      })),
    };
  }

  async getObservation(tenantId: string, id: string) {
    const item = await this.prisma.labOrderItem.findFirst({
      where: { id, tenantId },
      include: { labOrder: true },
    });
    if (!item) throw new NotFoundException(`Observation ${id} not found`);
    return mapObservation(item, item.labOrder);
  }

  async searchObservations(
    tenantId: string,
    query: { patient?: string; code?: string; date?: string; _count?: string },
  ) {
    const where: any = { tenantId };
    if (query.patient) {
      where.labOrder = { patientId: query.patient };
    }
    if (query.code) {
      where.OR = [
        { testName: { contains: query.code, mode: "insensitive" } },
        { labTestId: query.code },
      ];
    }
    if (query.date) {
      const from = new Date(query.date);
      const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
      where.createdAt = { gte: from, lt: to };
    }

    const limit = Math.min(100, Number(query._count) || 20);
    const items = await this.prisma.labOrderItem.findMany({
      where,
      include: { labOrder: { select: { patientId: true } } },
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    return {
      resourceType: "Bundle",
      type: "searchset",
      total: items.length,
      entry: items.map((i) => ({
        fullUrl: `${ADMIN.identifier[0].value}/Observation/${i.id}`,
        resource: mapObservation(i, { patientId: i.labOrder.patientId } as any),
      })),
    };
  }

  async getDiagnosticReport(tenantId: string, id: string) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException(`DiagnosticReport ${id} not found`);
    return mapDiagnosticReport(order);
  }

  async searchDiagnosticReports(
    tenantId: string,
    query: { patient?: string; status?: string; _count?: string },
  ) {
    const where: any = { tenantId };
    if (query.patient) where.patientId = query.patient;
    if (query.status) where.status = query.status;

    const limit = Math.min(100, Number(query._count) || 20);
    const orders = await this.prisma.labOrder.findMany({
      where,
      include: { items: true },
      take: limit,
      orderBy: { orderedAt: "desc" },
    });

    return {
      resourceType: "Bundle",
      type: "searchset",
      total: orders.length,
      entry: orders.map((o) => ({
        fullUrl: `${ADMIN.identifier[0].value}/DiagnosticReport/${o.id}`,
        resource: mapDiagnosticReport(o),
      })),
    };
  }

  async getCapabilityStatement(tenantId: string) {
    return {
      resourceType: "CapabilityStatement",
      id: "hms-fhir",
      status: "active",
      date: new Date().toISOString(),
      publisher: "HMS SaaS",
      kind: "instance",
      software: {
        name: "HMS SaaS FHIR Server",
        version: "1.0.0",
      },
      fhirVersion: "4.0.1",
      format: ["application/fhir+json"],
      rest: [
        {
          mode: "server",
          resource: [
            {
              type: "Patient",
              profile: "http://hl7.org/fhir/StructureDefinition/Patient",
              searchParam: [
                { name: "identifier", type: "token" },
                { name: "name", type: "string" },
                { name: "birthdate", type: "date" },
              ],
            },
            {
              type: "Observation",
              profile: "http://hl7.org/fhir/StructureDefinition/Observation",
              searchParam: [
                { name: "patient", type: "reference" },
                { name: "code", type: "token" },
                { name: "date", type: "date" },
              ],
            },
            {
              type: "DiagnosticReport",
              profile:
                "http://hl7.org/fhir/StructureDefinition/DiagnosticReport",
              searchParam: [
                { name: "patient", type: "reference" },
                { name: "status", type: "token" },
              ],
            },
          ],
        },
      ],
    };
  }
}
