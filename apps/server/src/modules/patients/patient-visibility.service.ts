import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Clinical-context-based patient visibility (spec §64).
 *
 * Principle: a patient is not visible because the patient exists. Visibility
 * requires a current, authorized clinical relationship:
 *
 *   current location + assignment + user authorization = visibility
 *
 * Access tiers (§64.17):
 *  - BROAD   — admins see everything (worklists + master index).
 *  - ADMIN   — registration/financial roles see the administrative master
 *              index (registration, billing, audit) but hold no worklist.
 *  - CLINICAL— doctors/nurses/technicians see only patients whose CURRENT
 *              clinical context (active/temporary location) or active care
 *              relationship (encounter/admission) matches their authorization.
 *              Historical care relationships grant record access (§64.18),
 *              never worklist visibility.
 */

type Mode = "BROAD" | "ADMIN" | "CLINICAL";

const BROAD_ROLES = new Set([
  "PLATFORM_SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "HOSPITAL_OWNER",
  "DEPARTMENT_HEAD",
]);

/** Administrative master-index access without clinical worklists (§64.24). */
const ADMIN_INDEX_ROLES = new Set([
  "RECEPTIONIST",
  "RECEPTION_SUPERVISOR",
  "FINANCE_MANAGER",
  "INSURANCE_OFFICER",
  "HR_MANAGER",
  "IT_ADMIN",
  "QUALITY_MANAGER",
  "AUDITOR",
]);

const ACTIVE_STATUSES = ["ACTIVE", "TEMPORARY"] as const;

export interface ClinicalContext {
  mode: Mode;
  departmentId: string | null;
  doctorId: string | null;
}

export interface VisibilityUser {
  id: string;
  tenantId: string;
  role?: string;
  userId?: string;
}

