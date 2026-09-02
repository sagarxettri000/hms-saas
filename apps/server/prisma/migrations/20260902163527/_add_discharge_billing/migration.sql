-- Migration: add_discharge_billing
-- Description: Add ServiceCategory, ChargeTransaction, DischargeBill, DischargeBillDetail tables.
--              Extend BillingService with service type, rates, and flags.
--              Add admissionId to LabOrder and RadiologyOrder.

-- 1. New enums
CREATE TYPE "ServiceType" AS ENUM ('FIXED', 'PER_UNIT', 'PER_DAY', 'PER_HOUR', 'PER_VISIT', 'PER_TEST', 'PER_PROCEDURE', 'PER_ITEM', 'PERCENTAGE', 'VARIABLE');
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'BILLED', 'CANCELLED', 'EXEMPT');
CREATE TYPE "DischargeBillStatus" AS ENUM ('DRAFT', 'FINALIZED', 'CANCELLED', 'VOID');
CREATE TYPE "DischargePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'REFUND_DUE');

-- 2. ServiceCategory table
CREATE TABLE "service_categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_categories_tenantId_code_key" ON "service_categories"("tenantId", "code");
CREATE INDEX "service_categories_tenantId_isActive_idx" ON "service_categories"("tenantId", "isActive");

-- 3. Extend BillingService
ALTER TABLE "billing_services" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "billing_services" ADD COLUMN "shortName" TEXT;
ALTER TABLE "billing_services" ADD COLUMN "serviceType" "ServiceType" NOT NULL DEFAULT 'PER_UNIT';
ALTER TABLE "billing_services" ADD COLUMN "unit" TEXT;
ALTER TABLE "billing_services" ADD COLUMN "insuranceRate" DECIMAL(14,2);
ALTER TABLE "billing_services" ADD COLUMN "patientRate" DECIMAL(14,2);
ALTER TABLE "billing_services" ADD COLUMN "corporateRate" DECIMAL(14,2);
ALTER TABLE "billing_services" ADD COLUMN "emergencyRate" DECIMAL(14,2);
ALTER TABLE "billing_services" ADD COLUMN "nightRate" DECIMAL(14,2);
ALTER TABLE "billing_services" ADD COLUMN "weekendRate" DECIMAL(14,2);
ALTER TABLE "billing_services" ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "billing_services" ADD COLUMN "requiresDoctor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "billing_services" ADD COLUMN "requiresDepartment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "billing_services" ADD COLUMN "requiresQuantity" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "billing_services" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "billing_services" ADD COLUMN "isPackageService" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "billing_services" ADD COLUMN "isRoomCharge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "billing_services" ADD COLUMN "isPharmacyItem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "billing_services" ADD COLUMN "isConsumable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "billing_services" ADD COLUMN "isInventoryItem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "billing_services" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "billing_services" ADD CONSTRAINT "billing_services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "service_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "billing_services_tenantId_categoryId_idx" ON "billing_services"("tenantId", "categoryId");
CREATE INDEX "billing_services_tenantId_departmentId_idx" ON "billing_services"("tenantId", "departmentId");

-- 4. Add admissionId to LabOrder
ALTER TABLE "lab_orders" ADD COLUMN "admissionId" TEXT;
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Add admissionId to RadiologyOrder
ALTER TABLE "radiology_orders" ADD COLUMN "admissionId" TEXT;
ALTER TABLE "radiology_orders" ADD CONSTRAINT "radiology_orders_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. ChargeTransaction table
CREATE TABLE "charge_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionId" TEXT,
    "encounterId" TEXT,
    "serviceId" TEXT,
    "sourceModule" TEXT NOT NULL,
    "sourceTransactionId" TEXT,
    "serviceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insuranceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "patientAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "billingStatus" TEXT NOT NULL DEFAULT 'UNBILLED',
    "dischargeBillId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "charge_transactions_tenantId_patientId_idx" ON "charge_transactions"("tenantId", "patientId");
