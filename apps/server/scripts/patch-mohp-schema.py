import io

p = "prisma/schema.prisma"
s = io.open(p, encoding="utf-8").read()
orig = s


def must(old, new):
    global s
    assert old in s, "anchor not found: %r" % old[:70]
    assert s.count(old) == 1, "anchor not unique: %r" % old[:70]
    s = s.replace(old, new, 1)


# ---- 1. Tenant back-relations ----
must(
    "  govLedgerEntries        GovernmentProgrammeLedger[]\n"
    "  disasterDeferredTxns    DisasterDeferredTransaction[]\n",
    "  govLedgerEntries        GovernmentProgrammeLedger[]\n"
    "  disasterDeferredTxns    DisasterDeferredTransaction[]\n"
    "  fhirBundles             FhirBundleRecord[]\n"
    "  consentRecords          ConsentRecord[]\n",
)

# ---- 2. BloodUnit back-relation ----
must(
    "  crossMatchTo    String?\n"
    "  issuedTo        String?\n",
    "  crossMatchTo    String?\n"
    "  issuedTo        String?\n"
    "  returns         BloodUnitReturn[]\n",
)

# ---- 3. New models ----
s += """
/// FHIR bundle/export record (spec #10/#11): provenance for every outbound
/// interoperability artifact — internal lineage + validation result + profile
/// versions. The FHIR JSON itself is generated on demand; this is the
/// traceability anchor, not a second source of clinical truth.
model FhirBundleRecord {
  id             String   @id @default(cuid())
  tenantId       String
  tenant         Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  bundleType     String   // PATIENT_SUMMARY, ENCOUNTER_SUMMARY, DISCHARGE_SUMMARY, LAB_PACKAGE, REFERRAL, PUBLIC_HEALTH_NOTICE, BIRTH_EVENT, DEATH_EVENT
  internalType   String?
  internalId     String?
  profileVersion String?
  fhirVersion    String   @default("4.0.1")
  generatedBy    String?
  validation     Json?
  resourceCount  Int      @default(0)
  contentHash    String?
  createdAt      DateTime @default(now())

  @@index([tenantId, bundleType])
  @@index([tenantId, internalType, internalId])
  @@map("fhir_bundle_records")
}

/// Consent record (spec #49): patient-authorized sharing metadata, distinct
/// from legally mandated reporting which never depends on consent.
model ConsentRecord {
  id           String   @id @default(cuid())
  tenantId     String
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  patientId    String
  purpose      String   // TREATMENT, PAYMENT, RESEARCH, PATIENT_PORTAL, OTHER
  dataScope    String?
  recipient    String?
  effectiveFrom DateTime @default(now())
  effectiveTo  DateTime?
  status       String   @default("ACTIVE") // ACTIVE, REVOKED, EXPIRED
  revokedAt    DateTime?
  revokedReason String?
  createdBy    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([tenantId, patientId, status])
  @@map("consent_records")
}

/// Blood unit return (spec #33): unused-unit return to the bank — a distinct
/// disposition from discard/wastage, so returnable units re-enter inventory
/// instead of being destroyed.
model BloodUnitReturn {
  id          String   @id @default(cuid())
  tenantId    String
  unitId      String
  unit        BloodUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)
  returnedBy  String?
  reason      String?
  returnedAt  DateTime @default(now())

  @@index([tenantId, unitId])
  @@map("blood_unit_returns")
}
"""

assert s != orig
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("schema patched: FhirBundleRecord + ConsentRecord + BloodUnitReturn")
