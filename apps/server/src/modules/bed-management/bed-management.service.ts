import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { BedStatus } from "@prisma/client";
import { RegulatoryRuleService } from "../regulatory/regulatory-rule.service";
import { RULE_KEYS } from "../regulatory/regulatory.service";

export interface CreateWardDto {
  name: string;
  code?: string;
  location?: string;
  floor?: number;
  capacity?: number;
  departmentId?: string;
}

export interface UpdateWardDto extends Partial<CreateWardDto> {
  isActive?: boolean;
}

export interface CreateRoomDto {
  wardId: string;
  name: string;
  roomNumber?: string;
  roomType?: string;
  capacity?: number;
  ratePerDay?: number;
}

export interface UpdateRoomDto extends Partial<CreateRoomDto> {
  isActive?: boolean;
}

export interface CreateBedDto {
  wardId?: string;
  roomId?: string;
  bedNumber: string;
  bedType?: string;
  ratePerDay?: number;
  /** Hospital-wide free-bed designation (§65.2): counts toward the quota. */
  freeBedEligible?: boolean;
  /** e.g. "POOR", "HELPLESS", "UNCLAIMED" — mirrors regulatory eligibility categories. */
  quotaCategory?: string;
}

export interface UpdateBedDto extends Partial<CreateBedDto> {
  status?: string;
  isActive?: boolean;
}

export interface AllocateBedDto {
  bedId: string;
  admissionId: string;
  /** Admission is free-treatment eligible — required to claim a designated free bed. */
  isFreeTreatment?: boolean;
}

export interface TransferBedDto {
  toBedId: string;
  admissionId: string;
  reason?: string;
  /** Transfer of a free-treatment-eligible admission into a designated bed. */
  isFreeTreatment?: boolean;
}

export interface CreateMaintenanceDto {
  wardId?: string;
  bedId?: string;
  type: string;
  description?: string;
  scheduledAt?: Date | string;
  assignedTo?: string;
  notes?: string;
}

export interface UpdateMaintenanceDto extends Partial<CreateMaintenanceDto> {
  status?: string;
  completedAt?: Date | string;
}

