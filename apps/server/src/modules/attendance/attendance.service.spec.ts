import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AttendanceService } from "./attendance.service";

function makeService(prisma: any, audit?: any): AttendanceService {
  return new AttendanceService(prisma, audit ?? { log: jest.fn().mockResolvedValue(undefined) });
}

function txOf(prisma: any) {
  return prisma; // tests treat tx and prisma as the same mock surface
}

function staffPrisma(overrides: any = {}) {
  return {
    attendanceRecord: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      ...(overrides.attendanceRecord || {}),
    },
    roster: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...(overrides.roster || {}),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      ...(overrides.user || {}),
    },
    $transaction: jest.fn((fn: any) => fn(txOf(overrides))),
    ...(overrides.root || {}),
  };
}

describe("AttendanceService — clockIn", () => {
  it("records PRESENT with a server-generated clockIn timestamp (client cannot supply one)", async () => {
    const before = new Date(Date.now() - 1000);
    const after = new Date(Date.now() + 1000);
    let captured: any;
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => {
          captured = data;
          return { id: "a1", ...data };
        }),
      },
    });
    const service = makeService(prisma);
    // A malicious client sends a forged timestamp — it is ignored entirely.
    const result = await service.clockIn("t1", { status: "PRESENT", timestamp: "2000-01-01T00:00:00Z" } as any, "u1", "Dr. X");

    expect(result.data.clockIn).toBeInstanceOf(Date);
    expect(result.data.clockIn.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.data.clockIn.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(captured.timestamp).toBeUndefined();
    expect(captured.createdBy).toBe("u1");
    expect(captured.status).toBe("PRESENT");
  });

  it("is idempotent: a duplicate clock-in returns the existing record without creating a new one", async () => {
    const existing = { id: "a0", userId: "u1", clockOut: null, clockIn: new Date() };
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    });
    const service = makeService(prisma);
    const result = await service.clockIn("t1", {}, "u1");

    expect(result.data.id).toBe("a0");
    expect(prisma.attendanceRecord.create).not.toHaveBeenCalled();
  });

  it("survives a concurrent duplicate via the unique constraint (P2002) by returning the winner", async () => {
    const winner = { id: "a1", clockOut: null, clockIn: new Date() };
    const prisma = staffPrisma({
      attendanceRecord: {
        // First call (inside tx): no record. Second call (P2002 recovery): winner.
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner),
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "5.22.0",
          }),
        ),
      },
    });
    prisma.$transaction = jest.fn(async (fn: any) => {
      try {
        return await fn(prisma);
      } catch (err) {
        throw err;
      }
    });
    const service = makeService(prisma);
    const result = await service.clockIn("t1", {}, "u1");
    expect(result.data.id).toBe("a1");
    expect(prisma.attendanceRecord.create).toHaveBeenCalledTimes(1);
  });

  it("links the record to today's rostered shift when one exists", async () => {
    let captured: any;
    const prisma = staffPrisma({
      roster: { findFirst: jest.fn().mockResolvedValue({ id: "r1", shift: { id: "s1", name: "Morning" } }) },
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => {
          captured = data;
          return { id: "a1", ...data };
        }),
      },
    });
    const service = makeService(prisma);
    const result = await service.clockIn("t1", {}, "u1", "Dr. X");

    expect(captured.rosterId).toBe("r1");
    expect(result.shift).toEqual({ id: "s1", name: "Morning" });
  });

  it("records ABSENT status when requested", async () => {
    let captured: any;
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => {
          captured = data;
          return { id: "a1", ...data };
        }),
      },
    });
    const service = makeService(prisma);
    await service.clockIn("t1", { status: "ABSENT" }, "u1");
    expect(captured.status).toBe("ABSENT");
  });

  it("writes an audit log entry with the server timestamp", async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: "a1", ...data })),
      },
    });
    const service = makeService(prisma, audit);
    await service.clockIn("t1", { status: "PRESENT" }, "u1", "Dr. X");

    expect(audit.log).toHaveBeenCalledWith(
      "t1",
      "u1",
      "AttendanceRecord",
      "a1",
      "CREATE",
      expect.objectContaining({ action: "CLOCK_IN", status: "PRESENT" }),
    );
  });
});

