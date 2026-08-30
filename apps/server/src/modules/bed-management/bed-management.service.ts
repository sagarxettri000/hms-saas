import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

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
}

export interface UpdateBedDto extends Partial<CreateBedDto> {
  status?: string;
  isActive?: boolean;
}

export interface AllocateBedDto {
  bedId: string;
  admissionId: string;
}

export interface TransferBedDto {
  toBedId: string;
  admissionId: string;
  reason?: string;
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
  constructor(private readonly prisma: PrismaService) {}

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

  async deleteBed(tenantId: string, id: string) {
    const existing = await this.prisma.bed.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!existing) throw new NotFoundException("Bed not found");
    if (existing.status === "OCCUPIED")
      throw new ConflictException("Cannot delete an occupied bed");
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
