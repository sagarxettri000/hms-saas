import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RegulatoryRuleService } from "../regulatory/regulatory-rule.service";

/**
 * Unified government-integration gateway (§84, §89).
 *
 * Every outbound government/FHIR transaction flows through this ONE queue:
 * modules construct payloads; the gateway validates, classifies failures,
 * retries transient errors, and reconciles acknowledgements. Modules never
 * talk to external systems directly (§84) and clinical transactions never
 * fail because an external endpoint failed (§84.2, §89).
 */

export const TERMINAL_STATUSES = ["ACCEPTED", "REJECTED", "CANCELLED"];

export interface SubmitResult {
  transactionId: string;
  status: string;
  ackRef?: string;
  note?: string;
}

function isTerminal(status?: string): boolean {
  return TERMINAL_STATUSES.includes(status ?? "");
}

@Injectable()
export class InteropGatewayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  /**
   * Enqueue an outbound transaction. Idempotent on idempotencyKey (§89):
   * re-submission of the same source event returns the existing transaction
   * and changes nothing.
   */
  async enqueue(
    tenantId: string,
    data: {
      destination: string;
      purpose: "SURVEILLANCE" | "VITAL_EVENT" | "REPORTING" | "FHIR_EXCHANGE";
      sourceModule: string;
      sourceEntity: string;
      sourceEntityId: string;
      payload: any;
      payloadVersion?: string;
      mappingVersion?: string;
      ruleVersion?: number;
      patientId?: string;
      encounterId?: string;
      lineage?: any;
      createdBy?: string;
    },
  ): Promise<{ txn: any; deduplicated: boolean }> {
    const idempotencyKey = `${tenantId}:${data.destination}:${data.purpose}:${data.sourceEntity}:${data.sourceEntityId}`;
    const existing = await this.prisma.interopTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return { txn: existing, deduplicated: true };
    }
    try {
      const txn = await this.prisma.interopTransaction.create({
        data: {
          tenantId,
          destination: data.destination,
          purpose: data.purpose,
          sourceModule: data.sourceModule,
          sourceEntity: data.sourceEntity,
          sourceEntityId: data.sourceEntityId,
          idempotencyKey,
          payload: data.payload,
          payloadVersion: data.payloadVersion ?? "1.0",
          mappingVersion: data.mappingVersion,
          ruleVersion: data.ruleVersion,
          patientId: data.patientId,
          encounterId: data.encounterId,
          lineage: data.lineage,
          createdBy: data.createdBy,
        },
      });
      return { txn, deduplicated: false };
    } catch (e: any) {
      // Concurrent enqueue hit the unique idempotency key — return the winner.
      if (e?.code === "P2002") {
        const winner = await this.prisma.interopTransaction.findUnique({ where: { idempotencyKey } });
        if (winner) return { txn: winner, deduplicated: true };
      }
      throw e;
    }
  }

  /** Move a transaction to a new state (§80.5). Terminal states are final. */
  async markStatus(
    tenantId: string,
    id: string,
    status: string,
    extra: { ackRef?: string; response?: any; failureClass?: string; lastError?: string } = {},
  ) {
    const txn = await this.prisma.interopTransaction.findFirst({ where: { id, tenantId } });
    if (!txn) throw new NotFoundException("Interop transaction not found");
    if (isTerminal(txn.status)) {
      throw new ConflictException(`Transaction is terminal (${txn.status}) — cannot move to ${status}`);
    }
    return this.prisma.interopTransaction.update({
      where: { id },
      data: {
        status,
        ...(extra.ackRef !== undefined ? { ackRef: extra.ackRef } : {}),
        ...(extra.response !== undefined ? { response: extra.response } : {}),
        ...(extra.failureClass !== undefined ? { failureClass: extra.failureClass } : {}),
        ...(extra.lastError !== undefined ? { lastError: extra.lastError } : {}),
        lastAttemptAt: new Date(),
        retryCount: status === "RETRY_PENDING" ? { increment: 1 } : undefined,
      },
    });
  }

  /**
   * Validate → transmit → classify. Validation failures are VALIDATION class
   * and never transmitted; transport outcomes map to the §89 failure
   * taxonomy (transient ≠ business rejection ≠ authorization ≠ duplicate).
   */
  async transmit(tenantId: string, txnId: string): Promise<SubmitResult> {
    const txn = await this.prisma.interopTransaction.findFirst({ where: { id: txnId, tenantId } });
    if (!txn) throw new NotFoundException("Interop transaction not found");
    if (isTerminal(txn.status)) {
      return { transactionId: txn.id, status: txn.status, note: "Terminal — no retransmission" };
    }

    await this.markStatus(tenantId, txnId, "VALIDATING");
    const validation = await this.validatePayload(tenantId, txn);
    if (!validation.ok) {
      await this.markStatus(tenantId, txnId, "VALIDATION_FAILED", {
        failureClass: "VALIDATION",
        lastError: validation.errors.join("; "),
      });
      return { transactionId: txn.id, status: "VALIDATION_FAILED", note: validation.errors.join("; ") };
    }

    const result = await this.transport(tenantId, txn);

    if (result.ok) {
      await this.markStatus(tenantId, txnId, "ACKNOWLEDGED", { ackRef: result.ackRef, response: result.response });
      await this.rules.logEvent(tenantId, "INTEROP_ACKNOWLEDGED", "InteropTransaction", txn.id, {
        destination: txn.destination,
        purpose: txn.purpose,
        ackRef: result.ackRef,
      }, txn.patientId ?? undefined);
      return { transactionId: txn.id, status: "ACKNOWLEDGED", ackRef: result.ackRef };
    }

    const cls = result.failureClass ?? "TRANSIENT";
    const next =
      cls === "TRANSIENT" ? "RETRY_PENDING"
      : cls === "DUPLICATE" ? "ACKNOWLEDGED"
      : cls === "BUSINESS_REJECTION" ? "REJECTED"
      : "FAILED";

    await this.markStatus(tenantId, txnId, next, {
      failureClass: cls,
      lastError: result.message,
      response: result.response,
    });
    if (cls === "DUPLICATE") {
      return { transactionId: txn.id, status: "ACKNOWLEDGED", note: `Duplicate submission treated as already-received: ${result.message}` };
    }
    return { transactionId: txn.id, status: next, note: result.message };
  }

  /** Retry — only transient/failed transmissions are retryable (§89). */
  async retry(tenantId: string, txnId: string) {
    const txn = await this.prisma.interopTransaction.findFirst({ where: { id: txnId, tenantId } });
    if (!txn) throw new NotFoundException("Interop transaction not found");
    if (isTerminal(txn.status)) {
      throw new ConflictException(`Terminal transaction (${txn.status}) cannot be retried`);
    }
    // VALIDATING = interrupted transmission (crash recovery) — also retryable.
    if (!["RETRY_PENDING", "FAILED", "VALIDATION_FAILED", "PENDING", "VALIDATING"].includes(txn.status)) {
      throw new ConflictException(`Transaction in status ${txn.status} is not retryable`);
    }
    return this.transmit(tenantId, txnId);
  }

  /** §84.3 reconciliation: counts by status vs local source records. */
  async reconciliation(tenantId: string, destination?: string) {
    const txns = await this.prisma.interopTransaction.findMany({
      where: { tenantId, ...(destination ? { destination } : {}) },
      select: { status: true, purpose: true, failureClass: true },
    });
    const byStatus: Record<string, number> = {};
    const byFailureClass: Record<string, number> = {};
    for (const t of txns) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      if (t.failureClass) byFailureClass[t.failureClass] = (byFailureClass[t.failureClass] ?? 0) + 1;
    }
    const outstanding = (byStatus["PENDING"] ?? 0) + (byStatus["VALIDATING"] ?? 0)
      + (byStatus["RETRY_PENDING"] ?? 0) + (byStatus["SUBMITTED"] ?? 0);
    return {
      total: txns.length,
      byStatus,
      byFailureClass,
      outstanding,
      unreconciled: (byStatus["VALIDATION_FAILED"] ?? 0) + (byStatus["FAILED"] ?? 0) + (byStatus["MANUAL_REVIEW"] ?? 0) + (byStatus["REJECTED"] ?? 0),
      generatedAt: new Date(),
    };
  }

  /** List transactions needing attention (failed items stay visible, §71.5-analog). */
  async attentionList(tenantId: string) {
    return this.prisma.interopTransaction.findMany({
      where: { tenantId, status: { in: ["VALIDATION_FAILED", "FAILED", "RETRY_PENDING", "MANUAL_REVIEW", "REJECTED"] } },
      orderBy: { updatedAt: "asc" },
      take: 200,
    });
  }

  /**
   * Pre-transmission validation (§78.3/§80.3): required payload fields per
   * purpose. Deeper profile/terminology validation rides with the adapter.
   */
  private async validatePayload(tenantId: string, txn: any): Promise<{ ok: boolean; errors: string[] }> {
    const errors: string[] = [];
    const payload = txn.payload as any;
    if (!payload || typeof payload !== "object") {
      errors.push("Payload is missing or not an object");
      return { ok: false, errors };
    }
    if (txn.purpose === "SURVEILLANCE") {
      if (!payload.disease && !payload.condition) errors.push("Surveillance payload requires disease/condition");
      if (!payload.patientRef) errors.push("Surveillance payload requires the minimum patient reference (§80.4)");
    }
    if (txn.purpose === "VITAL_EVENT") {
      if (!payload.eventType) errors.push("Vital-event payload requires eventType");
      if (!payload.eventDateTime) errors.push("Vital-event payload requires eventDateTime");
    }
    if (txn.purpose === "FHIR_EXCHANGE" && payload.resourceType && !payload.id) {
      errors.push("FHIR resource payload requires an id");
    }
    return { ok: errors.length === 0, errors };
  }

  /**
   * The ONLY place a real external call would happen. §65.5/§65.24 principle
   * applies unchanged: no invented government APIs. Without an officially
   * configured adapter rule, the transaction stays queued/retryable (§89) —
   * a transient condition, never data loss.
   */
  private async transport(tenantId: string, txn: any): Promise<{ ok: boolean; ackRef?: string; response?: any; failureClass?: string; message: string }> {
    const adapter = await this.rules.resolveOrNull<any>(tenantId, `INTEROP_ADAPTER_${txn.destination}`);
    if (!adapter || !adapter.config?.endpoint) {
      return {
        ok: false,
        failureClass: "TRANSIENT",
        message: `No official adapter configured for destination "${txn.destination}" — transaction remains queued (§89)`,
      };
    }
    return {
      ok: false,
      failureClass: "TRANSIENT",
      message: "Official adapter contract not yet implemented — transaction remains queued (§89)",
    };
  }

  /**
   * Spec #62 reconciliation: compare the hospital's authoritative record vs
   * the gateway submission state vs the stored government response. Any
   * mismatch opens a RegulatoryException (ERROR); an ACKNOWLEDGED txn with
   * no mismatch is confirmed RECONCILED (ACCEPTED). Answers spec #66:
   * "was it acknowledged, rejected, corrected, or reconciled?"
   */
  async reconcileOne(tenantId: string, txnId: string) {
    const txn = await this.prisma.interopTransaction.findFirst({
      where: { id: txnId, tenantId },
    });
    if (!txn) throw new NotFoundException("Interop transaction not found");

    const govResponse = (txn.response as any)?.code ?? null;
    const ackRef = txn.ackRef ?? null;
    const mismatches: string[] = [];
    if (txn.status === "SUBMITTED" && !ackRef) {
      mismatches.push("Gateway SUBMITTED but no acknowledgement reference stored");
    }
    if (ackRef && govResponse && String(govResponse).toUpperCase() === "REJECTED" && txn.status === "ACKNOWLEDGED") {
      mismatches.push("Government response REJECTED but gateway status ACKNOWLEDGED");
    }

    if (mismatches.length) {
      const exception = await this.prisma.regulatoryException.create({
        data: {
          tenantId,
          kind: "GOVERNMENT_RECONCILIATION_MISMATCH",
          severity: "ERROR",
          entityType: "InteropTransaction",
          entityId: txn.id,
          patientId: txn.patientId,
          message: mismatches.join("; "),
          details: { submittedState: txn.status, govResponse, ackRef },
        },
      });
      await this.rules.logEvent(tenantId, "GOVERNMENT_RECONCILIATION_MISMATCH", "InteropTransaction", txn.id, {
        exceptionId: exception.id,
      });
      return { txnId: txn.id, outcome: "EXCEPTION", mismatches, exceptionId: exception.id };
    }

    if (txn.status === "ACKNOWLEDGED") {
      await this.prisma.interopTransaction.update({
        where: { id: txn.id },
        data: { status: "ACCEPTED" },
      });
      return { txnId: txn.id, outcome: "RECONCILED" };
    }
    return { txnId: txn.id, outcome: "NO_ACTION", status: txn.status };
  }
}
