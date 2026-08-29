import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const CORE_CLINICAL_TABLES = [
  "patients",
  "admissions",
  "encounters",
  "appointments",
  "prescriptions",
  "prescription_items",
  "lab_orders",
  "lab_order_items",
  "vitals",
  "diagnoses",
  "wards",
  "rooms",
  "beds",
  "bed_allocations",
  "ot_cases",
  "emergency_cases",
  "nursing_notes",
  "medication_administrations",
  "radiology_orders",
  "procedures",
];

@Injectable()
export class RlsBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger("RlsBootstrap");

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (process.env.ENABLE_RLS !== "true") {
      this.logger.log(
        "ENABLE_RLS not set to true; skipping Row-Level Security bootstrap.",
      );
      return;
    }

    // Confirm the DB user has rights to alter tables; run as superuser in migration.
    for (const table of CORE_CLINICAL_TABLES) {
      await this.enableOnTable(table);
    }
    this.logger.log(
      `Row-Level Security enabled on ${CORE_CLINICAL_TABLES.length} core clinical table(s).`,
    );
  }

  private async enableOnTable(table: string) {
    try {
      // Only handle tables that actually expose a tenantId column.
      const cols: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenantId'`,
        table,
      );
      if (!cols.length) {
        this.logger.warn(`Table ${table} has no tenantId column; skipped.`);
        return;
      }

      await this.prisma.$executeRawUnsafe(
        `ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY`,
      );
      const policy = `${table}_tenant_isolation`;
      await this.prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = '${table}' AND policyname = '${policy}'
          ) THEN
            CREATE POLICY "${policy}" ON "public"."${table}"
              USING (
                "tenantId" = current_setting('app.current_tenant_id', true)
                OR current_setting('app.rls_bypass', true) = 'true'
              )
              WITH CHECK (
                "tenantId" = current_setting('app.current_tenant_id', true)
                OR current_setting('app.rls_bypass', true) = 'true'
              );
          END IF;
        END $$;
      `);
      this.logger.log(`RLS enabled + policy created on ${table}.`);
    } catch (err) {
      this.logger.error(
        `Failed to enable RLS on ${table}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
