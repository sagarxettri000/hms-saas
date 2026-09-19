import io

p = 'prisma/schema.prisma'
s = io.open(p, encoding='utf-8').read()
orig = s

def must(old, new):
    global s
    assert old in s, f"anchor not found: {old[:70]!r}"
    s = s.replace(old, new, 1)

# ---- 1. Patient back-relations ----
must(
    "  vipAccessLogs        VipAccessLog[]          @relation(\"VipAccessPatient\")\n",
    "  vipAccessLogs        VipAccessLog[]          @relation(\"VipAccessPatient\")\n"
    "  aamaIncentives       AamaIncentiveCase[]\n"
    "  sifarisDocs          SifarisDocument[]\n"
    "  disasterCasualties   DisasterCasualty[]\n",
)

# ---- 2. Tenant back-relations ----
must(
    "  subsidyLedgerEntries   SubsidyLedgerEntry[]\n",
    "  subsidyLedgerEntries   SubsidyLedgerEntry[]\n"
    "  mssStandardSets        MssStandardSet[]\n"
    "  mssStandards           MssStandard[]\n"
    "  mssAssessments         MssAssessment[]\n"
    "  mssEvidence            MssEvidence[]\n"
    "  correctiveActions      CorrectiveAction[]\n"
    "  aamaIncentives         AamaIncentiveCase[]\n"
    "  sifarisDocs            SifarisDocument[]\n"
    "  disasterActivations    DisasterActivation[]\n"
    "  disasterCasualties     DisasterCasualty[]\n"
    "  offlineSyncItems       OfflineSyncItem[]\n"
    "  translationTerms       TranslationTerm[]\n"
    "  govProgramBatchMeta    GovProgramBatchMeta[]\n"
    "  govUtilizations        GovProgramUtilization[]\n",
)

# ---- 3. InventoryItem funding segregation (§67) ----
must(
    "  transactions InventoryTransaction[]\n",
    "  fundingSource FundingSource @default(PRIVATE_RETAIL)\n"
    "  programName  String?\n"
    "  govSchemeRef String?\n"
    "  transactions InventoryTransaction[]\n"
    "  govBatchMeta GovProgramBatchMeta?\n"
    "  govUtilizations GovProgramUtilization[]\n",
)

