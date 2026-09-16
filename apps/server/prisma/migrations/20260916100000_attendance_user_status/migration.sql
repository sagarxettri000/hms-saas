/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,userId,date]` on the table `attendance_records` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "userId" TEXT,
ADD COLUMN     "rosterId" TEXT,
ADD COLUMN     "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT';

-- Backfill: attach legacy records to users by name where a confident match exists
UPDATE "attendance_records" ar
SET "userId" = u."id"
FROM "users" u
WHERE ar."userId" IS NULL
  AND u."tenantId" = ar."tenantId"
  AND LOWER(TRIM(u."firstName" || ' ' || u."lastName")) = LOWER(TRIM(ar."staffName"));

-- Drop legacy rows that could not be matched to a user (they carry no identity)
DELETE FROM "attendance_records" WHERE "userId" IS NULL;

-- AlterTable
ALTER TABLE "attendance_records" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "attendance_records_userId_date_idx" ON "attendance_records"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_tenantId_userId_date_key" ON "attendance_records"("tenantId", "userId", "date");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "rosters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
