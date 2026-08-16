import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ICD10_CATALOG } from "./icd10.data";

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  searchIcd10(search?: string, limit = 25) {
    const q = (search || "").trim().toLowerCase();
    const results = ICD10_CATALOG.filter(
      (e) =>
        !q ||
        e.code.toLowerCase().startsWith(q) ||
        e.code.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q),
    ).slice(0, Math.min(100, limit));
    return results;
  }

  async labTests(tenantId: string, search?: string) {
    const where: any = { tenantId, isActive: true };
    if (search) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ];
    }
    return this.prisma.labTest.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        category: true,
        specimenType: true,
        unit: true,
        referenceRange: true,
        price: true,
        turnaroundTime: true,
        discipline: true,
      },
      orderBy: { name: "asc" },
      take: 100,
    });
  }

  async medicines(tenantId: string, search?: string) {
    const where: any = { tenantId, isActive: true };
    if (search) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { genericName: { contains: q, mode: "insensitive" } },
        { brandName: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
      ];
    }
    return this.prisma.medicine.findMany({
      where,
      select: {
        id: true,
        name: true,
        genericName: true,
        brandName: true,
        category: true,
        sku: true,
        unit: true,
        strength: true,
        form: true,
        salesRate: true,
        requiresPrescription: true,
      },
      orderBy: { name: "asc" },
      take: 100,
    });
  }
}
