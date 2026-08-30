import { StockTransfersController } from "./stock-transfers.controller";
import { StockTransfersService } from "./stock-transfers.service";

function makeController(service: any) {
  return new StockTransfersController(service);
}

function makeReq(overrides: any = {}) {
  return {
    user: { id: "u1", tenantId: "t1", ...(overrides.user || {}) },
  };
}

describe("StockTransfersController", () => {
  describe("create", () => {
    it("passes tenant, dto and user to the service", async () => {
      const service = { create: jest.fn().mockResolvedValue({ id: "st1" }) };
      const controller = makeController(service);
      const dto = { fromStore: "A", toStore: "B", itemName: "P", quantity: 5 };
      const result = await controller.create(dto, makeReq());
      expect(service.create).toHaveBeenCalledWith("t1", dto, "u1");
      expect(result).toEqual({ id: "st1" });
    });
  });

  describe("findAll", () => {
    it("passes query and tenant to the service", async () => {
      const service = { findAll: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      const query = { limit: "10" };
      await controller.findAll(query, makeReq());
      expect(service.findAll).toHaveBeenCalledWith("t1", query);
    });
  });
});
