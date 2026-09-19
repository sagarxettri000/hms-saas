import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { MssService } from "./mss.service";
import { ProgramsService } from "./programs.service";
import { DisasterOfflineService } from "./disaster-offline.service";
import { BilingualService } from "./bilingual.service";

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
    private readonly mss: MssService,
    private readonly programs: ProgramsService,
    private readonly disasterOffline: DisasterOfflineService,
    private readonly bilingual: BilingualService,
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

  // ---------------- MSS compliance (spec §66) ----------------

  @Post("mss/sets")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Publish a versioned MSS standard set (declared count is metadata, §66.1)" })
  publishMssSet(@Body() body: any, @Req() req: any) {
    return this.mss.publishStandardSet(req.user.tenantId, {
      setName: body.setName,
      facilityLevel: body.facilityLevel,
      declaredCount: Number(body.declaredCount),
      authority: body.authority,
      sourceRef: body.sourceRef,
      standards: body.standards ?? [],
      createdBy: req.user.id,
    });
  }

  @Get("mss/sets/active")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Active MSS set for a facility level" })
  activeMssSet(@Query("facilityLevel") facilityLevel: string, @Req() req: any) {
    return this.mss.getActiveSet(req.user.tenantId, facilityLevel);
  }

  @Post("mss/standards/:id/assess")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Assess a standard (evidence-gated compliance, §66.2)" })
  assessMssStandard(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.mss.assessStandard(req.user.tenantId, id, {
      proposedStatus: body.status,
      score: body.score != null ? Number(body.score) : undefined,
      comments: body.comments,
      assessedBy: req.user.id,
    });
  }

  @Post("mss/standards/:id/evidence")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Upload evidence for a standard (§66.3)" })
  uploadMssEvidence(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.mss.uploadEvidence(req.user.tenantId, id, {
      title: body.title,
      docType: body.docType,
      documentRef: body.documentRef,
      documentVersion: body.documentVersion,
      validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
      validTo: body.validTo ? new Date(body.validTo) : undefined,
      uploadedBy: req.user.id,
    });
  }

  @Post("mss/evidence/:id/verify")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Verify or reject evidence (§66.3)" })
  verifyMssEvidence(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.mss.verifyEvidence(req.user.tenantId, id, {
      decision: body.decision,
      reviewerId: req.user.id,
      notes: body.notes,
    });
  }

  @Get("mss/scores")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Weighted compliance scores by domain (§66.2)" })
  mssScores(@Query("facilityLevel") facilityLevel: string, @Req() req: any) {
    return this.mss.computeScores(req.user.tenantId, facilityLevel);
  }

  @Get("mss/trend")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Historical compliance trend (§66.5)" })
  mssTrend(@Query("facilityLevel") facilityLevel: string, @Req() req: any) {
    return this.mss.getTrend(req.user.tenantId, facilityLevel);
  }

  @Get("mss/capa")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Corrective actions incl. overdue (§66.4)" })
  mssCapa(@Req() req: any) {
    return this.mss.listCapa(req.user.tenantId);
  }

  @Post("mss/capa/:id/close")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Close a corrective action" })
  closeMssCapa(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.mss.closeCapa(req.user.tenantId, id, {
      reviewNotes: body.reviewNotes,
      closedBy: req.user.id,
    });
  }

  // ---------------- Government medicine (spec §67) ----------------

  @Post("gov-medicine/batches")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Register a government-program batch (segregated stock, §67.1)" })
  registerGovBatch(@Body() body: any, @Req() req: any) {
    return this.programs.registerGovBatch(req.user.tenantId, {
      itemId: body.itemId,
      name: body.name,
      storeId: body.storeId,
      medicineId: body.medicineId,
      batchNumber: body.batchNumber,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
      quantity: Number(body.quantity),
      unit: body.unit,
      programName: body.programName,
      govScheme: body.govScheme,
      procurementSource: body.procurementSource,
      distributionRestrictions: body.distributionRestrictions,
      eligiblePopulation: body.eligiblePopulation,
      reportingRequirements: body.reportingRequirements,
      receivedDate: body.receivedDate ? new Date(body.receivedDate) : undefined,
      createdBy: req.user.id,
    });
  }

  @Post("gov-medicine/dispense")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Dispense from government stock (utilization recorded, charge blocked, §67.3)" })
  dispenseGov(@Body() body: any, @Req() req: any) {
    return this.programs.dispenseGov(req.user.tenantId, {
      itemId: body.itemId,
      patientId: body.patientId,
      encounterId: body.encounterId,
      quantity: Number(body.quantity),
      createdBy: req.user.id,
    });
  }

  @Get("gov-medicine/reconciliation")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Program inventory reconciliation (§67.4)" })
  govReconciliation(@Query("program") program: string | undefined, @Req() req: any) {
    return this.programs.govReconciliation(req.user.tenantId, program);
  }

  // ---------------- Aama / Safe Motherhood (spec §68) ----------------

  @Post("aama/cases")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create an Aama incentive case (idempotent on caseNumber, §68.4)" })
  createAamaCase(@Body() body: any, @Req() req: any) {
    return this.programs.createAamaCase(req.user.tenantId, {
      patientId: body.patientId,
      caseNumber: body.caseNumber,
      pregnancyRef: body.pregnancyRef,
      deliveryEncounterId: body.deliveryEncounterId,
      deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : undefined,
      facilityName: body.facilityName,
      ancMilestones: body.ancMilestones,
      createdBy: req.user.id,
    });
  }

  @Post("aama/cases/:id/eligibility")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Assess eligibility against the active Aama rule (§68.1)" })
  assessAama(@Param("id") id: string, @Req() req: any) {
    return this.programs.assessAamaEligibility(req.user.tenantId, id);
  }

  @Post("aama/cases/:id/approve")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Approve the incentive (ceiling from rule, §68.3)" })
  approveAama(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.programs.approveAama(req.user.tenantId, id, Number(body.amount), req.user.id);
  }

  @Post("aama/cases/:id/payment/submit")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Submit approved incentive for payment" })
  submitAamaPayment(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.programs.submitAamaPayment(req.user.tenantId, id, body.paymentRef);
  }

  @Post("aama/cases/:id/payment/outcome")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Record PAID/FAILED/REJECTED — failed stays retryable (§68.3)" })
  recordAamaPayment(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.programs.recordAamaPayment(req.user.tenantId, id, body.outcome, {
      paymentRef: body.paymentRef,
      failureReason: body.failureReason,
    });
  }

  @Post("aama/cases/:id/payment/retry")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Retry a FAILED payment (traceable chain)" })
  retryAamaPayment(@Param("id") id: string, @Req() req: any) {
    return this.programs.retryAamaPayment(req.user.tenantId, id);
  }

  // ---------------- Sifaris (spec §69) ----------------

  @Post("sifaris")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Register a ward/municipality recommendation (§69.1)" })
  registerSifaris(@Body() body: any, @Req() req: any) {
    return this.programs.registerSifaris(req.user.tenantId, {
      patientId: body.patientId,
      encounterId: body.encounterId,
      relatedProgram: body.relatedProgram,
      relatedCaseId: body.relatedCaseId,
      municipality: body.municipality,
      wardNo: body.wardNo,
      recommendationNo: body.recommendationNo,
      issueDate: new Date(body.issueDate),
      issuingAuthority: body.issuingAuthority,
      recommendedBenefit: body.recommendedBenefit,
      validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
      validTo: body.validTo ? new Date(body.validTo) : undefined,
      documentRef: body.documentRef,
      documentHash: body.documentHash,
      createdBy: req.user.id,
    });
  }

  @Post("sifaris/:id/verify")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Verify or reject a Sifaris (§69.3)" })
  verifySifaris(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.programs.verifySifaris(req.user.tenantId, id, body.decision, req.user.id, body.notes);
  }

  @Get("sifaris/:id/eligibility-check")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Does this Sifaris currently qualify for benefits? (§69.3)" })
  checkSifaris(@Param("id") id: string, @Req() req: any) {
    return this.programs.assertSifarisEligible(req.user.tenantId, id);
  }

  @Get("patients/:patientId/sifaris")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "All Sifaris documents for a patient (§69.4 audit chain)" })
  patientSifaris(@Param("patientId") patientId: string, @Req() req: any) {
    return this.programs.listSifarisForPatient(req.user.tenantId, patientId);
  }

  // ---------------- Disaster / HEOC (spec §70) ----------------

  @Post("disaster/activate")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Activate disaster / mass-casualty mode (§70.1)" })
  activateDisaster(@Body() body: any, @Req() req: any) {
    return this.disasterOffline.activate(req.user.tenantId, {
      mode: body.mode,
      incidentName: body.incidentName,
      incidentType: body.incidentType,
      incidentRef: body.incidentRef,
      authority: body.authority,
      expectedDurationHours: body.expectedDurationHours ? Number(body.expectedDurationHours) : undefined,
      activatedBy: req.user.id,
    });
  }

  @Post("disaster/:id/deactivate")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "End a disaster activation" })
  deactivateDisaster(@Param("id") id: string, @Req() req: any) {
    return this.disasterOffline.deactivate(req.user.tenantId, id, req.user.id);
  }

  @Get("disaster/active")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Currently active activation" })
  activeDisaster(@Req() req: any) {
    return this.disasterOffline.activeActivation(req.user.tenantId);
  }

  @Post("disaster/intake")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Rapid casualty intake — minimal identity (§70.2)" })
  rapidIntake(@Body() body: any, @Req() req: any) {
    return this.disasterOffline.rapidIntake(req.user.tenantId, {
      activationId: body.activationId,
      tempCasualtyId: body.tempCasualtyId,
      wristbandCode: body.wristbandCode,
      displayName: body.displayName,
      patientId: body.patientId,
      payerClass: body.payerClass,
      createdBy: req.user.id,
    });
  }

  @Post("disaster/casualties/:id/triage")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Record color-coded triage (append-only history, §70.3)" })
  triageCasualty(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.disasterOffline.recordTriage(req.user.tenantId, id, {
      category: body.category,
      triageOfficer: req.user.id,
      clinicalFindings: body.clinicalFindings,
      destination: body.destination,
    });
  }

  @Post("disaster/casualties/:id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update casualty disposition status" })
  casualtyStatus(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.disasterOffline.setCasualtyStatus(req.user.tenantId, id, body.status);
  }

  @Post("disaster/casualties/:id/reconcile-identity")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Link a provisional casualty to the definitive patient (§70.5)" })
  reconcileCasualty(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.disasterOffline.reconcileIdentity(req.user.tenantId, id, body.patientId, body.payerClass);
  }

  @Get("disaster/dashboard")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Mass-casualty dashboard (counts only, §70.6)" })
  disasterDashboard(@Req() req: any) {
    return this.disasterOffline.dashboard(req.user.tenantId);
  }

  // ---------------- Offline sync (spec §71) ----------------

  @Post("offline/enqueue")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Queue a local transaction for sync (idempotent, §71.2/§71.4)" })
  offlineEnqueue(@Body() body: any, @Req() req: any) {
    return this.disasterOffline.enqueue(req.user.tenantId, {
      localTxnId: body.localTxnId,
      localNodeId: body.localNodeId,
      userId: req.user.id,
      entityType: body.entityType,
      entityId: body.entityId,
      operationType: body.operationType,
      payload: body.payload,
      checksum: body.checksum,
      sequenceNo: body.sequenceNo != null ? Number(body.sequenceNo) : undefined,
    });
  }

  @Post("offline/sync")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Upload a batch on reconnection — no duplicates (§71.4)" })
  offlineSync(@Body() body: any, @Req() req: any) {
    return this.disasterOffline.syncBatch(req.user.tenantId, body.items ?? []);
  }

  @Post("offline/items/:id/resolve-conflict")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Resolve a conflict (financial items force manual review, §71.5)" })
  resolveOfflineConflict(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.disasterOffline.resolveConflict(req.user.tenantId, id, body.resolution, req.user.id, body.notes);
  }

  @Get("offline/failed")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Failed/conflicted sync items visible until resolved (§71.5)" })
  offlineFailed(@Query("localNodeId") localNodeId: string | undefined, @Req() req: any) {
    return this.disasterOffline.failedItems(req.user.tenantId, localNodeId);
  }

  // ---------------- Bilingual documents (spec §72) ----------------

  @Post("translations")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Upsert a versioned dictionary term (§72.3)" })
  upsertTerm(@Body() body: any, @Req() req: any) {
    return this.bilingual.upsertTerm(req.user.tenantId, {
      domain: body.domain,
      sourceText: body.sourceText,
      language: body.language,
      translatedText: body.translatedText,
      createdBy: req.user.id,
    });
  }

  @Post("translations/bulk")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Bulk-upsert dictionary terms" })
  bulkUpsertTerms(@Body() body: any, @Req() req: any) {
    return this.bilingual.bulkUpsertTerms(req.user.tenantId, body.terms ?? []);
  }

  @Post("translations/translate")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Translate presentation text (missing terms fall back)" })
  translate(@Body() body: any, @Req() req: any) {
    return this.bilingual.t(req.user.tenantId, body.domain, body.text, body.language ?? "ne");
  }

  @Post("translations/prescription")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Localize a structured prescription (values preserved, §72.2)" })
  localizePrescription(@Body() body: any, @Req() req: any) {
    return this.bilingual.localizePrescription(req.user.tenantId, body.instructions, body.language ?? "ne");
  }

  @Post("translations/thermal-receipt")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Build bilingual thermal-receipt content (§72.4)" })
  thermalReceipt(@Body() body: any, @Req() req: any) {
    return this.bilingual.buildThermalReceipt(
      req.user.tenantId,
      { ...body, dateTime: new Date(body.dateTime ?? Date.now()) },
      body.language ?? "ne",
    );
  }
}
