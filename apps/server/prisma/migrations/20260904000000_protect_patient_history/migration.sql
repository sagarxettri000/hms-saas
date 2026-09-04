-- Protect patient clinical/financial history from accidental cascade deletion.

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_patientId_fkey";

-- DropForeignKey
ALTER TABLE "encounters" DROP CONSTRAINT "encounters_patientId_fkey";

-- DropForeignKey
ALTER TABLE "follow_ups" DROP CONSTRAINT "follow_ups_patientId_fkey";

-- DropForeignKey
ALTER TABLE "vitals" DROP CONSTRAINT "vitals_patientId_fkey";

-- DropForeignKey
ALTER TABLE "prescriptions" DROP CONSTRAINT "prescriptions_patientId_fkey";

-- DropForeignKey
ALTER TABLE "admissions" DROP CONSTRAINT "admissions_patientId_fkey";

-- DropForeignKey
ALTER TABLE "lab_orders" DROP CONSTRAINT "lab_orders_patientId_fkey";

-- DropForeignKey
ALTER TABLE "radiology_orders" DROP CONSTRAINT "radiology_orders_patientId_fkey";

-- DropForeignKey
ALTER TABLE "ot_cases" DROP CONSTRAINT "ot_cases_patientId_fkey";

-- DropForeignKey
ALTER TABLE "emergency_cases" DROP CONSTRAINT "emergency_cases_patientId_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_patientId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_patientId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_patientId_fkey";

-- DropForeignKey
ALTER TABLE "deposits" DROP CONSTRAINT "deposits_patientId_fkey";

-- DropForeignKey
ALTER TABLE "credit_accounts" DROP CONSTRAINT "credit_accounts_patientId_fkey";

-- DropForeignKey
ALTER TABLE "insurance_policies" DROP CONSTRAINT "insurance_policies_patientId_fkey";

-- DropForeignKey
ALTER TABLE "insurance_claims" DROP CONSTRAINT "insurance_claims_patientId_fkey";

-- DropForeignKey
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_patientId_fkey";

-- DropForeignKey
ALTER TABLE "charge_transactions" DROP CONSTRAINT "charge_transactions_patientId_fkey";

-- DropForeignKey
ALTER TABLE "discharge_bills" DROP CONSTRAINT "discharge_bills_patientId_fkey";

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admissions" ADD CONSTRAINT "admissions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radiology_orders" ADD CONSTRAINT "radiology_orders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_cases" ADD CONSTRAINT "ot_cases_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_cases" ADD CONSTRAINT "emergency_cases_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_transactions" ADD CONSTRAINT "charge_transactions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_bills" ADD CONSTRAINT "discharge_bills_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fix OT case staff FK drift: surgeon/assistant/anesthetist were created as
-- plain TEXT columns without foreign keys; add the declared relations.

-- AddForeignKey
ALTER TABLE "ot_cases" ADD CONSTRAINT "ot_cases_surgeonId_fkey" FOREIGN KEY ("surgeonId") REFERENCES "doctor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_cases" ADD CONSTRAINT "ot_cases_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "doctor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ot_cases" ADD CONSTRAINT "ot_cases_anesthetistId_fkey" FOREIGN KEY ("anesthetistId") REFERENCES "doctor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
