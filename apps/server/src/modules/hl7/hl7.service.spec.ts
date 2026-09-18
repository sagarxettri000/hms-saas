import { Hl7Service } from "./hl7.service";

const ADT = [
  "MSH|^~\\&|RIS|HOSPITAL|HMS|NEPAL|20250115123000||ADT^A01|MSG0001|P|2.5",
  "PID|1||MRN000123^^^HOSP^MR||DOE^JOHN^A||19800101|M|||123 MAIN ST^^KATHMANDU^BAGMATI^44600^NP||555-555-5555|",
  "PV1|1|I|WARD^1^101^HOSP|||",
].join("\r");

const ORM = [
  "MSH|^~\\&|RIS|HOSPITAL|HMS|NEPAL|20250115123000||ORM^O01|MSG0002|P|2.5",
  "PID|1||MRN000123^^^HOSP^MR||DOE^JOHN^A||19800101|M|",
  "ORC|NW|ORD-1001|||NW",
  "OBR|1|ORD-1001|FILL-2001|CT^CT CHEST W/O CONTRAST^L|||20250115123000|||RAD",
].join("\r");

const ORU_RAD = [
  "MSH|^~\\&|RIS|HOSPITAL|HMS|NEPAL|20250115123300||ORU^R01|MSG0003|P|2.5",
  "PID|1||MRN000123^^^HOSP^MR||DOE^JOHN^A||19800101|M|",
  "OBR|1|ORD-1001|FILL-2001|CT^CT CHEST W/O CONTRAST^L|||",
  "OBX|1|ST|IMP^IMPRESSION^L||No acute findings.",
].join("\r");

const ORU_LAB = [
  "MSH|^~\\&|LIS|HOSPITAL|HMS|NEPAL|20250115123400||ORU^R01|MSG0004|P|2.5",
  "PID|1||MRN000123^^^HOSP^MR||DOE^JOHN^A||19800101|M|",
  "OBR|1|LAB-1|FILL-1|CBC^COMPLETE BLOOD COUNT^L|||",
  "OBX|1|NM|WBC^WHITE BLOOD COUNT^L||8.5|10^9/L|4-11|N",
  "OBX|2|NM|HGB^HEMOGLOBIN^L||13.1|g/dL|12-16|N",
].join("\r");

const SIU = [
  "MSH|^~\\&|RIS|HOSPITAL|HMS|NEPAL|20250115123500||SIU^S12|MSG0005|P|2.5",
  "PID|1||MRN000123^^^HOSP^MR||DOE^JOHN^A||19800101|M|",
  "SCH|APT-1|||||CT CHEST|||60|MIN|20250116090000|20250116100000",
  "AIL|1||RAD-1^CT SCANNER ROOM^HOSP",
].join("\r");

function makePrisma() {
  const patient = {
    id: "patient-1",
    mrn: "MRN000123",
    firstName: "JOHN",
    lastName: "DOE",
    status: "ACTIVE",
  };
  return {
    patient: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(patient),
      update: jest.fn().mockResolvedValue({ ...patient, lastName: "SMITH" }),
    },
    radiologyOrder: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ ...data, id: "rad-1" })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: "rad-1" }),
    },
    labOrder: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ ...data, id: "lab-1" })),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: "lab-1" }),
    },
    labOrderItem: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: "item-1", ...data })),
    },
  };
}

