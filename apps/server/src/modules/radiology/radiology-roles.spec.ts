import { ForbiddenException } from "@nestjs/common";
import { RadiologyService } from "./radiology.service";

function makePrisma(initialStatus = "IMAGES_UPLOADED") {
  let orderStatus = initialStatus;
  const update = jest.fn().mockImplementation(({ data }) => {
    orderStatus = data.status ?? orderStatus;
    return { id: "rad-1", status: orderStatus };
  });
  return {
    radiologyOrder: {
      findFirst: jest.fn().mockImplementation(() => ({ id: "rad-1", status: orderStatus })),
      update,
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }) },
  };
}

describe("RadiologyService role separation", () => {
  let service: RadiologyService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new RadiologyService(prisma as any);
  });

  it("rejects report writing for a radiology technician", async () => {
    await expect(
      service.writeReport("t", "rad-1", { findings: "x" }, "tech-1", "RADIOLOGY_TECHNICIAN"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.radiologyOrder.update).not.toHaveBeenCalled();
  });

  it("allows report writing for a radiologist", async () => {
    await service.writeReport("t", "rad-1", { findings: "Normal study" }, "doc-1", "RADIOLOGIST");
    expect(prisma.radiologyOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REPORTED" }) }),
    );
  });

  it("blocks a technician from VERIFIED and APPROVED transitions", async () => {
    await expect(
      service.transitionStatus("t", "rad-1", "VERIFIED", "tech-1", "RADIOLOGY_TECHNICIAN"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.transitionStatus("t", "rad-1", "APPROVED", "tech-1", "RADIOLOGY_TECHNICIAN"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows a technician to perform non-reporting transitions", async () => {
    prisma = makePrisma("ORDERED");
    service = new RadiologyService(prisma as any);
    await service.transitionStatus("t", "rad-1", "SCHEDULED", "tech-1", "RADIOLOGY_TECHNICIAN");
    expect(prisma.radiologyOrder.update).toHaveBeenCalled();
  });

  it("allows a radiologist to verify", async () => {
    prisma = makePrisma("REPORTED");
    service = new RadiologyService(prisma as any);
    await expect(
      service.transitionStatus("t", "rad-1", "VERIFIED", "doc-1", "RADIOLOGIST"),
    ).resolves.toBeDefined();
  });

  it("keeps legacy callers without actor context working", async () => {
    await expect(service.writeReport("t", "rad-1", { report: "ok" })).resolves.toBeDefined();
  });
});