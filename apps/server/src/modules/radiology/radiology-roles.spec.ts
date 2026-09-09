import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { RadiologyService } from "./radiology.service";

function makeOrder(overrides: Record<string, any> = {}) {
  return {
    id: "rad-1",
    tenantId: "t",
    patientId: "pat-1",
    orderNumber: "RAD-20260909-0001",
    status: "IMAGES_UPLOADED",
    orderedAt: new Date("2026-09-09T08:00:00Z"),
    reportedAt: null,
    verifiedAt: null,
    reportVersion: 1,
    isCritical: false,
    doctorId: "doc-1",
    assignedRadiologistId: null,
    findings: null,
    impression: null,
    report: null,
    ...overrides,
  };
}

const makeNotify = () => ({ create: jest.fn().mockResolvedValue({ id: "n-1" }) });

function makePrisma(initialOverride: Record<string, any> = {}) {
  let order = makeOrder(initialOverride);

  const update = jest.fn().mockImplementation(({ data }) => {
    order = { ...order, ...data };
    return order;
  });

  const revision = {
    id: "rev-1",
    tenantId: "t",
    radiologyOrderId: "rad-1",
    version: 2,
    findings: "Updated",
    impression: "OK",
    report: null,
    reason: "Addendum",
    authoredBy: "doc-1",
    createdAt: new Date(),
  };

  const review = {
    id: "pv-1",
    tenantId: "t",
    radiologyOrderId: "rad-1",
    requestedBy: "doc-1",
    reviewerId: "doc-2",
    status: "REQUESTED",
    notes: null,
    decidedAt: null,
    requestedAt: new Date(),
  };

  return {
    radiologyOrder: {
      findFirst: jest.fn().mockImplementation(() => order),
      findMany: jest.fn().mockResolvedValue([
        {
          id: "o1",
          orderNumber: "RAD-1",
          assignedRadiologistId: "doc-1",
          orderedAt: new Date("2026-09-09T08:00:00Z"),
          reportedAt: new Date("2026-09-09T10:00:00Z"),
          verifiedAt: new Date("2026-09-09T12:00:00Z"),
        },
        {
          id: "o2",
          orderNumber: "RAD-2",
          assignedRadiologistId: "doc-2",
          orderedAt: new Date("2026-09-09T08:00:00Z"),
          reportedAt: new Date("2026-09-09T09:00:00Z"),
          verifiedAt: null,
        },
        {
          id: "o3",
          orderNumber: "RAD-3",
          assignedRadiologistId: null,
          orderedAt: new Date("2026-09-09T08:00:00Z"),
          reportedAt: new Date("2026-09-09T11:30:00Z"),
          verifiedAt: null,
        },
      ]),
      update,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    radiologyReportRevision: {
      create: jest.fn().mockResolvedValue(revision),
      findMany: jest.fn().mockResolvedValue([revision]),
    },
    radiologyPeerReview: {
      create: jest.fn().mockResolvedValue(review),
      findFirst: jest.fn().mockResolvedValue(review),
      findMany: jest.fn().mockResolvedValue([review]),
      update: jest.fn().mockResolvedValue({ ...review, status: "APPROVED", decidedAt: new Date() }),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: "doc-1" },
        { id: "doc-2" },
      ]),
      findFirst: jest.fn().mockImplementation(({ where }) => {
        if (where.id === "bad-user") return null;
        return { id: where.id ?? "doc-1", role: "RADIOLOGIST", status: "ACTIVE" };
      }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    doctorProfile: {
      findFirst: jest.fn().mockResolvedValue({ id: "doc-1", userId: "referring-user" }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: "log-1" }) },
  };
}

describe("RadiologyService role separation", () => {
  let service: RadiologyService;
  let prisma: ReturnType<typeof makePrisma>;
  const notifications = makeNotify();

  beforeEach(() => {
    notifications.create.mockClear();
    prisma = makePrisma();
    service = new RadiologyService(prisma as any, undefined as any, notifications as any);
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
    prisma = makePrisma({ status: "ORDERED" });
    service = new RadiologyService(prisma as any);
    await service.transitionStatus("t", "rad-1", "SCHEDULED", "tech-1", "RADIOLOGY_TECHNICIAN");
    expect(prisma.radiologyOrder.update).toHaveBeenCalled();
  });

  it("allows a radiologist to verify", async () => {
    prisma = makePrisma({ status: "REPORTED", reportedAt: new Date() });
    service = new RadiologyService(prisma as any);
    await expect(
      service.transitionStatus("t", "rad-1", "VERIFIED", "doc-1", "RADIOLOGIST"),
    ).resolves.toBeDefined();
  });

  it("keeps legacy callers without actor context working", async () => {
    await expect(service.writeReport("t", "rad-1", { report: "ok" })).resolves.toBeDefined();
  });

  it("auto-assigns a radiologist when an order is scheduled and has no assignee", async () => {
    prisma = makePrisma({ status: "ORDERED", assignedRadiologistId: null });
    service = new RadiologyService(prisma as any);
    prisma.user.findMany.mockResolvedValue([{ id: "doc-1" }, { id: "doc-2" }]);
    prisma.radiologyOrder.findMany = jest.fn().mockResolvedValue([]);
    prisma.radiologyOrder.findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: "rad-1", status: "ORDERED", assignedRadiologistId: null })
      .mockResolvedValueOnce(null);
    await service.transitionStatus("t", "rad-1", "SCHEDULED", "tech-1", "RADIOLOGY_TECHNICIAN");
    // wait for the fire-and-forget autofill
    await new Promise((r) => setTimeout(r, 20));
    expect(prisma.radiologyOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assignedRadiologistId: "doc-1" }) }),
    );
  });
});

