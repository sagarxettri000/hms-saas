import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateStockTransferDto {
  fromStore?: string;
  toStore?: string;
  itemName?: string;
  quantity?: number;
}

@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateStockTransferDto, userId: string) {
    const qty = Number(dto.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BadRequestException("Valid quantity is required");
    }
    if (!dto.fromStore || !dto.toStore) {
      throw new BadRequestException("Source and destination stores are required");
    }
    return this.prisma.stockTransfer.create({
      data: {
        tenantId,
        fromStore: dto.fromStore,
        toStore: dto.toStore,
        itemName: dto.itemName || null,
        quantity: qty,
        status: "COMPLETED",
        transferredAt: new Date(),
        createdBy: userId,
      },
    });
  }

  async findAll(
    tenantId: string,
    params: { page?: number; limit?: number },
  ) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 100;
    const where: any = { tenantId };
    const [data, total] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        orderBy: { transferredAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
