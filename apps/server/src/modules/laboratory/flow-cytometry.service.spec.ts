import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FlowCytometryService } from "./flow-cytometry.service";

function makePrisma(overrides: any = {}) {
  const prisma: any = {
    patient: { findFirst: jest.fn() },
    encounter: { findFirst: jest.fn() },
    doctorProfile: { findFirst: jest.fn() },
    labTest: { findFirst: jest.fn() },
    labTestPanel: { findFirst: jest.fn() },
    labSample: { findFirst: jest.fn() },
    labOrder: { findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    flowCytometryStudy: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    flowRun: { create: jest.fn() },
    flowPopulation: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    flowPanelMarker: { findFirst: jest.fn() },
    flowMarkerResult: { upsert: jest.fn(), count: jest.fn() },
    flowInstrument: { findFirst: jest.fn() },
    flowMarker: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(prisma)),
    ...overrides,
  };
  return prisma;
}

function makeService(prisma: any, laboratory: any = { transitionStatus: jest.fn() }) {
  return new FlowCytometryService(
    prisma,
    { create: jest.fn() } as any,
    laboratory as any,
  );
}

const TENANT = "tn_1";

function baseOrder(overrides: any = {}) {
  return {
    id: "ord_1",
    tenantId: TENANT,
    status: "PROCESSING",
    patientId: "pat_1",
    orderNumber: "LAB-20260915-0001",
    items: [{ id: "item_1", labTestId: "test_1", status: "ORDERED", labTest: { discipline: "FLOW_CYTOMETRY" } }],
    ...overrides,
  };
}

describe("FlowCytometryService.createOrder", () => {
  it("rejects an unknown panel code", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    await expect(
      service.createOrder(TENANT, { patientId: "pat_1", panelCode: "FCM-XXX" }, "u1"),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a missing patient", async () => {
    const prisma = makePrisma();
    prisma.patient.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(
      service.createOrder(TENANT, { patientId: "pat_1", panelCode: "FCM-LYS" }, "u1"),
    ).rejects.toThrow(NotFoundException);
  });

  it("creates an order with a single panel item", async () => {
    const prisma = makePrisma();
    prisma.patient.findFirst.mockResolvedValue({ id: "pat_1" });
    prisma.labTest.findFirst.mockResolvedValue({ id: "test_1" });
    prisma.labOrder.findFirst.mockResolvedValue(null); // no prior order numbers
    prisma.labOrder.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: "ord_1", ...data, items: data.items ? [{ id: "item_1" }] : [] }),
    );
    const service = makeService(prisma);
    const order = await service.createOrder(TENANT, { patientId: "pat_1", panelCode: "FCM-PNH" }, "u1");
    expect(order.id).toBe("ord_1");
    expect(prisma.labOrder.create).toHaveBeenCalled();
    const createCall = prisma.labOrder.create.mock.calls[0][0];
    expect(createCall.data.items.create.testName).toBe("PNH Screening Panel");
    expect(createCall.data.items.create.price).toBe(6500);
  });
});

describe("FlowCytometryService.startStudy", () => {
  it("throws when an order has no reachable panel test", async () => {
    const prisma = makePrisma();
    prisma.labOrder.findFirst.mockResolvedValue(baseOrder({ items: [{ id: "item_1", labTestId: "test_1", status: "ORDERED", labTest: null }] }));
    prisma.flowCytometryStudy.findFirst.mockResolvedValue(null);
    prisma.labTestPanel.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(service.startStudy(TENANT, "ord_1", {}, "u1")).rejects.toThrow(BadRequestException);
  });

  it("creates a study with an initial run and marks the order PROCESSING", async () => {
    const prisma = makePrisma();
    prisma.labOrder.findFirst.mockResolvedValue(baseOrder());
    const created = {
      id: "study_1",
      resultSummary: null,
      gatingStrategy: null,
      panel: { code: "FCM-LYS" },
      runs: [],
      populations: [],
    };
    prisma.flowCytometryStudy.findFirst.mockImplementation(({ where, select }: any) => {
      if (where && where.labOrderItemId && select && select.id) return Promise.resolve(null);
      return Promise.resolve(created);
    });
    prisma.labTestPanel.findFirst.mockResolvedValue({ id: "panel_1" });
    prisma.flowCytometryStudy.create.mockResolvedValue(created);
    prisma.labOrder.update.mockResolvedValue({ status: "PROCESSING" });
    const service = makeService(prisma);
    const study = await service.startStudy(TENANT, "ord_1", {}, "u1");
    expect(study.id).toBe("study_1");
    expect(prisma.labOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ord_1" }, data: expect.objectContaining({ status: "PROCESSING" }) }),
    );
  });
});