export interface BedSearchParams {
  wardId?: string;
  roomId?: string;
  status?: string;
  bedType?: string;
  search?: string;
  isActive?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class BedManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  async getDashboard(tenantId: string) {
    const beds = await this.prisma.bed.findMany({
      where: { tenantId, isActive: true },
      include: {
        ward: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
    });

    const wards = await this.prisma.ward.findMany({
      where: { tenantId, isActive: true },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    const totalBeds = beds.length;
    const available = beds.filter((b) => b.status === "AVAILABLE").length;
    const occupied = beds.filter((b) => b.status === "OCCUPIED").length;
    const reserved = beds.filter((b) => b.status === "RESERVED").length;
    const cleaning = beds.filter((b) => b.status === "CLEANING").length;
    const maintenanceCount = beds.filter((b) => b.status === "MAINTENANCE").length;
    const blocked = beds.filter((b) => b.status === "BLOCKED").length;
    const occupancyRate = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;

    const byWard = wards.map((w) => {
      const wBeds = beds.filter((b) => b.wardId === w.id);
      const wTotal = wBeds.length;
      const wOccupied = wBeds.filter((b) => b.status === "OCCUPIED").length;
      const wAvailable = wBeds.filter((b) => b.status === "AVAILABLE").length;
      return {
        id: w.id,
        name: w.name,
        department: w.department?.name,
        totalBeds: wTotal,
        occupied: wOccupied,
        available: wAvailable,
        occupancyRate: wTotal > 0 ? Math.round((wOccupied / wTotal) * 100) : 0,
      };
    });

    const typeList = [
      "GENERAL",
      "SEMI_PRIVATE",
      "PRIVATE",
      "DELUXE",
      "ICU",
      "NICU",
      "EMERGENCY",
      "MATERNITY",
      "PEDIATRIC",
      "ISOLATION",
      "SURGICAL",
    ];
    const byType = typeList
      .map((t) => {
        const typeBeds = beds.filter((b) => b.bedType === t);
        if (typeBeds.length === 0) return null;
        return {
          type: t,
          total: typeBeds.length,
          occupied: typeBeds.filter((b) => b.status === "OCCUPIED").length,
          available: typeBeds.filter((b) => b.status === "AVAILABLE").length,
        };
      })
      .filter(Boolean);

    const recentAllocations = await this.prisma.bedAllocation.findMany({
      where: { tenantId, status: "OCCUPIED" },
      include: {
        bed: { select: { id: true, bedNumber: true, ward: { select: { name: true } } } },
        admission: {
          select: {
            id: true,
            patient: { select: { firstName: true, lastName: true, mrn: true } },
          },
        },
      },
      orderBy: { allocatedAt: "desc" },
      take: 10,
    });

    const pendingMaintenance = await this.prisma.bedMaintenance.findMany({
      where: { tenantId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      include: {
        bed: { select: { id: true, bedNumber: true } },
        ward: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 10,
    });

    return {
      summary: {
        totalBeds,
        available,
        occupied,
        reserved,
        cleaning,
        maintenance: maintenanceCount,
        blocked,
        occupancyRate,
      },
      byWard,
      byType,
      recentAllocations,
      pendingMaintenance,
    };
  }

  async getBoard(tenantId: string) {
    const wards = await this.prisma.ward.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ floor: "asc" }, { name: "asc" }],
      include: {
        department: { select: { id: true, name: true } },
        rooms: {
          where: { isActive: true },
          orderBy: { name: "asc" },
          include: {
            beds: {
              where: { isActive: true },
              orderBy: { bedNumber: "asc" },
              include: {
                allocations: {
                  where: { status: "OCCUPIED" },
                  include: {
                    admission: {
                      select: {
                        id: true,
                        admissionNumber: true,
                        primaryDiagnosis: true,
                        patient: {
                          select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            mrn: true,
                          },
                        },
                      },
                    },
                  },
                  take: 1,
                },
              },
            },
          },
        },
        beds: {
          where: { roomId: null, isActive: true },
          orderBy: { bedNumber: "asc" },
          include: {
            allocations: {
              where: { status: "OCCUPIED" },
              include: {
                admission: {
                  select: {
                    id: true,
                    admissionNumber: true,
                    primaryDiagnosis: true,
                    patient: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        mrn: true,
                      },
                    },
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
    });

    const allBeds = wards.flatMap((w) => [...w.rooms.flatMap((r) => r.beds), ...w.beds]);
    const total = allBeds.length;
    const count = (st: string) => allBeds.filter((b) => b.status === st).length;
    const summary = {
      total,
      available: count("AVAILABLE"),
      occupied: count("OCCUPIED"),
      reserved: count("RESERVED"),
      cleaning: count("CLEANING"),
      maintenance: count("MAINTENANCE"),
      blocked: count("BLOCKED"),
      isolation: allBeds.filter((b) => b.bedType === "ISOLATION").length,
      occupancyRate: total > 0 ? Math.round((count("OCCUPIED") / total) * 100) : 0,
    };

    const board = wards.map((w) => {
      const wardRooms = w.rooms.map((r) => ({
        ...r,
        beds: r.beds,
      }));
      return {
        id: w.id,
        name: w.name,
        code: w.code,
        floor: w.floor,
        department: w.department?.name ?? null,
        capacity: w.capacity,
        rooms: wardRooms,
        unassignedBeds: w.beds,
        totalBeds: wardRooms.reduce((s, r) => s + r.beds.length, 0) + w.beds.length,
        occupied: [...wardRooms.flatMap((r) => r.beds), ...w.beds].filter(
          (b) => b.status === "OCCUPIED",
        ).length,
      };
    });

    return { summary, wards: board };
  }

  async findAllWards(
    tenantId: string,
    query: { search?: string; page?: number; limit?: number },
  ) {
    const { search, page = 1, limit = 50 } = query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 50);
    const where: any = { tenantId, isActive: true };
    if (search)
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];

    const [rows, total] = await Promise.all([
      this.prisma.ward.findMany({
        where,
        include: {
          department: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      this.prisma.ward.count({ where }),
    ]);

    const enriched = await Promise.all(
      rows.map(async (w) => {
        const beds = await this.prisma.bed.findMany({
          where: { wardId: w.id, isActive: true },
          select: { status: true },
        });
        const occupied = beds.filter((b: any) => b.status === "OCCUPIED").length;
        const available = beds.filter((b: any) => b.status === "AVAILABLE").length;
        return { ...w, occupied, available, totalBeds: beds.length };
      }),
    );

    return { data: enriched, total, page, limit };
  }

  async createWard(tenantId: string, dto: CreateWardDto) {
    if (!dto.name) throw new BadRequestException("Ward name is required");
    return this.prisma.ward.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code,
        location: dto.location,
        floor: dto.floor,
        capacity: dto.capacity ?? 0,
        departmentId: dto.departmentId,
      },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async updateWard(tenantId: string, id: string, dto: UpdateWardDto) {
    const existing = await this.prisma.ward.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!existing) throw new NotFoundException("Ward not found");
    const { tenantId: _t, departmentId: _d, ...fields } = dto as any;
    return this.prisma.ward.update({
      where: { id },
      data: { ...fields },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async deleteWard(tenantId: string, id: string) {
    const existing = await this.prisma.ward.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!existing) throw new NotFoundException("Ward not found");
    const bedsInWard = await this.prisma.bed.count({
      where: { wardId: id, isActive: true },
    });
    if (bedsInWard > 0)
      throw new ConflictException("Cannot delete ward with active beds");
    return this.prisma.ward.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findAllRooms(
    tenantId: string,
    query: {
      wardId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { wardId, search, page = 1, limit = 50 } = query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 50);
    const where: any = { tenantId, isActive: true };
    if (wardId) where.wardId = wardId;
    if (search)
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { roomNumber: { contains: search, mode: "insensitive" } },
      ];

    const [rows, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        include: {
          ward: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      this.prisma.room.count({ where }),
    ]);

    return { data: rows, total, page: pageNum, limit: limitNum };
  }

  async createRoom(tenantId: string, dto: CreateRoomDto) {
    if (!dto.name || !dto.wardId)
      throw new BadRequestException("Room name and ward are required");
    const ward = await this.prisma.ward.findFirst({
      where: { id: dto.wardId, tenantId, isActive: true },
    });
    if (!ward) throw new NotFoundException("Ward not found");
    return this.prisma.room.create({
      data: {
        tenantId,
        wardId: dto.wardId,
        name: dto.name,
        roomNumber: dto.roomNumber,
        roomType: (dto.roomType as any) ?? "OTHER",
        capacity: dto.capacity ?? 1,
        ratePerDay: dto.ratePerDay ?? 0,
      },
      include: { ward: { select: { id: true, name: true } } },
    });
  }

  async updateRoom(tenantId: string, id: string, dto: UpdateRoomDto) {
    const existing = await this.prisma.room.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!existing) throw new NotFoundException("Room not found");
    const { tenantId: _t, wardId: _w, ...fields } = dto as any;
    return this.prisma.room.update({
      where: { id },
      data: { ...fields } as any,
    });
  }

  async deleteRoom(tenantId: string, id: string) {
    const existing = await this.prisma.room.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!existing) throw new NotFoundException("Room not found");
    const bedsInRoom = await this.prisma.bed.count({
      where: { roomId: id, isActive: true },
    });
    if (bedsInRoom > 0)
      throw new ConflictException("Cannot delete room with active beds");
    return this.prisma.room.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findAllBeds(tenantId: string, query: BedSearchParams) {
    const {
      wardId,
      roomId,
      status,
      bedType,
      search,
      isActive,
      page = 1,
      limit = 50,
    } = query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 50);
    const where: any = { tenantId };
    if (wardId) where.wardId = wardId;
    if (roomId) where.roomId = roomId;
    if (status) where.status = status;
    if (bedType) where.bedType = bedType;
    if (isActive !== undefined) where.isActive = isActive === "true";
    if (search)
      where.OR = [
        { bedNumber: { contains: search, mode: "insensitive" } },
      ];

    const [rows, total] = await Promise.all([
      this.prisma.bed.findMany({
        where,
        include: {
          ward: { select: { id: true, name: true } },
          room: { select: { id: true, name: true, roomType: true } },
          allocations: {
            where: { status: "OCCUPIED" },
            include: {
              admission: {
                select: {
                  id: true,
                  patient: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      mrn: true,
                    },
                  },
                },
              },
            },
            take: 1,
          },
        },
        orderBy: { bedNumber: "asc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      this.prisma.bed.count({ where }),
    ]);

    return { data: rows, total, page: pageNum, limit: limitNum };
  }

  async createBed(tenantId: string, dto: CreateBedDto) {
    if (!dto.bedNumber)
      throw new BadRequestException("Bed number is required");
    if (dto.wardId) {
      const ward = await this.prisma.ward.findFirst({
        where: { id: dto.wardId, tenantId, isActive: true },
      });
      if (!ward) throw new NotFoundException("Ward not found");
    }
    if (dto.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: dto.roomId, tenantId, isActive: true },
      });
      if (!room) throw new NotFoundException("Room not found");
    }
    const existing = await this.prisma.bed.findFirst({
      where: { tenantId, bedNumber: dto.bedNumber, isActive: true },
    });
    if (existing)
      throw new ConflictException("Bed number already exists in this tenant");

    return this.prisma.bed.create({
      data: {
        tenantId,
        bedNumber: dto.bedNumber,
        wardId: dto.wardId,
        roomId: dto.roomId,
        bedType: (dto.bedType as any) ?? "GENERAL",
        ratePerDay: dto.ratePerDay ?? 0,
      },
      include: {
        ward: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
    });
  }

  async updateBed(tenantId: string, id: string, dto: UpdateBedDto) {
    const existing = await this.prisma.bed.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!existing) throw new NotFoundException("Bed not found");
    const { tenantId: _t, wardId: _w, roomId: _r, ...fields } = dto as any;
    return this.prisma.bed.update({
      where: { id },
      data: { ...fields } as any,
      include: {
        ward: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
    });
  }

  async updateBedStatus(
    tenantId: string,
    id: string,
    status: string,
    reason?: string,
  ) {
    const existing = await this.prisma.bed.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!existing) throw new NotFoundException("Bed not found");
    if (existing.status === "OCCUPIED" && status !== "AVAILABLE") {
      throw new ConflictException(
        "Cannot change status of an occupied bed. Deallocate first.",
      );
    }
    return this.prisma.bed.update({
      where: { id },
      data: { status: status as any },
      include: {
        ward: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
    });
  }

  // ------------------------------------------------------------------
  // Hospital-wide free-bed designation (§65.2, §65.9) — the 10% quota is a
  // HOSPITAL-level obligation; designated beds keep their normal identity
  // and location in any ward. Required count comes from the versioned
  // free_bed_quota rule; this is physical-inventory truth.
  // ------------------------------------------------------------------

  /** Bed statuses that count toward the operational hospital bed total (§6). */
  private static readonly OPERATIONAL_BED_STATUS: BedStatus[] = [
    "AVAILABLE",
    "OCCUPIED",
    "CLEANING",
    "RESERVED",
  ];

  private static quotaFromConfig(config: {
    bedBase: number;
    quotaPercent: number;
    roundingMode: "FLOOR" | "CEIL" | "ROUND";
  }) {
    const raw = (config.bedBase * config.quotaPercent) / 100;
    const required =
      config.roundingMode === "CEIL"
        ? Math.ceil(raw)
        : config.roundingMode === "ROUND"
          ? Math.round(raw)
          : Math.floor(raw);
    return required;
  }

  /**
   * Hospital-wide free-bed compliance summary (spec §7/§13).
   * required ← free_bed_quota rule (config-driven, versioned)
   * allocated ← physical beds with freeBedEligible in the operational inventory
   * available/occupied/blocked ← live operational status of those beds
   */
  async getFreeBedSummary(tenantId: string) {
    const quota = await this.rules
      .resolve<{
        bedBase: number;
        quotaPercent: number;
        roundingMode: "FLOOR" | "CEIL" | "ROUND";
        warningThresholdPercent?: number;
      }>(tenantId, RULE_KEYS.FREE_BED)
      .catch(() => null);

    const operationalWhere = {
      tenantId,
      isActive: true,
      status: { in: BedManagementService.OPERATIONAL_BED_STATUS },
    };

    const [totalOperationalBeds, designatedBeds, byWardRaw] = await Promise.all([
      this.prisma.bed.count({ where: operationalWhere }),
      this.prisma.bed.findMany({
        where: { ...operationalWhere, freeBedEligible: true },
        select: {
          id: true,
          bedNumber: true,
          status: true,
          wardId: true,
          ward: { select: { id: true, name: true } },
          quotaCategory: true,
        },
      }),
      this.prisma.bed.groupBy({
        by: ["wardId"],
        where: operationalWhere,
        _count: { _all: true },
      }),
    ]);

    const required = quota ? BedManagementService.quotaFromConfig(quota.config) : 0;

    const freeState = (status: string) =>
      status === "OCCUPIED"
        ? "OCCUPIED"
        : status === "AVAILABLE" || status === "CLEANING"
          ? "AVAILABLE"
          : "BLOCKED";
    const available = designatedBeds.filter((b) => freeState(b.status) === "AVAILABLE").length;
    const occupied = designatedBeds.filter((b) => freeState(b.status) === "OCCUPIED").length;
    const blocked = designatedBeds.length - available - occupied;

    // Per-ward rollup: totals + designated split (§8/§13 department summary).
    const wardIds = byWardRaw.map((w) => w.wardId).filter((id): id is string => !!id);
    const wards = wardIds.length
      ? await this.prisma.ward.findMany({ where: { id: { in: wardIds } }, select: { id: true, name: true } })
      : [];
    const wardNameById = new Map(wards.map((w) => [w.id, w.name]));
    const byWard = byWardRaw
      .map((w) => {
        const designated = designatedBeds.filter((b) => b.wardId === w.wardId);
        return {
          wardId: w.wardId,
          wardName: w.wardId ? (wardNameById.get(w.wardId) ?? "Unknown") : "Unassigned",
          totalBeds: w._count._all,
          freeBeds: designated.length,
          availableFreeBeds: designated.filter((b) => freeState(b.status) === "AVAILABLE").length,
          occupiedFreeBeds: designated.filter((b) => freeState(b.status) === "OCCUPIED").length,
        };
      })
      .sort((a, b) => b.freeBeds - a.freeBeds || b.totalBeds - a.totalBeds);

    const allocated = designatedBeds.length;
    const complianceStatus =
      allocated > required ? "OVER_ALLOCATED" : allocated === required ? "COMPLIANT" : "UNDER_ALLOCATED";

    return {
      bedBase: quota?.config.bedBase ?? totalOperationalBeds,
      totalOperationalBeds,
      quotaPercent: quota?.config.quotaPercent ?? 10,
      roundingMode: quota?.config.roundingMode ?? "FLOOR",
      ruleVersion: quota?.version ?? null,
      requiredFreeBeds: required,
      allocatedFreeBeds: allocated,
      remainingToAllocate: Math.max(0, required - allocated),
      availableFreeBeds: available,
      occupiedFreeBeds: occupied,
      blockedFreeBeds: blocked,
      utilizationPercent: allocated > 0 ? Math.round((occupied / allocated) * 100) : 0,
      complianceStatus,
      warningThresholdPercent: quota?.config.warningThresholdPercent ?? 80,
      // Capacity drift: the rule's bedBase should track the real inventory.
      capacityDrift:
        quota && quota.config.bedBase !== totalOperationalBeds
          ? { ruleBedBase: quota.config.bedBase, actualOperationalBeds: totalOperationalBeds }
          : null,
      byWard,
    };
  }

  /** Available designated beds across ALL wards (spec §15) — never ER-only. */
  async getAvailableFreeBeds(tenantId: string) {
    const beds = await this.prisma.bed.findMany({
      where: {
        tenantId,
        isActive: true,
        freeBedEligible: true,
        status: { in: ["AVAILABLE", "CLEANING"] },
      },
      select: {
        id: true,
        bedNumber: true,
        bedType: true,
        status: true,
        quotaCategory: true,
        ward: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
      orderBy: [{ ward: { name: "asc" } }, { bedNumber: "asc" }],
    });
    return { data: beds, total: beds.length };
  }

  /**
   * Designate / un-designate a bed for the free-bed quota (spec §9/§26).
   * Every change is audited via RegulatoryEvent — no silent rewrites (§17).
   */
  async setFreeBedDesignation(
    tenantId: string,
    bedId: string,
    dto: { freeBedEligible: boolean; quotaCategory?: string | null; reason?: string },
    userId?: string,
  ) {
    const bed = await this.prisma.bed.findFirst({ where: { id: bedId, tenantId, isActive: true } });
    if (!bed) throw new NotFoundException("Bed not found");

    const activeStay = await this.prisma.freeBedAllocation.findFirst({
      where: { tenantId, bedId, status: "OCCUPIED" },
    });

    if (!dto.freeBedEligible) {
      if (activeStay)
        throw new ConflictException(
          "Bed has an active free-treatment patient — release the stay first",
        );
    } else {
      if (bed.freeBedEligible)
        throw new ConflictException("Bed is already designated as a free bed");
      // Designated beds are reserved for eligible patients (Rule 3/§65.4):
      // cannot designate a bed currently holding a paid admission.
      if (bed.status === "OCCUPIED" && !activeStay)
        throw new ConflictException(
          "Bed is currently occupied by a paid admission — deallocate first",
        );
      // Never silently exceed the regulatory requirement (§8).
      const summary = await this.getFreeBedSummary(tenantId);
      if (summary.allocatedFreeBeds >= summary.requiredFreeBeds)
        throw new ForbiddenException(
          `Free-bed allocation would exceed the required quota (${summary.allocatedFreeBeds}/${summary.requiredFreeBeds}). Update the free_bed_quota rule first.`,
        );
    }

    const updated = await this.prisma.bed.update({
      where: { id: bedId },
      data: {
        freeBedEligible: dto.freeBedEligible,
        quotaCategory: dto.freeBedEligible
          ? (dto.quotaCategory ?? bed.quotaCategory ?? "FREE")
          : null,
      },
      include: {
        ward: { select: { id: true, name: true } },
        room: { select: { id: true, name: true } },
      },
    });

    await this.rules.logEvent(
      tenantId,
      dto.freeBedEligible ? "FREE_BED_DESIGNATED" : "FREE_BED_UNDESIGNATED",
      "Bed",
      bedId,
      {
        previous: { freeBedEligible: bed.freeBedEligible, quotaCategory: bed.quotaCategory },
        new: { freeBedEligible: dto.freeBedEligible, quotaCategory: updated.quotaCategory },
        reason: dto.reason ?? null,
      },
      activeStay?.patientId,
      userId,
    );
    return updated;
  }

  async deleteBed(tenantId: string, id: string) {
    const existing = await this.prisma.bed.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!existing) throw new NotFoundException("Bed not found");
    if (existing.status === "OCCUPIED")
      throw new ConflictException("Cannot delete an occupied bed");
    // Rule 6: deleting a designated bed must not silently break compliance —
    // flag it in the audit trail so the shortfall is visible.
    if (existing.freeBedEligible) {
      await this.rules.logEvent(
        tenantId,
        "FREE_BED_UNDESIGNATED",
        "Bed",
        id,
        { previous: { freeBedEligible: true, quotaCategory: existing.quotaCategory }, reason: "bed deleted/deactivated" },
        undefined,
        undefined,
      );
    }
    return this.prisma.bed.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async allocateBed(tenantId: string, dto: AllocateBedDto, userId?: string) {
    const bed = await this.prisma.bed.findFirst({
      where: { id: dto.bedId, tenantId, isActive: true },
    });
    if (!bed) throw new NotFoundException("Bed not found");
    if (bed.status !== "AVAILABLE")
      throw new ConflictException(
        `Bed is not available (current status: ${bed.status})`,
      );
    // Rule 3: designated free beds are reserved for eligible free-treatment
    // admissions — a paid admission can never silently take one.
    if (bed.freeBedEligible && !dto.isFreeTreatment)
      throw new ForbiddenException(
        "This bed is designated for free-treatment patients (use a non-designated bed or mark the admission free-treatment eligible)",
      );

    const admission = await this.prisma.admission.findFirst({
      where: { id: dto.admissionId, tenantId },
    });
    if (!admission) throw new NotFoundException("Admission not found");

    const existingAllocation = await this.prisma.bedAllocation.findFirst({
      where: { bedId: dto.bedId, status: "OCCUPIED", tenantId },
    });
    if (existingAllocation)
      throw new ConflictException("Bed is already allocated");

    return this.prisma.$transaction(async (tx) => {
      const allocation = await tx.bedAllocation.create({
        data: {
          tenantId,
          bedId: dto.bedId,
          admissionId: dto.admissionId,
          status: "OCCUPIED",
          createdBy: userId,
        },
      });

      await tx.bed.update({
        where: { id: dto.bedId },
        data: { status: "OCCUPIED" },
      });

      return allocation;
    });
  }

  async deallocateBed(tenantId: string, bedId: string) {
    const bed = await this.prisma.bed.findFirst({
      where: { id: bedId, tenantId, isActive: true },
    });
    if (!bed) throw new NotFoundException("Bed not found");

    const allocation = await this.prisma.bedAllocation.findFirst({
      where: { bedId, status: "OCCUPIED", tenantId },
    });
    if (!allocation)
      throw new NotFoundException(
        "No active allocation found for this bed",
      );

    return this.prisma.$transaction(async (tx) => {
      await tx.bedAllocation.update({
        where: { id: allocation.id },
        data: { status: "AVAILABLE", releasedAt: new Date() },
      });

      await tx.bed.update({
        where: { id: bedId },
        data: { status: "CLEANING" },
      });

      return { success: true, message: "Bed deallocated. Status set to CLEANING." };
    });
  }

  async transferBed(
    tenantId: string,
    dto: TransferBedDto,
    userId?: string,
  ) {
    const currentAllocation = await this.prisma.bedAllocation.findFirst({
      where: { admissionId: dto.admissionId, status: "OCCUPIED", tenantId },
      include: { bed: true },
    });
    if (!currentAllocation)
      throw new NotFoundException(
        "No active bed allocation found for this admission",
      );

    const newBed = await this.prisma.bed.findFirst({
      where: { id: dto.toBedId, tenantId, isActive: true },
    });
    if (!newBed) throw new NotFoundException("Target bed not found");
    if (newBed.status !== "AVAILABLE")
      throw new ConflictException(
        `Target bed is not available (status: ${newBed.status})`,
      );
    if (currentAllocation.bedId === dto.toBedId)
      throw new ConflictException("Patient is already in this bed");
    // Rule 3 applies to transfers too: a designated bed cannot receive a paid
    // admission unless the moving admission is itself free-treatment eligible.
    const activeFreeStay = await this.prisma.freeBedAllocation.findFirst({
      where: { tenantId, admissionId: dto.admissionId, status: "OCCUPIED" },
    });
    if (newBed.freeBedEligible && !activeFreeStay && !dto.isFreeTreatment)
      throw new ForbiddenException(
        "Target bed is designated for free-treatment patients — transfer a free-stay patient or mark the admission free-treatment eligible",
      );

    return this.prisma.$transaction(async (tx) => {
      await tx.bedAllocation.update({
        where: { id: currentAllocation.id },
        data: { status: "AVAILABLE", releasedAt: new Date() },
      });

      await tx.bed.update({
        where: { id: currentAllocation.bedId },
        data: { status: "CLEANING" },
      });

      const newAlloc = await tx.bedAllocation.create({
        data: {
          tenantId,
          bedId: dto.toBedId,
          admissionId: dto.admissionId,
          status: "OCCUPIED",
          createdBy: userId,
        },
      });

      await tx.bed.update({
        where: { id: dto.toBedId },
        data: { status: "OCCUPIED" },
      });

      await tx.bedMovement.create({
        data: {
          tenantId,
          bedId: currentAllocation.bedId,
          admissionId: dto.admissionId,
          fromBedId: currentAllocation.bedId,
          toBedId: dto.toBedId,
          reason: dto.reason,
          movedBy: userId,
        },
      });

      // §64.8/§64.6: the clinical context follows the bed — the active
      // location's bed pointer updates so bed-based visibility stays true.
      if ((tx as any).patientLocation) {
        const admission = await tx.admission.findFirst({
          where: { id: dto.admissionId },
          select: { patientId: true, departmentId: true },
        });
        if (admission) {
          const active = await (tx as any).patientLocation.findFirst({
            where: { tenantId, patientId: admission.patientId, status: "ACTIVE" },
            select: { id: true, departmentId: true, wardId: true },
          });
          if (active) {
            const targetBed = await tx.bed.findFirst({
              where: { id: dto.toBedId },
              select: { room: { select: { ward: { select: { id: true, departmentId: true } } } } },
            });
            await (tx as any).patientLocation.update({
              where: { id: active.id },
              data: {
                bedId: dto.toBedId,
                ...(targetBed?.room?.ward
                  ? {
                      wardId: targetBed.room.ward.id,
                      departmentId: targetBed.room.ward.departmentId,
                    }
                  : {}),
              },
            });
          }
        }
      }

      // Free-stay sync (Rule 5/§12): the patient's free-bed record follows the
      // physical bed atomically — designation and free status are preserved.
      if (activeFreeStay && activeFreeStay.bedId !== dto.toBedId) {
        await tx.freeBedAllocation.update({
          where: { id: activeFreeStay.id },
          data: { bedId: dto.toBedId },
        });
      }

      return newAlloc;
    });
  }

  async findAllMaintenance(
    tenantId: string,
    query: {
      wardId?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { wardId, status, page = 1, limit = 50 } = query;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 50);
    const where: any = { tenantId };
    if (wardId) where.wardId = wardId;
    if (status) where.status = status;

    const [rows, total] = await Promise.all([
      this.prisma.bedMaintenance.findMany({
        where,
        include: {
          ward: { select: { id: true, name: true } },
          bed: { select: { id: true, bedNumber: true } },
        },
        orderBy: { scheduledAt: "desc" },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      this.prisma.bedMaintenance.count({ where }),
    ]);

    return { data: rows, total, page: pageNum, limit: limitNum };
  }

  async createMaintenance(tenantId: string, dto: CreateMaintenanceDto) {
    if (!dto.type)
      throw new BadRequestException("Maintenance type is required");
    return this.prisma.bedMaintenance.create({
      data: {
        tenantId,
        wardId: dto.wardId,
        bedId: dto.bedId,
        type: dto.type,
        description: dto.description,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
        assignedTo: dto.assignedTo,
        notes: dto.notes,
        status: "SCHEDULED",
      },
      include: {
        ward: { select: { id: true, name: true } },
        bed: { select: { id: true, bedNumber: true } },
      },
    });
  }

  async updateMaintenance(
    tenantId: string,
    id: string,
    dto: UpdateMaintenanceDto,
  ) {
    const existing = await this.prisma.bedMaintenance.findFirst({
      where: { id, tenantId },
    });
    if (!existing)
      throw new NotFoundException("Maintenance record not found");

    const updateData: any = { ...dto };
    if (dto.scheduledAt) updateData.scheduledAt = new Date(dto.scheduledAt);
    if (dto.completedAt) updateData.completedAt = new Date(dto.completedAt);
    if (dto.status === "COMPLETED" && !dto.completedAt)
      updateData.completedAt = new Date();

    if (dto.status === "COMPLETED" && existing.bedId) {
      await this.prisma.bed.update({
        where: { id: existing.bedId },
        data: { status: "AVAILABLE" },
      });
    }

    return this.prisma.bedMaintenance.update({
      where: { id },
      data: updateData,
      include: {
        ward: { select: { id: true, name: true } },
        bed: { select: { id: true, bedNumber: true } },
      },
    });
  }

  async deleteMaintenance(tenantId: string, id: string) {
    const existing = await this.prisma.bedMaintenance.findFirst({
      where: { id, tenantId },
    });
    if (!existing)
      throw new NotFoundException("Maintenance record not found");
    return this.prisma.bedMaintenance.delete({ where: { id } });
  }

  async findBedById(tenantId: string, id: string) {
    const bed = await this.prisma.bed.findFirst({
      where: { id, tenantId, isActive: true },
      include: {
        ward: {
          select: { id: true, name: true, floor: true, location: true },
        },
        room: { select: { id: true, name: true, roomType: true } },
        allocations: {
          include: {
            admission: {
              select: {
                id: true,
                patient: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    mrn: true,
                  },
                },
              },
            },
          },
          orderBy: { allocatedAt: "desc" },
          take: 5,
        },
        movements: {
          orderBy: { movedAt: "desc" },
          take: 5,
        },
      },
    });
    if (!bed) throw new NotFoundException("Bed not found");
    return bed;
  }

  async findWardById(tenantId: string, id: string) {
    const ward = await this.prisma.ward.findFirst({
      where: { id, tenantId, isActive: true },
      include: {
        department: { select: { id: true, name: true } },
        rooms: {
          where: { isActive: true },
          include: {
            beds: {
              where: { isActive: true },
              include: {
                allocations: {
                  where: { status: "OCCUPIED" },
                  include: {
                    admission: {
                      select: {
                        id: true,
                        patient: {
                          select: {
                            firstName: true,
                            lastName: true,
                            mrn: true,
                          },
                        },
                      },
                    },
                  },
                  take: 1,
                },
              },
            },
          },
        },
        beds: {
          where: { roomId: null, isActive: true },
          include: {
            allocations: {
              where: { status: "OCCUPIED" },
              include: {
                admission: {
                  select: {
                    id: true,
                    patient: {
                      select: {
                        firstName: true,
                        lastName: true,
                        mrn: true,
                      },
                    },
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
    });
    if (!ward) throw new NotFoundException("Ward not found");
    return ward;
  }
}
