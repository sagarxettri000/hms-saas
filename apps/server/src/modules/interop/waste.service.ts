import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RegulatoryRuleService } from "../regulatory/regulatory-rule.service";

/**
 * Healthcare-waste management ledger (§83): daily ward entries, chain of
 * custody, manifests, exception monitoring, inspection dashboards. Category
 * list is configurable — regulation changes are data operations.
 */

export const WASTE_CATEGORIES = [
  "INFECTIOUS", "SHARPS", "GENERAL", "CHEMICAL", "PHARMACEUTICAL", "PATHOLOGICAL", "OTHER_REGULATED",
];

@Injectable()
export class WasteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  /** §83.2: record a daily ward waste entry (one per department+category+date). */
  async recordEntry(
    tenantId: string,
    data: {
      entryDate: Date;
      department: string;
      category: string;
      weightKg: number;
      containerCount?: number;
      collectedAt?: Date;
      collectedBy?: string;
      storageLocation?: string;
      responsibleOfficer?: string;
      notes?: string;
    },
  ) {
    if (!WASTE_CATEGORIES.includes(data.category)) {
      throw new BadRequestException(`Unknown waste category ${data.category} — configure it first`);
    }
    if (data.weightKg <= 0) throw new BadRequestException("Weight must be positive");

    const day = new Date(data.entryDate);
    day.setUTCHours(0, 0, 0, 0);
    const existing = await this.prisma.wasteLedgerEntry.findFirst({
      where: {
        tenantId,
        entryDate: day,
        department: data.department,
        category: data.category,
      },
    });
    if (existing) {
      // Same-day correction replaces the weight; the custody trail records it.
      const trail = Array.isArray(existing.custodyTrail) ? existing.custodyTrail : [];
      trail.push({ action: "CORRECTED", at: new Date().toISOString(), by: data.responsibleOfficer, newWeightKg: data.weightKg });
      return this.prisma.wasteLedgerEntry.update({
        where: { id: existing.id },
        data: { weightKg: data.weightKg, custodyTrail: trail },
      });
    }
    const entry = await this.prisma.wasteLedgerEntry.create({
      data: {
        tenantId,
        entryDate: day,
        department: data.department,
        category: data.category,
        weightKg: data.weightKg,
        containerCount: data.containerCount,
        collectedAt: data.collectedAt,
        collectedBy: data.collectedBy,
        storageLocation: data.storageLocation,
        custodyTrail: [{ action: "GENERATED", at: new Date().toISOString(), by: data.responsibleOfficer }],
        responsibleOfficer: data.responsibleOfficer,
        notes: data.notes,
      },
    });
    await this.rules.logEvent(tenantId, "WASTE_GENERATED", "WasteLedgerEntry", entry.id, {
      department: data.department,
      category: data.category,
      weightKg: data.weightKg,
    });
    return entry;
  }

  /** §83.3: append a timestamped chain-of-custody transition. */
  async custodyTransition(
    tenantId: string,
    entryId: string,
    data: { action: string; by?: string; detail?: any },
  ) {
    const entry = await this.prisma.wasteLedgerEntry.findFirst({ where: { id: entryId, tenantId } });
    if (!entry) throw new NotFoundException("Waste ledger entry not found");
    const trail = Array.isArray(entry.custodyTrail) ? entry.custodyTrail : [];
    trail.push({ action: data.action, at: new Date().toISOString(), by: data.by, detail: data.detail });
    return this.prisma.wasteLedgerEntry.update({
      where: { id: entryId },
      data: {
        custodyTrail: trail,
        ...(data.action === "COLLECTED" ? { collectedAt: new Date() } : {}),
        ...(data.action === "STORED" && data.detail?.storageLocation ? { storageLocation: data.detail.storageLocation } : {}),
        ...(data.action === "TREATED" && data.detail?.treatmentMethod ? { treatmentMethod: data.detail.treatmentMethod } : {}),
        ...(data.action === "DISPOSED" && data.detail?.disposalMethod ? { disposalMethod: data.detail.disposalMethod } : {}),
      },
    });
  }

  /** §83.4: prepare a manifest from unmanifested entries. */
  async prepareManifest(
    tenantId: string,
    data: {
      transporter?: string;
      receivingEntity?: string;
      treatmentMethod?: string;
      disposalMethod?: string;
      entryIds?: string[];
      preparedBy?: string;
    },
  ) {
    const manifestNumber = `WM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const manifest = await this.prisma.wasteManifest.create({
      data: {
        tenantId,
        manifestNumber,
        transporter: data.transporter,
        receivingEntity: data.receivingEntity,
        treatmentMethod: data.treatmentMethod,
        disposalMethod: data.disposalMethod,
        preparedBy: data.preparedBy,
      },
    });
    await this.prisma.wasteLedgerEntry.updateMany({
      where: {
        tenantId,
        manifestId: null,
        ...(data.entryIds?.length ? { id: { in: data.entryIds } } : {}),
      },
      data: { manifestId: manifest.id },
    });
    await this.rules.logEvent(tenantId, "WASTE_MANIFEST_PREPARED", "WasteManifest", manifest.id, {
      manifestNumber,
    });
    return manifest;
  }

  /** §83.4 manifest lifecycle: dispatch → external confirmation. */
  async dispatchManifest(tenantId: string, manifestId: string, dispatchedBy?: string) {
    const m = await this.prisma.wasteManifest.findFirst({ where: { id: manifestId, tenantId } });
    if (!m) throw new NotFoundException("Manifest not found");
    if (m.status !== "PREPARED") throw new ConflictException(`Manifest is ${m.status}, expected PREPARED`);
    return this.prisma.wasteManifest.update({
      where: { id: manifestId },
      data: { status: "DISPATCHED", dispatchedAt: new Date() },
    });
  }

  async confirmManifest(
    tenantId: string,
    manifestId: string,
    data: { confirmationRef?: string; accepted?: boolean; reason?: string },
  ) {
    const m = await this.prisma.wasteManifest.findFirst({ where: { id: manifestId, tenantId } });
    if (!m) throw new NotFoundException("Manifest not found");
    if (m.status !== "DISPATCHED") throw new ConflictException(`Manifest is ${m.status}, expected DISPATCHED`);
    const entries = await this.prisma.wasteLedgerEntry.findMany({
      where: { tenantId, manifestId },
    });
    if (data.accepted) {
      for (const e of entries) {
        await this.custodyTransition(tenantId, e.id, {
          action: "DISPOSED",
          by: data.confirmationRef,
          detail: { disposalMethod: m.disposalMethod, manifestNumber: m.manifestNumber },
        });
      }
    }
    await this.rules.logEvent(tenantId, data.accepted ? "WASTE_DISPOSED" : "WASTE_TRANSFERRED", "WasteManifest", manifestId, {
      manifestNumber: m.manifestNumber,
      accepted: data.accepted,
      reason: data.reason,
    });
    return this.prisma.wasteManifest.update({
      where: { id: manifestId },
      data: {
        status: data.accepted ? "CONFIRMED" : "REJECTED",
        confirmedAt: new Date(),
        confirmationRef: data.confirmationRef,
      },
    });
  }

  /** §83.5 exception monitoring over the ledger. */
  async exceptions(tenantId: string) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    yesterday.setUTCHours(0, 0, 0, 0);

    // Missing daily entries: departments that recorded waste yesterday but not today.
    const [recent, today] = await Promise.all([
      this.prisma.wasteLedgerEntry.findMany({
        where: { tenantId, entryDate: { gte: new Date(now.getTime() - 7 * 86400000) } },
        select: { department: true, entryDate: true, weightKg: true, collectedAt: true, manifestId: true, custodyTrail: true },
      }),
      this.prisma.wasteLedgerEntry.findMany({
        where: { tenantId, entryDate: { gte: yesterday } },
        select: { department: true },
      }),
    ]);

    const exceptions: Array<{ kind: string; detail: any }> = [];
    const deptsWithToday = new Set(today.map((t) => t.department));
    const depts7d = new Set(recent.map((r) => r.department));
    for (const d of depts7d) {
      if (!deptsWithToday.has(d)) {
        exceptions.push({ kind: "MISSING_DAILY_ENTRY", detail: { department: d, date: yesterday.toISOString().slice(0, 10) } });
      }
    }

    // Quantity spikes: any entry > 3× the department mean.
    const grouped = new Map<string, number[]>();
    for (const r of recent) {
      const k = `${r.department}`;
      grouped.set(k, [...(grouped.get(k) ?? []), Number(r.weightKg)]);
    }
    for (const [dept, weights] of grouped) {
      const mean = weights.reduce((s, w) => s + w, 0) / weights.length;
      const max = Math.max(...weights);
      if (mean > 0 && max > mean * 3) {
        exceptions.push({ kind: "QUANTITY_SPIKE", detail: { department: dept, mean, max } });
      }
    }

    // Uncollected / unmanifested waste.
    for (const r of recent) {
      const trail = Array.isArray(r.custodyTrail) ? r.custodyTrail : [];
      if (!trail.some((t: any) => t.action === "COLLECTED" || t.action === "DISPOSED") && !r.collectedAt) {
        exceptions.push({ kind: "UNCOLLECTED_WASTE", detail: { department: r.department } });
      }
    }
    const unmanifested = recent.filter((r) => !r.manifestId).length;
    if (unmanifested > 0) {
      exceptions.push({ kind: "AWAITING_MANIFEST", detail: { count: unmanifested } });
    }

    return { exceptions, generatedAt: now };
  }

  /** §83.6 inspection dashboard: daily/monthly, ward-wise, category-wise. */
  async inspectionDashboard(tenantId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const entries = await this.prisma.wasteLedgerEntry.findMany({
      where: { tenantId, entryDate: { gte: monthStart } },
      select: { entryDate: true, department: true, category: true, weightKg: true, treatmentMethod: true, disposalMethod: true, manifestId: true },
    });
    const byDepartment: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    let totalKg = 0;
    let treatedKg = 0;
    for (const e of entries) {
      const w = Number(e.weightKg);
      totalKg += w;
      byDepartment[e.department] = (byDepartment[e.department] ?? 0) + w;
      byCategory[e.category] = (byCategory[e.category] ?? 0) + w;
      const day = e.entryDate.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + w;
      if (e.treatmentMethod || e.disposalMethod) treatedKg += w;
    }
    const manifests = await this.prisma.wasteManifest.count({ where: { tenantId } });
    return {
      month: monthStart.toISOString().slice(0, 7),
      totalKg,
      treatedKg,
      untreatedKg: totalKg - treatedKg,
      byDepartment,
      byCategory,
      byDay,
      manifests,
      generatedAt: now,
    };
  }
}
