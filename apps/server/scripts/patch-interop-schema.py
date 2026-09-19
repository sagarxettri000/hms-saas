import io

p = 'prisma/schema.prisma'
s = io.open(p, encoding='utf-8').read()
orig = s

def must(old, new):
    global s
    assert old in s, f"anchor not found: {old[:70]!r}"
    s = s.replace(old, new, 1)

# ---- Tenant back-relations ----
must(
    "  claimItems              ClaimItem[]\n",
    "  claimItems              ClaimItem[]\n"
    "  icdCodes                IcdCode[]\n"
    "  fhirMappings            FhirMapping[]\n"
    "  surveillanceRules       SurveillanceRule[]\n"
    "  interopTransactions     InteropTransaction[]\n"
    "  vitalEvents             VitalEvent[]\n"
    "  bloodCrossmatches       BloodCrossmatch[]\n"
    "  bloodTransfusions       BloodTransfusion[]\n"
    "  wasteLedgerEntries      WasteLedgerEntry[]\n"
    "  wasteManifests          WasteManifest[]\n",
)

# ---- Patient back-relations ----
must(
    "  sifarisDocs          SifarisDocument[]       @relation(\"SifarisPatient\")\n",
    "  sifarisDocs          SifarisDocument[]       @relation(\"SifarisPatient\")\n"
    "  interopTxns          InteropTransaction[]    @relation(\"InteropPatient\")\n"
    "  vitalEvents          VitalEvent[]            @relation(\"VitalEventPatient\")\n"
    "  bloodCrossmatches    BloodCrossmatch[]       @relation(\"CrossmatchPatient\")\n"
    "  bloodTransfusions    BloodTransfusion[]      @relation(\"TransfusionPatient\")\n",
)

# ---- Diagnosis: ICD-11 fields with version pinning (§79.3) ----
must(
    "  icd10Code   String?\n"
    "  name        String\n"
    "  type        String? // PRIMARY, SECONDARY, etc.\n",
    "  icd10Code   String?\n"
    "  icd11Code   String?\n"
    "  icd11Display String?\n"
    "  icd11Version String?\n"
    "  certainty   String? // CONFIRMED, PROBABLE, SUSPECTED\n"
    "  onsetDate   DateTime?\n"
    "  name        String\n"
    "  type        String? // PRIMARY, SECONDARY, WORKING, CONFIRMED, DIFFERENTIAL, COMORBIDITY, COMPLICATION, DISCHARGE, CAUSE_OF_DEATH\n",
)

