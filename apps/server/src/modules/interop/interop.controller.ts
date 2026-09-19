import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { Permissions, TenantScoped } from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";
import { TerminologyService } from "./terminology.service";
import { InteropGatewayService } from "./interop-gateway.service";
import { PublicHealthService } from "./public-health.service";
import { BloodChainService } from "./blood-chain.service";
import { WasteService } from "./waste.service";
import { FhirMappingService } from "./fhir-mapping.service";

/**
 * National interoperability API (§77–§83). All routes tenant-scoped and
 * permission-guarded; government-adapter configuration never appears here
 * (§86 — credentials stay in rules/env, never in user-reachable payloads).
 */
@ApiTags("Interop")
@Controller("interop")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class InteropController {
  constructor(
    private readonly terminology: TerminologyService,
    private readonly gateway: InteropGatewayService,
    private readonly publicHealth: PublicHealthService,
    private readonly bloodChain: BloodChainService,
    private readonly waste: WasteService,
    private readonly fhirMappings: FhirMappingService,
  ) {}

  // ---------------- ICD-11 terminology (§79) ----------------

  @Post("terminology/icd11/import")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Import a new ICD-11 terminology version (history preserved)" })
  importIcd11(@Body() body: any, @Req() req: any) {
    return this.terminology.importVersion(req.user.tenantId, {
      version: body.version,
      codes: body.codes ?? [],
      createdBy: req.user.id,
    });
  }

  @Get("terminology/icd11/lookup/:code")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Lookup an ICD-11 code" })
  lookupIcd11(@Param("code") code: string, @Query("version") version: string | undefined, @Req() req: any) {
    return this.terminology.lookup(req.user.tenantId, code, version);
  }

  @Get("terminology/icd11/search")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Search ICD-11 by display/code/synonym" })
  searchIcd11(@Query("q") q: string, @Query("version") version: string | undefined, @Req() req: any) {
    return this.terminology.search(req.user.tenantId, q, { version });
  }

  @Post("terminology/icd11/validate")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Validate an ICD-11 code (deprecation-aware)" })
  validateIcd11(@Body() body: any, @Req() req: any) {
    return this.terminology.validate(req.user.tenantId, body.code, body.version);
  }

  @Post("terminology/diagnoses/:id/code")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Attach an ICD-11 code to a diagnosis (version-pinned)" })
  codeDiagnosis(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.terminology.codeDiagnosis(req.user.tenantId, id, {
      icd11Code: body.icd11Code,
      certainty: body.certainty,
      onsetDate: body.onsetDate ? new Date(body.onsetDate) : undefined,
      codedBy: req.user.id,
    });
  }

  // ---------------- FHIR mapping registry (§78.2) ----------------

  @Post("fhir/mappings")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Register a FHIR mapping version entry" })
  upsertMapping(@Body() body: any, @Req() req: any) {
    return this.fhirMappings.upsertMapping(req.user.tenantId, {
      sourceEntity: body.sourceEntity,
      sourceField: body.sourceField,
      fhirResource: body.fhirResource,
      fhirElement: body.fhirElement,
      transformRule: body.transformRule,
      terminologyMap: body.terminologyMap,
      mappingVersion: body.mappingVersion,
      createdBy: req.user.id,
    });
  }

  @Get("fhir/mappings/:sourceEntity")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Effective FHIR mappings for a source entity" })
  resolveMappings(@Param("sourceEntity") sourceEntity: string, @Req() req: any) {
    return this.fhirMappings.resolve(req.user.tenantId, sourceEntity);
  }

  // ---------------- Surveillance (§80) ----------------

  @Post("surveillance/rules")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Publish a surveillance rule version (disease list is data)" })
  upsertSurveillanceRule(@Body() body: any, @Req() req: any) {
    return this.publicHealth.upsertSurveillanceRule(req.user.tenantId, {
      diseaseName: body.diseaseName,
      icd11Code: body.icd11Code,
      triggerIcd10: body.triggerIcd10,
      triggerLabTest: body.triggerLabTest,
      reportability: body.reportability,
      urgency: body.urgency,
      requiredFields: body.requiredFields,
      caseDefinition: body.caseDefinition,
      destination: body.destination,
      createdBy: req.user.id,
    });
  }

  @Post("surveillance/evaluate")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Evaluate a diagnosis against surveillance rules (creates EWARS txn)" })
  evaluateDiagnosis(@Body() body: any, @Req() req: any) {
    return this.publicHealth.evaluateDiagnosis(req.user.tenantId, {
      diagnosisId: body.diagnosisId,
      patientId: body.patientId,
      encounterId: body.encounterId,
      icd10Code: body.icd10Code,
      icd11Code: body.icd11Code,
      diagnosisName: body.diagnosisName,
      origin: body.origin ?? "AUTOMATIC",
      createdBy: req.user.id,
    });
  }

  // ---------------- Vital events (§81) ----------------

  @Post("vital-events/birth")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Register a birth event (duplicate-prevented)" })
  registerBirth(@Body() body: any, @Req() req: any) {
    return this.publicHealth.registerBirth(req.user.tenantId, {
      patientId: body.patientId,
      eventDateTime: new Date(body.eventDateTime),
      location: body.location,
      facilityName: body.facilityName,
      motherName: body.motherName,
      newbornSex: body.newbornSex,
      birthWeightGrams: body.birthWeightGrams ? Number(body.birthWeightGrams) : undefined,
      deliveryType: body.deliveryType,
      attendingClinician: body.attendingClinician,
      createdBy: req.user.id,
    });
  }

  @Post("vital-events/death")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Document a death event" })
  registerDeath(@Body() body: any, @Req() req: any) {
    return this.publicHealth.registerDeath(req.user.tenantId, {
      patientId: body.patientId,
      eventDateTime: new Date(body.eventDateTime),
      location: body.location,
      facilityName: body.facilityName,
      certifyingClinician: body.certifyingClinician,
      immediateCause: body.immediateCause,
      underlyingCause: body.underlyingCause,
      contributingConditions: body.contributingConditions,
      causeOfDeathIcd11: body.causeOfDeathIcd11,
      createdBy: req.user.id,
    });
  }

  @Post("vital-events/:id/certify-death")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Certify a death (requires cause of death)" })
  certifyDeath(@Param("id") id: string, @Req() req: any) {
    return this.publicHealth.certifyDeath(req.user.tenantId, id, req.user.id);
  }

  @Post("vital-events/:id/submit")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Submit a vital event to civil registration via the gateway" })
  submitVitalEvent(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.publicHealth.submitVitalEvent(req.user.tenantId, id, {
      createdBy: req.user.id,
      mappingVersion: body?.mappingVersion,
    });
  }

  @Post("vital-events/:id/registration")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Record the civil-registration outcome" })
  recordRegistration(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.publicHealth.recordRegistration(req.user.tenantId, id, {
      registered: body.registered,
      registrationRef: body.registrationRef,
      rejected: body.rejected,
      reason: body.reason,
    });
  }

  @Post("vital-events/:id/certificate")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Issue certificate metadata (template versioned; not official registration)" })
  issueCertificate(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.publicHealth.issueCertificate(req.user.tenantId, id, {
      templateVersion: body.templateVersion,
      issuedBy: req.user.id,
    });
  }

  // ---------------- Blood chain (§82) ----------------

  @Post("blood/crossmatch")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Record compatibility testing (ABO/Rh hard gate)" })
  recordCrossmatch(@Body() body: any, @Req() req: any) {
    return this.bloodChain.recordCrossmatch(req.user.tenantId, {
      patientId: body.patientId,
      encounterId: body.encounterId,
      unitId: body.unitId,
      patientGroup: body.patientGroup,
      units: body.units ? Number(body.units) : undefined,
      method: body.method,
      result: body.result,
      testedBy: req.user.id,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      approvedBy: body.approvedBy,
    });
  }

  @Post("blood/transfusions")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Record a transfusion episode (ISSUED units only, bedside scan enforced)" })
  recordTransfusion(@Body() body: any, @Req() req: any) {
    return this.bloodChain.recordTransfusion(req.user.tenantId, {
      patientId: body.patientId,
      encounterId: body.encounterId,
      unitId: body.unitId,
      crossmatchId: body.crossmatchId,
      startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
      volumeMl: body.volumeMl ? Number(body.volumeMl) : undefined,
      administeredBy: body.administeredBy,
      verifiedBy: req.user.id,
      bedsideScan: body.bedsideScan,
      location: body.location,
      indication: body.indication,
      createdBy: req.user.id,
    });
  }

  @Post("blood/transfusions/:id/complete")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Complete a transfusion (times, vitals, outcome)" })
  completeTransfusion(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.bloodChain.completeTransfusion(req.user.tenantId, id, {
      endedAt: body.endedAt ? new Date(body.endedAt) : undefined,
      vitals: body.vitals,
      outcome: body.outcome,
    });
  }

  @Post("blood/transfusions/:id/reaction")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Record a transfusion reaction (quarantines the unit, raises CRITICAL)" })
  recordReaction(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.bloodChain.recordReaction(req.user.tenantId, id, {
      reaction: body.reaction,
      severity: body.severity,
      intervention: body.intervention,
      outcome: body.outcome,
      reportedBy: req.user.id,
    });
  }

  // ---------------- Waste ledger (§83) ----------------

  @Post("waste/entries")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Record a daily ward waste entry" })
  recordWasteEntry(@Body() body: any, @Req() req: any) {
    return this.waste.recordEntry(req.user.tenantId, {
      entryDate: new Date(body.entryDate),
      department: body.department,
      category: body.category,
      weightKg: Number(body.weightKg),
      containerCount: body.containerCount ? Number(body.containerCount) : undefined,
      collectedAt: body.collectedAt ? new Date(body.collectedAt) : undefined,
      collectedBy: body.collectedBy,
      storageLocation: body.storageLocation,
      responsibleOfficer: req.user.id,
      notes: body.notes,
    });
  }

  @Post("waste/entries/:id/custody")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Append a chain-of-custody transition" })
  wasteCustody(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.waste.custodyTransition(req.user.tenantId, id, {
      action: body.action,
      by: req.user.id,
      detail: body.detail,
    });
  }

  @Post("waste/manifests")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Prepare a waste manifest from unmanifested entries" })
  prepareManifest(@Body() body: any, @Req() req: any) {
    return this.waste.prepareManifest(req.user.tenantId, {
      transporter: body.transporter,
      receivingEntity: body.receivingEntity,
      treatmentMethod: body.treatmentMethod,
      disposalMethod: body.disposalMethod,
      entryIds: body.entryIds,
      preparedBy: req.user.id,
    });
  }

  @Post("waste/manifests/:id/dispatch")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Dispatch a waste manifest" })
  dispatchManifest(@Param("id") id: string, @Req() req: any) {
    return this.waste.dispatchManifest(req.user.tenantId, id, req.user.id);
  }

  @Post("waste/manifests/:id/confirm")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Confirm external disposal / rejection of a manifest" })
  confirmManifest(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.waste.confirmManifest(req.user.tenantId, id, {
      accepted: body.accepted,
      confirmationRef: body.confirmationRef,
      reason: body.reason,
    });
  }

  @Get("waste/exceptions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Waste exception monitoring (§83.5)" })
  wasteExceptions(@Req() req: any) {
    return this.waste.exceptions(req.user.tenantId);
  }

  @Get("waste/inspection-dashboard")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Inspection-ready waste dashboard (§83.6)" })
  wasteDashboard(@Req() req: any) {
    return this.waste.inspectionDashboard(req.user.tenantId);
  }

  // ---------------- Gateway ops (§84) ----------------

  @Get("transactions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Interop transaction list (status filter)" })
  txnList(@Query("status") status: string | undefined, @Req() req: any) {
    return this.gateway.attentionList(req.user.tenantId);
  }

  @Post("transactions/:id/transmit")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Validate + transmit a queued transaction" })
  transmit(@Param("id") id: string, @Req() req: any) {
    return this.gateway.transmit(req.user.tenantId, id);
  }

  @Post("transactions/:id/retry")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Retry a transient-failed transaction" })
  retry(@Param("id") id: string, @Req() req: any) {
    return this.gateway.retry(req.user.tenantId, id);
  }

  @Get("reconciliation")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Government-integration reconciliation dashboard (§84.3)" })
  reconciliation(@Query("destination") destination: string | undefined, @Req() req: any) {
    return this.gateway.reconciliation(req.user.tenantId, destination);
  }
}