describe("AttendanceService — clockOut", () => {
  it("throws when there is no open session", async () => {
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    });
    const service = makeService(prisma);
    await expect(service.clockOut("t1", "u1")).rejects.toThrow(BadRequestException);
    expect(prisma.attendanceRecord.update).not.toHaveBeenCalled();
  });

  it("computes duration from stored timestamps, not client input", async () => {
    const clockIn = new Date(Date.now() - 2 * 3600000); // 2h ago
    let updateData: any;
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue({ id: "a1", clockIn, clockOut: null, status: "PRESENT" }),
        update: jest.fn().mockImplementation(({ data }) => {
          updateData = data;
          return { id: "a1", clockIn, ...data };
        }),
      },
    });
    const service = makeService(prisma);
    const result = await service.clockOut("t1", "u1");

    expect(result.data.clockOut).toBeInstanceOf(Date);
    expect(updateData.hours).toBeGreaterThanOrEqual(1.98);
    expect(updateData.hours).toBeLessThan(2.02);
    expect(updateData.clockOut).toBeInstanceOf(Date);
  });

  it("refuses to clock out a session marked ABSENT", async () => {
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue({ id: "a1", clockIn: new Date(), clockOut: null, status: "ABSENT" }),
        update: jest.fn(),
      },
    });
    const service = makeService(prisma);
    await expect(service.clockOut("t1", "u1")).rejects.toThrow(/ABSENT/);
    expect(prisma.attendanceRecord.update).not.toHaveBeenCalled();
  });

  it("audits the clock-out", async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue({ id: "a1", clockIn: new Date(Date.now() - 1000), clockOut: null, status: "PRESENT" }),
        update: jest.fn().mockImplementation(({ data }) => ({ id: "a1", ...data })),
      },
    });
    const service = makeService(prisma, audit);
    await service.clockOut("t1", "u1");

    expect(audit.log).toHaveBeenCalledWith(
      "t1",
      "u1",
      "AttendanceRecord",
      "a1",
      "UPDATE",
      expect.objectContaining({ action: "CLOCK_OUT" }),
    );
  });
});

describe("AttendanceService — meToday", () => {
  it("returns NOT_CLOCKED_IN when no record exists today", async () => {
    const prisma = staffPrisma({
      attendanceRecord: { findFirst: jest.fn().mockResolvedValue(null) },
      roster: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);
    const result = await service.meToday("t1", "u1");

    expect(result.data.status).toBe("NOT_CLOCKED_IN");
    expect(result.data.serverTime).toBeDefined();
  });

  it("returns CLOCKED_OUT for a closed PRESENT record", async () => {
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue({ id: "a1", status: "PRESENT", clockOut: new Date(), clockIn: new Date() }),
      },
      roster: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);
    const result = await service.meToday("t1", "u1");
    expect(result.data.status).toBe("CLOCKED_OUT");
  });

  it("returns PRESENT for an open record", async () => {
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockResolvedValue({ id: "a1", status: "PRESENT", clockOut: null, clockIn: new Date() }),
      },
      roster: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);
    const result = await service.meToday("t1", "u1");
    expect(result.data.status).toBe("PRESENT");
  });

  it("scopes strictly to the authenticated user (IDOR: another user's record is invisible)", async () => {
    let capturedWhere: any;
    const prisma = staffPrisma({
      attendanceRecord: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          capturedWhere = where;
          return null;
        }),
      },
      roster: { findFirst: jest.fn() },
    });
    const service = makeService(prisma);
    await service.meToday("t1", "u1");

    expect(capturedWhere.userId).toBe("u1");
    expect(capturedWhere.tenantId).toBe("t1");
  });
});

