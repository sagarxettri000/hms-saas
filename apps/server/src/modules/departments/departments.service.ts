import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

export interface CreateDepartmentDto {
  name: string;
  code: string;
  description?: string;
  parentId?: string;
  branchId?: string;
}

export interface UpdateDepartmentDto {
  name?: string;
  code?: string;
  description?: string;
  parentId?: string | null;
  branchId?: string | null;
  isActive?: boolean;
}

export interface CreateWardDto {
  name: string;
  code?: string;
  location?: string;
  departmentId?: string;
}

export interface UpdateWardDto {
  name?: string;
  code?: string | null;
  location?: string | null;
  departmentId?: string | null;
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

export interface CreateBedDto {
  wardId?: string;
  roomId?: string;
  bedNumber: string;
  ratePerDay?: number;
}

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, includeInactive = false) {
    return this.prisma.department.findMany({
      where: {
        tenantId,
        isActive: includeInactive ? undefined : true,
      },
      include: {
        _count: {
          select: {
            users: true,
            doctors: true,
            wards: true,
          },
        },
        children: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async create(tenantId: string, dto: CreateDepartmentDto) {
    const existing = await this.prisma.department.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code.toUpperCase() } },
    });
    if (existing) throw new ConflictException("Department code already exists");

    return this.prisma.department.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        parentId: dto.parentId,
        branchId: dto.branchId,
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { users: true, doctors: true, wards: true } },
        children: true,
      },
    });
    if (!department) throw new NotFoundException("Department not found");
    return department;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateDepartmentDto,
    actorUserId?: string,
  ) {
    const department = await this.prisma.department.findFirst({
      where: { id, tenantId },
    });
    if (!department) throw new NotFoundException("Department not found");

    const data: UpdateDepartmentDto = {};

    if (dto.name !== undefined) {
      const name = String(dto.name).trim();
      if (!name) throw new BadRequestException("Name cannot be empty");
      data.name = name;
    }

    if (dto.code !== undefined) {
      const code = String(dto.code).trim().toUpperCase();
      if (!code) throw new BadRequestException("Code cannot be empty");
      if (code !== department.code) {
        const clash = await this.prisma.department.findUnique({
          where: { tenantId_code: { tenantId, code } },
        });
        if (clash) throw new ConflictException("Department code already exists");
      }
      data.code = code;
    }

    if (dto.description !== undefined) data.description = dto.description;
    if (dto.branchId !== undefined) data.branchId = dto.branchId || null;

    if (dto.parentId !== undefined) {
      const parentId = dto.parentId || null;
      if (parentId === id) {
        throw new BadRequestException("A department cannot be its own parent");
      }
      if (parentId) {
        const parent = await this.prisma.department.findFirst({
          where: { id: parentId, tenantId },
        });
        if (!parent) throw new NotFoundException("Parent department not found");
        // Walk up the ancestor chain (starting at the parent itself) — a
        // department may never sit under its own subtree.
        let cursor = parent;
        const guard = new Set<string>();
        while (cursor) {
          if (cursor.id === id) {
            throw new BadRequestException("Cannot move a department under its own descendant");
          }
          if (!cursor.parentId || guard.has(cursor.id)) break;
          guard.add(cursor.id);
          const next = await this.prisma.department.findUnique({
            where: { id: cursor.parentId },
          });
          if (!next) break;
          cursor = next;
        }
      }
      data.parentId = parentId;
    }

    if (dto.isActive !== undefined && dto.isActive !== department.isActive) {
      if (!dto.isActive) {
        // Deactivation must not strand active clinical workflows.
        const [users, wards, appointments, services] = await Promise.all([
          this.prisma.user.count({ where: { departmentId: id, isActive: true } }),
          this.prisma.ward.count({ where: { departmentId: id, isActive: true } }),
          this.prisma.appointment.count({
            where: {
              departmentId: id,
              status: {
                in: [
                  "REQUESTED",
                  "CONFIRMED",
                  "CHECKED_IN",
                  "WAITING",
                  "IN_CONSULTATION",
                  "RESCHEDULED",
                ] as any,
              },
            },
          }),
          this.prisma.billingService.count({ where: { departmentId: id, isActive: true } }),
        ]);
        if (users > 0 || wards > 0 || appointments > 0 || services > 0) {
          throw new ConflictException(
            `Cannot deactivate: ${users} active user(s), ${wards} active ward(s), ${appointments} upcoming appointment(s), ${services} active billing service(s) depend on this department`,
          );
        }
      }
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No changes to apply");
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: data as any,
    });

    await this.audit.log(tenantId, actorUserId, "Department", id, "UPDATE", {
      previous: {
        name: department.name,
        code: department.code,
        description: department.description,
        parentId: department.parentId,
        branchId: department.branchId,
        isActive: department.isActive,
      },
      changes: data,
    });

    return updated;
  }

  async remove(tenantId: string, id: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, tenantId },
    });
    if (!department) throw new NotFoundException("Department not found");

    return this.prisma.department.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Wards
  async getWards(tenantId: string) {
    return this.prisma.ward.findMany({
      where: { tenantId },
      include: {
        department: { select: { id: true, name: true } },
        rooms: { include: { _count: { select: { beds: true } } } },
        _count: { select: { beds: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async createWard(tenantId: string, dto: CreateWardDto) {
    return this.prisma.ward.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code,
        location: dto.location,
        departmentId: dto.departmentId,
      },
    });
  }

  async getWardById(tenantId: string, id: string) {
    return this.prisma.ward.findFirst({
      where: { id, tenantId },
      include: {
        rooms: {
          include: { beds: { orderBy: { bedNumber: "asc" } } },
          orderBy: { name: "asc" },
        },
        beds: { orderBy: { bedNumber: "asc" } },
        department: true,
      },
    });
  }

  async updateWard(
    tenantId: string,
    id: string,
    dto: UpdateWardDto,
    actorUserId?: string,
  ) {
    const ward = await this.prisma.ward.findFirst({
      where: { id, tenantId },
    });
    if (!ward) throw new NotFoundException("Ward not found");

    const data: UpdateWardDto = {};

    if (dto.name !== undefined) {
      const name = String(dto.name).trim();
      if (!name) throw new BadRequestException("Name cannot be empty");
      data.name = name;
    }

    if (dto.code !== undefined) {
      const code = String(dto.code).trim();
      data.code = code || null;
    }

    if (dto.location !== undefined) data.location = dto.location;

    if (dto.departmentId !== undefined) {
      const departmentId = dto.departmentId || null;
      if (departmentId) {
        const department = await this.prisma.department.findFirst({
          where: { id: departmentId, tenantId },
        });
        if (!department) throw new NotFoundException("Department not found");
      }
      (data as any).departmentId = departmentId;
    }

    if (dto.isActive !== undefined && dto.isActive !== ward.isActive) {
      if (!dto.isActive) {
        const activeBeds = await this.prisma.bed.count({
          where: { wardId: id, status: "OCCUPIED" },
        });
        if (activeBeds > 0) {
          throw new ConflictException(
            `Cannot deactivate: ${activeBeds} occupied bed(s) in this ward`,
          );
        }
      }
      data.isActive = dto.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No changes to apply");
    }

    const updated = await this.prisma.ward.update({
      where: { id },
      data: data as any,
      include: { department: { select: { id: true, name: true } } },
    });

    await this.audit.log(tenantId, actorUserId, "Ward", id, "UPDATE", {
      previous: {
        name: ward.name,
        code: ward.code,
        location: ward.location,
        departmentId: ward.departmentId,
        isActive: ward.isActive,
      },
      changes: data,
    });

    return updated;
  }

  // Rooms
  async getRooms(tenantId: string, wardId?: string) {
    return this.prisma.room.findMany({
      where: { tenantId, wardId },
      include: {
        ward: { select: { id: true, name: true } },
        _count: { select: { beds: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async createRoom(tenantId: string, dto: CreateRoomDto) {
    return this.prisma.room.create({
      data: {
        tenantId,
        wardId: dto.wardId,
        name: dto.name,
        roomNumber: dto.roomNumber,
        roomType: dto.roomType as any,
        capacity: dto.capacity || 1,
        ratePerDay: dto.ratePerDay || 0,
      },
    });
  }

  // Beds
  async getBeds(
    tenantId: string,
    params: { wardId?: string; roomId?: string; status?: string },
  ) {
    return this.prisma.bed.findMany({
      where: {
        tenantId,
        wardId: params.wardId,
        roomId: params.roomId,
        status: params.status as any,
      },
      include: {
        room: { select: { id: true, name: true, roomNumber: true } },
        ward: { select: { id: true, name: true } },
        allocations: {
          where: { releasedAt: null },
          include: { admission: { include: { patient: true } } },
        },
      },
      orderBy: { bedNumber: "asc" },
    });
  }

  async createBed(tenantId: string, dto: CreateBedDto) {
    return this.prisma.bed.create({
      data: {
        tenantId,
        wardId: dto.wardId,
        roomId: dto.roomId,
        bedNumber: dto.bedNumber,
        ratePerDay: dto.ratePerDay || 0,
      },
    });
  }

  async updateBedStatus(tenantId: string, bedId: string, status: string) {
    const bed = await this.prisma.bed.findFirst({
      where: { id: bedId, tenantId },
    });
    if (!bed) throw new NotFoundException("Bed not found");

    return this.prisma.bed.update({
      where: { id: bedId },
      data: { status: status as any },
    });
  }

  async getBedBoard(tenantId: string) {
    const beds = await this.prisma.bed.findMany({
      where: { tenantId },
      include: {
        ward: { select: { id: true, name: true } },
        room: { select: { id: true, name: true, roomNumber: true } },
        allocations: {
          where: { releasedAt: null },
          include: {
            admission: {
              include: {
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
        },
      },
      orderBy: [{ ward: { name: "asc" } }, { bedNumber: "asc" }],
    });

    const statusCounts = beds.reduce(
      (acc, bed) => {
        acc[bed.status] = (acc[bed.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      beds,
      summary: {
        total: beds.length,
        available: beds.filter((b) => b.status === "AVAILABLE").length,
        occupied: beds.filter((b) => b.status === "OCCUPIED").length,
        reserved: beds.filter((b) => b.status === "RESERVED").length,
        cleaning: beds.filter((b) => b.status === "CLEANING").length,
        maintenance: beds.filter((b) => b.status === "MAINTENANCE").length,
        blocked: beds.filter((b) => b.status === "BLOCKED").length,
        occupancyRate: beds.length
          ? Math.round(
              (beds.filter((b) => b.status === "OCCUPIED").length /
                beds.length) *
                100,
            )
          : 0,
      },
      statusCounts,
    };
  }
}
