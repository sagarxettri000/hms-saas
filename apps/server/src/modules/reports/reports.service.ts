import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseRange(from?: string, to?: string) {
    const range: { from?: Date; to?: Date } = {};
    if (from) {
      const d = new Date(from);
      if (isNaN(d.getTime())) throw new BadRequestException("Invalid from date");
      range.from = d;
    }
    if (to) {
      const d = new Date(to);
      if (isNaN(d.getTime())) throw new BadRequestException("Invalid to date");
      d.setHours(23, 59, 59, 999);
      range.to = d;
    }
    return range;
  }

  private dateWhere(tenantId: string, field: string, range: { from?: Date; to?: Date }) {
    const where: any = { tenantId };
    if (range.from || range.to) {
      where[field] = {};
      if (range.from) where[field].gte = range.from;
      if (range.to) where[field].lte = range.to;
    }
    return where;
  }

  async getSummary(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);

    const invWhere = this.dateWhere(tenantId, "issuedDate", range);
    invWhere.status = { not: "CANCELLED" };

    const [invoices, appointments, patients, admissions, beds, doctors, labOrders, radiologyOrders, activeAdmits, overdueCount] =
      await Promise.all([
        this.prisma.invoice.findMany({
          where: invWhere,
          select: { totalAmount: true, paidAmount: true, status: true },
        }),
        this.prisma.appointment.count({
          where: this.dateWhere(tenantId, "startTime", range),
        }),
        this.prisma.patient.count({
          where: range.from || range.to
            ? {
                tenantId,
                deletedAt: null,
                createdAt: { gte: range.from ?? undefined, lte: range.to ?? undefined },
              }
            : { tenantId, deletedAt: null },
        }),
        this.prisma.admission.count({
          where: this.dateWhere(tenantId, "admissionDate", range),
        }),
        this.prisma.bed.count({ where: { tenantId } }),
        this.prisma.doctorProfile.count({ where: { tenantId } }),
        this.prisma.labOrder.count({ where: this.dateWhere(tenantId, "orderedAt", range) }),
        this.prisma.radiologyOrder.count({ where: this.dateWhere(tenantId, "orderedAt", range) }),
        this.prisma.admission.count({
          where: { tenantId, status: { in: ["ADMITTED", "PENDING"] } },
        }),
        this.prisma.invoice.count({ where: { tenantId, status: "OVERDUE" } }),
      ]);

    const occupiedBeds = await this.prisma.bed.count({
      where: { tenantId, status: "OCCUPIED" },
    });

    const totalRevenue = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const collected = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);

    return {
      totalRevenue,
      collected,
      outstanding: Math.max(0, totalRevenue - collected),
      overdueInvoices: overdueCount,
      patients,
      appointments,
      admissions,
      activeAdmissions: activeAdmits,
      bedOccupancy: { occupied: occupiedBeds, total: beds },
      doctors,
      labOrders,
      radiologyOrders,
    };
  }

  async revenueByStatus(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);
    const where = this.dateWhere(tenantId, "issuedDate", range);
    where.status = { not: "CANCELLED" };
    const rows = await this.prisma.invoice.findMany({
      where,
      select: { status: true, totalAmount: true, paidAmount: true, dueAmount: true },
    });
    const byStatus: Record<string, { count: number; amount: number; collected: number }> = {};
    for (const r of rows) {
      const key = r.status;
      if (!byStatus[key]) byStatus[key] = { count: 0, amount: 0, collected: 0 };
      byStatus[key].count += 1;
      byStatus[key].amount += Number(r.totalAmount);
      byStatus[key].collected += Number(r.paidAmount);
    }
    return Object.entries(byStatus)
      .map(([status, v]) => ({ status, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }

  async appointmentsByStatus(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);
    const grouped = await this.prisma.appointment.groupBy({
      by: ["status"],
      where: this.dateWhere(tenantId, "startTime", range),
      _count: true,
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  async admissionsByStatus(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);
    const grouped = await this.prisma.admission.groupBy({
      by: ["status"],
      where: this.dateWhere(tenantId, "admissionDate", range),
      _count: true,
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  async labByStatus(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);
    const grouped = await this.prisma.labOrder.groupBy({
      by: ["status"],
      where: this.dateWhere(tenantId, "orderedAt", range),
      _count: true,
    });
    return grouped.map((g) => ({ status: g.status, count: g._count }));
  }

  async doctorWorkload(tenantId: string, params: { from?: string; to?: string } = {}) {
    const range = this.parseRange(params.from, params.to);
    const where = this.dateWhere(tenantId, "startTime", range);
    const grouped = await this.prisma.appointment.groupBy({
      by: ["doctorId"],
      where,
      _count: true,
    });
    const ids = grouped.map((g) => g.doctorId).filter(Boolean);
    const profiles = ids.length
      ? await this.prisma.doctorProfile.findMany({
          where: { id: { in: ids as string[] } },
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
    const nameById = new Map(profiles.map((p) => [p.id, `${p.user.firstName} ${p.user.lastName}`.trim()]));
    return grouped
      .filter((g) => g.doctorId)
      .map((g) => ({
        doctorId: g.doctorId,
        name: nameById.get(g.doctorId as string) || g.doctorId,
        count: g._count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  async departmentStats(tenantId: string) {
    const grouped = await this.prisma.encounter.groupBy({
      by: ["departmentId"],
      where: { tenantId },
      _count: true,
    });
    const ids = grouped.map((g) => g.departmentId).filter(Boolean);
    const depts = ids.length
      ? await this.prisma.department.findMany({
          where: { id: { in: ids as string[] } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(depts.map((d) => [d.id, d.name]));
    return grouped
      .filter((g) => g.departmentId)
      .map((g) => ({
        departmentId: g.departmentId,
        name: nameById.get(g.departmentId as string) || g.departmentId,
        count: g._count,
      }))
      .sort((a, b) => b.count - a.count);
  }
}
