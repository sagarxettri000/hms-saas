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
    "  attendanceRecords       AttendanceRecord[]\n",
    "  attendanceRecords       AttendanceRecord[]\n"
    "  govLedgerEntries        GovernmentProgrammeLedger[]\n"
    "  disasterDeferredTxns    DisasterDeferredTransaction[]\n",
)

# ---- 2. DisasterActivation back-relation ----
must(
    "  isActive        Boolean      @default(true)\n"
    "  casualties      DisasterCasualty[]\n",
    "  isActive        Boolean      @default(true)\n"
    "  casualties      DisasterCasualty[]\n"
    "  deferredTxns    DisasterDeferredTransaction[]\n",
)

# ---- 3. New models: unified programme ledger (spec #24) + disaster deferred billing (#12) ----
s += """
/// Unified government-programme ledger (spec #24): one auditable chain per
/// benefit event — eligibility case → service/inventory → invoice line →
/// claim → payment → reconciliation. Append-oriented: corrections are
/// reversal entries, never destructive edits.
model GovernmentProgrammeLedger {
  id                  String   @id @default(cuid())
  tenantId            String
  tenant              Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  programme           String
  programmeVersion    String?
  patientId           String?
  encounterId         String?
  eligibilityCaseId   String?
  benefitType         String
  approvalRef         String?
  serviceRef          String?
  invoiceLineId       String?
  inventoryTxnId      String?
  approvedAmount      Decimal  @default(0) @db.Decimal(14, 2)
  utilizedAmount      Decimal  @default(0) @db.Decimal(14, 2)
  claimedAmount       Decimal  @default(0) @db.Decimal(14, 2)
  paidAmount          Decimal  @default(0) @db.Decimal(14, 2)
  reversedAmount      Decimal  @default(0) @db.Decimal(14, 2)
  remainingAmount     Decimal  @default(0) @db.Decimal(14, 2)
  governmentReference String?
  status              String   @default("ACTIVE")
  createdBy           String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([tenantId, programme])
  @@index([tenantId, patientId])
  @@index([tenantId, status])
  @@map("government_programme_ledger")
}

/// Disaster deferred transaction (spec #12/#37): a service rendered during
/// mass-casualty mode without completed billing. Clinical care precedes
/// billing; the service stays traceable and is later reconciled into a real
/// encounter/invoice, or written off with an authorized reason.
model DisasterDeferredTransaction {
  id              String             @id @default(cuid())
  tenantId        String
  tenant          Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  activationId    String
  activation      DisasterActivation @relation(fields: [activationId], references: [id], onDelete: Cascade)
  casualtyId      String?
  tempPatientId   String?
  patientId       String?
  serviceCode     String
  description     String?
  quantity        Decimal            @default(1) @db.Decimal(12, 3)
  clinicianRef    String?
  location        String?
  serviceAt       DateTime           @default(now())
  amount          Decimal?           @db.Decimal(12, 2)
  status          String             @default("PENDING") // PENDING | RECONCILED | WRITTEN_OFF
  encounterId     String?
  invoiceId       String?
  reconciledAt    DateTime?
  reconciledBy    String?
  writeOffReason  String?
  createdBy       String?
  createdAt       DateTime           @default(now())

  @@index([tenantId, activationId, status])
  @@index([tenantId, status])
  @@map("disaster_deferred_transactions")
}
"""

assert s != orig
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("schema patched: GovernmentProgrammeLedger + DisasterDeferredTransaction")
