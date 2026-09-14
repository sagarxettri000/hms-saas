import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateStockTransferDto {
  fromStoreId?: string;
  toStoreId?: string;
  inventoryItemId?: string;
  quantity?: number;
  itemName?: string;
}

@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateStockTransferDto, userId: string) {
    const qty = Number(dto.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BadRequestException("Valid quantity is required");
    }
    if (!dto.fromStoreId || !dto.toStoreId) {
      throw new BadRequestException("Source and destination stores are required");
    }
    if (dto.fromStoreId === dto.toStoreId) {
      throw new BadRequestException("Source and destination stores must differ");
    }
    if (!dto.inventoryItemId) {
      throw new BadRequestException("An inventory item is required");
    }

    const [fromStore, toStore, item] = await Promise.all([
      this.prisma.store.findFirst({
        where: { id: dto.fromStoreId, tenantId },
      }),
      this.prisma.store.findFirst({
        where: { id: dto.toStoreId, tenantId },
      }),
      this.prisma.inventoryItem.findFirst({
        where: { id: dto.inventoryItemId, tenantId },
      }),
    ]);

    if (!fromStore) throw new NotFoundException("Source store not found");
    if (!toStore) throw new NotFoundException("Destination store not found");
    if (!item) throw new NotFoundException("Inventory item not found");
    if (item.storeId !== fromStore.id) {
      throw new BadRequestException(
        "The selected item does not belong to the source store",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic claim on the source stock so concurrent transfers cannot
      // double-spend.
      const claimed = await tx.inventoryItem.updateMany({
        where: { id: item.id, tenantId, currentStock: { gte: qty } },
        data: { currentStock: { decrement: qty } },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          `Insufficient stock for "${item.name}" in ${fromStore.name}`,
        );
      }

      // Locate (or create) the destination inventory row for this store.
      const existingDest = await tx.inventoryItem.findFirst({
        where: {
          tenantId,
          storeId: toStore.id,
          ...(item.medicineId
            ? { medicineId: item.medicineId }
            : { name: item.name }),
        },
      });

      let destination: any;
      if (existingDest) {
        destination = await tx.inventoryItem.update({
          where: { id: existingDest.id },
          data: {
            currentStock: { increment: qty },
            ...(item.batchNumber ? { batchNumber: item.batchNumber } : {}),
          },
        });
      } else {
        destination = await tx.inventoryItem.create({
          data: {
            tenantId,
            storeId: toStore.id,
            medicineId: item.medicineId,
            name: item.name,
            itemType: item.itemType,
            sku: item.sku,
            unit: item.unit,
            currentStock: qty,
            expiryDate: item.expiryDate,
            batchNumber: item.batchNumber,
            purchaseRate: item.purchaseRate,
            salesRate: item.salesRate,
            reorderLevel: item.reorderLevel,
            location: item.location,
          },
        });
      }

      const transfer = await tx.stockTransfer.create({
        data: {
          tenantId,
          fromStoreId: fromStore.id,
          toStoreId: toStore.id,
          inventoryItemId: item.id,
          fromStore: fromStore.name,
          toStore: toStore.name,
          itemName: item.name,
          quantity: qty,
          status: "COMPLETED",
          transferredAt: new Date(),
          createdBy: userId,
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          itemId: item.id,
          storeId: fromStore.id,
          type: "TRANSFER_OUT",
          quantity: qty,
          unitPrice: item.purchaseRate,
          totalValue: item.purchaseRate
            ? Number(item.purchaseRate) * qty
            : undefined,
          referenceType: "StockTransfer",
          referenceId: transfer.id,
          remarks: `Transferred to ${toStore.name}`,
          createdBy: userId,
        },
      });

      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          itemId: destination.id,
          storeId: toStore.id,
          type: "TRANSFER_IN",
          quantity: qty,
          unitPrice: item.purchaseRate,
          totalValue: item.purchaseRate
            ? Number(item.purchaseRate) * qty
            : undefined,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          referenceType: "StockTransfer",
          referenceId: transfer.id,
          remarks: `Received from ${fromStore.name}`,
          createdBy: userId,
        },
      });

      return transfer;
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