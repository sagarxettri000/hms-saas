import { ControlledSubstancesController } from "./controlled-substances.controller";
import { ControlledSubstancesService } from "./controlled-substances.service";

function makeController(service: any) {
  return new ControlledSubstancesController(service);
}

function makeReq(overrides: any = {}) {
  return {
    user: { id: "u1", tenantId: "t1", username: "jdoe", ...(overrides.user || {}) },
  };
}

describe("ControlledSubstancesController", () => {
  describe("create", () => {
    it("passes tenant, dto and resolved user name to the service", async () => {
      const service = { create: jest.fn().mockResolvedValue({ id: "l1" }) };
      const controller = makeController(service);
      const dto = { drug: "Morphine", quantity: 2 };
      const result = await controller.create(dto, makeReq());
      expect(service.create).toHaveBeenCalledWith("t1", dto, "u1", "jdoe");
      expect(result).toEqual({ id: "l1" });
    });

    it("prefers first/last name for the actor name", async () => {
      const service = { create: jest.fn().mockResolvedValue({}) };
      const controller = makeController(service);
      await controller.create({ drug: "X", quantity: 1 }, makeReq({ user: { firstName: "Jane", lastName: "Doe" } }));
      expect(service.create).toHaveBeenCalledWith("t1", { drug: "X", quantity: 1 }, "u1", "Jane Doe");
    });
  });

  describe("findAll", () => {
    it("passes query and tenant to the service", async () => {
      const service = { findAll: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      const query = { drug: "morph" };
      await controller.findAll(query, makeReq());
      expect(service.findAll).toHaveBeenCalledWith("t1", query);
    });
  });

  describe("remove", () => {
    it("passes id and tenant to the service", async () => {
      const service = { remove: jest.fn().mockResolvedValue({ success: true }) };
      const controller = makeController(service);
      const result = await controller.remove("l1", makeReq());
      expect(service.remove).toHaveBeenCalledWith("t1", "l1");
      expect(result).toEqual({ success: true });
    });
  });
});
