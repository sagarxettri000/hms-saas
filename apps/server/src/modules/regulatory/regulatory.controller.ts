import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";
import { RegulatoryService } from "./regulatory.service";
import { RegulatoryRuleService } from "./regulatory-rule.service";

/**
 * Nepal Regulatory & Special Patient Care API (spec §65).
 * All routes tenant-scoped, permission-guarded; sensitive surfaces
 * (brain death, VIP) enforce need-to-know in the service layer.
 */
@ApiTags("Regulatory")
@Controller("regulatory")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class RegulatoryController {
  constructor(
    private readonly regulatory: RegulatoryService,
    private readonly rules: RegulatoryRuleService,
  ) {}

  // ---------------- Rule engine (admin configuration) ----------------

  @Post("rules")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a new regulatory rule version" })
  createRule(@Body() body: any, @Req() req: any) {
    return this.rules.createVersion(req.user.tenantId, {
      ruleKey: body.ruleKey,
      ruleName: body.ruleName,
      authority: body.authority,
      legalReference: body.legalReference,
      category: body.category,
      config: body.config,
      effectiveFrom: new Date(body.effectiveFrom),
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      createdBy: req.user.id,
      approvedBy: body.approvedBy,
    });
  }

  @Post("rules/:id/approve")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Approve a DRAFT rule version (SoD: creator ≠ approver)" })
  approveRule(@Param("id") id: string, @Req() req: any) {
    return this.rules.approve(req.user.tenantId, id, req.user.id);
  }

  @Post("rules/:id/retire")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Retire a rule version immediately" })
  retireRule(@Param("id") id: string, @Req() req: any) {
    return this.rules.retire(req.user.tenantId, id, req.user.id);
  }

  @Get("rules/:ruleKey/versions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Full version history of a rule" })
  ruleVersions(@Param("ruleKey") ruleKey: string, @Req() req: any) {
    return this.rules.listVersions(req.user.tenantId, ruleKey);
  }

  @Get("rules/resolve/:ruleKey")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Resolve the currently active rule" })
  resolveRule(@Param("ruleKey") ruleKey: string, @Req() req: any) {
    return this.rules.resolve(req.user.tenantId, ruleKey);
  }

  // ---------------- Free-bed quota ----------------

  @Get("free-beds/dashboard")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Free-bed quota compliance dashboard" })
  freeBedDashboard(@Req() req: any) {
    return this.regulatory.getFreeBedDashboard(req.user.tenantId);
  }

  @Post("free-beds")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Assign an eligible patient under the free-bed quota" })
  assignFreeBed(@Body() body: any, @Req() req: any) {
    return this.regulatory.assignFreeBed(req.user.tenantId, {
      patientId: body.patientId,
      encounterId: body.encounterId,
      admissionId: body.admissionId,
      bedId: body.bedId,
      eligibilityBasis: body.eligibilityBasis,
      verificationDocRef: body.verificationDocRef,
      verificationAuthority: body.verificationAuthority,
      createdBy: req.user.id,
    });
  }

  @Post("free-beds/:id/release")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Release a free-bed allocation (discharge)" })
  releaseFreeBed(@Param("id") id: string, @Req() req: any) {
    return this.regulatory.releaseFreeBed(req.user.tenantId, id, req.user.id);
  }

  // ---------------- SSU ----------------

  @Post("ssu/assessments")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create an SSU socioeconomic assessment" })
  createSsuAssessment(@Body() body: any, @Req() req: any) {
    return this.regulatory.createSsuAssessment(req.user.tenantId, {
      patientId: body.patientId,
      encounterId: body.encounterId,
      invoiceId: body.invoiceId,
      economicTier: body.economicTier,
      diseaseCategory: body.diseaseCategory,
      treatmentCategory: body.treatmentCategory,
      householdIncome: body.householdIncome,
      assessmentNotes: body.assessmentNotes,
      documents: body.documents,
      recommendedSubsidy: body.recommendedSubsidy,
      totalBillAmount: body.totalBillAmount,
      createdBy: req.user.id,
    });
  }

  @Post("ssu/assessments/:id/committee-decision")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Record an SSU committee decision (SoD enforced)" })
  decideSsu(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.regulatory.decideSsuAssessment(req.user.tenantId, id, {
      decision: body.decision,
      members: body.members,
      approvedAmount: body.approvedAmount,
      reason: body.reason,
      decidedBy: req.user.id,
      governmentContribution: body.governmentContribution,
      hospitalContribution: body.hospitalContribution,
      patientContribution: body.patientContribution,
    });
  }

  @Get("ssu/assessments/:id/reconcile")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Reconcile the SSU funding split against the bill" })
  reconcileSsu(@Param("id") id: string, @Req() req: any) {
    return this.regulatory.reconcileSsu(req.user.tenantId, id);
  }

  // ---------------- Bipanna Nagarik Kosh ----------------

  @Post("bipanna/cases")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a Bipanna case (disease list from active rule)" })
  createBipannaCase(@Body() body: any, @Req() req: any) {
    return this.regulatory.createBipannaCase(req.user.tenantId, {
      patientId: body.patientId,
      diseaseCategory: body.diseaseCategory,
      diagnosis: body.diagnosis,
      createdBy: req.user.id,
    });
  }

  @Post("bipanna/cases/:id/approve-assistance")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Approve Bipanna assistance (ceiling from rule)" })
  approveBipanna(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.regulatory.approveBipannaAssistance(
      req.user.tenantId,
      id,
      Number(body.amount),
      req.user.id,
    );
  }

  @Post("bipanna/cases/:id/utilize")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Record assistance utilization (over-utilization blocked)" })
  utilizeBipanna(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.regulatory.utilizeBipannaAssistance(
      req.user.tenantId,
      id,
      Number(body.amount),
      body.reference,
      req.user.id,
    );
  }

  @Post("bipanna/cases/:id/claims")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Submit a Bipanna claim (≤ utilized)" })
  claimBipanna(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.regulatory.submitBipannaClaim(
      req.user.tenantId,
      id,
      Number(body.amount),
      req.user.id,
    );
  }

  @Post("bipanna/cases/:id/settlement")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Record claim approval/receipt/rejection" })
  settleBipanna(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.regulatory.settleBipannaClaim(req.user.tenantId, id, {
      approvedClaim: Number(body.approvedClaim),
      received: Number(body.received),
      rejected: Number(body.rejected),
      userId: req.user.id,
    });
  }

  // ---------------- Brain death & donor coordination (restricted) ----------------

  @Post("brain-death/cases")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Start a brain-death documentation protocol" })
  startBrainDeath(@Body() body: any, @Req() req: any) {
    return this.regulatory.startBrainDeathProtocol(req.user.tenantId, {
      patientId: body.patientId,
      admissionId: body.admissionId,
      encounterId: body.encounterId,
      createdBy: req.user.id,
    });
  }

  @Post("brain-death/cases/:id/steps")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Record a protocol step / status change (certification gated)" })
  brainDeathStep(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.regulatory.recordBrainDeathStep(req.user.tenantId, id, {
      status: body.status,
      step: body.step,
      clinicianId: req.user.id,
      notes: body.notes,
    });
  }

  @Post("brain-death/cases/:id/donor-alert")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Send a donor-coordination alert to authorized recipients" })
  donorAlert(@Param("id") id: string, @Req() req: any) {
    return this.regulatory.sendDonorAlert(req.user.tenantId, id, req.user.id);
  }

  // ---------------- Senior citizen priority queue ----------------

  @Post("senior/queue")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Enqueue a senior-citizen priority token" })
  enqueueSenior(@Body() body: any, @Req() req: any) {
    return this.regulatory.enqueueSenior(req.user.tenantId, {
      patientId: body.patientId,
      servicePoint: body.servicePoint,
      encounterId: body.encounterId,
      dateOfBirth: new Date(body.dateOfBirth),
      emergencyTriageLevel: body.emergencyTriageLevel,
      overrideReason: body.overrideReason,
      handledBy: req.user.id,
    });
  }

  @Post("senior/queue/:id/serve")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Mark a queue entry as served (records waiting time)" })
  serveSenior(@Param("id") id: string, @Req() req: any) {
    return this.regulatory.serveSeniorQueueEntry(req.user.tenantId, id, req.user.id);
  }

  @Get("senior/queue")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Priority queue entries" })
  seniorQueue(@Req() req: any) {
    return this.regulatory.seniorQueueList(req.user.tenantId);
  }

  // ---------------- VIP / VVIP ----------------

  @Post("vip/classify")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create an authorized VIP/VVIP classification" })
  classifyVip(@Body() body: any, @Req() req: any) {
    return this.regulatory.classifyVip(req.user.tenantId, {
      patientId: body.patientId,
      level: body.level,
      authorizedBy: body.authorizedBy ?? req.user.id,
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : undefined,
      accessPolicy: body.accessPolicy,
      createdBy: req.user.id,
    });
  }

  @Post("vip/:patientId/access")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Gate a VIP record access attempt (logs + break-glass)" })
  vipAccess(@Param("patientId") patientId: string, @Body() body: any, @Req() req: any) {
    return this.regulatory.assertVipAccess(req.user.tenantId, patientId, req.user, {
      action: body.action ?? "VIEW",
      reason: body.reason ?? "",
      module: body.module,
      breakGlass: body.breakGlass,
      ip: req.ip,
      sessionId: req.user?.sessionId,
    });
  }

  @Get("vip/:patientId/access-log")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Immutable VIP access log" })
  vipAccessLog(@Param("patientId") patientId: string, @Req() req: any) {
    return this.regulatory.vipAccessLogList(req.user.tenantId, patientId);
  }

  @Post("vip/classifications/:id/revoke")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Revoke a VIP classification" })
  revokeVip(@Param("id") id: string, @Req() req: any) {
    return this.regulatory.revokeVip(req.user.tenantId, id, req.user.id);
  }

  // ---------------- Sync, waterfall, dashboards ----------------

  @Get("gov-sync")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Government sync queue/status records" })
  govSync(@Req() req: any) {
    return this.regulatory.govSyncList(req.user.tenantId);
  }

  @Get("invoices/:invoiceId/funding-waterfall")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Auditable funding waterfall for a bill" })
  fundingWaterfall(@Param("invoiceId") invoiceId: string, @Req() req: any) {
    return this.regulatory.getFundingWaterfall(req.user.tenantId, invoiceId);
  }

  @Get("invoices/:invoiceId/double-funding-check")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Potential duplicate-funding check" })
  doubleFunding(@Param("invoiceId") invoiceId: string, @Req() req: any) {
    return this.regulatory.checkDoubleFunding(req.user.tenantId, invoiceId);
  }

  @Get("dashboard/compliance")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Regulatory compliance dashboard (§65.41)" })
  complianceDashboard(@Req() req: any) {
    return this.regulatory.getComplianceDashboard(req.user.tenantId);
  }

  @Get("events")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Regulatory event log" })
  events(@Req() req: any) {
    return this.regulatory.regulatoryEventList(req.user.tenantId);
  }

  @Get("exceptions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Compliance exception register" })
  exceptions(@Req() req: any) {
    return this.regulatory.exceptionList(req.user.tenantId);
  }
}