describe("AttendanceService — adminUserHistory", () => {
  it("refuses a target user outside the admin's tenant (cross-tenant IDOR)", async () => {
    const prisma = staffPrisma({
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const service = makeService(prisma);
    await expect(service.adminUserHistory("t1", "u-evil", {})).rejects.toThrow(ForbiddenException);
  });

  it("returns history for a valid same-tenant staff member", async () => {
    const prisma = staffPrisma({
      user: { findFirst: jest.fn().mockResolvedValue({ id: "u2" }) },
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue([{ id: "a1" }]),
        count: jest.fn().mockResolvedValue(1),
      },
    });
    const service = makeService(prisma);
    const result = await service.adminUserHistory("t1", "u2", {});
    expect(result.data).toHaveLength(1);
  });
});

describe("AttendanceService — adminTodayRoster", () => {
  it("includes staff without a record as NOT_CLOCKED_IN and computes summary", async () => {
    const prisma = staffPrisma({
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "u1", firstName: "A", lastName: "One", email: "a@x.io", role: "NURSE",
            department: null, staffProfile: null,
            attendanceRecords: [],
          },
          {
            id: "u2", firstName: "B", lastName: "Two", email: "b@x.io", role: "DOCTOR",
            department: { id: "d1", name: "ICU" }, staffProfile: { employeeCode: "E2", designation: "Consultant" },
            attendanceRecords: [{ id: "a1", status: "PRESENT", clockIn: new Date(), clockOut: null, roster: { shift: { name: "Morning" } } }],
          },
          {
            id: "u3", firstName: "C", lastName: "Three", email: "c@x.io", role: "NURSE",
            department: null, staffProfile: null,
            attendanceRecords: [{ id: "a2", status: "ABSENT", clockIn: new Date(), clockOut: null, roster: null }],
          },
        ]),
      },
    });
    const service = makeService(prisma);
    const result = await service.adminTodayRoster("t1", {});

    expect(result.summary).toEqual({ present: 1, absent: 1, notClockedIn: 1 });
    expect(result.data[0].status).toBe("NOT_CLOCKED_IN");
    expect(result.data[1].status).toBe("PRESENT");
    expect(result.data[1].shift).toBe("Morning");
    expect(result.data[2].status).toBe("ABSENT");
  });
});

describe("AttendanceService — history", () => {
  it("applies date-range filters and pagination", async () => {
    const prisma = staffPrisma({
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue([{ id: "a1" }]),
        count: jest.fn().mockResolvedValue(1),
      },
    });
    const service = makeService(prisma);
    const result = await service.history("t1", "u1", "2026-09-01", "2026-09-15", 2, 10);

    const where = prisma.attendanceRecord.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe("u1");
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.date.lte).toBeInstanceOf(Date);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });
});

describe("AttendanceService — training (legacy)", () => {
  it("rejects a missing program", async () => {
    const prisma = staffPrisma();
    const service = makeService(prisma);
    await expect(service.enroll("t1", { program: "" }, "u1")).rejects.toThrow(BadRequestException);
  });

  it("enrolls a staff member", async () => {
    const prisma = staffPrisma({
      root: {
        staffTraining: {
          create: jest.fn().mockImplementation(({ data }) => ({ ...data, id: "tr1" })),
        },
      },
    });
    const service = makeService(prisma);
    const result = await service.enroll("t1", { program: "CPR" }, "u1", "Dr. X");
    expect(result.program).toBe("CPR");
    expect(result.staffName).toBe("Dr. X");
  });

  it("toggleTraining throws when the record is missing", async () => {
    const prisma = staffPrisma({
      root: {
        staffTraining: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
      },
    });
    const service = makeService(prisma);
    await expect(service.toggleTraining("t1", "tr-x")).rejects.toThrow(BadRequestException);
  });

  it("toggleTraining sets completedAt when previously incomplete", async () => {
    const prisma = staffPrisma({
      root: {
        staffTraining: {
          findFirst: jest.fn().mockResolvedValue({ id: "tr1", completedAt: null }),
          update: jest.fn().mockImplementation(({ data }) => ({ id: "tr1", ...data })),
        },
      },
    });
    const service = makeService(prisma);
    const result = await service.toggleTraining("t1", "tr1");
    expect(result.completedAt).toBeInstanceOf(Date);
  });
});
