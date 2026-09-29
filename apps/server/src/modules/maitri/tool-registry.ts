import { z } from "zod";
import type {
  MaitriToolSpec,
  MaitriClientContext,
  MaitriRequiredPermission,
} from "@hms/shared";
import {
  PatientsService,
  CreatePatientDto,
} from "../patients/patients.service";
import { PatientVisibilityService } from "../patients/patient-visibility.service";
import {
  AppointmentsService,
  CreateAppointmentDto,
} from "../appointments/appointments.service";
import { BedManagementService } from "../bed-management/bed-management.service";
import { PharmacyService } from "../pharmacy/pharmacy.service";
import {
  BillingService,
  InvoiceSearchParams,
  PaymentSearchParams,
} from "../billing/billing.service";
import { LaboratoryService } from "../laboratory/laboratory.service";
import { DoctorsService } from "../doctors/doctors.service";
import { UsersService } from "../users/users.service";
import { EncountersService } from "../encounters/encounters.service";
import { DepartmentsService } from "../departments/departments.service";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Maitri tool registry — the strict allowlist of everything the assistant can
 * do (spec §9). Every tool:
 *  - declares the HMS module/action pairs it requires; the orchestrator checks
 *    them server-side against the same role matrix as the HMS UI (spec §8/§37),
 *  - declares a zod schema the MODEL-PROPOSED arguments are validated against
 *    (the model can never bypass backend validation, spec §10),
 *  - wraps an EXISTING HMS service — no duplicated business logic (spec §53).
 *
 * Handlers receive a scope object; the registry holds no request-local state.
 */
export interface MaitriToolScope {
  tenantId: string;
  userId: string;
  role: string;
  user: any;
  context: MaitriClientContext;
}

export interface MaitriToolDeps {
  prisma: PrismaService;
  patients: PatientsService;
  visibility: PatientVisibilityService;
  appointments: AppointmentsService;
  beds: BedManagementService;
  pharmacy: PharmacyService;
  billing: BillingService;
  laboratory: LaboratoryService;
  doctors: DoctorsService;
  users: UsersService;
  encounters: EncountersService;
  departments: DepartmentsService;
}

type MaitriToolHandler = (input: any, scope: MaitriToolScope) => Promise<any>;

export interface MaitriTool extends Omit<MaitriToolSpec, "inputSchema"> {
  inputSchema: z.ZodTypeAny;
  handler: MaitriToolHandler;
}

const P = (module: string, action: string): MaitriRequiredPermission =>
  ({ module, action } as MaitriRequiredPermission);

/**
 * Free-text cap for strings the MODEL extracts from the user's message.
 * The cap is a prompt-injection cost bound (spec 17): any document/record
 * content echoed into a tool argument stays small, and handlers never
 * interpret these strings as anything but data.
 */
const untrustedText = (description: string) =>
  z.string().min(1).max(300).describe(description);

const VIEW_TODAY = () => {
  const d = new Date();
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  return iso;
};

/** Compact patient projection — the model never sees full rows. */
function compactPatient(p: any) {
  if (!p) return p;
  const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
  return {
    id: p.id,
    mrn: p.mrn,
    name,
    gender: p.gender ?? null,
    age: p.age ?? null,
    mobile: p.mobile ?? p.phone ?? null,
    patientType: p.patientType ?? null,
    status: p.status ?? null,
  };
}

function compactPatients(res: any): any[] {
  const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  return rows.slice(0, 10).map(compactPatient);
}

