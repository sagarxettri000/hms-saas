-- Unified government-programme ledger (spec #24) + disaster deferred transactions (spec #12)
CREATE TABLE "government_programme_ledger" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "programme" TEXT NOT NULL,
    "programme_version" TEXT,
    "patient_id" TEXT,
    "encounter_id" TEXT,
    "eligibility_case_id" TEXT,
    "benefit_type" TEXT NOT NULL,
    "approval_ref" TEXT,
    "service_ref" TEXT,
    "invoice_line_id" TEXT,
    "inventory_txn_id" TEXT,
    "approved_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "utilized_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "claimed_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reversed_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "government_reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "government_programme_ledger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "disaster_deferred_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "casualty_id" TEXT,
    "temp_patient_id" TEXT,
    "patient_id" TEXT,
    "service_code" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "clinician_ref" TEXT,
    "location" TEXT,
    "service_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "encounter_id" TEXT,
    "invoice_id" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by" TEXT,
    "write_off_reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disaster_deferred_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "government_programme_ledger_tenant_programme_idx" ON "government_programme_ledger"("tenant_id", "programme");
CREATE INDEX "government_programme_ledger_tenant_patient_idx" ON "government_programme_ledger"("tenant_id", "patient_id");
CREATE INDEX "government_programme_ledger_tenant_status_idx" ON "government_programme_ledger"("tenant_id", "status");
CREATE INDEX "disaster_deferred_transactions_tenant_status_idx" ON "disaster_deferred_transactions"("tenant_id", "status");
CREATE INDEX "disaster_deferred_transactions_activation_status_idx" ON "disaster_deferred_transactions"("tenant_id", "activation_id", "status");

ALTER TABLE "government_programme_ledger" ADD CONSTRAINT "government_programme_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "disaster_deferred_transactions" ADD CONSTRAINT "disaster_deferred_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "disaster_deferred_transactions" ADD CONSTRAINT "disaster_deferred_transactions_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "disaster_activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