s += '''
// ============================================================
// NATIONAL INTEROPERABILITY (specs §77–§90)
// ============================================================

/// ICD-11 terminology entry (§79.2). Versioned; historical diagnoses stay
/// pinned to the terminology version recorded at coding time (§79.3).
model IcdCode {
  id          String    @id @default(cuid())
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  code        String
  display     String
  chapterRef  String?
  language    String    @default("en")
  synonyms    Json?
  isActive    Boolean   @default(true)
  deprecatedAt DateTime?
  version     String
  effectiveFrom DateTime @default(now())
  effectiveTo DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([tenantId, code, version, language])
  @@index([tenantId, isActive, version])
  @@index([tenantId, display])
  @@map("icd_codes")
}

/// Version-controlled FHIR mapping registry (§78.2). Operational data is the
/// source of truth; mappings are metadata describing the transformation.
model FhirMapping {
  id             String   @id @default(cuid())
  tenantId       String
  tenant         Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  sourceEntity   String
  sourceField    String?
  fhirResource   String
  fhirElement    String?
  transformRule  Json?
  terminologyMap Json?
  mappingVersion String
  effectiveFrom  DateTime @default(now())
  effectiveTo    DateTime?
  createdBy      String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([tenantId, sourceEntity, sourceField, fhirResource, fhirElement, mappingVersion])
  @@index([tenantId, sourceEntity, fhirResource])
  @@map("fhir_mappings")
}

/// Config-driven surveillance rule (§80.2). The reportable-disease list is
/// data, never code.
model SurveillanceRule {
  id             String    @id @default(cuid())
  tenantId       String
  tenant         Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  diseaseName    String
  icd11Code      String?
  triggerIcd10   String?
  triggerLabTest String?
  reportability  String    @default("MANDATORY")
  urgency        String    @default("DAILY") // IMMEDIATE, URGENT, DAILY, WEEKLY, PERIODIC
  requiredFields Json?
  caseDefinition String?
  destination    String    @default("EWARS")
  ruleVersion    Int       @default(1)
  effectiveFrom  DateTime  @default(now())
  effectiveTo    DateTime?
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@unique([tenantId, diseaseName, ruleVersion])
  @@index([tenantId, isActive, urgency])
  @@map("surveillance_rules")
}

/// Unified government-integration transaction (§84.1/§80.5/§89). One queue,
/// one state machine, one reconciliation surface — modules never talk to
/// external systems directly.
model InteropTransaction {
  id             String    @id @default(cuid())
  tenantId       String
  tenant         Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  patientId      String?
  patient        Patient?  @relation("InteropPatient", fields: [patientId], references: [id], onDelete: SetNull)
  encounterId    String?
  destination    String
  purpose        String    // SURVEILLANCE, VITAL_EVENT, REPORTING, FHIR_EXCHANGE
  sourceModule   String
  sourceEntity   String
  sourceEntityId String
  idempotencyKey String    @unique
  payload        Json?
  payloadVersion String    @default("1.0")
  mappingVersion String?
  ruleVersion    Int?
  lineage        Json?
  status         String    @default("PENDING") // PENDING, VALIDATING, VALIDATION_FAILED, SUBMITTED, ACKNOWLEDGED, ACCEPTED, REJECTED, FAILED, RETRY_PENDING, MANUAL_REVIEW, CANCELLED
  failureClass   String?   // TRANSIENT, VALIDATION, BUSINESS_REJECTION, AUTHORIZATION, DUPLICATE, PERMANENT
  response       Json?
  ackRef         String?
  retryCount     Int       @default(0)
  lastAttemptAt  DateTime?
  lastError      String?
  createdBy      String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([tenantId, status])
  @@index([tenantId, destination, purpose])
  @@index([tenantId, createdAt])
  @@map("interop_transactions")
}

/// Birth/death clinical event (§81). Distinct from civil registration —
/// the government registration reference lives here once acknowledged.
model VitalEvent {
  id                String   @id @default(cuid())
  tenantId          String
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  patientId         String
  patient           Patient  @relation("VitalEventPatient", fields: [patientId], references: [id], onDelete: Cascade)
  eventType         String   // BIRTH, DEATH
  eventDateTime     DateTime
  location          String?
  facilityName      String?
  // birth specifics (§81.1)
  motherName        String?
  newbornSex        String?
  birthWeightGrams  Int?
  deliveryType      String?
  attendingClinician String?
  // death specifics (§81.2)
  certifyingClinician String?
  immediateCause    String?
  underlyingCause   String?
  contributingConditions Json?
  causeOfDeathIcd11 String?
  // registration state
  certificationStatus String @default("UNCERTIFIED") // UNCERTIFIED, CERTIFIED
  registrationStatus  String @default("NOT_SUBMITTED") // NOT_SUBMITTED, SUBMITTED, ACKNOWLEDGED, REGISTERED, REJECTED, AMENDED
  registrationRef   String?
  certificateRef    String?
  certificateTemplateVersion String?
  amendments        Json?
  createdBy         String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([tenantId, eventType, registrationStatus])
  @@index([tenantId, patientId])
  @@map("vital_events")
}

/// Compatibility testing record (§82.4). Issue is gated on a COMPATIBLE,
/// unexpired crossmatch.
model BloodCrossmatch {
  id             String    @id @default(cuid())
  tenantId       String
  tenant         Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  patientId      String
  patient        Patient   @relation("CrossmatchPatient", fields: [patientId], references: [id], onDelete: Cascade)
  encounterId    String?
  unitId         String
  requestedComponent String
  patientGroup   String
  donorGroup     String
  units          Int       @default(1)
  method         String?
  result         String    // COMPATIBLE, INCOMPATIBLE, INCONCLUSIVE
  testedBy       String?
  testedAt       DateTime  @default(now())
  expiresAt      DateTime?
  approvedBy     String?
  createdAt      DateTime  @default(now())

  @@index([tenantId, patientId])
  @@index([tenantId, unitId])
  @@map("blood_crossmatches")
}

/// Bedside transfusion episode (§82.5) with reaction capture (§82.7).
model BloodTransfusion {
  id              String    @id @default(cuid())
  tenantId        String
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  patientId       String
  patient         Patient   @relation("TransfusionPatient", fields: [patientId], references: [id], onDelete: Cascade)
  encounterId     String?
  unitId          String
  crossmatchId    String?
  startedAt       DateTime  @default(now())
  endedAt         DateTime?
  volumeMl        Int?
  administeredBy  String?
  verifiedBy      String?
  bedsideScan     Json?
  location        String?
  indication      String?
  vitals          Json?
  reaction        String?
  reactionSeverity String?
  intervention    String?
  outcome         String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([tenantId, patientId])
  @@index([tenantId, unitId])
  @@map("blood_transfusions")
}

/// Daily ward waste ledger entry (§83.2) with chain-of-custody transitions (§83.3).
model WasteLedgerEntry {
  id             String    @id @default(cuid())
  tenantId       String
  tenant         Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  entryDate      DateTime
  department     String
  category       String    // INFECTIOUS, SHARPS, GENERAL, CHEMICAL, PHARMACEUTICAL, PATHOLOGICAL, OTHER_REGULATED
  weightKg       Decimal   @db.Decimal(10, 2)
  containerCount Int?
  collectedAt    DateTime?
  collectedBy    String?
  storageLocation String?
  treatmentMethod String?
  disposalMethod String?
  transferDestination String?
  custodyTrail   Json?
  responsibleOfficer String?
  manifestId     String?
  notes          String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@unique([tenantId, entryDate, department, category])
  @@index([tenantId, entryDate])
  @@index([tenantId, category])
  @@map("waste_ledger_entries")
}

/// Auditable waste manifest (§83.4) linking ledger entries to treatment/disposal.
model WasteManifest {
  id             String    @id @default(cuid())
  tenantId       String
  tenant         Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  manifestNumber String    @unique
  transporter    String?
  receivingEntity String?
  treatmentMethod String?
  disposalMethod String?
  status         String    @default("PREPARED") // PREPARED, DISPATCHED, CONFIRMED, REJECTED
  dispatchedAt   DateTime?
  confirmedAt    DateTime?
  confirmationRef String?
  preparedBy     String?
  entries        WasteLedgerEntry[]
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([tenantId, status])
  @@map("waste_manifests")
}
'''

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print("schema patched:", len(s) - len(orig), "chars added")
