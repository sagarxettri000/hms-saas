import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateDepartmentDto {
  name: string;
  code: string;
  description?: string;
  parentId?: string;
  branchId?: string;
}

export interface CreateWardDto {
  name: string;
  code?: string;
  location?: string;
  departmentId?: string;
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
  constructor(private readonly prisma: PrismaService) {}

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

  async update(
    tenantId: string,
    id: string,
    dto: Partial<CreateDepartmentDto>,
  ) {
    const department = await this.prisma.department.findFirst({
      where: { id, tenantId },
    });
    if (!department) throw new NotFoundException("Department not found");

    const { tenantId: _t, ...fields } = dto as any;
    return this.prisma.department.update({
      where: { id },
      data: fields,
    });
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
