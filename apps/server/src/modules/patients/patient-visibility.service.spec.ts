/**
 * Patient visibility & clinical-context isolation (spec §64.28).
 *
 * Each test maps to an acceptance scenario: ER isolation, IPD transfer,
 * ward-to-ward transfer, temporary visits, search restriction, direct-API
 * denial, pending-transfer inertness, completed-transfer flip, historical
 * access, and no cross-department leakage.
 */
import { ForbiddenException, ConflictException } from "@nestjs/common";
import { PatientVisibilityService } from "./patient-visibility.service";

const NO_MATCH = { id: { in: ["__no_clinical_context__"] } };

function makePrisma(over: any = {}) {
  return {
    staffProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...(over.staffProfile || {}),
    },
    doctorProfile: {
      findFirst: jest.fn().mockResolvedValue(null),
      ...over.doctorProfile,
    },
    patient: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
    patientLocation: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "loc-new" }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...(over.patientLocation || {}),
    },
    encounter: { findFirst: jest.fn().mockResolvedValue(null), ...(over.encounter || {}) },
    admission: { findFirst: jest.fn().mockResolvedValue(null), ...(over.admission || {}) },
    patientTransfer: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      ...(over.patientTransfer || {}),
    },
    bed: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), ...(over.bed || {}) },
    ...(over.root || {}),
  };
}

const ER_STAFF = { id: "u1", userId: "u1", tenantId: "t1", role: "EMERGENCY_STAFF" };
const DOCTOR = { id: "u2", userId: "u2", tenantId: "t1", role: "DOCTOR" };
const ADMIN = { id: "u3", userId: "u3", tenantId: "t1", role: "HOSPITAL_ADMIN" };
const RECEPTION = { id: "u4", userId: "u4", tenantId: "t1", role: "RECEPTIONIST" };

describe("PatientVisibilityService — context tiers (§64.3/§64.17)", () => {
  it("admin gets BROAD (sees everything)", async () => {
    const prisma = makePrisma();
    const svc = new PatientVisibilityService(prisma as any);
    const ctx = await svc.getContext(ADMIN);
    expect(ctx.mode).toBe("BROAD");
    expect(await svc.buildActiveListFilter(ADMIN as any)).toEqual({});
  });

  it("reception gets ADMIN master-index access (registration/billing), not clinical", async () => {
    const prisma = makePrisma();
    const svc = new PatientVisibilityService(prisma as any);
    const ctx = await svc.getContext(RECEPTION);
    expect(ctx.mode).toBe("ADMIN");
    expect(await svc.buildActiveListFilter(RECEPTION as any)).toEqual({});
    expect(await svc.canAccessPatient(RECEPTION as any, "p1")).toBe(true);
  });

  it("clinical role with no department/doctor identity gets no worklist visibility", async () => {
    const prisma = makePrisma();
    const svc = new PatientVisibilityService(prisma as any);
    const filter = await svc.buildActiveListFilter(ER_STAFF as any);
    expect(filter).toEqual(NO_MATCH);
  });
});

