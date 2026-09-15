import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

// Every table that carries a tenantId column is treated as tenant-scoped and
// gets a Row-Level Security policy. Tables without a tenantId column are
// skipped automatically by enableOnTable(). Platform-global tables
// (tenants, roles, permissions, plans, etc.) have no tenantId and are excluded
// by design. Super-admins and requests without a tenant context set
// app.rls_bypass = true (see prisma.service.ts), so they remain unaffected.
const TENANT_SCOPED_TABLES = [
  "accounts",
  "admissions",
  "adverse_events",
  "ambulance_calls",
  "ambulance_vehicles",
  "api_keys",
  "appointments",
  "attendance_records",
  "audit_logs",
  "availability_slots",
  "bed_allocations",
  "bed_maintenances",
  "bed_movements",
  "beds",
  "billing_schemes",
  "billing_services",
  "billing_settings",
  "blog_posts",
  "blood_donors",
  "blood_units",
  "branches",
  "cash_handovers",
  "cash_sessions",
  "credit_accounts",
  "controlled_substance_logs",
  "daily_closings",
  "departments",
  "deposit_transactions",
  "deposits",
  "diagnoses",
  "doctor_profiles",
  "doctor_schedules",
  "doctor_share_rules",
  "doctor_share_transactions",
  "document_signatures",
  "emergency_cases",
  "encounters",
  "enquiries",
  "equipment_items",
  "equipment_logs",
  "financial_transactions",
  "follow_up_doctors",
  "follow_ups",
  "goods_receipts",
  "insurance_claims",
  "insurance_policies",
  "insurance_providers",
  "insurance_preauthorizations",
  "integration_settings",
  "inventory_items",
  "inventory_transactions",
  "invoice_items",
  "invoices",
  "journal_entries",
  "journal_lines",
  "lab_order_items",
  "lab_orders",
  "lab_samples",
  "lab_tests",
  "leaves",
  "medical_tourism_cases",
  "medication_administrations",
  "medicines",
  "membership_family",
  "membership_packages",
  "memberships",
  "notifications",
  "nursing_notes",
  "ot_cases",
  "patient_allergies",
  "patient_conditions",
  "patient_documents",
  "patients",
  "payments",
  "prescription_items",
  "prescriptions",
  "procedures",
  "purchase_orders",
  "purchase_requests",
  "quality_checklists",
  "radiology_orders",
  "refunds",
  "rooms",
  "rosters",
  "sessions",
  "shift_handovers",
  "shifts",
  "staff_profiles",
  "staff_trainings",
  "stores",
  "stock_transfers",
  "subscriptions",
  "suppliers",
  "tenant_feature_flags",
  "tenant_settings",
  "usage_metrics",
  "users",
  "vitals",
  "wards",
  "webhooks",
];

@Injectable()
export class RlsBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger("RlsBootstrap");

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === "production" && process.env.ENABLE_RLS !== "true") {
      console.warn("WARNING: Row-Level Security is DISABLED in production. This is a security risk. Set ENABLE_RLS=true.");
    }

    if (process.env.ENABLE_RLS !== "true") {
      this.logger.log(
        "ENABLE_RLS not set to true; skipping Row-Level Security bootstrap.",
      );
      return;
    }

    // Confirm the DB user has rights to alter tables; run as superuser in migration.
    for (const table of TENANT_SCOPED_TABLES) {
      await this.enableOnTable(table);
    }
    this.logger.log(
      `Row-Level Security enabled on ${TENANT_SCOPED_TABLES.length} tenant-scoped table(s).`,
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
