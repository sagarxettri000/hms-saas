import { QualityChecklistsController } from "./quality-checklists.controller";
import { QualityChecklistsService } from "./quality-checklists.service";

function makeController(service: any) {
  return new QualityChecklistsController(service);
}

function makeReq(overrides: any = {}) {
  return {
    user: { id: "u1", tenantId: "t1", ...(overrides.user || {}) },
  };
}

describe("QualityChecklistsController", () => {
  describe("findAll", () => {
    it("passes query and tenant to the service", async () => {
      const service = { findAll: jest.fn().mockResolvedValue([]) };
      const controller = makeController(service);
      const query = { category: "Sanitation" };
      await controller.findAll(query, makeReq());
      expect(service.findAll).toHaveBeenCalledWith("t1", query);
    });
  });

  describe("setItem", () => {
    it("passes body, tenant and user to the service", async () => {
      const service = { setItem: jest.fn().mockResolvedValue({ id: "q1" }) };
      const controller = makeController(service);
      const body = { category: "A", item: "x", checked: true };
      const result = await controller.setItem(body, makeReq());
      expect(service.setItem).toHaveBeenCalledWith("t1", body, "u1");
      expect(result).toEqual({ id: "q1" });
    });
  });
});
