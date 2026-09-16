import { AttendanceController } from "./attendance.controller";

function makeController(service: any) {
  return new AttendanceController(service);
}

function makeReq(overrides: any = {}) {
  return {
    user: { id: "u1", tenantId: "t1", username: "jdoe", ...(overrides.user || {}) },
  };
}

describe("AttendanceController", () => {
  describe("meToday", () => {
    it("passes tenant and authenticated user id to the service", async () => {
      const service = { meToday: jest.fn().mockResolvedValue({ data: { status: "NOT_CLOCKED_IN" } }) };
      const controller = makeController(service);
      await controller.meToday(makeReq());
      expect(service.meToday).toHaveBeenCalledWith("t1", "u1");
    });
  });

  describe("myHistory", () => {
    it("passes tenant, authenticated user id and filters to the service", async () => {
      const service = { history: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      await controller.myHistory("2026-09-01", "2026-09-15", "2", "10", makeReq());
      expect(service.history).toHaveBeenCalledWith("t1", "u1", "2026-09-01", "2026-09-15", 2, 10);
    });
  });

  describe("clockIn", () => {
    it("passes tenant, dto, user and resolved name to the service", async () => {
      const service = { clockIn: jest.fn().mockResolvedValue({ data: { id: "a1" } }) };
      const controller = makeController(service);
      const dto = { status: "PRESENT" as const };
      const result = await controller.clockIn(dto, makeReq());
      expect(service.clockIn).toHaveBeenCalledWith("t1", dto, "u1", "jdoe");
      expect(result).toEqual({ data: { id: "a1" } });
    });
  });

  describe("clockOut", () => {
    it("passes tenant and user to the service", async () => {
      const service = { clockOut: jest.fn().mockResolvedValue({ data: { id: "a1" } }) };
      const controller = makeController(service);
      await controller.clockOut(makeReq());
      expect(service.clockOut).toHaveBeenCalledWith("t1", "u1");
    });
  });

  describe("adminList", () => {
    it("passes tenant and query to the service", async () => {
      const service = { adminList: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      await controller.adminList({ status: "ABSENT" }, makeReq());
      expect(service.adminList).toHaveBeenCalledWith("t1", { status: "ABSENT" });
    });
  });

  describe("adminTodayRoster", () => {
    it("passes tenant and query to the service", async () => {
      const service = { adminTodayRoster: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      await controller.adminTodayRoster({ role: "NURSE" }, makeReq());
      expect(service.adminTodayRoster).toHaveBeenCalledWith("t1", { role: "NURSE" });
    });
  });

  describe("adminUserHistory", () => {
    it("passes tenant, path userId and query to the service", async () => {
      const service = { adminUserHistory: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      await controller.adminUserHistory("u-target", { limit: "10" }, makeReq());
      expect(service.adminUserHistory).toHaveBeenCalledWith("t1", "u-target", { limit: "10" });
    });
  });

  describe("legacy endpoints", () => {
    it("listAttendance passes query and tenant to the service", async () => {
      const service = { listAttendance: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      await controller.listAttendance({ limit: "10" }, makeReq());
      expect(service.listAttendance).toHaveBeenCalledWith("t1", { limit: "10" });
    });

    it("enroll passes tenant, dto, user and resolved name to the service", async () => {
      const service = { enroll: jest.fn().mockResolvedValue({ id: "tr1" }) };
      const controller = makeController(service);
      const dto = { program: "CPR" };
      const result = await controller.enroll(dto, makeReq());
      expect(service.enroll).toHaveBeenCalledWith("t1", dto, "u1", "jdoe");
      expect(result).toEqual({ id: "tr1" });
    });

    it("listTraining passes query and tenant to the service", async () => {
      const service = { listTraining: jest.fn().mockResolvedValue({ data: [] }) };
      const controller = makeController(service);
      await controller.listTraining({}, makeReq());
      expect(service.listTraining).toHaveBeenCalledWith("t1", {});
    });

    it("toggleTraining passes id and tenant to the service", async () => {
      const service = { toggleTraining: jest.fn().mockResolvedValue({ id: "tr1" }) };
      const controller = makeController(service);
      await controller.toggleTraining("tr1", makeReq());
      expect(service.toggleTraining).toHaveBeenCalledWith("t1", "tr1");
    });

    it("setCertificateDate passes id, tenant and certificate date to the service", async () => {
      const service = { setCertificateDate: jest.fn().mockResolvedValue({ id: "tr1" }) };
      const controller = makeController(service);
      await controller.setCertificateDate("tr1", { certificateDate: "2026-01-01" }, makeReq());
      expect(service.setCertificateDate).toHaveBeenCalledWith("t1", "tr1", "2026-01-01");
    });
  });
});
