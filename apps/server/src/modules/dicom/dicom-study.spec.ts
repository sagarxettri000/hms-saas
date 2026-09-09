import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DicomService } from "./dicom.service";

const makeStorage = () => ({
  put: jest.fn(async () => ({ key: "k", size: 100 })),
  get: jest.fn(),
  delete: jest.fn(),
});

function makePrisma() {
  return {
    dicomStudy: {
      findFirst: jest.fn(),
      update: jest.fn(async (args: any) => ({ id: "study-1", ...(args.data ?? {}) })),
    },
    radiologyOrder: {
      findFirst: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async (args: any) => ({ id: "order-1", ...args.data })),
    },
    auditLog: {
      create: jest.fn(async () => ({ id: "log-1" })),
    },
  };
}

describe("DicomService study association", () => {
  it("associates a study with an order and advances the order status", async () => {
    const prisma = makePrisma();
    prisma.dicomStudy.findFirst.mockResolvedValue({ id: "study-1", radiologyOrderId: null });
    prisma.radiologyOrder.findFirst.mockResolvedValue({ id: "order-1", status: "ORDERED" });
    const service = new DicomService(prisma as any, makeStorage() as any);

    const result = await service.associateStudy("t", "study-1", "order-1", "u-1");

    expect(result).toEqual({ studyId: "study-1", radiologyOrderId: "order-1" });
    expect(prisma.dicomStudy.update).toHaveBeenCalledWith({
      where: { id: "study-1" },
      data: { radiologyOrderId: "order-1" },
    });
    expect(prisma.radiologyOrder.updateMany).toHaveBeenCalledWith({
      where: {
        id: "order-1",
        tenantId: "t",
        status: { in: ["ORDERED", "SCHEDULED", "IN_PROGRESS"] },
      },
      data: { status: "IMAGES_UPLOADED" },
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("rejects association when the study or order does not exist", async () => {
    const prisma = makePrisma();
    prisma.dicomStudy.findFirst.mockResolvedValue(null);
    const service = new DicomService(prisma as any, makeStorage() as any);

    await expect(service.associateStudy("t", "bad", "order-1", "u-1")).rejects.toThrow(NotFoundException);
  });

  it("unassociates a study", async () => {
    const prisma = makePrisma();
    prisma.dicomStudy.findFirst.mockResolvedValue({ id: "study-1", radiologyOrderId: "order-1" });
    const service = new DicomService(prisma as any, makeStorage() as any);

    const result = await service.unassociateStudy("t", "study-1", "u-1");

    expect(result).toEqual({ studyId: "study-1", radiologyOrderId: null });
    expect(prisma.dicomStudy.update).toHaveBeenCalledWith({
      where: { id: "study-1" },
      data: { radiologyOrderId: null },
    });
  });

  it("creates a radiology order from an orphan study and links it", async () => {
    const prisma = makePrisma();
    prisma.dicomStudy.findFirst.mockResolvedValue({
      id: "study-1",
      patientId: "pat-1",
      accessionNumber: "ACC-001",
      modality: "MR",
      bodyPart: "BRAIN",
      radiologyOrderId: null,
    });
    prisma.radiologyOrder.findFirst.mockResolvedValue(null);
    const service = new DicomService(prisma as any, makeStorage() as any);

    const result = await service.createOrderFromStudy(
      "t",
      "study-1",
      { bodyPart: "HEAD", referringDoctorId: "doc-1" },
      "u-1",
    );

    expect(result.id).toBe("order-1");
    expect(result.orderNumber).toMatch(/^RAD-\d{8}-0001$/);
    expect(result.modality).toBe("MRI");
    expect(result.patientId).toBe("pat-1");
    expect(prisma.dicomStudy.update).toHaveBeenCalledWith({
      where: { id: "study-1" },
      data: { radiologyOrderId: "order-1" },
    });
  });

  it("errors when the study is already linked to an order", async () => {
    const prisma = makePrisma();
    prisma.dicomStudy.findFirst.mockResolvedValue({
      id: "study-1",
      patientId: "pat-1",
      modality: "CT",
      radiologyOrderId: "order-9",
    });
    const service = new DicomService(prisma as any, makeStorage() as any);

    await expect(service.createOrderFromStudy("t", "study-1", {}, "u-1")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("maps DICOM modalities to radiology order modalities", async () => {
    const prisma = makePrisma();
    prisma.dicomStudy.findFirst.mockResolvedValue({
      id: "study-1",
      patientId: "pat-1",
      modality: "DX",
      radiologyOrderId: null,
    });
    prisma.radiologyOrder.findFirst.mockResolvedValue(null);
    const service = new DicomService(prisma as any, makeStorage() as any);

    const result = await service.createOrderFromStudy("t", "study-1", {}, "u-1");

    expect(result.modality).toBe("XRAY");
  });
});