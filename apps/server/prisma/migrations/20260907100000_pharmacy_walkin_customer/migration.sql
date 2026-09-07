-- Enable pharmacy walk-in billing for customers who are NOT hospital patients.
-- Makes the Patient link optional on invoices, payments and refunds, and adds
-- walk-in customer name/phone on the invoice.
-- DropIndex (nullable change requires no index rebuild in Postgres)

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "patientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "patientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "refunds" ALTER COLUMN "patientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "customerName" TEXT,
                       ADD COLUMN "customerPhone" TEXT;
