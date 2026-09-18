import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { Prisma } from "@prisma/client";

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

/** Canonical BloodGroup enum values (Prisma schema). */
const BLOOD_GROUPS = [
  "A_POS",
  "A_NEG",
  "B_POS",
  "B_NEG",
  "AB_POS",
  "AB_NEG",
  "O_POS",
  "O_NEG",
  "UNKNOWN",
] as const;

/**
 * Accept the many spellings clients have used for a blood group
 * ("O+", "o positive", "AB-", "a_neg", "O POS"...) and map them onto the
 * canonical enum. The UI now sends enum values, but older saved forms,
 * integrations and manual API calls still send display forms — normalizing
 * here keeps the DB enum authoritative while being forgiving at the edge.
 */
function normalizeBloodGroup(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string")
    throw new BadRequestException("Invalid blood group");
  const s = raw
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "_");
  if ((BLOOD_GROUPS as readonly string[]).includes(s)) return s;
  const compact = s.replace(/_/g, "");
  const abo = ["AB", "A", "B", "O"].find((g) => compact.startsWith(g));
  if (!abo) return compact === "UNKNOWN" ? "UNKNOWN" : undefined;
  const sign = compact.slice(abo.length);
  if (sign === "+" || sign === "POS" || sign === "POSITIVE")
    return `${abo}_POS`;
  if (sign === "-" || sign === "NEG" || sign === "NEGATIVE")
    return `${abo}_NEG`;
  return undefined;
}

function normalizeGender(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const s = String(raw).trim().toUpperCase();
  return ["MALE", "FEMALE", "OTHER"].includes(s) ? s : undefined;
}

const COMPONENTS = ["WHOLE_BLOOD", "PACKED_RBC", "PLATELETS", "PLASMA", "CRYO"];

function normalizeComponent(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "WHOLE_BLOOD";
  const s = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return COMPONENTS.includes(s) ? s : "WHOLE_BLOOD";
}