@Injectable()
export class PatientVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve the user's visibility mode + clinical identity. */
  async getContext(user: VisibilityUser): Promise<ClinicalContext> {
    const role = user.role ?? "";
    if (BROAD_ROLES.has(role)) {
      return { mode: "BROAD", departmentId: null, doctorId: null };
    }
    if (ADMIN_INDEX_ROLES.has(role)) {
      return { mode: "ADMIN", departmentId: null, doctorId: null };
    }

    let departmentId: string | null = null;
    let doctorId: string | null = null;
    if (user.userId ?? user.id) {
      const [staff, doctor] = await Promise.all([
        this.prisma.staffProfile
          .findFirst({
            where: { userId: user.userId ?? user.id, tenantId: user.tenantId },
            select: { departmentId: true },
          })
          .catch(() => null),
        this.prisma.doctorProfile
          .findFirst({
            where: { userId: user.userId ?? user.id, tenantId: user.tenantId },
            select: { id: true },
          })
          .catch(() => null),
      ]);
      departmentId = staff?.departmentId ?? null;
      doctorId = doctor?.id ?? null;
    }

    return { mode: "CLINICAL", departmentId, doctorId };
  }

  /**
   * Prisma filter for ACTIVE patient worklists (§64.23). Clinical users get
   * only patients whose current context matches; ADMIN/BROAD get everything.
   */
  async buildActiveListFilter(user: VisibilityUser): Promise<any> {
    const ctx = await this.getContext(user);

    // §65.56/§65.58: VIP patients are excluded from list/search results for
    // everyone except roles explicitly configured to see them in lists.
    // (Authorized users still open the record via the logged VIP gate.)
    const vipFilter = await this.buildVipListExclusion(user);

    if (ctx.mode !== "CLINICAL") {
      return vipFilter ? { AND: [vipFilter] } : {};
    }

    const or: any[] = [
      // Current clinical context in the user's department.
      {
        locations: {
          some: { status: { in: [...ACTIVE_STATUSES] }, departmentId: ctx.departmentId ?? "__none__" },
        },
      },
    ];
    if (ctx.doctorId) {
      // Active care relationship: my encounter or my admission.
      or.push({ encounters: { some: { doctorId: ctx.doctorId, status: { in: ["ACTIVE", "ADMITTED"] } } } });
      or.push({ admissions: { some: { admittingDoctorId: ctx.doctorId, status: { in: ["ADMITTED"] } } } });
    } else if (!ctx.departmentId) {
      // Clinical role with no department and no doctor identity → no
      // clinical worklist visibility at all (never "patient exists").
      return { id: { in: ["__no_clinical_context__"] } };
    }
    return vipFilter ? { AND: [{ OR: or }, vipFilter] } : { OR: or };
  }

  /** §65.56: ACTIVE VIP patients vanish from lists unless role-allowlisted. */
  private async buildVipListExclusion(user: VisibilityUser): Promise<any | null> {
    if (!(this.prisma as any).vipClassification) return null;
    const rule = await (this.prisma as any).regulatoryRule
      ?.findFirst({
        where: { tenantId: user.tenantId, ruleKey: "vip_access_policy", status: "ACTIVE" },
        orderBy: { version: "desc" },
      })
      .catch(() => null);
    const listRoles: string[] = rule?.config?.listVisibilityRoles ?? [];
    if (listRoles.includes(user.role ?? "")) return null;
    return { vipClassifications: { none: { status: "ACTIVE" } } };
  }

  /**
   * Whether the user may open a patient's record (§64.16/§64.17). Clinical
   * users need a current or historical care relationship; "exists" is never
   * a reason.
   */
  async canAccessPatient(user: VisibilityUser, patientId: string): Promise<boolean> {
    const ctx = await this.getContext(user);
    if (ctx.mode !== "CLINICAL") return true;

    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) return false;

    // Current clinical context in my department.
    const location = await this.prisma.patientLocation.findFirst({
      where: {
        tenantId: user.tenantId,
        patientId,
        status: { in: [...ACTIVE_STATUSES] },
        ...(ctx.departmentId ? { departmentId: ctx.departmentId } : {}),
      },
      select: { id: true },
    });
    if (location) return true;

    if (ctx.doctorId) {
      // Active or historical care relationship (§64.18): encounter/admission
      // linkage grants record access regardless of current location.
      const asDoctor = await this.prisma.encounter.findFirst({
        where: { tenantId: user.tenantId, patientId, doctorId: ctx.doctorId },
        select: { id: true },
      });
      if (asDoctor) return true;
      const asAdmitting = await this.prisma.admission.findFirst({
        where: { tenantId: user.tenantId, patientId, admittingDoctorId: ctx.doctorId },
        select: { id: true },
      });
      if (asAdmitting) return true;
    }

    return false;
  }

  /** Guard for detail endpoints — throws Forbidden when unauthorized. */
  async assertCanAccess(user: VisibilityUser, patientId: string): Promise<void> {
    const allowed = await this.canAccessPatient(user, patientId);
    if (!allowed) {
      throw new ForbiddenException(
        "You do not have an authorized clinical relationship with this patient",
      );
    }
  }

  /**
   * Full record-access gate for patient detail endpoints:
   * 1. clinical-context isolation (§64.16)
   * 2. VIP/VVIP restricted-record protocol (§65.32–§65.34): need-to-know
   *    allowlist, every access logged, break-glass with justification and
   *    a high-priority compliance exception. Admins do NOT auto-pass.
   */
  async assertPatientRecordAccess(
    user: VisibilityUser,
    patientId: string,
    opts?: {
      reason?: string;
      breakGlass?: boolean;
      ip?: string;
      sessionId?: string;
      module?: string;
    },
  ): Promise<void> {
    await this.assertCanAccess(user, patientId);

    if (!(this.prisma as any).vipClassification) return;
    const vip = await this.prisma.vipClassification.findFirst({
      where: {
        tenantId: user.tenantId,
        patientId,
        status: "ACTIVE",
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (!vip) return;

    const policy: any = (vip.accessPolicy as any) ?? {};
    const allowedRoles: string[] = policy.allowedRoles ?? [];
    const allowedUsers: string[] = policy.allowedUsers ?? [];

    if (allowedUsers.includes(user.id) || allowedRoles.includes(user.role ?? "")) {
      await this.prisma.vipAccessLog
        .create({
          data: {
            tenantId: user.tenantId,
            patientId,
            vipClassificationId: vip.id,
            userId: user.id,
            userRole: user.role,
            action: "VIEW",
            recordModule: opts?.module,
            ipAddress: opts?.ip,
            sessionId: opts?.sessionId,
            accessReason: opts?.reason,
          },
        })
        .catch(() => undefined);
      return;
    }

    // §65.34 break-glass: substantive reason + high-priority audit trail.
    if (opts?.breakGlass && (opts.reason ?? "").trim().length >= 10) {
      await this.prisma.vipAccessLog
        .create({
          data: {
            tenantId: user.tenantId,
            patientId,
            vipClassificationId: vip.id,
            userId: user.id,
            userRole: user.role,
            action: "BREAK_GLASS",
            recordModule: opts?.module,
            ipAddress: opts?.ip,
            sessionId: opts?.sessionId,
            accessReason: opts?.reason,
          },
        })
        .catch(() => undefined);
      if ((this.prisma as any).regulatoryException) {
        await this.prisma.regulatoryException
          .create({
            data: {
              tenantId: user.tenantId,
              kind: "VIP_BREAK_GLASS",
              severity: "CRITICAL",
              message: `BREAK-GLASS VIP access by ${user.id}: ${opts?.reason}`,
              details: { patientId, userId: user.id, reason: opts?.reason } as any,
              patientId,
            },
          })
          .catch(() => undefined);
      }
      return;
      return;
    }

    throw new ForbiddenException(
      "This record is classified — access requires authorization (break-glass is available with a substantive justification)",
    );
  }

  // ------------------------------------------------------------------
  // Location lifecycle writers (call inside the caller's transaction)
  // ------------------------------------------------------------------

  /**
   * Register the patient into a clinical context. Supersedes any prior
   * ACTIVE primary location (§64.21 — one authoritative location) inside
   * the caller's transaction, then creates the new location row.
   */
  async registerLocation(
    tx: any,
    data: {
      tenantId: string;
      patientId: string;
      encounterId?: string | null;
      admissionId?: string | null;
      locationType: string;
      departmentId?: string | null;
      wardId?: string | null;
      bedId?: string | null;
      createdBy?: string | null;
    },
  ) {
    if (!(tx as any)?.patientLocation) return; // test/mock tolerance
    await tx.patientLocation.updateMany({
      where: {
        tenantId: data.tenantId,
        patientId: data.patientId,
        status: { in: [...ACTIVE_STATUSES] },
      },
      data: { status: "ENDED", endedAt: new Date(), endReason: "Superseded by new location" },
    });
    return tx.patientLocation.create({
      data: {
        tenantId: data.tenantId,
        patientId: data.patientId,
        encounterId: data.encounterId ?? null,
        admissionId: data.admissionId ?? null,
        locationType: data.locationType as any,
        departmentId: data.departmentId ?? null,
        wardId: data.wardId ?? null,
        bedId: data.bedId ?? null,
        status: "ACTIVE",
        isPrimary: true,
        createdBy: data.createdBy ?? null,
      },
    });
  }

  /** End all active locations (discharge / departure). */
  async endLocations(tx: any, tenantId: string, patientId: string, reason: string) {
    if (!(tx as any)?.patientLocation) return;
    await tx.patientLocation.updateMany({
      where: { tenantId, patientId, status: { in: [...ACTIVE_STATUSES] } },
      data: { status: "ENDED", endedAt: new Date(), endReason: reason },
    });
  }

  /** Attach bed/admission to the patient's current active location. */
  async updateActiveLocation(
    tx: any,
    tenantId: string,
    patientId: string,
    patch: { bedId?: string | null; admissionId?: string | null; wardId?: string | null },
  ) {
    if (!(tx as any)?.patientLocation) return;
    const active = await tx.patientLocation.findFirst({
      where: { tenantId, patientId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!active) return;
    return tx.patientLocation.update({ where: { id: active.id }, data: patch });
  }

  /**
   * Transfer request (§64.20): records intent. Visibility does NOT change —
   * the patient stays active at the source until COMPLETED (Test 7).
   */
  async requestTransfer(
    tx: any,
    data: {
      tenantId: string;
      patientId: string;
      toLocationType: string;
      toDepartmentId?: string | null;
      toWardId?: string | null;
      toBedId?: string | null;
      reason?: string | null;
      requestedBy?: string | null;
    },
  ) {
    const from = await tx.patientLocation.findFirst({
      where: { tenantId: data.tenantId, patientId: data.patientId, status: "ACTIVE" },
      select: { id: true },
    });
    return tx.patientTransfer.create({
      data: {
        tenantId: data.tenantId,
        patientId: data.patientId,
        fromLocationId: from?.id ?? null,
        toLocationType: data.toLocationType as any,
        toDepartmentId: data.toDepartmentId ?? null,
        toWardId: data.toWardId ?? null,
        toBedId: data.toBedId ?? null,
        reason: data.reason ?? null,
        status: "REQUESTED",
        requestedBy: data.requestedBy ?? null,
      },
    });
  }

  /**
   * Atomic transfer completion (§64.25/§64.22): source ENDED + destination
   * ACTIVE + bed claimed + transfer COMPLETED in one transaction — the
   * patient can never be active in two locations.
   */
  async completeTransfer(tx: any, tenantId: string, transferId: string, userId?: string) {
    const transfer = await tx.patientTransfer.findFirst({
      where: { id: transferId, tenantId },
    });
    if (!transfer) throw new NotFoundException("Transfer not found");
    if (transfer.status === "COMPLETED") return transfer;
    if (["CANCELLED", "REJECTED"].includes(transfer.status)) {
      throw new ConflictException(`Transfer is ${transfer.status}`);
    }

    // Claim the destination bed atomically (§64.22).
    if (transfer.toBedId) {
      const claimed = await tx.bed.updateMany({
        where: { id: transfer.toBedId, tenantId, status: { not: "OCCUPIED" } },
        data: { status: "OCCUPIED" },
      });
      if (claimed.count === 0) throw new ConflictException("Destination bed is not available");
    }

    await this.endLocations(tx, tenantId, transfer.patientId, `Transferred (${transfer.id})`);

    const dest = await tx.patientLocation.create({
      data: {
        tenantId,
        patientId: transfer.patientId,
        locationType: transfer.toLocationType,
        departmentId: transfer.toDepartmentId,
        wardId: transfer.toWardId,
        bedId: transfer.toBedId,
        status: "ACTIVE",
        isPrimary: true,
        createdBy: userId ?? null,
      },
    });

    return tx.patientTransfer.update({
      where: { id: transferId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedBy: userId ?? null,
        resultingLocationId: dest.id,
      },
    });
  }

  /**
   * Temporary movement (§64.9): the primary location stays ACTIVE; a
   * TEMPORARY row grants the destination department visibility for the
   * procedure duration.
   */
  async beginTemporaryVisit(
    tx: any,
    data: {
      tenantId: string;
      patientId: string;
      locationType: string;
      departmentId?: string | null;
      encounterId?: string | null;
      reason?: string | null;
      createdBy?: string | null;
    },
  ) {
    const primary = await tx.patientLocation.findFirst({
      where: { tenantId: data.tenantId, patientId: data.patientId, status: "ACTIVE", isPrimary: true },
      select: { id: true },
    });
    if (!primary) throw new ConflictException("Patient has no active primary location");
    return tx.patientLocation.create({
      data: {
        tenantId: data.tenantId,
        patientId: data.patientId,
        encounterId: data.encounterId ?? null,
        locationType: data.locationType as any,
        departmentId: data.departmentId ?? null,
        status: "TEMPORARY",
        isPrimary: false,
        createdBy: data.createdBy ?? null,
      },
    });
  }

  async endTemporaryVisit(tx: any, tenantId: string, temporaryLocationId: string) {
    const temp = await tx.patientLocation.findFirst({
      where: { id: temporaryLocationId, tenantId, status: "TEMPORARY" },
    });
    if (!temp) throw new NotFoundException("Temporary visit not found");
    return tx.patientLocation.update({
      where: { id: temporaryLocationId },
      data: { status: "ENDED", endedAt: new Date(), endReason: "Returned from temporary visit" },
    });
  }

  /** Location history (§64.19) — auditable chain of every movement. */
  async getLocationHistory(tenantId: string, patientId: string) {
    return this.prisma.patientLocation.findMany({
      where: { tenantId, patientId },
      orderBy: { startedAt: "desc" },
      include: {
        department: { select: { id: true, name: true } },
        ward: { select: { id: true, name: true } },
        bed: { select: { id: true, bedNumber: true } },
      },
    });
  }
}
