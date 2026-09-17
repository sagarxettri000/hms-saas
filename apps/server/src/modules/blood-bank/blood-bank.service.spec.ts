import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { BloodBankService } from "./blood-bank.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("BloodBankService", () => {
  let service: BloodBankService;
  let donorModel: any;
  let unitModel: any;
  let auditLog: jest.Mock;
  const TENANT = "tenant-1";

  beforeEach(async () => {
    donorModel = {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    };
    unitModel = {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
    };
    auditLog = jest.fn().mockResolvedValue(undefined);
    const prisma: any = {
      bloodDonor: donorModel,
      bloodUnit: unitModel,
      $transaction: jest.fn((fn: any) => fn({ bloodUnit: unitModel, bloodDonor: donorModel })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BloodBankService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: auditLog } },
      ],
    }).compile();
    service = moduleRef.get(BloodBankService);
  });

  // ---------- Blood group normalization ----------

  describe("blood group normalization", () => {
    it.each([
      ["O+", "O_POS"],
      ["o positive", "O_POS"],
      ["AB-", "AB_NEG"],
      ["a_neg", "A_NEG"],
      ["B POS", "B_POS"],
      ["A_NEG", "A_NEG"],
      ["UNKNOWN", "UNKNOWN"],
    ])("accepts %s as %s", async (raw, expected) => {
      donorModel.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "d1", ...data }),
      );
      const donor = await service.createDonor(TENANT, {
        name: "Donor",
        bloodGroup: raw,
        phone: "98",
      });
      expect(donor.bloodGroup).toBe(expected);
    });

    it.each(["", " ", "XYZ", "C+", 42])("rejects invalid blood group %p", async (raw) => {
      await expect(
        service.createDonor(TENANT, { name: "D", bloodGroup: raw as any, phone: "9" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects unit registration with a display-form blood group that is not valid enum-adjacent", async () => {
      await expect(
        service.registerUnit(TENANT, { bloodGroup: "NOT_A_GROUP" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("normalizes display-form blood group when registering a unit", async () => {
      unitModel.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "u1", ...data, unitNumber: "BLD-1" }),
      );
      const unit = await service.registerUnit(TENANT, { bloodGroup: "O+" });
      expect(unit.bloodGroup).toBe("O_POS");
    });
  });

  // ---------- Donor registration ----------

  describe("createDonor", () => {
    beforeEach(() => {
      donorModel.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "d1", ...data, totalDonations: 0 }),
      );
      donorModel.findFirst.mockResolvedValue(null);
    });

    it("requires name and phone", async () => {
      await expect(
        service.createDonor(TENANT, { name: "  ", bloodGroup: "O+", phone: "9" }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createDonor(TENANT, { name: "D", bloodGroup: "O+", phone: "" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("trims name and phone and generates a donor code", async () => {
      const donor = await service.createDonor(TENANT, {
        name: "  Ram Bahadur ",
        bloodGroup: "B_POS",
        phone: " 9800000002 ",
      });
      expect(donor.name).toBe("Ram Bahadur");
      expect(donor.phone).toBe("9800000002");
      expect(donor.donorCode).toMatch(/^DNR-\d{5}$/);
    });

    it("coerces string weight from the UI form", async () => {
      const donor = await service.createDonor(TENANT, {
        name: "D",
        bloodGroup: "O-",
        phone: "9",
        weight: "65" as any,
      });
      expect(donor.weight).toBe(65);
    });

    it("does not persist unknown client fields (no mass assignment)", async () => {
      await service.createDonor(TENANT, {
        name: "D",
        bloodGroup: "O-",
        phone: "9",
      } as any);
      const data = donorModel.create.mock.calls[0][0].data;
      expect(Object.keys(data)).not.toContain("tenant");
      expect(Object.keys(data)).not.toContain("units");
    });

    it("writes an audit entry", async () => {
      await service.createDonor(TENANT, { name: "D", bloodGroup: "O-", phone: "9" }, "user-1");
      expect(auditLog).toHaveBeenCalledWith(
        TENANT,
        "user-1",
        "BloodDonor",
        expect.any(String),
        "CREATE",
        expect.objectContaining({ bloodGroup: "O_NEG" }),
      );
    });
  });

  // ---------- Donor list / search ----------

  describe("findDonors", () => {
    it("searches by name, phone and donor code", async () => {
      await service.findDonors(TENANT, { search: "ram" });
      const where = donorModel.findMany.mock.calls[0][0].where;
      expect(where.OR[0].name.contains).toBe("ram");
      expect(where.OR[1].phone.contains).toBe("ram");
      expect(where.OR[2].donorCode.contains).toBe("ram");
    });

    it("filters by blood group in display form", async () => {
      await service.findDonors(TENANT, { bloodGroup: "AB+" });
      expect(donorModel.findMany.mock.calls[0][0].where.bloodGroup).toBe("AB_POS");
    });

    it("returns a paginated shape with a total", async () => {
      donorModel.count.mockResolvedValue(2);
      const r = await service.findDonors(TENANT, {});
      expect(r.total).toBe(2);
      expect(Array.isArray(r.data)).toBe(true);
    });
  });

  // ---------- Donor update ----------

  describe("updateDonor", () => {
    const existing = {
      id: "d1",
      tenantId: TENANT,
      name: "Old",
      phone: "1",
      bloodGroup: "O_POS",
      email: null,
      gender: "MALE",
      isActive: true,
      totalDonations: 1,
    };

    beforeEach(() => {
      donorModel.findFirst.mockResolvedValue(existing);
      donorModel.update.mockResolvedValue({ ...existing, name: "New" });
    });

    it("404s for another tenant's donor (IDOR)", async () => {
      donorModel.findFirst.mockResolvedValue(null);
      await expect(
        service.updateDonor(TENANT, "d1", { name: "X" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("rejects empty payloads instead of writing nothing", async () => {
      await expect(service.updateDonor(TENANT, "d1", {})).rejects.toThrow(
        BadRequestException,
      );
      expect(donorModel.update).not.toHaveBeenCalled();
    });

    it("updates only whitelisted fields and ignores client tenant injection", async () => {
      await service.updateDonor(TENANT, "d1", {
        name: "New",
        tenantId: "other-tenant",
      } as any);
      const data = donorModel.update.mock.calls[0][0].data;
      expect(data.name).toBe("New");
      expect(data.tenantId).toBeUndefined();
    });

    it("validates blood group on update", async () => {
      await expect(
        service.updateDonor(TENANT, "d1", { bloodGroup: "QQ+" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("audits with previous values", async () => {
      await service.updateDonor(TENANT, "d1", { name: "New" }, "user-2");
      expect(auditLog).toHaveBeenCalledWith(
        TENANT,
        "user-2",
        "BloodDonor",
        "d1",
        "UPDATE",
        expect.objectContaining({ previous: expect.any(Object), changes: { name: "New" } }),
      );
    });
  });

  // ---------- Unit registration ----------

  describe("registerUnit", () => {
    beforeEach(() => {
      unitModel.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "u1", status: "AVAILABLE", ...data }),
      );
    });

    it("defaults expiry to ~35 days when not provided", async () => {
      const unit = await service.registerUnit(TENANT, { bloodGroup: "A_POS" });
      const days = (unit.expiryDate.getTime() - Date.now()) / 86400000;
      expect(days).toBeGreaterThan(34);
      expect(days).toBeLessThan(36);
    });

    it("rejects an invalid donor id (donor must belong to the same tenant)", async () => {
      donorModel.findFirst.mockResolvedValue(null);
      await expect(
        service.registerUnit(TENANT, { bloodGroup: "A_POS", donorId: "nope" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("links the unit to a tenant donor and increments their donation count transactionally", async () => {
      donorModel.findFirst.mockResolvedValue({ id: "don-1", totalDonations: 2 });
      await service.registerUnit(TENANT, { bloodGroup: "A_POS", donorId: "don-1" });
      expect(unitModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ donorId: "don-1" }) }),
      );
      expect(donorModel.update).toHaveBeenCalledWith({
        where: { id: "don-1" },
        data: { totalDonations: 3, lastDonationDate: expect.any(Date) },
      });
    });

    it("generates sequential unit numbers per tenant", async () => {
      unitModel.findFirst.mockResolvedValue({ unitNumber: "BLD-20260916-0007" });
      await service.registerUnit(TENANT, { bloodGroup: "A_POS" });

      expect(unitModel.create.mock.calls[0][0].data.unitNumber).toMatch(/^BLD-\d{8}-0008$/);
    });

    it("audits unit registration", async () => {
      await service.registerUnit(TENANT, { bloodGroup: "A_POS" }, "user-3");
      expect(auditLog).toHaveBeenCalledWith(
        TENANT,
        "user-3",
        "BloodUnit",
        expect.any(String),
        "CREATE",
        expect.objectContaining({ bloodGroup: "A_POS" }),
      );
    });
  });

  // ---------- Inventory list ----------

  describe("findUnits", () => {
    it("filters by status, blood group and component", async () => {
      await service.findUnits(TENANT, {
        status: "available",
        bloodGroup: "O-",
        component: "PLASMA",
      });
      const where = unitModel.findMany.mock.calls[0][0].where;
      expect(where.status).toBe("AVAILABLE");
      expect(where.bloodGroup).toBe("O_NEG");
      expect(where.component).toBe("PLASMA");
    });

    it("rejects invalid status filters", async () => {
      await expect(
        service.findUnits(TENANT, { status: "HACKED" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("searches by unit number and storage location", async () => {
      await service.findUnits(TENANT, { search: "BLD-2026" });
      const where = unitModel.findMany.mock.calls[0][0].where;
      expect(where.OR[0].unitNumber.contains).toBe("BLD-2026");
      expect(where.OR[1].storageLocation.contains).toBe("BLD-2026");
    });

    it("paginates", async () => {
      unitModel.count.mockResolvedValue(45);
      const r = await service.findUnits(TENANT, { page: "2", limit: "20" } as any);
      expect(unitModel.findMany.mock.calls[0][0].skip).toBe(20);
      expect(r.totalPages).toBe(3);
    });
  });

  // ---------- Issue / discard ----------

  describe("issueUnit", () => {
    const unit = {
      id: "u1",
      tenantId: TENANT,
      status: "AVAILABLE",
      unitNumber: "BLD-1",
      expiryDate: new Date(Date.now() + 86400000),
    };

    it("refuses to issue a non-available or expired unit", async () => {
      unitModel.findFirst.mockResolvedValue({ ...unit, status: "ISSUED" });
      await expect(
        service.issueUnit(TENANT, "u1", { issuedTo: "p1" }),
      ).rejects.toThrow(BadRequestException);

      unitModel.findFirst.mockResolvedValue({
        ...unit,
        expiryDate: new Date(Date.now() - 1000),
      });
      await expect(
        service.issueUnit(TENANT, "u1", { issuedTo: "p1" }),
      ).rejects.toThrow(BadRequestException);
      expect(unitModel.update).not.toHaveBeenCalled();
    });

    it("issues an available unit and records who issued it", async () => {
      unitModel.findFirst.mockResolvedValue(unit);
      unitModel.update.mockResolvedValue({ ...unit, status: "ISSUED" });
      await service.issueUnit(TENANT, "u1", { issuedTo: "patient-9" }, "user-4");
      expect(unitModel.update).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: expect.objectContaining({ status: "ISSUED", issuedBy: "user-4" }),
      });
      expect(auditLog).toHaveBeenCalled();
    });
  });

  describe("discardUnit", () => {
    it("requires a reason and records it", async () => {
      const unit = { id: "u1", tenantId: TENANT, unitNumber: "BLD-1", testResults: null };
      unitModel.findFirst.mockResolvedValue(unit);
      unitModel.update.mockResolvedValue({ ...unit, status: "DISCARDED" });

      await expect(service.discardUnit(TENANT, "u1", "  ")).rejects.toThrow(
        BadRequestException,
      );
      await service.discardUnit(TENANT, "u1", "hemolysis", "user-5");
      const data = unitModel.update.mock.calls[0][0].data;
      expect(data.status).toBe("DISCARDED");
      expect(data.testResults.discardReason).toBe("hemolysis");
    });
  });
});
