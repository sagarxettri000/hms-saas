-- Add `affectedCount` to store the number of people involved in an incident.
ALTER TABLE "adverse_events" ADD COLUMN "affectedCount" INTEGER;