describe("PatientVisibilityService — §64.28 acceptance scenarios", () => {
  it("Test 1 — ER isolation: ER staff see only patients with an active ER location", async () => {
    const prisma = makePrisma({
      staffProfile: {
        findFirst: jest.fn().mockResolvedValue({ departmentId: "dept-er" }),
      },
    });
    const svc = new PatientVisibilityService(prisma as any);
    const filter = await svc.buildActiveListFilter(ER_STAFF as any);
    // Only clause: active location in the ER department. No global fallback.
    expect(filter.OR).toHaveLength(1);
    expect(filter.OR[0].locations.some.status).toEqual({ in: ["ACTIVE", "TEMPORARY"] });
    expect(filter.OR[0].locations.some.departmentId).toBe("dept-er");
  });

  it("Test 2/3 — ward transfer: visibility follows ward context via active locations", async () => {
    const prisma = makePrisma({
      staffProfile: {
        findFirst: jest.fn().mockResolvedValue({ departmentId: "dept-wardB" }),
      },
    });
    const svc = new PatientVisibilityService(prisma as any);
    const filter = await svc.buildActiveListFilter({ ...ER_STAFF, role: "NURSE" } as any);
    expect(filter.OR[0].locations.some.departmentId).toBe("dept-wardB");
  });

  it("Test 4 — temporary radiology visit is included in visibility (TEMPORARY status)", async () => {
    const prisma = makePrisma({
      staffProfile: {
        findFirst: jest.fn().mockResolvedValue({ departmentId: "dept-rad" }),
      },
    });
    const svc = new PatientVisibilityService(prisma as any);
    const filter = await svc.buildActiveListFilter({ ...ER_STAFF, role: "RADIOLOGIST" } as any);
    expect(filter.OR[0].locations.some.status.in).toContain("TEMPORARY");
  });

  it("Test 5 — unauthorized search: department Y patient is filtered out of X's query", async () => {
    const prisma = makePrisma({
      staffProfile: {
        findFirst: jest.fn().mockResolvedValue({ departmentId: "dept-X" }),
      },
      patientLocation: {
        ...makePrisma().patientLocation,
        findFirst: jest.fn().mockResolvedValue(null), // no active loc in dept X
      },
    });
    const svc = new PatientVisibilityService(prisma as any);
    const visible = await svc.canAccessPatient({ ...ER_STAFF, role: "DOCTOR" } as any, "p1");
    expect(visible).toBe(false);
  });

  it("Test 6 — direct API attempt: assertCanAccess throws Forbidden", async () => {
    const prisma = makePrisma({
      patientLocation: {
        ...makePrisma().patientLocation,
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const svc = new PatientVisibilityService(prisma as any);
    await expect(
      svc.assertCanAccess({ ...ER_STAFF, role: "NURSE" } as any, "p1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("Test 7 — transfer request only: no visibility mutation happens on request", async () => {
    const prisma = makePrisma({
      patientLocation: {
        findFirst: jest.fn().mockResolvedValue({ id: "loc-src" }),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      patientTransfer: {
        create: jest.fn().mockResolvedValue({ id: "tr1", status: "REQUESTED" }),
      },
    });
    const svc = new PatientVisibilityService(prisma as any);
    await svc.requestTransfer(prisma as any, {
      tenantId: "t1",
      patientId: "p1",
      toLocationType: "IPD_WARD",
      toWardId: "ward-B",
    });
    // Request only records intent — source location untouched, no new location.
    expect(prisma.patientLocation.updateMany).not.toHaveBeenCalled();
    expect(prisma.patientLocation.create).not.toHaveBeenCalled();
    expect(prisma.patientTransfer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "REQUESTED", patientId: "p1" }),
    });
  });

  it("Test 8 — completed transfer: source ENDED + destination ACTIVE in one transaction", async () => {
    const prisma = makePrisma({
      patientTransfer: {
        findFirst: jest.fn().mockResolvedValue({
          id: "tr1",
          tenantId: "t1",
          patientId: "p1",
          status: "REQUESTED",
          toLocationType: "IPD_WARD",
          toWardId: "ward-B",
          toBedId: "bed-B12",
        }),
        update: jest.fn().mockResolvedValue({ id: "tr1", status: "COMPLETED" }),
      },
    });
    const svc = new PatientVisibilityService(prisma as any);
    await svc.completeTransfer(prisma as any, "t1", "tr1", "u9");
    expect(prisma.bed.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "bed-B12" }) }),
    );
    expect(prisma.patientLocation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ patientId: "p1", status: { in: ["ACTIVE", "TEMPORARY"] } }),
      }),
    );
    expect(prisma.patientLocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        locationType: "IPD_WARD",
        wardId: "ward-B",
        bedId: "bed-B12",
        status: "ACTIVE",
      }),
    });
    expect(prisma.patientTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }),
    );
  });

  it("Test 8b — completed transfer to an occupied bed is rejected (§64.22)", async () => {
    const prisma = makePrisma({
      bed: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      patientTransfer: {
        findFirst: jest.fn().mockResolvedValue({
          id: "tr1",
          tenantId: "t1",
          patientId: "p1",
          status: "APPROVED",
          toLocationType: "IPD_WARD",
          toBedId: "bed-occupied",
        }),
      },
    });
    const svc = new PatientVisibilityService(prisma as any);
    await expect(svc.completeTransfer(prisma as any, "t1", "tr1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.patientLocation.create).not.toHaveBeenCalled();
  });

  it("Test 9 — historical access: past care relationship grants record access, not worklist", async () => {
    const prisma = makePrisma({
      doctorProfile: { findFirst: jest.fn().mockResolvedValue({ id: "doc-1" }) },
      patientLocation: {
        ...makePrisma().patientLocation,
        findFirst: jest.fn().mockResolvedValue(null), // no CURRENT context
      },
      encounter: { findFirst: jest.fn().mockResolvedValue({ id: "enc-9" }) },
    });
    const svc = new PatientVisibilityService(prisma as any);
    // Record access: yes (§64.18)…
    expect(await svc.canAccessPatient(DOCTOR as any, "p1")).toBe(true);
    // …but the worklist filter has no unconditional clause — only current
    // relationships appear in active lists.
    const filter = await svc.buildActiveListFilter(DOCTOR as any);
    const hasGlobalFallback = (filter.OR || []).some(
      (clause: any) => !clause.locations && !clause.encounters && !clause.admissions,
    );
    expect(hasGlobalFallback).toBe(false);
  });

  it("Test 10 — no cross-department leakage: cardiology nurse sees nothing in orthopedics", async () => {
    const prisma = makePrisma({
      staffProfile: {
        findFirst: jest.fn().mockResolvedValue({ departmentId: "dept-cardio" }),
      },
      patientLocation: {
        ...makePrisma().patientLocation,
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const svc = new PatientVisibilityService(prisma as any);
    expect(await svc.canAccessPatient({ ...ER_STAFF, role: "NURSE" } as any, "p1")).toBe(false);
  });
});

describe("PatientVisibilityService — lifecycle helpers", () => {
  it("registerLocation supersedes the prior active location (§64.21)", async () => {
    const prisma = makePrisma();
    const svc = new PatientVisibilityService(prisma as any);
    await svc.registerLocation(prisma as any, {
      tenantId: "t1",
      patientId: "p1",
      locationType: "ER",
    });
    expect(prisma.patientLocation.updateMany).toHaveBeenCalled();
    expect(prisma.patientLocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ locationType: "ER", status: "ACTIVE", isPrimary: true }),
    });
  });

  it("beginTemporaryVisit keeps the primary location (§64.9)", async () => {
    const prisma = makePrisma({
      patientLocation: {
        ...makePrisma().patientLocation,
        findFirst: jest.fn().mockResolvedValue({ id: "loc-primary" }),
        create: jest.fn().mockResolvedValue({ id: "loc-temp", status: "TEMPORARY" }),
      },
    });
    const svc = new PatientVisibilityService(prisma as any);
    const temp = await svc.beginTemporaryVisit(prisma as any, {
      tenantId: "t1",
      patientId: "p1",
      locationType: "RADIOLOGY",
    });
    expect((temp as any).status).toBe("TEMPORARY");
    expect(prisma.patientLocation.updateMany).not.toHaveBeenCalled();
    expect(prisma.patientLocation.update).not.toHaveBeenCalled();
  });
});

describe("PatientVisibilityService — ER master-index isolation (§64)", () => {
  it("hides a patient with an active ER location", () => {
    const svc = new PatientVisibilityService(makePrisma() as any);
    const filter = svc.buildErIsolationFilter();
    expect(filter).toEqual({
      NOT: {
        OR: [
          {
            locations: {
              some: {
                status: { in: ["ACTIVE", "TEMPORARY"] },
                locationType: "ER",
              },
            },
          },
          {
            AND: [
              { locations: { some: { locationType: "ER" } } },
              { locations: { none: { locationType: { not: "ER" } } } },
            ],
          },
        ],
      },
    });
  });
});
