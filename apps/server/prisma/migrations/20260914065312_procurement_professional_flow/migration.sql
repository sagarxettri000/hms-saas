-- CreateEnum
CREATE TYPE "PurchaseRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "purchase_requests" ADD COLUMN     "justification" TEXT,
ADD COLUMN     "neededBy" TIMESTAMP(3),
ADD COLUMN     "priority" "PurchaseRequestPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedBy" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "stock_transfers" ADD COLUMN     "fromStoreId" TEXT,
ADD COLUMN     "inventoryItemId" TEXT,
ADD COLUMN     "toStoreId" TEXT;
