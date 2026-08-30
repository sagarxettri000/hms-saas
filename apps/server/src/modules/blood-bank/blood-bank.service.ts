import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateDonorDto {
  name: string;
  bloodGroup: string;
  phone: string;
  email?: string;
  address?: string;
  gender?: string;
  dateOfBirth?: Date | string;
  weight?: number;
  medicalHistory?: any;
}

export interface RegisterUnitDto {
  donorId?: string;
  bloodGroup: string;
  component?: string;
  collectionDate?: Date | string;
  expiryDate?: Date | string;
  storageLocation?: string;
  testResults?: any;
  tested?: boolean;
}

@Injectable()
export class BloodBankService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Donors ----------

  async findDonors(tenantId: string, bloodGroup?: string) {
    return this.prisma.bloodDonor.findMany({
      where: {
        tenantId,
        ...(bloodGroup ? { bloodGroup: bloodGroup as any } : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  async createDonor(tenantId: string, dto: CreateDonorDto) {
    const donorCode = await this.generateCode(
      tenantId,
      "DNR",
      "bloodDonor",
      "donorCode",
    );
    return this.prisma.bloodDonor.create({
      data: {
        tenantId,
        name: dto.name,
        bloodGroup: dto.bloodGroup as any,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        gender: dto.gender as any,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        weight: dto.weight,
        medicalHistory: dto.medicalHistory,
        donorCode,
      },
    });
  }

  async updateDonor(
    tenantId: string,
    id: string,
    dto: Partial<CreateDonorDto>,
  ) {
    const donor = await this.prisma.bloodDonor.findFirst({
      where: { id, tenantId },
    });
    if (!donor) throw new NotFoundException("Donor not found");
    const { tenantId: _t, ...fields } = dto as any;
    return this.prisma.bloodDonor.update({
      where: { id },
      data: {
        ...fields,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        bloodGroup: dto.bloodGroup as any,
        gender: dto.gender as any,
      },
    });
  }

  // ---------- Units ----------

  private readonly BLOOD_GROUPS = [
    "A_POS",
    "A_NEG",
    "B_POS",
    "B_NEG",
    "AB_POS",
    "AB_NEG",
    "O_POS",
    "O_NEG",
    "UNKNOWN",
  ];

  async registerUnit(tenantId: string, dto: RegisterUnitDto, userId?: string) {
    if (!dto.bloodGroup || !this.BLOOD_GROUPS.includes(dto.bloodGroup))
      throw new BadRequestException("Invalid blood group");

    if (!dto.expiryDate) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 35);
      dto.expiryDate = expiry.toISOString();
    }

    let donor: any = null;
    if (dto.donorId) {
      donor = await this.prisma.bloodDonor.findFirst({
        where: { id: dto.donorId, tenantId },
      });
      if (!donor) throw new NotFoundException("Donor not found");
    }

    return this.prisma.$transaction(async (tx) => {
      const unitNumber = await this.generateUnitNumber(tenantId, tx);
      const unit = await tx.bloodUnit.create({
        data: {
          tenantId,
          donorId: dto.donorId,
          unitNumber,
          bloodGroup: dto.bloodGroup as any,
          component: dto.component || "WHOLE_BLOOD",
          collectionDate: dto.collectionDate
            ? new Date(dto.collectionDate)
            : undefined,
          expiryDate: new Date(dto.expiryDate as any),
          storageLocation: dto.storageLocation,
          tested: dto.tested || false,
          testResults: dto.testResults,
          issuedBy: undefined,
        },
      });

      if (donor) {
        await tx.bloodDonor.update({
          where: { id: donor.id },
          data: {
            totalDonations: donor.totalDonations + 1,
            lastDonationDate: new Date(),
          },
        });
      }

      return unit;
    });
  }

  async findUnits(
    tenantId: string,
    query: {
      status?: string;
      bloodGroup?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (query.bloodGroup) where.bloodGroup = query.bloodGroup as any;

    const [data, total] = await Promise.all([
      this.prisma.bloodUnit.findMany({
        where,
        include: { donor: true },
        orderBy: { expiryDate: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bloodUnit.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getStock(tenantId: string) {
    const now = new Date();
    const units = await this.prisma.bloodUnit.findMany({
      where: {
        tenantId,
        status: "AVAILABLE",
        expiryDate: { gt: now },
      },
      select: { bloodGroup: true, component: true },
    });

    const stock: Record<string, any> = {};
    for (const u of units) {
      const key = `${u.bloodGroup}:${u.component}`;
      if (!stock[key])
        stock[key] = {
          bloodGroup: u.bloodGroup,
          component: u.component,
          units: 0,
        };
      stock[key].units += 1;
    }
    return Object.values(stock);
  }

  async issueUnit(
    tenantId: string,
    id: string,
    body: { issuedTo?: string; crossMatchTo?: string },
    userId?: string,
  ) {
    const unit = await this.prisma.bloodUnit.findFirst({
      where: { id, tenantId },
    });
    if (!unit) throw new NotFoundException("Unit not found");
    if (unit.status !== "AVAILABLE")
      throw new BadRequestException("Unit is not available");
    if (unit.expiryDate <= new Date())
      throw new BadRequestException("Unit has expired and cannot be issued");

    return this.prisma.bloodUnit.update({
      where: { id },
      data: {
        status: "ISSUED",
        issuedTo: body.issuedTo,
        crossMatchTo: body.crossMatchTo,
        issuedAt: new Date(),
        issuedBy: userId,
      },
    });
  }

  async discardUnit(tenantId: string, id: string, reason: string) {
    const unit = await this.prisma.bloodUnit.findFirst({
      where: { id, tenantId },
    });
    if (!unit) throw new NotFoundException("Unit not found");
    if (!reason || !String(reason).trim())
      throw new BadRequestException("Discard reason is required");
    const results = (unit.testResults as any) || {};
    return this.prisma.bloodUnit.update({
      where: { id },
      data: {
        status: "DISCARDED",
        storageLocation: unit.storageLocation,
        testResults: { ...results, discardReason: reason, discardedAt: new Date().toISOString() },
      },
    });
  }

  private async generateUnitNumber(
    tenantId: string,
    tx?: any,
  ): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const client = tx || this.prisma;
    const latest = await client.bloodUnit.findFirst({
      where: { tenantId, unitNumber: { startsWith: `BLD-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { unitNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.unitNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `BLD-${ymd}-${String(seq).padStart(4, "0")}`;
  }

  private async generateCode(
    tenantId: string,
    prefix: string,
    model: "bloodDonor",
    field: string,
  ): Promise<string> {
    const latest: any = await (this.prisma as any)[model].findFirst({
      where: { tenantId, [field]: { startsWith: `${prefix}-` } },
      orderBy: { createdAt: "desc" },
      select: { [field]: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest[field].split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `${prefix}-${String(seq).padStart(5, "0")}`;
  }
}
