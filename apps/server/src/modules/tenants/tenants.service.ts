import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

const MAX_LIMIT = 100;

export interface CreateTenantDto {
  name: string;
  code: string;
  logoUrl?: string;
  description?: string;
  timezone?: string;
  currency?: string;
  language?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  panNumber?: string;
  vatNumber?: string;
  registrationNumber?: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminEmail?: string;
  adminPassword?: string;
}

export interface CreateBranchDto {
  name: string;
  code: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { code: dto.code.toUpperCase() },
    });

    if (existing) {
      throw new ConflictException(`Tenant code ${dto.code} already exists`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          code: dto.code.toUpperCase(),
          logoUrl: dto.logoUrl,
          description: dto.description,
          timezone: dto.timezone || "Asia/Kathmandu",
          currency: dto.currency || "NPR",
          language: dto.language || "en",
          status: "TRIAL",
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          district: dto.district,
          province: dto.province,
          country: dto.country || "Nepal",
          postalCode: dto.postalCode,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          panNumber: dto.panNumber,
          vatNumber: dto.vatNumber,
          registrationNumber: dto.registrationNumber,
        },
      });

      // Create default plan subscription
      const starterPlan = await tx.plan.findUnique({
        where: { name: "STARTER" },
      });

      if (starterPlan) {
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: starterPlan.id,
            status: "TRIAL",
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            price: 0,
            billingCycle: "MONTHLY",
          },
        });
      }

      // Create default branch
      await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: dto.name,
          code: "MAIN",
          address: dto.addressLine1,
          city: dto.city,
          phone: dto.phone,
          email: dto.email,
        },
      });

      // Create hospital admin user if provided
      let adminUser: any = null;
      let temporaryPassword: string | undefined;
      if (dto.adminEmail && dto.adminFirstName && dto.adminLastName) {
        const password = dto.adminPassword || this.generateTemporaryPassword();
        const passwordHash = await this.hashPassword(password);
        adminUser = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: dto.adminEmail.toLowerCase(),
            passwordHash,
            firstName: dto.adminFirstName,
            lastName: dto.adminLastName,
            role: "HOSPITAL_ADMIN",
            // Unauthenticated onboarding: the account is created PENDING so an
            // anonymous caller cannot obtain a live, usable admin account. A
            // platform admin must first activate it (login rejects PENDING).
            // Email is NOT claimed verified; the admin sets their password on
            // first sign-in after activation.
            status: "PENDING",
            emailVerifiedAt: null,
            mustChangePassword: true,
          },
          // Never expose passwordHash, twoFactorSecret, or other credential
          // fields back to the (possibly anonymous) onboarding caller.
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            mustChangePassword: true,
          },
        });
        if (!dto.adminPassword) temporaryPassword = password;
      }

      // Create default departments
      const departments = [
        "Emergency",
        "General Medicine",
        "General Surgery",
        "Neurosurgery",
        "Orthopedics",
        "Pediatrics",
        "Gynecology",
        "Radiology",
        "Laboratory",
        "Pharmacy",
        "ICU",
        "NICU",
        "OT",
        "Physiotherapy",
        "Administration",
        "Accounts",
        "HR",
      ];

      for (const dept of departments) {
        await tx.department.create({
          data: {
            tenantId: tenant.id,
            name: dept,
            code: dept.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
          },
        });
      }

      return { tenant, adminUser, temporaryPassword };
    });

    return result;
  }

  async findAll(
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
    },
    scopeTenantId?: string,
  ) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

    const where: any = { deletedAt: null };
    // Non-super admins only ever see their own hospital in the registry.
    if (scopeTenantId) where.id = scopeTenantId;
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: "insensitive" } },
        { code: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: "desc" },
          },
          _count: { select: { users: true, patients: true, branches: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        branches: true,
        departments: true,
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: "desc" },
        },
        featureFlags: { include: { flag: true } },
        settings: true,
        _count: {
          select: {
            users: true,
            patients: true,
            appointments: true,
            invoices: true,
          },
        },
      },
    });

    if (!tenant || tenant.deletedAt) {
      throw new NotFoundException("Tenant not found");
    }

    return tenant;
  }

  async update(id: string, dto: Partial<CreateTenantDto>) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException("Tenant not found");

    const {
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPassword,
      ...updateData
    } = dto;

    return this.prisma.tenant.update({
      where: { id },
      data: updateData,
    });
  }

  async updateStatus(id: string, status: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException("Tenant not found");

    return this.prisma.tenant.update({
      where: { id },
      data: { status: status as any },
    });
  }

  async archive(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException("Tenant not found");

    return this.prisma.tenant.update({
      where: { id },
      data: { deletedAt: new Date(), status: "ARCHIVED" },
    });
  }

  async createBranch(tenantId: string, dto: CreateBranchDto) {
    const existing = await this.prisma.branch.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code.toUpperCase() } },
    });
    if (existing) throw new ConflictException("Branch code already exists");

    return this.prisma.branch.create({
      data: {
        tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        address: dto.address,
        city: dto.city,
        phone: dto.phone,
        email: dto.email,
      },
    });
  }

  async getBranches(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
  }

  async getDepartments(tenantId: string) {
    return this.prisma.department.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async getUsage(tenantId: string) {
    const [
      users,
      patients,
      appointments,
      invoices,
      branches,
      departments,
      documents,
    ] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.patient.count({ where: { tenantId } }),
      this.prisma.appointment.count({ where: { tenantId } }),
      this.prisma.invoice.count({ where: { tenantId } }),
      this.prisma.branch.count({ where: { tenantId } }),
      this.prisma.department.count({ where: { tenantId } }),
      this.prisma.patientDocument.count({ where: { tenantId } }),
    ]);

    return {
      users,
      patients,
      appointments,
      invoices,
      branches,
      departments,
      documents,
      storageUsedMB: Math.round(documents * 0.1),
    };
  }

  private async hashPassword(password: string): Promise<string> {
    const bcrypt = await import("bcryptjs");
    return bcrypt.hash(password, 12);
  }

  private generateTemporaryPassword(): string {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
    const buf = crypto.randomBytes(16);
    let password = "";
    for (let i = 0; i < 16; i++) {
      password += chars[buf[i] % chars.length];
    }
    return password;
  }
}
