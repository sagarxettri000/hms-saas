import { NotFoundException } from "@nestjs/common";
import { FhirService } from "./fhir.service";

describe("FhirService", () => {
  const prisma = {
    patient: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    labOrderItem: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    labOrder: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new FhirService(prisma as any);

  const patient = {
    id: "p1",
    tenantId: "t1",
    mrn: "MRN-001",
    uid: "UID-1",
    firstName: "Ram",
    middleName: null,
    lastName: "Sharma",
    dateOfBirth: new Date("1990-01-01"),
    gender: "MALE",
    bloodGroup: "O+",
    phone: "+9771",
    mobile: null,
    email: "ram@x.com",
    addressLine1: "Main Rd",
    city: "Kathmandu",
    country: "Nepal",
    status: "ACTIVE",
    deletedAt: null,
  };

  beforeEach(() => jest.clearAllMocks());

  it("maps a patient to a FHIR Patient resource", async () => {
    prisma.patient.findFirst.mockResolvedValue(patient);
    const resource = await service.getPatient("t1", "p1");
    expect(resource.resourceType).toBe("Patient");
    expect(resource.id).toBe("p1");
    expect(resource.active).toBe(true);
    expect(resource.name[0].family).toBe("Sharma");
    expect(resource.gender).toBe("male");
    expect(resource.birthDate).toBe("1990-01-01");
    expect(resource.identifier).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "MRN-001" }),
      ]),
    );
  });

  it("throws when a patient is not found", async () => {
    prisma.patient.findFirst.mockResolvedValue(null);
    await expect(service.getPatient("t1", "missing")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("returns a searchset bundle for patients filtered by name", async () => {
    prisma.patient.findMany.mockResolvedValue([patient]);
    const bundle = await service.searchPatients("t1", { name: "Ram" });
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("searchset");
    expect(bundle.total).toBe(1);
    expect(bundle.entry[0].resource.resourceType).toBe("Patient");
    const arg = prisma.patient.findMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe("t1");
    expect(arg.where.deletedAt).toBeNull();
    expect(arg.where.OR.length).toBe(3);
  });

  it("scopes patient search by identifier", async () => {
    prisma.patient.findMany.mockResolvedValue([]);
    await service.searchPatients("t1", { identifier: "MRN-001" });
    const arg = prisma.patient.findMany.mock.calls[0][0];
    expect(arg.where.OR).toHaveLength(3);
  });

  it("maps a lab order item to an Observation with quantity", async () => {
    prisma.labOrderItem.findFirst.mockResolvedValue({
      id: "o1",
      tenantId: "t1",
      testName: "Glucose",
      labTestId: "lt1",
      resultValue: 120,
      unit: "mg/dL",
      referenceRange: "70-100",
      isAbnormal: true,
      isCritical: false,
      updatedAt: new Date(),
      createdAt: new Date(),
      labOrder: { patientId: "p1" },
    });
    const obs = await service.getObservation("t1", "o1");
    expect(obs.resourceType).toBe("Observation");
    expect(obs.subject.reference).toBe("Patient/p1");
    expect(obs.valueQuantity.value).toBe(120);
    expect(obs.valueQuantity.unit).toBe("mg/dL");
    expect(obs.interpretation).toBeTruthy();
    expect(obs.status).toBe("final");
  });

  it("maps a string lab result to valueString", async () => {
    prisma.labOrderItem.findFirst.mockResolvedValue({
      id: "o2",
      tenantId: "t1",
      testName: "Blood Group",
      result: "O+",
      labOrder: { patientId: "p1" },
    });
    const obs = await service.getObservation("t1", "o2");
    expect(obs.valueString).toBe("O+");
    expect(obs.valueQuantity).toBeUndefined();
  });

  it("throws when an observation is not found", async () => {
    prisma.labOrderItem.findFirst.mockResolvedValue(null);
    await expect(service.getObservation("t1", "nope")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("maps a lab order to a DiagnosticReport with result references", async () => {
    prisma.labOrder.findFirst.mockResolvedValue({
      id: "r1",
      tenantId: "t1",
      patientId: "p1",
      doctorId: "d1",
      status: "COMPLETED",
      clinicalNote: "Panel",
      reportedAt: new Date(),
      verifiedAt: new Date(),
      updatedAt: new Date(),
      orderedAt: new Date(),
      items: [{ id: "o1" }],
    });
    const report = await service.getDiagnosticReport("t1", "r1");
    expect(report.resourceType).toBe("DiagnosticReport");
    expect(report.status).toBe("final");
    expect(report.subject.reference).toBe("Patient/p1");
    expect(report.result).toEqual([{ reference: "Observation/o1" }]);
  });

  it("returns a searchset bundle for observations filtered by patient", async () => {
    prisma.labOrderItem.findMany.mockResolvedValue([
      {
        id: "o1",
        testName: "Glucose",
        labOrder: { patientId: "p1" },
      },
    ]);
    const bundle = await service.searchObservations("t1", { patient: "p1" });
    expect(bundle.total).toBe(1);
    expect(bundle.entry[0].resource.subject.reference).toBe("Patient/p1");
    const arg = prisma.labOrderItem.findMany.mock.calls[0][0];
    expect(arg.where.labOrder).toEqual({ patientId: "p1" });
  });

  it("returns a CapabilityStatement listing supported resources", async () => {
    const cs = await service.getCapabilityStatement("t1");
    expect(cs.resourceType).toBe("CapabilityStatement");
    expect(cs.fhirVersion).toBe("4.0.1");
    const types = cs.rest[0].resource.map((r: any) => r.type);
    expect(types).toEqual(
      expect.arrayContaining(["Patient", "Observation", "DiagnosticReport"]),
    );
  });
});