describe("Hl7Service", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: Hl7Service;

  beforeEach(() => {
    prisma = makePrisma();
    service = new Hl7Service(prisma as any);
  });

  it("requires a tenant context", async () => {
    const result = await service.processMessage(ADT);
    expect(result.accepted).toBe(false);
    expect(result.actions[0].type).toBe("ERROR");
  });

  describe("ADT", () => {
    it("creates a new patient and reports it", async () => {
      const result = await service.processMessage(ADT, {
        tenantId: "t1",
        userId: "u1",
      });
      expect(result.accepted).toBe(true);
      expect(result.actions[0].type).toBe("PATIENT_UPSERTED");
      expect(result.actions[0].created).toBe(true);
      expect(prisma.patient.create).toHaveBeenCalledTimes(1);
      const data = prisma.patient.create.mock.calls[0][0].data;
      expect(data.mrn).toBe("MRN000123");
      expect(data.firstName).toBe("JOHN");
      expect(data.gender).toBe("MALE");
      expect(data.dateOfBirth.getFullYear()).toBe(1980);
      expect(data.city).toBe("KATHMANDU");
      expect(data.status).toBe("ACTIVE");
    });

    it("updates an existing patient when the MRN matches", async () => {
      prisma.patient.findFirst.mockResolvedValue({
        ...prisma.patient.create.mock.results[0]?.value,
        id: "patient-1",
      });
      prisma.patient.findFirst.mockResolvedValue({
        id: "patient-1",
        mrn: "MRN000123",
      });
      const realPatient = {
        id: "patient-1",
        mrn: "MRN000123",
        firstName: "JOHN",
        lastName: "DOE",
      };
      prisma.patient.update.mockResolvedValue(realPatient);

      const message = ADT.replace("DOE^JOHN", "SMITH^JOHN");
      const result = await service.processMessage(message, { tenantId: "t1" });
      expect(result.accepted).toBe(true);
      expect(prisma.patient.create).not.toHaveBeenCalled();
      expect(prisma.patient.update).toHaveBeenCalledTimes(1);
      expect(prisma.patient.update.mock.calls[0][0].data.lastName).toBe(
        "SMITH",
      );
    });
  });

  describe("ORM^O01", () => {
    it("creates a radiology order with modality CT", async () => {
      const result = await service.processMessage(ORM, { tenantId: "t1" });
      expect(result.accepted).toBe(true);
      expect(result.actions[0].type).toBe("RADIOLOGY_ORDER_CREATED");
      expect(prisma.radiologyOrder.create).toHaveBeenCalledTimes(1);
      const data = prisma.radiologyOrder.create.mock.calls[0][0].data;
      expect(data.modality).toBe("CT");
      expect(data.status).toBe("ORDERED");
      expect(data.bodyPart).toBe("CT CHEST W/O CONTRAST");
    });
  });

  describe("ORU^R01 radiology", () => {
    it("reports an existing order", async () => {
      prisma.radiologyOrder.findFirst.mockResolvedValue({ id: "rad-1" });
      const result = await service.processMessage(ORU_RAD, { tenantId: "t1" });
      expect(result.accepted).toBe(true);
      expect(result.actions[0].type).toBe("RADIOLOGY_ORDER_REPORTED");
      expect(prisma.radiologyOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "rad-1" },
          data: expect.objectContaining({ status: "REPORTED" }),
        }),
      );
    });
  });

  describe("ORU^R01 lab", () => {
    it("creates lab items for OBX rows", async () => {
      const result = await service.processMessage(ORU_LAB, { tenantId: "t1" });
      expect(result.accepted).toBe(true);
      expect(result.actions[0].type).toBe("LAB_ORDER_REPORTED");
      expect(prisma.labOrder.create).toHaveBeenCalledTimes(1);
      expect(prisma.labOrderItem.create).toHaveBeenCalledTimes(2);
      expect(prisma.labOrderItem.create.mock.calls[0][0].data.testName).toBe(
        "WHITE BLOOD COUNT",
      );
      expect(prisma.labOrderItem.create.mock.calls[0][0].data.result).toBe(
        "8.5",
      );
    });
  });

  describe("SIU^S12", () => {
    it("creates a scheduled radiology order", async () => {
      const result = await service.processMessage(SIU, { tenantId: "t1" });
      expect(result.accepted).toBe(true);
      expect(result.actions[0].type).toBe("RADIOLOGY_ORDER_SCHEDULED");
      const data = prisma.radiologyOrder.create.mock.calls[0][0].data;
      expect(data.status).toBe("SCHEDULED");
      expect(data.scheduledAt.getFullYear()).toBe(2025);
      expect(data.modality).toBe("CT");
    });
  });

  describe("unsupported events", () => {
    it("returns IGNORED for unknown message types", async () => {
      const msg = ADT.replace("ADT^A01", "QBP^Q13");
      const result = await service.processMessage(msg, { tenantId: "t1" });
      expect(result.accepted).toBe(true);
      expect(result.actions[0].type).toBe("IGNORED");
      expect(result.actions[0].detail).toBe("QBP^Q13");
    });
  });
});
