-- CreateEnum
CREATE TYPE "PurchaseOrderType" AS ENUM ('STANDARD', 'EMERGENCY', 'CONTRACT', 'BLANKET', 'SERVICE');

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "batchRequired" BOOLEAN,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "calibrationRequired" BOOLEAN,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "coldChainRequired" BOOLEAN,
ADD COLUMN     "criticality" TEXT,
ADD COLUMN     "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountPercent" DECIMAL(5,2),
ADD COLUMN     "expectedDelivery" TIMESTAMP(3),
ADD COLUMN     "expiryRequired" BOOLEAN,
ADD COLUMN     "hsCode" TEXT,
ADD COLUMN     "installationRequired" BOOLEAN,
ADD COLUMN     "itemCode" TEXT,
ADD COLUMN     "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "otherCharges" DECIMAL(14,2),
ADD COLUMN     "specification" TEXT,
ADD COLUMN     "sterilityRequired" BOOLEAN,
ADD COLUMN     "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxPercent" DECIMAL(5,2),
ADD COLUMN     "taxableAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "temperatureRequirement" TEXT,
ADD COLUMN     "trainingRequired" BOOLEAN,
ADD COLUMN     "warrantyRequired" BOOLEAN;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NPR',
ADD COLUMN     "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountPercent" DECIMAL(5,2),
ADD COLUMN     "freightAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "insuranceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "poType" "PurchaseOrderType" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "roundingAdjustment" DECIMAL(14,2),
ADD COLUMN     "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxPercent" DECIMAL(5,2),
ADD COLUMN     "taxableAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tdsPercent" DECIMAL(5,2),
ADD COLUMN     "updatedBy" TEXT,
ADD COLUMN     "validityDays" INTEGER,
ADD COLUMN     "vendorAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "vendorAcceptedBy" TEXT;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bankBranch" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "vatNumber" TEXT;


-- Backfill existing records so historical totals remain consistent
UPDATE "purchase_orders"
SET "subtotal" = "totalAmount", "taxableAmount" = "totalAmount", "grandTotal" = "totalAmount"
WHERE "totalAmount" > 0;

UPDATE "purchase_order_items"
SET "taxableAmount" = "totalPrice", "lineTotal" = "totalPrice"
WHERE "totalPrice" > 0;