describe("FlowCytometryService.setMarkerResult", () => {
  it("rejects a marker that is not part of the study panel", async () => {
    const prisma = makePrisma();
    prisma.flowPopulation.findFirst.mockResolvedValue({
      id: "pop_1",
      studyId: "study_1",
      study: { panelId: "panel_1", labOrder: { status: "PROCESSING" } },
    });
    prisma.flowPanelMarker.findFirst.mockResolvedValue(null);
    const service = makeService(prisma);
    await expect(
      service.setMarkerResult(TENANT, "pop_1", { markerId: "m_CD13" }, "u1"),
    ).rejects.toThrow(BadRequestException);
  });

  it("upserts a marker result with RESULT_ENTERED status", async () => {
    const prisma = makePrisma();
    prisma.flowPopulation.findFirst.mockResolvedValue({
      id: "pop_1",
      studyId: "study_1",
      study: { panelId: "panel_1", labOrder: { status: "PROCESSING" } },
    });
    prisma.flowPanelMarker.findFirst.mockResolvedValue({ id: "link_1" });
    prisma.flowMarkerResult.upsert.mockResolvedValue({ id: "mr_1", status: "RESULT_ENTERED" });
    const service = makeService(prisma);
    const result = await service.setMarkerResult(TENANT, "pop_1", { markerId: "m_CD19", percentage: 12.4 }, "u1");
    expect(result.id).toBe("mr_1");
    const call = prisma.flowMarkerResult.upsert.mock.calls[0][0];
    expect(call.where.populationId_markerId).toEqual({ populationId: "pop_1", markerId: "m_CD19" });
    expect(call.create.status).toBe("RESULT_ENTERED");
  });
});

describe("FlowCytometryService.submitResults", () => {
  it("rejects submission when no population has entered results", async () => {
    const prisma = makePrisma();
    prisma.flowCytometryStudy.findFirst.mockResolvedValue({
      id: "study_1",
      labOrderItemId: "item_1",
      labOrder: { id: "ord_1", status: "PROCESSING" },
      populations: [{ id: "pop_1", status: "PENDING" }],
    });
    const service = makeService(prisma);
    await expect(service.submitResults(TENANT, "study_1", {}, "u1")).rejects.toThrow(BadRequestException);
  });

  it("finalizes populations, sets item/order to result-ready", async () => {
    const prisma = makePrisma();
    prisma.flowCytometryStudy.findFirst.mockResolvedValue({
      id: "study_1",
      labOrderItemId: "item_1",
      labOrder: { id: "ord_1", status: "PROCESSING" },
      populations: [{ id: "pop_1", status: "RESULT_ENTERED" }],
    });
    prisma.flowPopulation.update.mockResolvedValue({ id: "pop_1", status: "FINALIZED" });
    prisma.flowCytometryStudy.update.mockResolvedValue({ id: "study_1", status: "RESULT_ENTERED" });
    prisma.labOrderItem = { update: jest.fn().mockResolvedValue({}) };
    prisma.labOrder.update.mockResolvedValue({ status: "RESULT_READY" });
    prisma.flowMarkerResult.count.mockResolvedValue(0);
    const service = makeService(prisma);
    const study = await service.submitResults(TENANT, "study_1", { resultSummary: "No MRD" }, "u1");
    expect(study.status).toBe("RESULT_ENTERED");
    expect(prisma.flowPopulation.update).toHaveBeenCalled();
    expect(prisma.labOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ord_1" }, data: expect.objectContaining({ status: "RESULT_READY" }) }),
    );
  });
});

describe("FlowCytometryService.verify", () => {
  it("requires a submitted flow result before verifying", async () => {
    const prisma = makePrisma();
    prisma.labOrder.findFirst.mockResolvedValue(baseOrder({ items: [{ id: "item_1", status: "ORDERED", labTest: { discipline: "FLOW_CYTOMETRY" } }] }));
    const service = makeService(prisma);
    await expect(service.verify(TENANT, "ord_1", "u1")).rejects.toThrow(BadRequestException);
  });

  it("delegates verified transition to the laboratory service", async () => {
    const prisma = makePrisma();
    prisma.labOrder.findFirst.mockResolvedValue(baseOrder({ items: [{ id: "item_1", status: "RESULT_ENTERED", labTest: { discipline: "FLOW_CYTOMETRY" } }] }));
    prisma.flowMarkerResult.count.mockResolvedValue(0);
    const laboratory = { transitionStatus: jest.fn().mockResolvedValue({ status: "VERIFIED" }) };
    const service = makeService(prisma, laboratory);
    const result = await service.verify(TENANT, "ord_1", "u1");
    expect(laboratory.transitionStatus).toHaveBeenCalledWith(TENANT, "ord_1", "VERIFIED", "u1");
    expect(result.status).toBe("VERIFIED");
  });
});