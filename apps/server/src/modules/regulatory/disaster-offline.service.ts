import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RegulatoryRuleService } from "./regulatory-rule.service";

/**
 * HEOC disaster / mass-casualty mode (§70) and the offline store-and-forward
 * sync engine (§71).
 *
 * Disaster intake deliberately minimizes identity capture (§70.2) — full
 * demographics are completed at reconciliation. Triage history is
 * append-only and auditable (§70.3/§75). Offline sync is idempotent by
 * durable localTxnId (§71.4) and financial conflicts are NEVER silently
 * overwritten (§71.5).
 */

@Injectable()
export class DisasterOfflineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  // ================= §70 Disaster / HEOC =================

  async activate(
    tenantId: string,
    data: {
      mode: "DISASTER_MODE" | "MASS_CASUALTY_MODE";
      incidentName?: string;
      incidentType?: string;
      incidentRef?: string;
      authority?: string;
      expectedDurationHours?: number;
      activatedBy: string;
    },
  ) {
    const current = await this.prisma.disasterActivation.findFirst({
      where: { tenantId, isActive: true },
    });
    if (current) {
      throw new ConflictException(
        `An activation (${current.mode}) is already active — deactivate it before starting a new one`,
      );
    }
    const activation = await this.prisma.disasterActivation.create({
      data: { tenantId, ...data, mode: data.mode },
    });
    await this.rules.logEvent(tenantId, "DISASTER_ACTIVATED", "DisasterActivation", activation.id, {
      mode: data.mode,
      incidentName: data.incidentName,
      activatedBy: data.activatedBy,
    });
    return activation;
  }

  async deactivate(tenantId: string, activationId: string, deactivatedBy: string) {
    const activation = await this.prisma.disasterActivation.findFirst({
      where: { id: activationId, tenantId },
    });
    if (!activation) throw new NotFoundException("Activation not found");
    if (!activation.isActive) throw new ConflictException("Activation already ended");
    return this.prisma.disasterActivation.update({
      where: { id: activationId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
  }

  async activeActivation(tenantId: string) {
    return this.prisma.disasterActivation.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { activatedAt: "desc" },
    });
  }

  /** §70.2: minimal intake — only the wristband/temp ID is truly required. */
  async rapidIntake(
    tenantId: string,
    data: {
      activationId?: string;
      tempCasualtyId?: string;
      wristbandCode?: string;
      displayName?: string;
      patientId?: string;
      payerClass?: string;
      createdBy: string;
    },
  ) {
    let activationId = data.activationId;
    if (!activationId) {
      const active = await this.activeActivation(tenantId);
      if (!active) {
        throw new ConflictException("No active disaster activation — activate HEOC mode before rapid intake");
      }
      activationId = active.id;
    }
    const tempCasualtyId =
      data.tempCasualtyId ??
      `MC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const casualty = await this.prisma.disasterCasualty.create({
      data: {
        tenantId,
        activationId,
        tempCasualtyId,
        wristbandCode: data.wristbandCode,
        displayName: data.displayName,
        patientId: data.patientId,
        payerClass: data.payerClass ?? "UNIDENTIFIED_CASUALTY",
        createdBy: data.createdBy,
      },
    });
    await this.rules.logEvent(tenantId, "DISASTER_INTAKE", "DisasterCasualty", casualty.id, {
      tempCasualtyId,
      payerClass: casualty.payerClass,
    }, data.patientId);
    return casualty;
  }

  /** §70.3: color-coded triage — append-only history, timestamped + attributed. */
  async recordTriage(
    tenantId: string,
    casualtyId: string,
    data: {
      category: "RED" | "YELLOW" | "GREEN" | "BLACK";
      triageOfficer: string;
      clinicalFindings?: string;
      destination?: string;
    },
  ) {
    const casualty = await this.prisma.disasterCasualty.findFirst({
      where: { id: casualtyId, tenantId },
    });
    if (!casualty) throw new NotFoundException("Casualty not found");

    const history = Array.isArray(casualty.triageHistory) ? casualty.triageHistory : [];
    const entry = {
      category: data.category,
      triageOfficer: data.triageOfficer,
      clinicalFindings: data.clinicalFindings ?? null,
      destination: data.destination ?? null,
      triagedAt: new Date().toISOString(),
    };
    const updated = await this.prisma.disasterCasualty.update({
      where: { id: casualtyId },
      data: {
        currentCategory: data.category,
        triageHistory: [...history, entry],
        status: casualty.status === "AWAITING_ASSESSMENT" ? "IN_TREATMENT" : casualty.status,
        destination: data.destination ?? casualty.destination,
      },
    });
    await this.rules.logEvent(tenantId, "DISASTER_TRIAGE", "DisasterCasualty", casualtyId, {
      category: data.category,
      previous: casualty.currentCategory,
    }, casualty.patientId ?? undefined);
    return updated;
  }

  async setCasualtyStatus(
    tenantId: string,
    casualtyId: string,
    status: "AWAITING_ASSESSMENT" | "IN_TREATMENT" | "ADMITTED" | "TRANSFERRED" | "DISCHARGED" | "DECEASED" | "MISSING",
  ) {
    const casualty = await this.prisma.disasterCasualty.findFirst({
      where: { id: casualtyId, tenantId },
    });
    if (!casualty) throw new NotFoundException("Casualty not found");
    return this.prisma.disasterCasualty.update({
      where: { id: casualtyId },
      data: { status },
    });
  }

  /** §70.5: link a provisional casualty to the definitive patient identity. */
  async reconcileIdentity(tenantId: string, casualtyId: string, patientId: string, payerClass?: string) {
    const casualty = await this.prisma.disasterCasualty.findFirst({
      where: { id: casualtyId, tenantId },
    });
    if (!casualty) throw new NotFoundException("Casualty not found");
    const updated = await this.prisma.disasterCasualty.update({
      where: { id: casualtyId },
      data: {
        patientId,
        payerClass: payerClass ?? casualty.payerClass,
      },
    });
    await this.rules.logEvent(tenantId, "DISASTER_IDENTITY_RECONCILED", "DisasterCasualty", casualtyId, {
      tempCasualtyId: casualty.tempCasualtyId,
      patientId,
    }, patientId);
    return updated;
  }

  /** §70.6: real-time mass-casualty dashboard for the active activation. */
  async dashboard(tenantId: string) {
    const activation = await this.activeActivation(tenantId);
    if (!activation) return { active: false, totals: {}, message: "No active disaster activation" };
    const casualties = await this.prisma.disasterCasualty.findMany({
      where: { tenantId, activationId: activation.id },
    });
    const byCategory = { RED: 0, YELLOW: 0, GREEN: 0, BLACK: 0, untriaged: 0 };
    const byStatus: Record<string, number> = {};
    for (const c of casualties) {
      if (c.currentCategory) byCategory[c.currentCategory] += 1;
      else byCategory.untriaged += 1;
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    }
    return {
      active: true,
      activation: {
        id: activation.id,
        mode: activation.mode,
        incidentName: activation.incidentName,
        activatedAt: activation.activatedAt,
      },
      totalCasualties: casualties.length,
      byCategory,
      byStatus,
      // §70.6: visibility note — detail lists remain behind the emergency
      // role guard and clinical-context isolation; this dashboard exposes
      // counts for situational awareness, not a global patient list.
    };
  }

  // ================= §71 Offline sync =================

  /** §71.2: durable queue entry — idempotent on localTxnId (§71.4). */
  async enqueue(
    tenantId: string,
    data: {
      localTxnId: string;
      localNodeId: string;
      userId?: string;
      entityType: string;
      entityId: string;
      operationType: string;
      payload?: any;
      checksum?: string;
      sequenceNo?: number;
    },
  ) {
    const existing = await this.prisma.offlineSyncItem.findUnique({
      where: { localTxnId: data.localTxnId },
    });
    if (existing) return { item: existing, deduplicated: true };
    const item = await this.prisma.offlineSyncItem.create({
      data: {
        tenantId,
        localTxnId: data.localTxnId,
        localNodeId: data.localNodeId,
        userId: data.userId,
        entityType: data.entityType,
        entityId: data.entityId,
        operationType: data.operationType,
        payload: data.payload,
        checksum: data.checksum,
        sequenceNo: data.sequenceNo,
        syncState: "QUEUED",
      },
    });
    return { item, deduplicated: false };
  }

  /** Financial entities — conflicts are NEVER silently overwritten (§71.5). */
  private static readonly FINANCIAL_ENTITIES = new Set([
    "Invoice", "Payment", "PharmacySale", "Refund", "RevenueAllocation", "Claim",
  ]);

  /**
   * §71.2 reconnection: central validation + commit. Re-uploading the same
   * batch changes nothing (idempotent). Financial conflicts force MANUAL_REVIEW.
   */
  async syncBatch(
    tenantId: string,
    items: Array<{ localTxnId: string; checksum?: string }>,
  ) {
    const results: Array<{ localTxnId: string; syncState: string; note?: string }> = [];
    for (const ref of items) {
      const item = await this.prisma.offlineSyncItem.findFirst({
        where: { tenantId, localTxnId: ref.localTxnId },
      });
      if (!item) {
        results.push({ localTxnId: ref.localTxnId, syncState: "REJECTED", note: "Unknown transaction — not accepted from this node" });
        continue;
      }
      if (item.syncState === "SYNCED") {
        results.push({ localTxnId: ref.localTxnId, syncState: "SYNCED", note: "Already committed — no duplicate (§71.4)" });
        continue;
      }
      if (item.checksum && ref.checksum && item.checksum !== ref.checksum) {
        const financial = DisasterOfflineService.FINANCIAL_ENTITIES.has(item.entityType);
        await this.prisma.offlineSyncItem.update({
          where: { id: item.id },
          data: {
            syncState: financial ? "MANUAL_REVIEW" : "CONFLICT",
            conflictDetail: { kind: "CHECKSUM_MISMATCH", local: ref.checksum, central: item.checksum },
          },
        });
        results.push({ localTxnId: ref.localTxnId, syncState: financial ? "MANUAL_REVIEW" : "CONFLICT", note: "Checksum mismatch" });
        continue;
      }
      const updated = await this.prisma.offlineSyncItem.update({
        where: { id: item.id },
        data: { syncState: "SYNCED", lastAttemptAt: new Date(), lastError: null },
      });
      results.push({ localTxnId: ref.localTxnId, syncState: updated.syncState });
    }
    return results;
  }

  /** Report an upload failure — RETRY_PENDING stays visible until resolved. */
  async markUploadFailed(tenantId: string, localTxnId: string, error: string) {
    const item = await this.prisma.offlineSyncItem.findFirst({
      where: { tenantId, localTxnId },
    });
    if (!item) throw new NotFoundException("Sync item not found");
    return this.prisma.offlineSyncItem.update({
      where: { id: item.id },
      data: {
        syncState: "RETRY_PENDING",
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        lastError: error,
      },
    });
  }

  /**
   * §71.5 conflict resolution. Financial items cannot be auto-accepted —
   * they go through explicit adjustment/reversal in manual review.
   */
  async resolveConflict(
    tenantId: string,
    itemId: string,
    resolution: "ACCEPT_LOCAL" | "REJECT_LOCAL",
    resolvedBy: string,
    notes?: string,
  ) {
    const item = await this.prisma.offlineSyncItem.findFirst({
      where: { id: itemId, tenantId },
    });
    if (!item) throw new NotFoundException("Sync item not found");
    if (!["CONFLICT", "MANUAL_REVIEW"].includes(item.syncState)) {
      throw new ConflictException(`Item is not in a conflicted state (${item.syncState})`);
    }
    if (DisasterOfflineService.FINANCIAL_ENTITIES.has(item.entityType) && resolution === "ACCEPT_LOCAL") {
      throw new ConflictException(
        "Financial transactions cannot be silently overwritten — reconcile through explicit adjustment/reversal (§71.5)",
      );
    }
    return this.prisma.offlineSyncItem.update({
      where: { id: itemId },
      data: {
        syncState: resolution === "ACCEPT_LOCAL" ? "SYNCED" : "REJECTED",
        conflictDetail: { ...(item.conflictDetail as any ?? {}), resolvedBy, resolution, notes },
      },
    });
  }

  /** §75: failed sync transactions remain visible until resolved. */
  async failedItems(tenantId: string, localNodeId?: string) {
    return this.prisma.offlineSyncItem.findMany({
      where: {
        tenantId,
        syncState: { in: ["CONFLICT", "REJECTED", "RETRY_PENDING", "MANUAL_REVIEW"] },
        ...(localNodeId ? { localNodeId } : {}),
      },
      orderBy: { updatedAt: "asc" },
    });
  }
}
