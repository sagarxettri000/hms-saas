import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { UserRole } from "@hms/shared";

const MAX_LIMIT = 100;
const ROLE_VALUES = new Set(Object.values(UserRole));

function isRole(value: any): value is UserRole {
  return ROLE_VALUES.has(value);
}

function isUserStatus(
  value: any,
): value is "ACTIVE" | "INACTIVE" | "SUSPENDED" | "LOCKED" | "PENDING" {
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
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  private static readonly ROLE_RANK: Record<string, number> = {
    PLATFORM_SUPER_ADMIN: 100,
    HOSPITAL_OWNER: 80,
    HOSPITAL_ADMIN: 70,
    IT_ADMIN: 60,
    DEPARTMENT_HEAD: 50,
    HR_MANAGER: 45,
    FINANCE_MANAGER: 40,
    INVENTORY_MANAGER: 40,
    QUALITY_MANAGER: 40,
    PATHOLOGIST: 30,
    RADIOLOGIST: 30,
    DOCTOR: 30,
    ANESTHETIST: 30,
    RECEPTION_SUPERVISOR: 25,
    WARD_INCHARGE: 25,
    PURCHASE_OFFICER: 22,
    NURSE: 20,
    RECEPTIONIST: 20,
    LAB_TECHNICIAN: 20,
    RADIOLOGY_TECHNICIAN: 20,
    PHARMACIST: 20,
    INSURANCE_OFFICER: 20,
    OT_NURSE: 20,
    OT_TECHNICIAN: 20,
    STORE_KEEPER: 15,
    ICU_STAFF: 15,
    EMERGENCY_STAFF: 15,
    AMBULANCE_STAFF: 15,
    BLOOD_BANK_STAFF: 15,
    BIOMEDICAL_ENGINEER: 15,
    AUDITOR: 18,
  };

  private assertCanManageRoles(actorRole: string, targetRole: string) {
    const managers = [
      "PLATFORM_SUPER_ADMIN",
      "HOSPITAL_OWNER",
      "HOSPITAL_ADMIN",
      "IT_ADMIN",
      "HR_MANAGER",
      "DEPARTMENT_HEAD",
    ];
    if (!managers.includes(actorRole)) {
      throw new BadRequestException(
        "You do not have permission to assign user roles",
      );
    }
    if (targetRole && targetRole === "PLATFORM_SUPER_ADMIN") {
      throw new BadRequestException(
        "Super admin role cannot be assigned through this endpoint",
      );
    }
    const actorRank = UsersService.ROLE_RANK[actorRole] ?? 0;
    const targetRank = UsersService.ROLE_RANK[targetRole] ?? 0;
    if (targetRank > actorRank) {
      throw new BadRequestException(
        "Cannot assign a role more privileged than your own",
      );
    }
  }

  async create(dto: CreateUserDto, actorRole?: string) {
    if (!dto.email || !String(dto.email).trim())
      throw new BadRequestException("Email is required");
    if (!dto.firstName || !String(dto.firstName).trim())
      throw new BadRequestException("First name is required");
    if (!dto.lastName || !String(dto.lastName).trim())
      throw new BadRequestException("Last name is required");
    if (!isRole(dto.role)) throw new BadRequestException("Invalid user role");
    this.assertCanManageRoles(actorRole || "", dto.role);

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
        .catch((err) => this.logger.warn("staffProfile create failed", err));

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
          .catch((err: unknown) =>
            this.logger.warn("doctorProfile create failed", err),
          );
      }
    }

    const { passwordHash: _ph, ...safeUser } = user;
    return {
      ...safeUser,
      temporaryPassword: dto.password ? undefined : password,
    };
  }

  async invite(tenantId: string, dto: InviteUserDto, actorRole?: string) {
    return this.create(
      {
        ...dto,
        tenantId,
        isActive: true,
      },
      actorRole,
    );
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
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

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

  async getStats(tenantId?: string) {
    const where: any = { deletedAt: null };
    if (tenantId) where.tenantId = tenantId;
    const [total, active] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...where, isActive: true } }),
    ]);
    return { total, active };
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
    const { passwordHash: _ph, ...safeUser } = user;
    return safeUser;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    tenantId?: string,
    actorRole?: string,
  ) {
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
      this.assertCanManageRoles(actorRole || "", dto.role);
      data.role = dto.role;
    }

    if (dto.password) {
      if (String(dto.password).length < 8) {
        throw new BadRequestException("Password must be at least 8 characters");
      }
      data.passwordHash = await bcrypt.hash(String(dto.password), 12);
      data.mustChangePassword = false;
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
      password += chars[randomInt(chars.length)];
    }
    return password;
  }
}
