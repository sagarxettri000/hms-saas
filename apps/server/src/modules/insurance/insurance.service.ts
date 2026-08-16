import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateProviderDto {
  name: string;
  code?: string;
  type?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface CreatePolicyDto {
  patientId: string;
  providerId: string;
  policyNumber: string;
  groupNumber?: string;
  memberId?: string;
  coverageLimit?: number;
  startDate?: Date | string;
  expiryDate?: Date | string;
  coverageDetails?: any;
}

export interface CreateClaimDto {
  patientId: string;
  policyId?: string;
  providerId?: string;
  invoiceId?: string;
  claimAmount: number;
  notes?: string;
}

@Injectable()
export class InsuranceService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Providers ----------

  async findProviders(tenantId: string) {
    return this.prisma.insuranceProvider.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
  }

  async createProvider(tenantId: string, dto: CreateProviderDto) {
    if (!dto.name || !String(dto.name).trim())
      throw new BadRequestException("Provider name is required");
    const { tenantId: _t, ...clean } = dto as any;
    return this.prisma.insuranceProvider.create({
      data: { tenantId, ...clean },
    });
  }

  async updateProvider(
    tenantId: string,
    id: string,
    dto: Partial<CreateProviderDto>,
  ) {
    const existing = await this.prisma.insuranceProvider.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Provider not found");
    const { tenantId: _t, id: _id, ...clean } = dto as any;
    return this.prisma.insuranceProvider.update({
      where: { id },
      data: clean,
    });
  }

  // ---------- Policies ----------

  async findPolicies(tenantId: string, patientId?: string) {
    return this.prisma.insurancePolicy.findMany({
      where: { tenantId, ...(patientId ? { patientId } : {}) },
      include: {
        provider: true,
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPolicy(tenantId: string, dto: CreatePolicyDto) {
    const provider = await this.prisma.insuranceProvider.findFirst({
      where: { id: dto.providerId, tenantId },
    });
    if (!provider) throw new NotFoundException("Provider not found");
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    if (!dto.policyNumber || !String(dto.policyNumber).trim())
      throw new BadRequestException("Policy number is required");

    const startDate = dto.startDate ? new Date(dto.startDate) : undefined;
    const expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : undefined;
    if (
      startDate &&
      expiryDate &&
      !Number.isNaN(startDate.getTime()) &&
      !Number.isNaN(expiryDate.getTime()) &&
      expiryDate < startDate
    ) {
      throw new BadRequestException("Expiry date cannot be before start date");
    }

    return this.prisma.insurancePolicy.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        providerId: dto.providerId,
        policyNumber: dto.policyNumber,
        groupNumber: dto.groupNumber,
        memberId: dto.memberId,
        coverageLimit: dto.coverageLimit,
        startDate,
        expiryDate,
        coverageDetails: dto.coverageDetails,
      },
    });
  }

  async updatePolicy(
    tenantId: string,
    id: string,
    dto: Partial<CreatePolicyDto>,
  ) {
    const existing = await this.prisma.insurancePolicy.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException("Policy not found");
    const { tenantId: _t, id: _id, ...rest } = dto as any;
    const data: any = { ...rest };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.expiryDate) data.expiryDate = new Date(dto.expiryDate);
    return this.prisma.insurancePolicy.update({ where: { id }, data });
  }

  // ---------- Claims ----------

  async findClaims(tenantId: string, patientId?: string) {
    return this.prisma.insuranceClaim.findMany({
      where: { tenantId, ...(patientId ? { patientId } : {}) },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
        provider: true,
        policy: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createClaim(tenantId: string, dto: CreateClaimDto, userId?: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    const policy = await this.prisma.insurancePolicy.findFirst({
      where: { id: dto.policyId, tenantId, patientId: dto.patientId },
    });
    if (!policy)
      throw new NotFoundException("Policy not found for this patient");
    if (dto.providerId) {
      const provider = await this.prisma.insuranceProvider.findFirst({
        where: { id: dto.providerId, tenantId },
      });
      if (!provider) throw new NotFoundException("Provider not found");
    }
    const claimAmount = Number(dto.claimAmount);
    if (!Number.isFinite(claimAmount) || claimAmount <= 0)
      throw new BadRequestException("Claim amount must be a positive number");

    const claimNumber = await this.generateClaimNumber(tenantId);
    return this.prisma.insuranceClaim.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        policyId: dto.policyId,
        providerId: dto.providerId || policy.providerId,
        invoiceId: dto.invoiceId,
        claimNumber,
        claimAmount,
        notes: dto.notes,
        submittedAt: new Date(),
        status: "SUBMITTED" as any,
      },
    });
  }

  async updateClaimStatus(
    tenantId: string,
    id: string,
    body: { status: string; approvedAmount?: number; rejectionReason?: string },
    userId?: string,
  ) {
    const claim = await this.prisma.insuranceClaim.findFirst({
      where: { id, tenantId },
    });
    if (!claim) throw new NotFoundException("Claim not found");

    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      SUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
      UNDER_REVIEW: ["APPROVED", "REJECTED"],
      APPROVED: ["SETTLED"],
      SETTLED: [],
      REJECTED: [],
    };
    const allowed = ALLOWED_TRANSITIONS[claim.status as string] || [];
    if (!allowed.includes(body.status)) {
      throw new BadRequestException(
        `Cannot transition claim from ${claim.status} to ${body.status}`,
      );
    }

    const data: any = { status: body.status };
    if (body.status === "APPROVED") {
      if (body.approvedAmount !== undefined) {
        const approved = Number(body.approvedAmount);
        if (!Number.isFinite(approved) || approved < 0)
          throw new BadRequestException("Approved amount must be a valid number");
        if (approved > Number(claim.claimAmount))
          throw new BadRequestException(
            "Approved amount cannot exceed claim amount",
          );
        data.approvedAmount = approved;
      }
      data.approvedAt = new Date();
      data.approvedBy = userId;
    }
    if (body.status === "REJECTED") {
      data.rejectedAt = new Date();
      data.rejectionReason = body.rejectionReason;
    }
    if (body.status === "SETTLED") {
      data.settledAt = new Date();
    }
    return this.prisma.insuranceClaim.update({ where: { id }, data });
  }

  private async generateClaimNumber(tenantId: string): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await this.prisma.insuranceClaim.findFirst({
      where: { tenantId, claimNumber: { startsWith: `CLM-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { claimNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.claimNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `CLM-${ymd}-${String(seq).padStart(4, "0")}`;
  }
}
