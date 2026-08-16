import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";
import { UserRole } from "@hms/shared";

const ROLE_VALUES = new Set(Object.values(UserRole));

function isRole(value: any): value is UserRole {
  return ROLE_VALUES.has(value);
}

function isUserStatus(value: any): value is
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "LOCKED"
  | "PENDING" {
  return ["ACTIVE", "INACTIVE", "SUSPENDED", "LOCKED", "PENDING"].includes(
    value,
  );
}

export interface CreateUserDto {
  email: string;
  password?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  phone?: string;
  role: string;
  tenantId?: string;
  departmentId?: string;
  isActive?: boolean;
  avatarUrl?: string;
}

export interface UpdateUserDto extends Partial<CreateUserDto> {}

export interface InviteUserDto {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  departmentId?: string;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    if (!dto.email || !String(dto.email).trim())
      throw new BadRequestException("Email is required");
    if (!dto.firstName || !String(dto.firstName).trim())
      throw new BadRequestException("First name is required");
    if (!dto.lastName || !String(dto.lastName).trim())
      throw new BadRequestException("Last name is required");
    if (!isRole(dto.role))
      throw new BadRequestException("Invalid user role");

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException("User with this email already exists");
    }

    const password = dto.password || this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        middleName: dto.middleName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role as any,
        tenantId: dto.tenantId || null,
        departmentId: dto.departmentId,
        isActive: dto.isActive ?? true,
        avatarUrl: dto.avatarUrl,
        status: dto.password ? "ACTIVE" : "PENDING",
        mustChangePassword: !dto.password,
      },
    });

    // Create staff profile for hospital staff
    if (dto.tenantId && dto.role !== "PLATFORM_SUPER_ADMIN") {
      await this.prisma.staffProfile
        .create({
          data: {
            tenantId: dto.tenantId,
            userId: user.id,
            departmentId: dto.departmentId,
            designation: dto.role,
            employmentStatus: "ACTIVE",
          },
        })
        .catch(() => {});

      // Create doctor profile if role is DOCTOR
      if (dto.role === "DOCTOR") {
        await this.prisma.doctorProfile
          .create({
            data: {
              tenantId: dto.tenantId,
              userId: user.id,
              departmentId: dto.departmentId,
              isActive: true,
            },
          })
          .catch(() => {});
      }
    }

    return { ...user, temporaryPassword: dto.password ? undefined : password };
  }

  async invite(tenantId: string, dto: InviteUserDto) {
    return this.create({
      ...dto,
      tenantId,
      isActive: true,
    });
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    tenantId?: string;
    role?: string;
    departmentId?: string;
    status?: string;
  }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;

    const where: any = { deletedAt: null };
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.role) where.role = params.role;
    if (params.departmentId) where.departmentId = params.departmentId;
    if (params.status) where.status = params.status;

    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: "insensitive" } },
        { lastName: { contains: params.search, mode: "insensitive" } },
        { email: { contains: params.search, mode: "insensitive" } },
        { phone: { contains: params.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          middleName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          isActive: true,
          avatarUrl: true,
          tenantId: true,
          departmentId: true,
          lastLoginAt: true,
          createdAt: true,
          doctorProfile: { select: { id: true, specialization: true } },
          staffProfile: { select: { id: true, employeeCode: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string, tenantId?: string) {
    const where: any = { id, deletedAt: null };
    if (tenantId) where.tenantId = tenantId;

    const user = await this.prisma.user.findFirst({
      where,
      include: {
        tenant: { select: { id: true, name: true, code: true } },
        department: true,
        doctorProfile: true,
        staffProfile: true,
      },
    });

    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async update(id: string, dto: UpdateUserDto, tenantId?: string) {
    const user = await this.findScoped(id, tenantId);
    if (!user) throw new NotFoundException("User not found");

    const allowedFields = [
      "firstName",
      "middleName",
      "lastName",
      "phone",
      "departmentId",
      "avatarUrl",
      "isActive",
    ];
    const data: any = {};
    for (const field of allowedFields) {
      if (dto[field as keyof UpdateUserDto] !== undefined) {
        data[field] = dto[field as keyof UpdateUserDto];
      }
    }

    if (dto.email) {
      if (!String(dto.email).trim())
        throw new BadRequestException("Email cannot be empty");
      data.email = dto.email.toLowerCase();
    }
    if (dto.role) {
      if (!isRole(dto.role)) throw new BadRequestException("Invalid user role");
      if (
        user.role === "PLATFORM_SUPER_ADMIN" ||
        dto.role === "PLATFORM_SUPER_ADMIN"
      ) {
        throw new BadRequestException(
          "Super admin role cannot be assigned or changed through this endpoint",
        );
      }
      data.role = dto.role;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        isActive: true,
        tenantId: true,
        departmentId: true,
      },
    });
  }

  async updateStatus(id: string, status: string, tenantId?: string) {
    const user = await this.findScoped(id, tenantId);
    if (!user) throw new NotFoundException("User not found");
    if (!isUserStatus(status)) throw new BadRequestException("Invalid status");

    return this.prisma.user.update({
      where: { id },
      data: {
        status: status as any,
        isActive: status === "ACTIVE" ? true : undefined,
      },
    });
  }

  async activate(id: string, tenantId?: string) {
    const user = await this.findScoped(id, tenantId);
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.user.update({
      where: { id },
      data: { status: "ACTIVE", isActive: true },
    });
  }

  async deactivate(id: string, tenantId?: string) {
    const user = await this.findScoped(id, tenantId);
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false, status: "INACTIVE" },
    });
  }

  async delete(id: string, tenantId?: string) {
    const user = await this.findScoped(id, tenantId);
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, status: "INACTIVE" },
    });
  }

  private async findScoped(id: string, tenantId?: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null, ...(tenantId ? { tenantId } : {}) },
    });
  }

  async getSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        deviceId: true,
        isActive: true,
        lastActivityAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    return this.prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { isActive: false, revokedAt: new Date() },
    });
  }

  private generateTemporaryPassword(): string {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
  }
}