CREATE INDEX "charge_transactions_tenantId_admissionId_idx" ON "charge_transactions"("tenantId", "admissionId");
CREATE INDEX "charge_transactions_tenantId_sourceModule_sourceTransactionId_idx" ON "charge_transactions"("tenantId", "sourceModule", "sourceTransactionId");
CREATE INDEX "charge_transactions_tenantId_billingStatus_idx" ON "charge_transactions"("tenantId", "billingStatus");
CREATE INDEX "charge_transactions_tenantId_serviceDate_idx" ON "charge_transactions"("tenantId", "serviceDate");

-- 7. DischargeBill table
CREATE TABLE "discharge_bills" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "encounterId" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admissionDate" TIMESTAMP(3),
    "dischargeDate" TIMESTAMP(3),
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "discountApprovedBy" TEXT,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insuranceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "corporateAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advanceAdjustment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "previousDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundingAdjustment" DECIMAL(2,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "DischargeBillStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "DischargePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "dischargeStatus" TEXT NOT NULL DEFAULT 'BILLING_PENDING',
    "remarks" TEXT,
    "createdBy" TEXT,
    "finalizedBy" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discharge_bills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "discharge_bills_tenantId_billNumber_key" ON "discharge_bills"("tenantId", "billNumber");
CREATE INDEX "discharge_bills_tenantId_patientId_idx" ON "discharge_bills"("tenantId", "patientId");
CREATE INDEX "discharge_bills_tenantId_admissionId_idx" ON "discharge_bills"("tenantId", "admissionId");
CREATE INDEX "discharge_bills_tenantId_status_idx" ON "discharge_bills"("tenantId", "status");
CREATE INDEX "discharge_bills_tenantId_billDate_idx" ON "discharge_bills"("tenantId", "billDate");

-- 8. DischargeBillDetail table
CREATE TABLE "discharge_bill_details" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dischargeBillId" TEXT NOT NULL,
    "chargeTransactionId" TEXT,
    "serviceId" TEXT,
    "serviceCode" TEXT,
    "serviceName" TEXT NOT NULL,
    "categoryId" TEXT,
    "sourceModule" TEXT,
    "sourceTransactionId" TEXT,
    "serviceDate" TIMESTAMP(3),
    "description" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unitRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insuranceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "patientAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "manuallyAdded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "discharge_bill_details_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "discharge_bill_details_tenantId_dischargeBillId_idx" ON "discharge_bill_details"("tenantId", "dischargeBillId");
CREATE INDEX "discharge_bill_details_tenantId_serviceId_idx" ON "discharge_bill_details"("tenantId", "serviceId");

-- 9. Foreign keys for charge_transactions
ALTER TABLE "charge_transactions" ADD CONSTRAINT "charge_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charge_transactions" ADD CONSTRAINT "charge_transactions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charge_transactions" ADD CONSTRAINT "charge_transactions_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "charge_transactions" ADD CONSTRAINT "charge_transactions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "charge_transactions" ADD CONSTRAINT "charge_transactions_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "billing_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "charge_transactions" ADD CONSTRAINT "charge_transactions_dischargeBillId_fkey" FOREIGN KEY ("dischargeBillId") REFERENCES "discharge_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 10. Foreign keys for discharge_bills
ALTER TABLE "discharge_bills" ADD CONSTRAINT "discharge_bills_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discharge_bills" ADD CONSTRAINT "discharge_bills_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discharge_bills" ADD CONSTRAINT "discharge_bills_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "admissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "discharge_bills" ADD CONSTRAINT "discharge_bills_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 11. Foreign keys for discharge_bill_details
ALTER TABLE "discharge_bill_details" ADD CONSTRAINT "discharge_bill_details_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discharge_bill_details" ADD CONSTRAINT "discharge_bill_details_dischargeBillId_fkey" FOREIGN KEY ("dischargeBillId") REFERENCES "discharge_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discharge_bill_details" ADD CONSTRAINT "discharge_bill_details_chargeTransactionId_fkey" FOREIGN KEY ("chargeTransactionId") REFERENCES "charge_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "discharge_bill_details" ADD CONSTRAINT "discharge_bill_details_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "billing_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 12. Foreign key for service_categories
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
