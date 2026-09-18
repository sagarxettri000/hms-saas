import { NursingHandoversController } from "./nursing-handovers.controller";
import { NursingHandoversService } from "./nursing-handovers.service";

function makeController(service: any) {
  return new NursingHandoversController(service);
}

function makeReq(overrides: any = {}) {
  return {
    user: {
      id: "u1",
      tenantId: "t1",
      username: "nurse",
      ...(overrides.user || {}),
    },
  };
}

describe("NursingHandoversController", () => {
  describe("create", () => {
    it("passes tenant, dto and resolved user name to the service", async () => {
      const service = { create: jest.fn().mockResolvedValue({ id: "h1" }) };
      const controller = makeController(service);
      const dto = {
        wardId: "w1",
        wardName: "Ward A",
        shiftDate: "2026-01-01",
        notes: "quiet",
      };
      const result = await controller.create(dto, makeReq());
      expect(service.create).toHaveBeenCalledWith("t1", dto, "u1", "nurse");
      expect(result).toEqual({ id: "h1" });
    });
  });

  describe("findAll", () => {
    it("passes query and tenant to the service", async () => {
      const service = { findAll: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      const query = { wardId: "w1" };
      await controller.findAll(query, makeReq());
      expect(service.findAll).toHaveBeenCalledWith("t1", query);
    });
  });
});
