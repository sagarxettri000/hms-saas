import { PreauthorizationsController } from "./preauthorizations.controller";
import { PreauthorizationsService } from "./preauthorizations.service";

function makeController(service: any) {
  return new PreauthorizationsController(service);
}

function makeReq(overrides: any = {}) {
  return {
    user: { id: "u1", tenantId: "t1", ...(overrides.user || {}) },
  };
}

describe("PreauthorizationsController", () => {
  describe("create", () => {
    it("delegates to the service with tenant and user", async () => {
      const service = { create: jest.fn().mockResolvedValue({ id: "pa1" }) };
      const controller = makeController(service);
      const dto = { patientName: "P", treatment: "MRI", estimatedCost: 500 };
      const result = await controller.create(dto, makeReq());
      expect(service.create).toHaveBeenCalledWith("t1", dto, "u1");
      expect(result).toEqual({ id: "pa1" });
    });
  });

  describe("findAll", () => {
    it("passes query and tenant to the service", async () => {
      const service = { findAll: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      const query = { status: "PENDING", limit: "10" };
      await controller.findAll(query, makeReq());
      expect(service.findAll).toHaveBeenCalledWith("t1", query);
    });
  });

  describe("findById", () => {
    it("passes id and tenant to the service", async () => {
      const service = { findById: jest.fn().mockResolvedValue({ id: "pa1" }) };
      const controller = makeController(service);
      await controller.findById("pa1", makeReq());
      expect(service.findById).toHaveBeenCalledWith("t1", "pa1");
    });
  });

  describe("update", () => {
    it("passes id, tenant, dto and user to the service", async () => {
      const service = { update: jest.fn().mockResolvedValue({ id: "pa1" }) };
      const controller = makeController(service);
      const dto = { notes: "n" };
      await controller.update("pa1", dto, makeReq());
      expect(service.update).toHaveBeenCalledWith("t1", "pa1", dto, "u1");
    });
  });

  describe("decide", () => {
    it("passes decision fields and tenant to the service", async () => {
      const service = { decide: jest.fn().mockResolvedValue({ id: "pa1" }) };
      const controller = makeController(service);
      await controller.decide(
        "pa1",
        { decision: "APPROVED", approvedAmount: 450 },
        makeReq(),
      );
      expect(service.decide).toHaveBeenCalledWith("t1", "pa1", "APPROVED", 450);
    });
  });
});
