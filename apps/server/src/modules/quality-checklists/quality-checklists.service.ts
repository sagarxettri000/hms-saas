import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class QualityChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, params: { category?: string }) {
    const where: any = { tenantId };
    if (params.category) where.category = params.category;
    return this.prisma.qualityChecklist.findMany({
      where,
      orderBy: [{ category: "asc" }, { item: "asc" }],
    });
  }

  async setItem(
    tenantId: string,
    body: { category?: string; item?: string; checked?: boolean },
    userId: string,
  ) {
    if (!body.category || !body.item) {
      throw new BadRequestException("Category and item are required");
    }
    const checked = body.checked === true;
    const existing = await this.prisma.qualityChecklist.findFirst({
      where: { tenantId, category: body.category, item: body.item },
    });
    if (existing) {
      return this.prisma.qualityChecklist.update({
        where: { id: existing.id },
        data: {
          checked,
          checkedBy: checked ? userId : null,
          checkedAt: checked ? new Date() : null,
        },
      });
    }
    return this.prisma.qualityChecklist.create({
      data: {
        tenantId,
        category: body.category,
        item: body.item,
        checked,
        checkedBy: checked ? userId : null,
        checkedAt: checked ? new Date() : null,
      },
    });
  }
}