describe("RadiologyService keyword critical scanning", () => {
  it("suggests critical when the findings mention a critical keyword", async () => {
    const prisma = makePrisma();
    const service = new RadiologyService(prisma as any);
    await service.writeReport("t", "rad-1", { findings: "Large right pneumothorax seen", impression: "Needs urgent review" }, "doc-1", "RADIOLOGIST");
    expect(prisma.radiologyOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ criticalSuggested: true }) }),
    );
  });

  it("does not suggest critical for a benign report", async () => {
    const prisma = makePrisma();
    const service = new RadiologyService(prisma as any);
    await service.writeReport("t", "rad-1", { findings: "No acute abnormality" }, "doc-1", "RADIOLOGIST");
    expect(prisma.radiologyOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ criticalSuggested: false }) }),
    );
  });
});

describe("RadiologyService addendum / revisions", () => {
  it("blocks a technician from adding a revision", async () => {
    const prisma = makePrisma({ reportedAt: new Date() });
    const service = new RadiologyService(prisma as any);
    await expect(
      service.addRevision("t", "rad-1", { findings: "x" }, "tech-1", "RADIOLOGY_TECHNICIAN"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects revisions before a report exists", async () => {
    const prisma = makePrisma({ reportedAt: null });
    const service = new RadiologyService(prisma as any);
    await expect(
      service.addRevision("t", "rad-1", { findings: "x" }, "doc-1", "RADIOLOGIST"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a revision and bumps the report version", async () => {
    const prisma = makePrisma({ reportedAt: new Date(), reportVersion: 2 });
    const service = new RadiologyService(prisma as any);
    await service.addRevision("t", "rad-1", { findings: "New impression", reason: "Patient re-presented" }, "doc-1", "RADIOLOGIST");
    expect(prisma.radiologyReportRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 3, reason: "Patient re-presented" }),
      }),
    );
    expect(prisma.radiologyOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reportVersion: 3 }) }),
    );
  });

  it("lists revisions for an existing order", async () => {
    const prisma = makePrisma();
    const service = new RadiologyService(prisma as any);
    const result = await service.listRevisions("t", "rad-1");
    expect(result.revisions).toHaveLength(1);
    expect(prisma.radiologyReportRevision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ radiologyOrderId: "rad-1" }) }),
    );
  });

  it("throws not found when listing revisions for a missing order", async () => {
    const prisma = makePrisma();
    prisma.radiologyOrder.findFirst = jest.fn().mockResolvedValue(null);
    const service = new RadiologyService(prisma as any);
    await expect(service.listRevisions("t", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("RadiologyService critical flag", () => {
  const notifications = makeNotify();

  beforeEach(() => notifications.create.mockClear());

  it("blocks a technician from flagging", async () => {
    const prisma = makePrisma();
    const service = new RadiologyService(prisma as any);
    await expect(
      service.setCriticalFlag("t", "rad-1", { isCritical: true }, "tech-1", "RADIOLOGY_TECHNICIAN"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("flags the order and notifies the referring doctor", async () => {
    const prisma = makePrisma();
    const service = new RadiologyService(prisma as any, undefined as any, notifications as any);
    await service.setCriticalFlag("t", "rad-1", { isCritical: true, note: "Suspected aortic dissection" }, "doc-1", "RADIOLOGIST");
    expect(prisma.radiologyOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isCritical: true, criticalFlaggedBy: "doc-1" }) }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      "t",
      expect.objectContaining({ userId: "referring-user", referenceType: "RadiologyOrder" }),
    );
  });

  it("clears the flag and does not notify", async () => {
    const prisma = makePrisma({ isCritical: true });
    const service = new RadiologyService(prisma as any, undefined as any, notifications as any);
    await service.setCriticalFlag("t", "rad-1", { isCritical: false }, "doc-1", "RADIOLOGIST");
    expect(notifications.create).not.toHaveBeenCalled();
    expect(prisma.radiologyOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isCritical: false, criticalFlaggedBy: null }) }),
    );
  });
});

describe("RadiologyService assignment", () => {
  it("round-robins to the radiologist after the most recently assigned", async () => {
    const prisma = makePrisma();
    const service = new RadiologyService(prisma as any);
    prisma.radiologyOrder.findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: "rad-1", orderNumber: "R" })
      .mockResolvedValue({ assignedRadiologistId: "doc-1" });
    await service.assignRadiologist("t", "rad-1");
    expect(prisma.radiologyOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assignedRadiologistId: "doc-2" }) }),
    );
  });

  it("assigns a specific radiologist when provided", async () => {
    const prisma = makePrisma();
    const service = new RadiologyService(prisma as any);
    await service.assignRadiologist("t", "rad-1", "doc-2");
    expect(prisma.radiologyOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assignedRadiologistId: "doc-2" }) }),
    );
  });

  it("rejects assignment to an unknown radiologist", async () => {
    const prisma = makePrisma();
    prisma.user.findFirst = jest.fn().mockResolvedValue(null);
    const service = new RadiologyService(prisma as any);
    await expect(service.assignRadiologist("t", "rad-1", "bad-user")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("RadiologyService TAT metrics", () => {
  it("computes overall and per-radiologist averages", async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: "doc-1", firstName: "A", lastName: "One" },
      { id: "doc-2", firstName: "B", lastName: "Two" },
    ]);
    const service = new RadiologyService(prisma as any);
    const result = await service.tatMetrics("t", {});
    expect(result.overall.cases).toBe(3);
    expect(result.overall.avgReportHours).toBe(2.2);
    expect(result.perRadiologist).toHaveLength(3);
    const doc1 = result.perRadiologist.find((p: any) => p.radiologistId === "doc-1")!;
    expect(doc1.name).toBe("A One");
    expect(doc1.avgReportHours).toBe(2);
    expect(result.perRadiologist.find((p: any) => p.name === "Unassigned")!.avgVerifyHours).toBeNull();
  });
});