@Injectable()
export class BloodBankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Donors ----------

  async findDonors(
    tenantId: string,
    query: { bloodGroup?: string; search?: string },
  ) {
    const where: any = { tenantId };
    const bloodGroup = normalizeBloodGroup(query.bloodGroup);
    if (bloodGroup) where.bloodGroup = bloodGroup;
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" as const } },
        { phone: { contains: search } },
        { donorCode: { contains: search, mode: "insensitive" as const } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.bloodDonor.findMany({ where, orderBy: { name: "asc" } }),
      this.prisma.bloodDonor.count({ where }),
    ]);
    // Shape mirrors the paginated list contract EntityPage understands.
    return { data, total };
  }

  async createDonor(
    tenantId: string,
    dto: CreateDonorDto,
    actorUserId?: string,
  ) {
    if (!dto.name || !String(dto.name).trim())
      throw new BadRequestException("Donor name is required");
    if (!dto.phone || !String(dto.phone).trim())
      throw new BadRequestException("Donor phone is required");
    const bloodGroup = normalizeBloodGroup(dto.bloodGroup);
    if (!bloodGroup) throw new BadRequestException("Invalid blood group");

    const donorCode = await this.generateCode(
      tenantId,
      "DNR",
      "bloodDonor",
      "donorCode",
    );
    const donor = await this.prisma.bloodDonor.create({
      data: {
        tenantId,
        name: String(dto.name).trim(),
        bloodGroup: bloodGroup as any,
        phone: String(dto.phone).trim(),
        email: dto.email || undefined,
        address: dto.address || undefined,
        gender: normalizeGender(dto.gender) as any,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        weight:
          dto.weight !== undefined && dto.weight !== null
            ? Number(dto.weight)
            : undefined,
        medicalHistory: dto.medicalHistory,
        donorCode,
      },
    });

    await this.audit.log(
      tenantId,
      actorUserId,
      "BloodDonor",
      donor.id,
      "CREATE",
      {
        name: donor.name,
        bloodGroup: donor.bloodGroup,
        donorCode: donor.donorCode,
      },
    );
    return donor;
  }

  async getDonor(tenantId: string, id: string) {
    const donor = await this.prisma.bloodDonor.findFirst({
      where: { id, tenantId },
    });
    if (!donor) throw new NotFoundException("Donor not found");
    return donor;
  }

  async updateDonor(
    tenantId: string,
    id: string,
    dto: Partial<CreateDonorDto> & { isActive?: boolean },
    actorUserId?: string,
  ) {
    const donor = await this.prisma.bloodDonor.findFirst({
      where: { id, tenantId },
    });
    if (!donor) throw new NotFoundException("Donor not found");

    // Explicit whitelist — never spread client payloads.
    const data: any = {};
    if (dto.name !== undefined) {
      if (!String(dto.name).trim())
        throw new BadRequestException("Donor name is required");
      data.name = String(dto.name).trim();
    }
    if (dto.phone !== undefined) {
      if (!String(dto.phone).trim())
        throw new BadRequestException("Donor phone is required");
      data.phone = String(dto.phone).trim();
    }
    if (dto.bloodGroup !== undefined) {
      const bg = normalizeBloodGroup(dto.bloodGroup);
      if (!bg) throw new BadRequestException("Invalid blood group");
      data.bloodGroup = bg;
    }
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.address !== undefined) data.address = dto.address || null;
    if (dto.gender !== undefined)
      data.gender = normalizeGender(dto.gender) ?? null;
    if (dto.dateOfBirth !== undefined)
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (dto.weight !== undefined) {
      const w = dto.weight as unknown;
      const n = Number(w);
      data.weight = w !== null && w !== "" && Number.isFinite(n) ? n : null;
    }
    if (dto.isActive !== undefined) data.isActive = Boolean(dto.isActive);
    if (dto.medicalHistory !== undefined)
      data.medicalHistory = dto.medicalHistory;

    if (Object.keys(data).length === 0)
      throw new BadRequestException("No changes to apply");

    const updated = await this.prisma.bloodDonor.update({
      where: { id },
      data,
    });

    await this.audit.log(tenantId, actorUserId, "BloodDonor", id, "UPDATE", {
      previous: {
        name: donor.name,
        bloodGroup: donor.bloodGroup,
        phone: donor.phone,
        email: donor.email,
        gender: donor.gender,
        isActive: donor.isActive,
      },
      changes: data,
    });
    return updated;
  }

  // ---------- Units ----------

  async registerUnit(
    tenantId: string,
    dto: RegisterUnitDto,
    actorUserId?: string,
  ) {
    const bloodGroup = normalizeBloodGroup(dto.bloodGroup);
    if (!bloodGroup) throw new BadRequestException("Invalid blood group");
    const component = normalizeComponent(dto.component);

    let expiry: Date;
    if (dto.expiryDate) {
      expiry = new Date(dto.expiryDate);
      if (Number.isNaN(expiry.getTime()))
        throw new BadRequestException("Invalid expiry date");
    } else {
      expiry = new Date();
      expiry.setDate(expiry.getDate() + 35);
    }

    let donor: { id: string; totalDonations: number } | null = null;
    if (dto.donorId) {
      donor = await this.prisma.bloodDonor.findFirst({
        where: { id: dto.donorId, tenantId },
      });
      if (!donor) throw new NotFoundException("Donor not found");
    }

    // The unit number is generated from a max+1 sequence, so two concurrent
    // registrations can race to the same number. The (tenantId, unitNumber)
    // unique constraint arbitrates: the loser retries with the next number.
    const MAX_ATTEMPTS = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const unitNumber = await this.generateUnitNumber(tenantId, tx);
          const unit = await tx.bloodUnit.create({
            data: {
              tenantId,
              donorId: donor?.id,
              unitNumber,
              bloodGroup: bloodGroup as any,
              component,
              collectionDate: dto.collectionDate
                ? new Date(dto.collectionDate)
                : undefined,
              expiryDate: expiry,
              storageLocation: dto.storageLocation || undefined,
              tested: Boolean(dto.tested),
              testResults: dto.testResults,
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

          await this.audit.log(
            tenantId,
            actorUserId,
            "BloodUnit",
            unit.id,
            "CREATE",
            {
              unitNumber: unit.unitNumber,
              bloodGroup: unit.bloodGroup,
              component: unit.component,
              donorId: donor?.id,
              expiryDate: unit.expiryDate,
            },
          );

          return unit;
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          lastError = e;
          continue;
        }
        throw e;
      }
    }
    throw new BadRequestException(
      "Could not allocate a unique unit number, please retry",
    );
  }

  async findUnits(
    tenantId: string,
    query: {
      status?: string;
      bloodGroup?: string;
      component?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 200);

    const where: any = { tenantId };
    const status = query.status?.trim().toUpperCase();
    if (status) {
      const valid = [
        "AVAILABLE",
        "RESERVED",
        "ISSUED",
        "EXPIRED",
        "DISCARDED",
        "RETURNED",
      ];
      if (!valid.includes(status))
        throw new BadRequestException("Invalid status filter");
      where.status = status;
    }
    const bloodGroup = normalizeBloodGroup(query.bloodGroup);
    if (bloodGroup) where.bloodGroup = bloodGroup;
    const component = normalizeComponent(query.component);
    if (query.component) where.component = component;
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { unitNumber: { contains: search, mode: "insensitive" as const } },
        { storageLocation: { contains: search, mode: "insensitive" as const } },
      ];
    }

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

    const updated = await this.prisma.bloodUnit.update({
      where: { id },
      data: {
        status: "ISSUED",
        issuedTo: body.issuedTo,
        crossMatchTo: body.crossMatchTo,
        issuedAt: new Date(),
        issuedBy: userId,
      },
    });

    await this.audit.log(tenantId, userId, "BloodUnit", id, "UPDATE", {
      action: "ISSUE",
      unitNumber: unit.unitNumber,
      issuedTo: body.issuedTo,
      crossMatchTo: body.crossMatchTo,
    });
    return updated;
  }

  async discardUnit(
    tenantId: string,
    id: string,
    reason: string,
    actorUserId?: string,
  ) {
    const unit = await this.prisma.bloodUnit.findFirst({
      where: { id, tenantId },
    });
    if (!unit) throw new NotFoundException("Unit not found");
    if (!reason || !String(reason).trim())
      throw new BadRequestException("Discard reason is required");
    const results = (unit.testResults as any) || {};
    const updated = await this.prisma.bloodUnit.update({
      where: { id },
      data: {
        status: "DISCARDED",
        testResults: {
          ...results,
          discardReason: reason,
          discardedAt: new Date().toISOString(),
        },
      },
    });

    await this.audit.log(tenantId, actorUserId, "BloodUnit", id, "UPDATE", {
      action: "DISCARD",
      unitNumber: unit.unitNumber,
      reason,
    });
    return updated;
  }

  private async generateUnitNumber(
    tenantId: string,
    tx?: any,
  ): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const client = tx || this.prisma;
    const latest = await client.bloodUnit.findFirst({
      where: { tenantId, unitNumber: { startsWith: `BLD-${ymd}` } },
      orderBy: { unitNumber: "desc" },
      select: { unitNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.unitNumber.split("-");
      const n = parseInt(parts[parts.length - 1], 10);
      seq = Number.isFinite(n) ? n + 1 : 1;
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
      const n = parseInt(parts[parts.length - 1], 10);
      seq = Number.isFinite(n) ? n + 1 : 1;
    }
    return `${prefix}-${String(seq).padStart(5, "0")}`;
  }
}
