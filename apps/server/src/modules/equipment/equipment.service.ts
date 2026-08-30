import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateEquipmentDto {
  name: string;
  department?: string;
  model?: string;
  serialNumber?: string;
  manufacturer?: string;
  purchaseDate?: Date | string;
  warrantyExpiry?: Date | string;
  status?: string;
  location?: string;
}

export interface UpdateEquipmentDto extends Partial<CreateEquipmentDto> {}

export interface CreateLogDto {
  equipmentId: string;
  date?: Date | string;
  type?: string;
  notes?: string;
  performedBy?: string;
}

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findEquipment(tenantId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 100);
    const search = query.search?.toString().trim();

    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (query.department) where.department = query.department;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { model: { contains: search, mode: "insensitive" } },
        { serialNumber: { contains: search, mode: "insensitive" } },
        { manufacturer: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.equipmentItem.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.equipmentItem.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findEquipmentById(tenantId: string, id: string) {
    const item = await this.prisma.equipmentItem.findFirst({
      where: { id, tenantId },
    });
    if (!item) throw new NotFoundException("Equipment not found");
    return item;
  }

  async createEquipment(tenantId: string, dto: CreateEquipmentDto) {
    if (!dto.name?.trim())
      throw new BadRequestException("Equipment name is required");
    const { tenantId: _t, ...data } = dto as any;
    return this.prisma.equipmentItem.create({
      data: {
        tenantId,
        name: dto.name,
        department: data.department ?? null,
        model: data.model ?? null,
        serialNumber: data.serialNumber ?? null,
        manufacturer: data.manufacturer ?? null,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        warrantyExpiry: data.warrantyExpiry
          ? new Date(data.warrantyExpiry)
          : null,
        status: data.status ?? "OPERATIONAL",
        location: data.location ?? null,
      },
    });
  }

  async updateEquipment(tenantId: string, id: string, dto: UpdateEquipmentDto) {
    await this.findEquipmentById(tenantId, id);
    const clean: any = { ...(dto as any) };
    delete clean.tenantId;
    if ("purchaseDate" in clean && clean.purchaseDate)
      clean.purchaseDate = new Date(clean.purchaseDate);
    if ("warrantyExpiry" in clean && clean.warrantyExpiry)
      clean.warrantyExpiry = new Date(clean.warrantyExpiry);
    return this.prisma.equipmentItem.update({ where: { id }, data: clean });
  }

  async deleteEquipment(tenantId: string, id: string) {
    await this.findEquipmentById(tenantId, id);
    await this.prisma.equipmentLog.deleteMany({ where: { equipmentId: id } });
    await this.prisma.equipmentItem.delete({ where: { id } });
    return { success: true };
  }

  // ---------- Maintenance Logs ----------

  async findLogs(tenantId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 100);

    const where: any = { tenantId };
    if (query.equipmentId) where.equipmentId = query.equipmentId;

    const [data, total] = await Promise.all([
      this.prisma.equipmentLog.findMany({
        where,
        include: {
          equipment: { select: { id: true, name: true } },
        },
        orderBy: [{ date: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.equipmentLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createLog(tenantId: string, dto: CreateLogDto) {
    if (!dto.equipmentId)
      throw new BadRequestException("Equipment is required");
    await this.findEquipmentById(tenantId, dto.equipmentId);
    return this.prisma.equipmentLog.create({
      data: {
        tenantId,
        equipmentId: dto.equipmentId,
        date: dto.date ? new Date(dto.date) : new Date(),
        type: dto.type || "Preventive",
        notes: dto.notes ?? null,
        performedBy: dto.performedBy || "Biomedical Engineer",
      },
      include: {
        equipment: { select: { id: true, name: true } },
      },
    });
  }

  async recordService(tenantId: string, equipmentId: string, dto: CreateLogDto) {
    const item = await this.findEquipmentById(tenantId, equipmentId);
    const log = await this.prisma.equipmentLog.create({
      data: {
        tenantId,
        equipmentId,
        date: new Date(),
        type: dto.type || "Preventive",
        notes: dto.notes ?? null,
        performedBy: dto.performedBy || "Biomedical Engineer",
      },
      include: {
        equipment: { select: { id: true, name: true } },
      },
    });
    await this.prisma.equipmentItem.update({
      where: { id: equipmentId },
      data: { lastServiceDate: new Date(), status: item.status === "OUT_OF_SERVICE" ? "OUT_OF_SERVICE" : "OPERATIONAL" },
    });
    return log;
  }
}
