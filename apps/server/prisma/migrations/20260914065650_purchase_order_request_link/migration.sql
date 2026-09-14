-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "purchaseRequestId" TEXT;

-- CreateIndex
CREATE INDEX "purchase_orders_purchaseRequestId_idx" ON "purchase_orders"("purchaseRequestId");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
