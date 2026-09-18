import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreatePackageDto {
  name: string;
  description?: string;
  price?: number;
  durationDays?: number;
  discountPercent?: number;
  benefits?: any;
}

export interface CreateMembershipDto {
  patientId: string;
  packageId?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  discountPercent?: number;
  isFamily?: boolean;
}

export interface CreateFamilyMemberDto {
  patientId?: string;
  name: string;
  relationship: string;
  dateOfBirth?: Date | string;
  gender?: string;
}

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async findPackages(tenantId: string) {
    return this.prisma.membershipPackage.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
  }

  async createPackage(tenantId: string, dto: CreatePackageDto) {
    if (!dto.name || !String(dto.name).trim())
      throw new BadRequestException("Package name is required");
    const { tenantId: _t, ...clean } = dto as any;
    return this.prisma.membershipPackage.create({
      data: { tenantId, ...clean },
    });
  }

  async updatePackage(
    tenantId: string,
    id: string,
    dto: Partial<CreatePackageDto>,
  ) {
    const existing = await this.prisma.membershipPackage.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Package not found");
    const { tenantId: _t, id: _id, ...clean } = dto as any;
    return this.prisma.membershipPackage.update({
      where: { id },
      data: clean,
    });
  }

  async findMemberships(tenantId: string, patientId?: string) {
    return this.prisma.membership.findMany({
      where: { tenantId, ...(patientId ? { patientId } : {}) },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        package: true,
        familyMembers: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createMembership(tenantId: string, dto: CreateMembershipDto) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    let pkg: any = null;
    if (dto.packageId) {
      pkg = await this.prisma.membershipPackage.findFirst({
        where: { id: dto.packageId, tenantId },
      });
      if (!pkg) throw new NotFoundException("Membership package not found");
    }

    const membershipNumber = await this.generateMembershipNumber(tenantId);

    let endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (!endDate) {
      const durationDays = pkg?.durationDays || 365;
      const start = dto.startDate ? new Date(dto.startDate) : new Date();
      endDate = new Date(start);
      endDate.setDate(endDate.getDate() + durationDays);
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException("Invalid start or end date");
    }
    if (endDate < startDate)
      throw new BadRequestException("End date cannot be before start date");

    return this.prisma.membership.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        packageId: dto.packageId,
        membershipNumber,
        startDate,
        endDate,
        discountPercent: dto.discountPercent,
        isFamily: dto.isFamily || false,
      },
    });
  }

  async addFamilyMember(
    tenantId: string,
    membershipId: string,
    dto: CreateFamilyMemberDto,
  ) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
    });
    if (!membership) throw new NotFoundException("Membership not found");
    if (dto.patientId) {
      const patient = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, tenantId, deletedAt: null },
      });
      if (!patient) throw new NotFoundException("Patient not found");
    }
    return this.prisma.membershipFamily.create({
      data: {
        tenantId,
        membershipId,
        patientId: dto.patientId,
        name: dto.name,
        relationship: dto.relationship,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender as any,
      },
    });
  }

  async getMembershipByNumber(tenantId: string, membershipNumber: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { tenantId, membershipNumber },
      include: { patient: true, package: true, familyMembers: true },
    });
    if (!membership) throw new NotFoundException("Membership not found");
    return membership;
  }

  async updateMembershipStatus(tenantId: string, id: string, status: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id, tenantId },
    });
    if (!membership) throw new NotFoundException("Membership not found");
    const ALLOWED = ["ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED"];
    if (!ALLOWED.includes(status))
      throw new BadRequestException("Invalid membership status");
    return this.prisma.membership.update({ where: { id }, data: { status } });
  }

  private async generateMembershipNumber(tenantId: string): Promise<string> {
    const latest = await this.prisma.membership.findFirst({
      where: { tenantId, membershipNumber: { startsWith: "MEM-" } },
      orderBy: { createdAt: "desc" },
      select: { membershipNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.membershipNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `MEM-${String(seq).padStart(6, "0")}`;
  }
}
