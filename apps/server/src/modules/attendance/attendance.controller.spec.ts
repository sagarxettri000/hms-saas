import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

function makeController(service: any) {
  return new AttendanceController(service);
}

function makeReq(overrides: any = {}) {
  return {
    user: { id: "u1", tenantId: "t1", username: "jdoe", ...(overrides.user || {}) },
  };
}

describe("AttendanceController", () => {
  describe("clockIn", () => {
    it("passes tenant, dto, user and resolved name to the service", async () => {
      const service = { clockIn: jest.fn().mockResolvedValue({ id: "a1" }) };
      const controller = makeController(service);
      const dto = { staffName: "Jane" };
      const result = await controller.clockIn(dto, makeReq());
      expect(service.clockIn).toHaveBeenCalledWith("t1", dto, "u1", "jdoe");
      expect(result).toEqual({ id: "a1" });
    });
  });

  describe("clockOut", () => {
    it("passes tenant and user to the service", async () => {
      const service = { clockOut: jest.fn().mockResolvedValue({ id: "a1" }) };
      const controller = makeController(service);
      await controller.clockOut(makeReq());
      expect(service.clockOut).toHaveBeenCalledWith("t1", "u1");
    });
  });

  describe("listAttendance", () => {
    it("passes query and tenant to the service", async () => {
      const service = { listAttendance: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      await controller.listAttendance({ limit: "10" }, makeReq());
      expect(service.listAttendance).toHaveBeenCalledWith("t1", { limit: "10" });
    });
  });

  describe("enroll", () => {
    it("passes tenant, dto, user and resolved name to the service", async () => {
      const service = { enroll: jest.fn().mockResolvedValue({ id: "tr1" }) };
      const controller = makeController(service);
      const dto = { program: "CPR" };
      const result = await controller.enroll(dto, makeReq());
      expect(service.enroll).toHaveBeenCalledWith("t1", dto, "u1", "jdoe");
      expect(result).toEqual({ id: "tr1" });
    });
  });

  describe("listTraining", () => {
    it("passes query and tenant to the service", async () => {
      const service = { listTraining: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      await controller.listTraining({}, makeReq());
      expect(service.listTraining).toHaveBeenCalledWith("t1", {});
    });
  });

  describe("toggleTraining", () => {
    it("passes id and tenant to the service", async () => {
      const service = { toggleTraining: jest.fn().mockResolvedValue({ id: "tr1" }) };
      const controller = makeController(service);
      await controller.toggleTraining("tr1", makeReq());
      expect(service.toggleTraining).toHaveBeenCalledWith("t1", "tr1");
    });
  });

  describe("setCertificateDate", () => {
    it("passes id, tenant and certificate date to the service", async () => {
      const service = { setCertificateDate: jest.fn().mockResolvedValue({ id: "tr1" }) };
      const controller = makeController(service);
      await controller.setCertificateDate("tr1", { certificateDate: "2026-01-01" }, makeReq());
      expect(service.setCertificateDate).toHaveBeenCalledWith("t1", "tr1", "2026-01-01");
    });
  });
});
