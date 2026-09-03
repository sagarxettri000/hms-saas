-- Add `nurses` JSON column to store attending nursing staff for a scheduled OT case.
ALTER TABLE "ot_cases" ADD COLUMN "nurses" JSONB;