# ---- 4. New enums + models (append at end) ----
s += '''
// ============================================================
// MSS · GOVERNMENT MEDICINE · AAMA · SIFARIS · DISASTER ·
// OFFLINE SYNC · BILINGUAL DICTIONARY (specs §66–§72)
// ============================================================

enum FundingSource {
  PRIVATE_RETAIL
  GOVERNMENT_FREE_PROGRAM
  DONATED
  HOSPITAL_PROCURED
  INSURANCE_PROGRAM
  SPECIAL_PROGRAM
  OTHER
}

enum MssStandardStatus {
  ACTIVE
  RETIRED
}

enum MssComplianceStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLIANT
  PARTIALLY_COMPLIANT
  NON_COMPLIANT
  NOT_APPLICABLE
  EXPIRED
  PENDING_REVIEW
}

enum MssEvidenceStatus {
  PENDING_VERIFICATION
  VERIFIED
  REJECTED
  EXPIRED
}

enum CapaStatus {
  OPEN
  IN_PROGRESS
  PENDING_REVIEW
  CLOSED
  OVERDUE
}

enum AamaPaymentStatus {
  ELIGIBILITY_PENDING
  ELIGIBLE
  NOT_ELIGIBLE
  APPROVED
  PAYMENT_PENDING
  SUBMITTED
  PROCESSING
  PAID
  FAILED
  REJECTED
  CANCELLED
  RECONCILED
}

enum SifarisStatus {
  UPLOADED
  PENDING_VERIFICATION
  VERIFIED
  REJECTED
  EXPIRED
  SUPERSEDED
}

enum DisasterMode {
  NORMAL_MODE
  DISASTER_MODE
  MASS_CASUALTY_MODE
}

enum TriageCategory {
  RED
  YELLOW
  GREEN
  BLACK
}

enum CasualtyStatus {
  AWAITING_ASSESSMENT
  IN_TREATMENT
  ADMITTED
  TRANSFERRED
  DISCHARGED
  DECEASED
  MISSING
}

enum OfflineSyncState {
  LOCAL_ONLY
  QUEUED
  UPLOADING
  CENTRAL_VALIDATION
  SYNCED
  CONFLICT
  REJECTED
  RETRY_PENDING
  MANUAL_REVIEW
}

/// MSS standard-set metadata (§66.1): the standard COUNT is versioned
/// configuration, never a hard-coded constant.
model MssStandardSet {
  id             String             @id @default(cuid())
  tenantId       String
  tenant         Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  setName        String
  facilityLevel  String
  declaredCount  Int
  authority      String?
  sourceRef      String?
  effectiveFrom  DateTime
  effectiveTo    DateTime?
  status         MssStandardStatus  @default(ACTIVE)
  createdAt      DateTime           @default(now())
  standards      MssStandard[]

  @@index([tenantId, facilityLevel, status])
  @@map("mss_standard_sets")
}

model MssStandard {
  id              String              @id @default(cuid())
  tenantId        String
  tenant          Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  setId           String
  set             MssStandardSet      @relation(fields: [setId], references: [id], onDelete: Cascade)
  standardCode    String
  standardName    String
  domain          String
  requirement     String?
  isMandatory     Boolean             @default(true)
  evidenceRequired Boolean            @default(true)
  evidenceTypes   Json?
  responsibleDept String?
  responsibleRole String?
  scoringMethod   String?
  weight          Decimal             @default(1) @db.Decimal(8, 2)
  complianceThreshold Decimal?        @db.Decimal(5, 2)
  reviewFrequency String?
  sourceRef       String?
  status          MssStandardStatus   @default(ACTIVE)
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  assessments     MssAssessment[]
  evidence        MssEvidence[]

  @@unique([setId, standardCode])
  @@index([tenantId, domain])
  @@map("mss_standards")
}

/// Immutable compliance result (§66.5): new set versions never rewrite
/// historical assessments.
model MssAssessment {
  id                String               @id @default(cuid())
  tenantId          String
  tenant            Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  standardId        String
  standard          MssStandard          @relation(fields: [standardId], references: [id], onDelete: Cascade)
  standardVersion   Int
  assessmentDate    DateTime             @default(now())
  assessedBy        String?
  score             Decimal?             @db.Decimal(5, 2)
  status            MssComplianceStatus  @default(NOT_STARTED)
  evidenceSnapshot  Json?
  comments          String?
  approval          String?
  createdAt         DateTime             @default(now())
  correctiveActions CorrectiveAction[]

  @@index([tenantId, standardId])
  @@index([tenantId, assessmentDate])
  @@map("mss_assessments")
}

model MssEvidence {
  id              String             @id @default(cuid())
  tenantId        String
  tenant          Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  standardId      String
  standard        MssStandard        @relation(fields: [standardId], references: [id], onDelete: Cascade)
  title           String
  docType         String
  documentRef     String?
  documentVersion String?
  validFrom       DateTime?
  validTo         DateTime?
  status          MssEvidenceStatus  @default(PENDING_VERIFICATION)
  uploadedBy      String?
  reviewedBy      String?
  reviewDate      DateTime?
  reviewNotes     String?
  auditTrail      Json?
  createdAt       DateTime           @default(now())

  @@index([tenantId, standardId])
  @@map("mss_evidence")
}

model CorrectiveAction {
  id              String      @id @default(cuid())
  tenantId        String
  tenant          Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  assessmentId    String
  assessment      MssAssessment @relation(fields: [assessmentId], references: [id], onDelete: Cascade)
  rootCause       String?
  responsiblePerson String?
  dueDate         DateTime?
  priority        String      @default("MEDIUM")
  requiredEvidence Json?
  reviewNotes     String?
  status          CapaStatus  @default(OPEN)
  closedBy        String?
  closedAt        DateTime?
  createdAt       DateTime    @default(now())

  @@index([tenantId, status])
  @@index([tenantId, dueDate])
  @@map("corrective_actions")
}

/// Aama / Safe Motherhood incentive case (§68). Payment status is strictly
/// separated from eligibility (§68.3).
model AamaIncentiveCase {
  id              String              @id @default(cuid())
  tenantId        String
  tenant          Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  patientId       String
  patient         Patient             @relation("AamaPatient", fields: [patientId], references: [id], onDelete: Cascade)
  caseNumber      String              @unique
  pregnancyRef    String?
  deliveryEncounterId String?
  deliveryDate    DateTime?
  facilityName    String?
  ancMilestones   Json?
  eligibilityStatus String?
  ruleId          String?
  ruleVersion     Int?
  approvedAmount  Decimal?            @db.Decimal(12, 2)
  paymentStatus   AamaPaymentStatus   @default(ELIGIBILITY_PENDING)
  paymentRef      String?
  paymentDate     DateTime?
  failureReason   String?
  createdBy       String?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@index([tenantId, paymentStatus])
  @@index([tenantId, patientId])
  @@map("aama_incentive_cases")
}

/// Ward/municipality recommendation (Sifaris) repository (§69).
model SifarisDocument {
  id                String         @id @default(cuid())
  tenantId          String
  tenant            Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  patientId         String
  patient           Patient        @relation("SifarisPatient", fields: [patientId], references: [id], onDelete: Cascade)
  encounterId       String?
  relatedProgram    String?
  relatedCaseId     String?
  municipality      String
  wardNo            String?
  recommendationNo  String
  issueDate         DateTime
  issuingAuthority  String?
  recommendedBenefit String?
  validFrom         DateTime?
  validTo           DateTime?
  documentRef       String?
  documentHash      String?
  status            SifarisStatus  @default(UPLOADED)
  verifiedBy        String?
  verificationDate  DateTime?
  verificationNotes String?
  createdBy         String?
  createdAt         DateTime       @default(now())

  @@index([tenantId, patientId, status])
  @@map("sifaris_documents")
}

/// HEOC disaster activation (§70.1).
model DisasterActivation {
  id              String       @id @default(cuid())
  tenantId        String
  tenant          Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  mode            DisasterMode
  incidentName    String?
  incidentType    String?
  incidentRef     String?
  authority       String?
  expectedDurationHours Int?
  activatedBy     String?
  activatedAt     DateTime     @default(now())
  deactivatedAt   DateTime?
  isActive        Boolean      @default(true)

  @@index([tenantId, isActive])
  @@map("disaster_activations")
}

/// Mass-casualty intake record (§70.2/§70.3): minimal identity, triage
/// category history is append-only (§75 Disaster Mode tests).
model DisasterCasualty {
  id                String          @id @default(cuid())
  tenantId          String
  tenant            Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  activationId      String
  activation        DisasterActivation @relation(fields: [activationId], references: [id], onDelete: Cascade)
  patientId         String?         // null until reconciled with definitive identity
  patient           Patient?        @relation("DisasterPatient", fields: [patientId], references: [id], onDelete: SetNull)
  tempCasualtyId    String          @unique
  wristbandCode     String?
  displayName       String?
  currentCategory   TriageCategory?
  status            CasualtyStatus  @default(AWAITING_ASSESSMENT)
  triageHistory     Json?
  destination       String?
  payerClass        String?         // UNIDENTIFIED_CASUALTY, GOVERNMENT_DISASTER_FUNDED, ...
  provisionalInvoiceRef String?
  createdBy         String?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  @@index([tenantId, activationId, currentCategory])
  @@index([tenantId, status])
  @@map("disaster_casualties")
}

/// Store-and-forward offline sync item (§71.2/§71.3) with durable
/// idempotency key (§71.4).
model OfflineSyncItem {
  id                String            @id @default(cuid())
  tenantId          String
  tenant            Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  localTxnId        String            @unique
  localNodeId       String
  userId            String?
  entityType        String
  entityId          String
  operationType     String
  payload           Json?
  checksum          String?
  sequenceNo        BigInt?
  syncState         OfflineSyncState  @default(LOCAL_ONLY)
  attemptCount      Int               @default(0)
  lastAttemptAt     DateTime?
  lastError         String?
  conflictDetail    Json?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@index([tenantId, syncState])
  @@index([tenantId, localNodeId])
  @@map("offline_sync_items")
}

/// Version-controlled bilingual terminology (§72.3). Structured clinical
/// values are NEVER stored here — translation display-only (§72.6).
model TranslationTerm {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  domain      String
  sourceText  String
  language    String   @default("ne")
  translatedText String
  version     Int      @default(1)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, domain, sourceText, language])
  @@index([tenantId, domain, isActive])
  @@map("translation_terms")
}

/// Government-program metadata attached to a specific inventory batch (§67.1).
model GovProgramBatchMeta {
  id             String   @id @default(cuid())
  tenantId       String
  tenant         Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  inventoryItemId String  @unique
  inventoryItem  InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
  programName    String?
  govScheme      String?
  fundingSource  String?
  procurementSource String?
  distributionRestrictions Json?
  eligiblePopulation   String?
  reportingRequirements Json?
  receivedDate   DateTime?
  createdAt      DateTime @default(now())

  @@map("gov_program_batch_meta")
}

/// Program utilization record per dispensing (§67.3 step 9).
model GovProgramUtilization {
  id               String   @id @default(cuid())
  tenantId         String
  tenant           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  inventoryItemId  String
  inventoryItem    InventoryItem @relation(fields: [inventoryItemId], references: [id], onDelete: Cascade)
  patientId        String?
  encounterId      String?
  programName      String?
  quantity         Decimal  @db.Decimal(12, 3)
  batchNumber      String?
  utilizationDate  DateTime @default(now())
  createdBy        String?

  @@index([tenantId, programName])
  @@index([tenantId, utilizationDate])
  @@map("gov_program_utilizations")
}
'''

assert s != orig
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print("patched OK")