describe("RadiologyService peer review", () => {
  const notifications = makeNotify();

  beforeEach(() => notifications.create.mockClear());

  it("blocks a technician from requesting a review", async () => {
    const prisma = makePrisma({ reportedAt: new Date() });
    const service = new RadiologyService(prisma as any);
    await expect(
      service.requestPeerReview("t", "rad-1", { reviewerId: "doc-2" }, "tech-1", "RADIOLOGY_TECHNICIAN"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects a self-review", async () => {
    const prisma = makePrisma({ reportedAt: new Date() });
    const service = new RadiologyService(prisma as any);
    await expect(
      service.requestPeerReview("t", "rad-1", { reviewerId: "doc-1" }, "doc-1", "RADIOLOGIST"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a review when no report exists", async () => {
    const prisma = makePrisma({ reportedAt: null });
    const service = new RadiologyService(prisma as any);
    await expect(
      service.requestPeerReview("t", "rad-1", { reviewerId: "doc-2" }, "doc-1", "RADIOLOGIST"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a review request and notifies the reviewer", async () => {
    const prisma = makePrisma({ reportedAt: new Date() });
    prisma.radiologyPeerReview.findFirst = jest.fn().mockResolvedValue(null);
    const service = new RadiologyService(prisma as any, undefined as any, notifications as any);
    await service.requestPeerReview("t", "rad-1", { reviewerId: "doc-2", note: "Please double-check" }, "doc-1", "RADIOLOGIST");
    expect(prisma.radiologyPeerReview.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewerId: "doc-2", requestedBy: "doc-1" }) }),
    );
    expect(notifications.create).toHaveBeenCalled();
  });

  it("blocks a non-reviewer from deciding", async () => {
    const prisma = makePrisma();
    prisma.radiologyPeerReview.findFirst = jest
      .fn()
      .mockResolvedValue({ id: "pv-1", reviewerId: "doc-2", requestedBy: "doc-1", status: "REQUESTED", notes: null, radiologyOrderId: "rad-1" });
    const service = new RadiologyService(prisma as any);
    await expect(
      service.decidePeerReview("t", "pv-1", { status: "APPROVED" }, "doc-1", "RADIOLOGIST"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets the assigned reviewer approve", async () => {
    const prisma = makePrisma();
    prisma.radiologyPeerReview.findFirst = jest
      .fn()
      .mockResolvedValue({ id: "pv-1", reviewerId: "doc-2", requestedBy: "doc-1", status: "REQUESTED", notes: null, radiologyOrderId: "rad-1" });
    const service = new RadiologyService(prisma as any, undefined as any, notifications as any);
    await expect(
      service.decidePeerReview("t", "pv-1", { status: "APPROVED", note: "Looks good" }, "doc-2", "RADIOLOGIST"),
    ).resolves.toBeDefined();
    expect(prisma.radiologyPeerReview.update).toHaveBeenCalled();
  });
});