export function buildToolRegistry(deps: MaitriToolDeps): MaitriTool[] {
  return [
    // =======================================================================
    // NAVIGATION (client-only — nothing written, spec §12)
    // =======================================================================
    {
      name: "navigate_to_module",
      description:
        "Navigate the current user to an HMS module screen. Use for requests like “open pharmacy”, “take me to billing”, “show dashboard”. Nothing is written to the database.",
      module: "navigation",
      requiredPermissions: [],
      clientOnly: true,
      auditLevel: "low",
      activityLabel: "Opening module",
      inputSchema: z.object({
        target: z
          .string()
          .describe(
            "Route key: patients, patient_detail, appointments, encounters, admissions, beds, doctors, emergency, nursing, laboratory, radiology, pharmacy_billing, pharmacy_medicines, pharmacy_stores, billing, staff, departments, procurement, dashboard, settings, notifications, audit",
          ),
        id: z.string().optional().describe("Record id for *_detail targets"),
      }),
      handler: async (input) => input,
    },

    // =======================================================================
    // PATIENTS → PatientsService (existing HMS logic + visibility + PHI mask)
    // =======================================================================
    {
      name: "search_patient",
      description:
        "Search patients by name, MRN or mobile number. Returns a compact list; follow with get_patient_detail using the returned id.",
      module: "patients",
      requiredPermissions: [P("patients", "VIEW")],
      auditLevel: "low",
      activityLabel: "Searching patients",
      inputSchema: z.object({
        query: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      handler: async (input, scope) => {
        // Same server-side visibility composition as PatientsController.findAll
        const visibilityFilter = {
          AND: [
            await deps.visibility.buildActiveListFilter(scope.user),
            deps.visibility.buildErIsolationFilter(),
          ],
        };
        // Full-string search first (exact phrase match on any field). If that
        // finds nothing (e.g. “srijana basnet” spans two columns), retry with
        // the first token so “find patient srijana basnet” still matches —
        // same tolerance the global search box gets (§39).
        let result = await deps.patients.findAll(scope.tenantId, {
          query: input.query,
          limit: input.limit ?? 5,
          visibilityFilter,
        });
        if (!compactPatients({ data: result.data }).length && input.query.trim().includes(" ")) {
          const firstToken = input.query.trim().split(/\s+/)[0];
          result = await deps.patients.findAll(scope.tenantId, {
            query: firstToken,
            limit: input.limit ?? 5,
            visibilityFilter,
          });
        }
        // Same PHI masking as the HMS UI path — the AI never sees more.
        const masked = deps.patients.maskPatientPhi(scope.role, result.data);
        return compactPatients({ data: masked });
      },
    },
    {
      name: "get_patient_detail",
      description:
        "Get one patient's full record by exact patient id (from search_patient results or the current screen).",
      module: "patients",
      requiredPermissions: [P("patients", "VIEW")],
      auditLevel: "low",
      activityLabel: "Loading patient record",
      inputSchema: z.object({ patientId: z.string().min(1) }),
      handler: async (input, scope) => {
        await deps.visibility.assertPatientRecordAccess(scope.user, input.patientId, {
          reason: "Maitri assistant patient lookup",
          module: "maitri/get_patient_detail",
        });
        const p = await deps.patients.findById(scope.tenantId, input.patientId);
        return compactPatient(deps.patients.maskPatientPhi(scope.role, [p])[0] ?? p);
      },
    },
    {
      name: "get_patient_summary",
      description:
        "Summarize a patient's recent activity from real records: recent encounters, lab orders, prescriptions and latest vitals.",
      module: "patients",
      requiredPermissions: [P("patients", "VIEW")],
      auditLevel: "normal",
      activityLabel: "Summarizing patient",
      inputSchema: z.object({ patientId: z.string().min(1) }),
      handler: async (input, scope) => {
        await deps.visibility.assertPatientRecordAccess(scope.user, input.patientId, {
          reason: "Maitri assistant patient summary",
          module: "maitri/get_patient_summary",
        });
        const p: any = await deps.patients.findById(scope.tenantId, input.patientId);
        const [encounters, labOrders, vitals] = await Promise.all([
          deps.prisma.encounter.findMany({
            where: { tenantId: scope.tenantId, patientId: input.patientId },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              type: true,
              status: true,
              chiefComplaint: true,
              createdAt: true,
              doctor: { select: { user: { select: { firstName: true, lastName: true } } } },
            },
          }),
          deps.laboratory.findOrders(scope.tenantId, {
            patientId: input.patientId,
            limit: 5,
          }),
          deps.encounters.getVitals(scope.tenantId, input.patientId),
        ]);
        const labs = compactList(labOrders).map((o: any) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          orderedAt: o.orderedAt,
        }));
        const latestVitals = Array.isArray(vitals) ? vitals[0] : vitals;
        return {
          patient: compactPatient(deps.patients.maskPatientPhi(scope.role, [p])[0] ?? p),
          recentEncounters: encounters.map((e: any) => ({
            id: e.id,
            type: e.type,
            status: e.status,
            chiefComplaint: e.chiefComplaint ?? null,
            date: e.createdAt,
            doctor: e.doctor?.user
              ? `${e.doctor.user.firstName ?? ""} ${e.doctor.user.lastName ?? ""}`.trim()
              : null,
          })),
          recentLabOrders: labs,
          latestVitals: latestVitals ?? null,
        };
      },
    },
    {
      name: "create_patient",
      description:
        "Register a new patient. Requires at least first name and last name. Uses the same HMS registration path as the Patients screen.",
      module: "patients",
      requiredPermissions: [P("patients", "CREATE")],
      auditLevel: "high",
      activityLabel: "Registering patient",
      inputSchema: z.object({
        firstName: z.string().min(1).max(80),
        middleName: z.string().max(80).optional(),
        lastName: z.string().min(1).max(80),
        age: z.number().int().min(0).max(130).optional(),
        gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
        mobile: z.string().max(20).optional(),
        phone: z.string().max(20).optional(),
        email: z.string().email().optional(),
        addressLine1: z.string().max(200).optional(),
        city: z.string().max(100).optional(),
        district: z.string().max(100).optional(),
      }),
      handler: async (input, scope) => {
        const dto: CreatePatientDto = { ...input } as CreatePatientDto;
        return deps.patients.create(scope.tenantId, dto, scope.userId);
      },
    },

    // =======================================================================
    // APPOINTMENTS → AppointmentsService
    // =======================================================================
    {
      name: "get_todays_appointments",
      description:
        "List today's appointments with status counts. Optionally filter by doctor name or patient.",
      module: "appointments",
      requiredPermissions: [P("appointments", "VIEW")],
      auditLevel: "low",
      activityLabel: "Loading today's appointments",
      inputSchema: z.object({
        doctorName: z.string().max(120).optional(),
      }),
      handler: async (input, scope) => {
        let doctorId: string | undefined;
        if (input.doctorName) {
          const docs = await deps.doctors.findAll(scope.tenantId, {
            search: input.doctorName,
            limit: 1,
          });
          const first = compactList(docs)[0];
          doctorId = first?.id;
          if (!doctorId) return { appointments: [], count: 0, note: `No doctor matching “${input.doctorName}” was found.` };
        }
        const res: any = await deps.appointments.getToday(scope.tenantId);
        const list = (res?.appointments ?? res?.data ?? res ?? []) as any[];
        const filtered = doctorId
          ? list.filter((a) => a.doctorId === doctorId)
          : list;
        return {
          date: VIEW_TODAY(),
          count: filtered.length,
          byStatus: filtered.reduce((acc: Record<string, number>, a) => {
            const s = a.status ?? "UNKNOWN";
            acc[s] = (acc[s] ?? 0) + 1;
            return acc;
          }, {}),
          appointments: filtered.slice(0, 15).map((a) => ({
            id: a.id,
            time: a.startTime ?? a.appointmentDate ?? null,
            patient: a.patient
              ? [a.patient.firstName, a.patient.lastName].filter(Boolean).join(" ")
              : null,
            patientId: a.patientId ?? null,
            doctor: a.doctor?.user
              ? `${a.doctor.user.firstName ?? ""} ${a.doctor.user.lastName ?? ""}`.trim()
              : a.doctorName ?? null,
            department: a.department?.name ?? null,
            status: a.status,
            type: a.type ?? null,
          })),
        };
      },
    },
    {
      name: "find_available_appointment_slots",
      description:
        "Find open appointment slots for a date, optionally filtered by doctor or department. Read-only.",
      module: "appointments",
      requiredPermissions: [P("appointments", "VIEW")],
      auditLevel: "low",
      activityLabel: "Checking availability",        inputSchema: z.object({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .describe("ISO date, e.g. 2026-09-29"),
          doctorName: z.string().max(120).optional(),
          doctorId: z.string().optional(),
          departmentId: z.string().optional(),
          preferredTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/)
            .optional()
            .describe("Preferred HH:MM time; narrows slots to nearest options"),
        }),
        handler: async (input, scope) => {
        // Resolve which doctors to query: explicit id/name, else up to 5
        // active doctors so "find slots tomorrow" reflects the whole hospital.
        let doctorIds: string[] = [];
        let doctorName: string | null = null;
        if (input.doctorId) {
          doctorIds = [input.doctorId];
          const doc: any = await deps.doctors.findById(scope.tenantId, input.doctorId);
          doctorName = doc?.user
            ? `${doc.user.firstName ?? ""} ${doc.user.lastName ?? ""}`.trim()
            : null;
        } else if (input.doctorName) {
          const docs = await deps.doctors.findAll(scope.tenantId, {
            search: input.doctorName,
            limit: 1,
          });
          const first = compactList(docs)[0];
          if (!first)
            return { slots: [], count: 0, note: `No doctor matching “${input.doctorName}” was found.` };
          doctorIds = [first.id];
          doctorName = first.name ?? null;
        } else {
          const docs = await deps.doctors.findAll(scope.tenantId, { limit: 2 });
          doctorIds = compactList(docs).map((d: any) => d.id).slice(0, 2);
        }

        // The weekly-schedule slot engine (DoctorsService.getAvailability) is
        // the HMS source of truth for open booking windows. Query per doctor
        // (bounded: first 2 doctors) so a slow/unreachable DB cannot stall a
        // whole turn — earlier failures degrade to the remaining doctors.
        const merged: any[] = [];
        for (const docId of doctorIds.slice(0, 2)) {
          const avail = (await deps.doctors
            .getAvailability(scope.tenantId, docId, new Date(`${input.date}T00:00:00`))
            .catch(() => null)) as any;
          if (avail?.available && Array.isArray(avail.slots)) {
            merged.push(
              ...avail.slots.map((s: any) => ({
                doctorId: docId,
                startTime: s.startTime,
                endTime: s.endTime,
              })),
            );
          }
        }
        merged.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
        // Preferred time (§50 recovery): rank nearest options first so the
        // user sees 10:30/10:15/10:45 rather than the whole 09:00–17:00 grid.
        const ranked = input.preferredTime
          ? [...merged].sort(
              (a, b) =>
                Math.abs(String(a.startTime).localeCompare(input.preferredTime!)) -
                Math.abs(String(b.startTime).localeCompare(input.preferredTime!)),
            )
          : merged;
        if (!doctorName && merged.length) {
          const firstDoc: any = await deps.doctors.findById(scope.tenantId, merged[0].doctorId);
          doctorName = firstDoc?.user
            ? `${firstDoc.user.firstName ?? ""} ${firstDoc.user.lastName ?? ""}`.trim()
            : null;
        }
        return {
          date: input.date,
          doctor: doctorName,
          doctorsChecked: doctorIds.length,
          count: merged.length,
          ...(input.preferredTime ? { preferredTime: input.preferredTime } : {}),
          slots: ranked.slice(0, 20),
        };
      },
    },
    {
      name: "create_appointment",
      description:
        "Book an appointment for an existing patient with a doctor at a specific date/time. Validates doctor availability and conflicts through the HMS booking rules.",
      module: "appointments",
      requiredPermissions: [P("appointments", "CREATE")],
      auditLevel: "high",
      activityLabel: "Booking appointment",
      inputSchema: z.object({
        patientId: z.string().min(1).describe("Existing patient id"),
        doctorId: z.string().min(1),
        appointmentDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("ISO date, e.g. 2026-09-29"),
        startTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .describe("24h HH:MM, e.g. 10:30"),
        type: z.string().max(40).optional(),
        reason: z.string().max(300).optional(),
      }),
      handler: async (input, scope) => {
        const dto: CreateAppointmentDto = {
          patientId: input.patientId,
          doctorId: input.doctorId,
          appointmentDate: new Date(`${input.appointmentDate}T00:00:00`),
          startTime: input.startTime,
          type: input.type ?? "CONSULTATION",
          reason: input.reason,
        };
        return deps.appointments.create(scope.tenantId, dto, scope.userId);
      },
    },
    {
      name: "cancel_appointment",
      description:
        "Cancel an appointment by id with a reason. DESTRUCTIVE: always ask the user to confirm before calling.",
      module: "appointments",
      requiredPermissions: [P("appointments", "EDIT")],
      auditLevel: "high",
      confirmationRequired: true,
      destructive: true,
      activityLabel: "Cancelling appointment",
      inputSchema: z.object({
        appointmentId: z.string().min(1),
        reason: untrustedText(
          "Why the appointment is being cancelled",
        ).optional(),
      }),
      handler: async (input, scope) => {
        return deps.appointments.cancel(
          scope.tenantId,
          input.appointmentId,
          input.reason ?? "Cancelled via Maitri Assistant",
          scope.userId,
        );
      },
    },
    {
      name: "reschedule_appointment",
      description:
        "Move an appointment to a new date/time using the HMS reschedule rules (conflict-checked). Not destructive.",
      module: "appointments",
      requiredPermissions: [P("appointments", "EDIT")],
      auditLevel: "normal",
      activityLabel: "Rescheduling appointment",
      inputSchema: z.object({
        appointmentId: z.string().min(1),
        newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        newStartTime: z.string().regex(/^\d{2}:\d{2}$/),
      }),
      handler: async (input, scope) => {
        return deps.appointments.reschedule(
          scope.tenantId,
          input.appointmentId,
          new Date(`${input.newDate}T00:00:00`),
          input.newStartTime,
        );
      },
    },

    // =======================================================================
    // BEDS → BedManagementService
    // =======================================================================
    {
      name: "get_bed_availability",
      description:
        "Current bed availability across wards/rooms: totals, available, occupied and maintenance counts. Read-only.",
      module: "beds",
      requiredPermissions: [P("beds", "VIEW")],
      auditLevel: "low",
      activityLabel: "Checking bed availability",
      inputSchema: z.object({}),
      handler: async (_input, scope) => {
        return deps.beds.getFreeBedSummary(scope.tenantId);
      },
    },

    // =======================================================================
    // PHARMACY → PharmacyService
    // =======================================================================
    {
      name: "get_low_stock_medicines",
      description:
        "List pharmacy items at or below their reorder level, plus out-of-stock items. Uses the HMS stock-alert rules.",
      module: "pharmacy",
      requiredPermissions: [P("pharmacy", "VIEW")],
      auditLevel: "low",
      activityLabel: "Checking stock levels",
      inputSchema: z.object({}),
      handler: async (_input, scope) => {
        const alerts = await deps.pharmacy.getStockAlerts(scope.tenantId);
        return compactPharmacyAlerts(alerts);
      },
    },
    {
      name: "get_expiring_medicines",
      description:
        "List pharmacy inventory items expiring within the given number of days (default 60, max 365).",
      module: "pharmacy",
      requiredPermissions: [P("pharmacy", "VIEW")],
      auditLevel: "low",
      activityLabel: "Checking expiry dates",
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).optional().default(60),
      }),
      handler: async (input, scope) => {
        const res = await deps.pharmacy.findInventory(scope.tenantId, {
          itemType: "MEDICINE",
        });
        const rows = compactList(res);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + (input.days ?? 60));
        const expiring = rows
          .filter((r: any) => r.expiryDate && new Date(r.expiryDate) <= cutoff)
          .sort(
            (a: any, b: any) =>
              new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime(),
          )
          .slice(0, 20)
          .map((r: any) => ({
            id: r.id,
            name: r.medicine?.name ?? r.name ?? null,
            batch: r.batchNumber ?? null,
            quantity: r.currentStock ?? null,
            expiryDate: r.expiryDate,
          }));
        return { windowDays: input.days ?? 60, count: expiring.length, items: expiring };
      },
    },
    {
      name: "search_medicine",
      description:
        "Search the pharmacy medicine catalog by name; returns stock on hand per item.",
      module: "pharmacy",
      requiredPermissions: [P("pharmacy", "VIEW")],
      auditLevel: "low",
      activityLabel: "Searching medicines",
      inputSchema: z.object({
        query: z.string().min(1).max(120),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      handler: async (input, scope) => {
        const meds = compactList(
          await deps.pharmacy.findMedicines(scope.tenantId, {
            query: input.query,
            limit: input.limit ?? 5,
          }),
        );
        return meds.map((m: any) => ({
          id: m.id,
          name: m.name,
          category: m.category ?? null,
          strength: m.strength ?? null,
          form: m.form ?? null,
          prescriptionRequired: m.prescriptionRequired ?? null,
        }));
      },
    },

    // =======================================================================
    // LABORATORY → LaboratoryService
    // =======================================================================
    {
      name: "get_pending_lab_orders",
      description:
        "List laboratory orders awaiting sample collection, processing or results.",
      module: "laboratory",
      requiredPermissions: [P("laboratory", "VIEW")],
      auditLevel: "low",
      activityLabel: "Loading pending lab orders",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).optional().default(10),
      }),
      handler: async (input, scope) => {
        return deps.laboratory.getPendingResultOrders(scope.tenantId);
      },
    },

    // =======================================================================
    // BILLING → BillingService
    // =======================================================================
    {
      name: "get_todays_collections",
      description:
        "Payments collected today: total amount, count and breakdown by method.",
      module: "billing",
      requiredPermissions: [P("billing", "VIEW")],
      auditLevel: "normal",
      activityLabel: "Calculating today's collections",
      inputSchema: z.object({}),
      handler: async (_input, scope) => {
        const today = VIEW_TODAY();
        const params: PaymentSearchParams = { from: today, to: today, limit: 1 };
        const res: any = await deps.billing.findPayments(scope.tenantId, params);
        const payments = compactList(res);
        const total = payments.reduce(
          (sum: number, p: any) => sum + (Number(p.amount) || 0),
          0,
        );
        const byMethod = payments.reduce((acc: Record<string, number>, p: any) => {
          const m = p.method ?? "UNKNOWN";
          acc[m] = (acc[m] ?? 0) + (Number(p.amount) || 0);
          return acc;
        }, {});
        return {
          date: today,
          total: Math.round(total * 100) / 100,
          currency: "NPR",
          count: payments.length,
          byMethod,
        };
      },
    },
    {
      name: "search_invoices",
      description:
        "Search invoices by number or patient, optionally filtered by status (PENDING, PAID, OVERDUE, CANCELLED).",
      module: "billing",
      requiredPermissions: [P("billing", "VIEW")],
      auditLevel: "low",
      activityLabel: "Searching invoices",
      inputSchema: z.object({
        query: z.string().max(120).optional(),
        status: z.string().max(30).optional(),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      handler: async (input, scope) => {
        const params: InvoiceSearchParams = {
          search: input.query,
          status: input.status,
          limit: input.limit ?? 5,
        };
        const res = await deps.billing.findInvoices(scope.tenantId, params);
        return compactList(res)
          .slice(0, 10)
          .map((i: any) => ({
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            patient: i.patient
              ? [i.patient.firstName, i.patient.lastName].filter(Boolean).join(" ")
              : null,
            patientId: i.patientId ?? null,
            total: i.total ?? i.grandTotal ?? null,
            status: i.status,
            createdAt: i.createdAt,
          }));
      },
    },

    // =======================================================================
    // STAFF → UsersService (same path as the HMS admin UI)
    // =======================================================================
    {
      name: "search_staff",
      description:
        "Search staff/user accounts by name, email or role (e.g. NURSE, DOCTOR, PHARMACIST).",
      module: "staff",
      requiredPermissions: [P("staff", "VIEW")],
      auditLevel: "low",
      activityLabel: "Searching staff",
      inputSchema: z.object({
        query: z.string().max(120).optional(),
        role: z.string().max(40).optional(),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      handler: async (input, scope) => {
        const res = await deps.users.findAll({
          search: input.query,
          role: input.role,
          tenantId: scope.tenantId,
          limit: input.limit ?? 5,
          actorRole: scope.role,
        });
        return compactList(res)
          .slice(0, 10)
          .map((u: any) => ({
            id: u.id,
            name: [u.firstName, u.lastName].filter(Boolean).join(" "),
            email: u.email,
            role: u.role,
            status: u.status ?? null,
            department: u.department?.name ?? null,
          }));
      },
    },
    {
      name: "create_staff",
      description:
        "Create a staff/user account (e.g. nurse, pharmacist). Generates a temporary password when none is supplied; the account uses the same provisioning path as the HMS admin screen.",
      module: "staff",
      requiredPermissions: [P("staff", "CREATE")],
      auditLevel: "critical",
      activityLabel: "Creating staff account",
      inputSchema: z.object({
        firstName: z.string().min(1).max(80),
        lastName: z.string().min(1).max(80),
        email: z.string().email(),
        role: z
          .string()
          .min(3)
          .max(40)
          .describe("HMS role, e.g. NURSE, DOCTOR, PHARMACIST, RECEPTIONIST"),
        phone: z.string().max(20).optional(),
        departmentId: z.string().optional(),
      }),
      handler: async (input, scope) => {
        // Only roles the acting user's own HR scope could create via the UI:
        // UsersService.create enforces actorRole rules — pass the caller's role.
        const tempPassword = `Maitri@${Math.random().toString(36).slice(2, 10)}A1`;
        return deps.users.create(
          {
            ...input,
            tenantId: scope.tenantId,
            password: tempPassword,
          },
          scope.role,
        );
      },
    },

    // =======================================================================
    // DEPARTMENTS (read-only lookup used by conversation flows)
    // =======================================================================
    {
      name: "search_doctor",
      description:
        "Search doctors by name or filter by department id. Use before booking to resolve a doctor.",
      module: "doctors",
      requiredPermissions: [P("doctors", "VIEW")],
      auditLevel: "low",
      activityLabel: "Searching doctors",
      inputSchema: z.object({
        query: z.string().max(120).optional(),
        departmentId: z.string().optional(),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      handler: async (input, scope) => {
        const res = await deps.doctors.findAll(scope.tenantId, {
          search: input.query,
          departmentId: input.departmentId,
          limit: input.limit ?? 5,
        });
        return compactList(res)
          .slice(0, 10)
          .map((d: any) => ({
            id: d.id,
            name: d.user
              ? `${d.user.firstName ?? ""} ${d.user.lastName ?? ""}`.trim()
              : (d.name ?? null),
            specialty: d.specialty ?? null,
            department: d.department?.name ?? null,
          }));
      },
    },
    {
      name: "get_patient_visits",
      description:
        "A patient's recent visit history (encounters timeline) from the HMS EMR timeline.",
      module: "patients",
      requiredPermissions: [P("patients", "VIEW")],
      auditLevel: "normal",
      activityLabel: "Loading visit history",
      inputSchema: z.object({ patientId: z.string().min(1) }),
      handler: async (input, scope) => {
        await deps.visibility.assertPatientRecordAccess(scope.user, input.patientId, {
          reason: "Maitri assistant visit history",
          module: "maitri/get_patient_visits",
        });
        const timeline = await deps.patients.getTimeline(scope.tenantId, input.patientId);
        return compactList(timeline).slice(0, 15);
      },
    },
    {
      name: "get_patient_reports",
      description:
        "A patient's recent laboratory orders and report documents.",
      module: "laboratory",
      requiredPermissions: [P("patients", "VIEW"), P("laboratory", "VIEW")],
      auditLevel: "normal",
      activityLabel: "Loading patient reports",
      inputSchema: z.object({ patientId: z.string().min(1) }),
      handler: async (input, scope) => {
        await deps.visibility.assertPatientRecordAccess(scope.user, input.patientId, {
          reason: "Maitri assistant reports lookup",
          module: "maitri/get_patient_reports",
        });
        const orders = await deps.laboratory.findOrders(scope.tenantId, {
          patientId: input.patientId,
          limit: 10,
        });
        return compactList(orders).map((o: any) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          orderedAt: o.orderedAt,
        }));
      },
    },
    {
      name: "get_pending_bills",
      description:
        "List invoices with a PENDING or OVERDUE status, newest first.",
      module: "billing",
      requiredPermissions: [P("billing", "VIEW")],
      auditLevel: "normal",
      activityLabel: "Loading pending bills",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      handler: async (input, scope) => {
        const res = await deps.billing.findInvoices(scope.tenantId, {
          status: "PENDING",
          limit: input.limit ?? 5,
        });
        const overdue = await deps.billing.findInvoices(scope.tenantId, {
          status: "OVERDUE",
          limit: input.limit ?? 5,
        });
        const row = (i: any) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          patient: i.patient
            ? [i.patient.firstName, i.patient.lastName].filter(Boolean).join(" ")
            : null,
          total: i.total ?? i.grandTotal ?? null,
          status: i.status,
        });
        return {
          pending: compactList(res).slice(0, 10).map(row),
          overdue: compactList(overdue).slice(0, 10).map(row),
        };
      },
    },
    {
      name: "open_create_form",
      description:
        "Open a create-record form on an HMS screen with the given fields prefilled (e.g. staff/patient/appointment forms). The user sees the populated form and can review or submit. Nothing is written by this tool.",
      module: "navigation",
      requiredPermissions: [],
      clientOnly: true,
      auditLevel: "normal",
      activityLabel: "Opening form",
      inputSchema: z.object({
        target: z
          .string()
          .describe("Module route key, e.g. staff, patients, appointments"),
        fields: untrustedText("Prefill values as JSON object").describe(
          'JSON object of field values, e.g. {"firstName":"Suman","lastName":"Thapa","role":"NURSE"}',
        ),
      }),
      handler: async (input) => input,
    },
    {
      name: "search_department",
      description:
        "List hospital departments, optionally filtered by name. Useful to resolve a department before booking or navigation.",
      module: "departments",
      requiredPermissions: [],
      auditLevel: "low",
      activityLabel: "Searching departments",
      inputSchema: z.object({
        query: z.string().max(120).optional(),
      }),
      handler: async (input, scope) => {
        const all = await deps.departments.findAll(scope.tenantId);
        const q = (input.query ?? "").toLowerCase();
        return compactList(all)
          .filter((d: any) =>
            q ? String(d.name ?? "").toLowerCase().includes(q) : true,
          )
          .slice(0, 10)
          .map((d: any) => ({ id: d.id, name: d.name, isActive: d.isActive ?? true }));
      },
    },
  ];
}

/** Normalise `{data:{data:[…]|items:[…]|…}|data:[…]|[…]}` responses to rows. */
function compactList(res: any): any[] {
  if (Array.isArray(res)) return res;
  const d = res?.data ?? res;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.items)) return d.items;
  return [];
}

function compactPharmacyAlerts(alerts: any) {
  const low = (alerts?.lowStockItems ?? alerts?.lowStock ?? []) as any[];
  const out = (alerts?.outOfStockItems ?? alerts?.outOfStock ?? []) as any[];
  const near = (alerts?.nearExpiryItems ?? alerts?.nearExpiry ?? []) as any[];
  const row = (r: any) => ({
    id: r.id,
    name: r.medicine?.name ?? r.name ?? null,
    batch: r.batchNumber ?? null,
    quantity: r.currentStock ?? null,
    reorderLevel: r.reorderLevel ?? r.minStock ?? null,
    expiryDate: r.expiryDate ?? null,
  });
  return {
    lowStock: low.slice(0, 15).map(row),
    outOfStock: out.slice(0, 15).map(row),
    nearExpiry: near.slice(0, 15).map(row),
    counts: {
      lowStock: low.length,
      outOfStock: out.length,
      nearExpiry: near.length,
    },
  };
}
