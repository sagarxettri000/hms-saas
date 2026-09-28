/**
 * Maitri Assistant — AI copilot contract shared between the NestJS API and the
 * Next.js web app.
 *
 * The assistant is an HMS-only operator: the web client renders streamed
 * orchestration events and executes client actions (navigate / form actions),
 * while the server independently authenticates, authorizes and validates
 * everything through the existing HMS services.
 */

// ---------------------------------------------------------------------------
// Roles & permissions model
// ---------------------------------------------------------------------------

/**
 * Capability domains for AI tools. The backend maps each tool to the HMS
 * module it operates on; authorization reuses the exact same role → module
 * matrix that gates the HMS UI (mirrored on the server from
 * @hms/shared ROLE_PERMISSIONS + AppShell module roles).
 */
export type MaitriModule =
  | 'patients'
  | 'appointments'
  | 'encounters'
  | 'admissions'
  | 'beds'
  | 'doctors'
  | 'emergency'
  | 'nursing'
  | 'laboratory'
  | 'radiology'
  | 'pharmacy'
  | 'billing'
  | 'staff'
  | 'procurement'
  | 'departments'
  | 'dashboard'
  | 'navigation';

/** Actions a tool may require, mirroring PermissionAction. */
export type MaitriAction =
  | 'VIEW'
  | 'CREATE'
  | 'EDIT'
  | 'DELETE'
  | 'APPROVE'
  | 'VERIFY'
  | 'SIGN'
  | 'DISCOUNT'
  | 'SETTLE'
  | 'CONFIGURE';

export interface MaitriRequiredPermission {
  module: MaitriModule;
  action: MaitriAction;
}

// ---------------------------------------------------------------------------
// Tool registry contract
// ---------------------------------------------------------------------------

export type MaitriAuditLevel = 'low' | 'normal' | 'high' | 'critical';

/**
 * Static declaration of one assistant tool. The executable `handler` lives on
 * the server implementation; the shared package only carries the safe
 * metadata that may be rendered/serialised.
 */
export interface MaitriToolSpec {
  name: string;
  description: string;
  module: MaitriModule;
  requiredPermissions: MaitriRequiredPermission[];
  /** zod-style JSON schema served to the model for structured extraction. */
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** Navigate/open only — executed client-side, nothing persisted. */
  clientOnly?: boolean;
  /** Renders a confirmation dialog before the server executes the tool. */
  confirmationRequired?: boolean;
  /** Destructive tools are always confirmation-gated and audited at high level. */
  destructive?: boolean;
  auditLevel: MaitriAuditLevel;
  /** Short human label for activity indicators, e.g. "Searching patients…". */
  activityLabel?: string;
}

// ---------------------------------------------------------------------------
// Client context sent with every chat turn (never trusted for authorization)
// ---------------------------------------------------------------------------

export interface MaitriClientContext {
  currentRoute?: string;
  currentModule?: string;
  currentEntity?: string;
  currentEntityId?: string;
  /** Selected record hints for natural references ("the first one", "these"). */
  selectedIds?: string[];
  /** Timezone identifier so the server resolves "today"/"tomorrow" correctly. */
  timeZone?: string;
}

// ---------------------------------------------------------------------------
// Chat request / streaming events
// ---------------------------------------------------------------------------

export interface MaitriChatRequest {
  message: string;
  sessionId?: string;
  context?: MaitriClientContext;
}

export type MaitriStreamEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'thinking'; message: string }
  | { type: 'tool_start'; tool: string; label?: string; input?: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; status: 'success' | 'error' | 'denied'; summary?: string }
  /** Destructive tool halted server-side; client must show a confirmation UI. */
  | {
      type: 'confirm_required';
      toolCallId: string;
      tool: string;
      label?: string;
      message: string;
      input?: Record<string, unknown>;
    }
  | { type: 'token'; content: string }
  | {
      type: 'client_action';
      action: 'navigate' | 'form_open' | 'form_submit';
      route: string;
      params?: Record<string, unknown>;
      label?: string;
    }
  | { type: 'error'; message: string; code?: string }
  | { type: 'done'; sessionId: string };

/** Confirmation decision for a pending destructive tool call (spec §14/§32). */
export interface MaitriConfirmRequest {
  toolCallId: string;
  approved: boolean;
}

/** Structured result card rendered from tool output (spec §29). */
export interface MaitriActionCard {
  kind: string;
  title: string;
  fields?: { label: string; value: string }[];
  route?: string;
}

/** Assistant message as rendered by the web client. */
export interface MaitriMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  card?: MaitriActionCard;
}

// ---------------------------------------------------------------------------
// Provider abstraction (Gemma primary, swappable runtime)
// ---------------------------------------------------------------------------

export interface AIProviderGenerateRequest {
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  tools?: MaitriToolSpec[];
  maxTokens?: number;
  temperature?: number;
}

export interface AIProviderToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIProviderGenerateResponse {
  content: string;
  toolCalls?: AIProviderToolCall[];
  finishReason?: string;
}

export interface AIProviderStreamEvent {
  type: 'token' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: AIProviderToolCall;
  error?: string;
}

/** Provider-agnostic interface so the HMS is never locked to one runtime. */
export interface AIProvider {
  readonly name: string;
  generate(request: AIProviderGenerateRequest): Promise<AIProviderGenerateResponse>;
  stream?(request: AIProviderGenerateRequest): AsyncGenerator<AIProviderStreamEvent>;
}

// ---------------------------------------------------------------------------
// Route registry — the single map from assistant intent to real HMS routes
// ---------------------------------------------------------------------------

export const MAITRI_ROUTES: Record<string, { route: string; label: string }> = {
  dashboard: { route: '/dashboard', label: 'Dashboard' },
  patients: { route: '/patients', label: 'Patients' },
  patient_detail: { route: '/patients/{id}', label: 'Patient profile' },
  appointments: { route: '/appointments', label: 'Appointments' },
  encounters: { route: '/encounters', label: 'Encounters' },
  admissions: { route: '/admissions', label: 'Admissions' },
  beds: { route: '/bed-management', label: 'Bed management' },
  doctors: { route: '/doctors', label: 'Doctors' },
  emergency: { route: '/emergency?tab=dashboard', label: 'Emergency' },
  nursing: { route: '/nursing', label: 'Nursing' },
  laboratory: { route: '/laboratory', label: 'Laboratory' },
  radiology: { route: '/radiology', label: 'Radiology' },
  pharmacy_billing: { route: '/pharmacy?tab=billing', label: 'Pharmacy billing' },
  pharmacy_medicines: { route: '/pharmacy?tab=medicines', label: 'Pharmacy medicines' },
  pharmacy_stores: { route: '/pharmacy?tab=stores', label: 'Pharmacy stores & stock' },
  billing: { route: '/billing', label: 'Billing' },
  staff: { route: '/hr', label: 'HR & Staff' },
  departments: { route: '/departments', label: 'Departments' },
  procurement: { route: '/procurement', label: 'Procurement' },
  settings: { route: '/settings', label: 'Settings' },
  notifications: { route: '/notifications', label: 'Notifications' },
  audit: { route: '/audit', label: 'Audit logs' },
};

/**
 * Server-side role → module matrix (mirror of the web MODULE_ROLES gate).
 * Admin roles bypass via isMaitriAdminRole. Tools check against this before
 * touching any HMS service — the model can never widen it.
 */
export const MAITRI_MODULE_ROLES: Record<MaitriModule, string[]> = {
  patients: ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'RECEPTIONIST', 'RECEPTION_SUPERVISOR', 'ANESTHETIST', 'DEPARTMENT_HEAD'],
  appointments: ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'RECEPTIONIST', 'RECEPTION_SUPERVISOR', 'ANESTHETIST', 'DEPARTMENT_HEAD'],
  encounters: ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'EMERGENCY_STAFF', 'DEPARTMENT_HEAD'],
  admissions: ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'RECEPTIONIST', 'RECEPTION_SUPERVISOR', 'ANESTHETIST', 'DEPARTMENT_HEAD'],
  beds: ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'RECEPTIONIST', 'RECEPTION_SUPERVISOR', 'ANESTHETIST'],
  doctors: ['DOCTOR', 'RECEPTIONIST', 'RECEPTION_SUPERVISOR', 'WARD_INCHARGE', 'ICU_STAFF', 'ANESTHETIST', 'DEPARTMENT_HEAD'],
  emergency: ['EMERGENCY_STAFF'],
  nursing: ['NURSE', 'OT_NURSE', 'WARD_INCHARGE', 'ICU_STAFF'],
  laboratory: ['LAB_TECHNICIAN', 'PATHOLOGIST', 'DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'RADIOLOGIST', 'RADIOLOGY_TECHNICIAN', 'ANESTHETIST'],
  radiology: ['RADIOLOGIST', 'RADIOLOGY_TECHNICIAN', 'DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'LAB_TECHNICIAN', 'PATHOLOGIST', 'ANESTHETIST'],
  pharmacy: ['PHARMACIST', 'INVENTORY_MANAGER', 'STORE_KEEPER', 'PURCHASE_OFFICER', 'FINANCE_MANAGER', 'DEPARTMENT_HEAD'],
  billing: ['RECEPTIONIST', 'RECEPTION_SUPERVISOR', 'FINANCE_MANAGER', 'INSURANCE_OFFICER'],
  staff: ['HR_MANAGER'],
  procurement: ['INVENTORY_MANAGER', 'STORE_KEEPER', 'PURCHASE_OFFICER', 'PHARMACIST', 'FINANCE_MANAGER'],
  departments: [],
  dashboard: [],
  navigation: [],
};

/** Roles that bypass module checks (matches PermissionsGuard admin bypass). */
export const MAITRI_ADMIN_ROLES = ['PLATFORM_SUPER_ADMIN', 'HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'IT_ADMIN'];

export function isMaitriAdminRole(role: string): boolean {
  return MAITRI_ADMIN_ROLES.includes(role);
}

/** Role → action gate mirrored from @hms/shared ROLE_PERMISSIONS. */
export const MAITRI_ROLE_ACTIONS: Record<string, MaitriAction[]> = {
  PLATFORM_SUPER_ADMIN: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'VERIFY', 'SIGN', 'DISCOUNT', 'SETTLE', 'CONFIGURE'],
  HOSPITAL_ADMIN: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'VERIFY', 'SIGN', 'DISCOUNT', 'SETTLE', 'CONFIGURE'],
  HOSPITAL_OWNER: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'VERIFY', 'SIGN', 'DISCOUNT', 'SETTLE', 'CONFIGURE'],
  DEPARTMENT_HEAD: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'VERIFY', 'SIGN'],
  RECEPTIONIST: ['VIEW', 'CREATE', 'EDIT', 'VERIFY', 'DISCOUNT'],
  RECEPTION_SUPERVISOR: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'VERIFY', 'DISCOUNT'],
  DOCTOR: ['VIEW', 'CREATE', 'EDIT', 'VERIFY', 'SIGN'],
  NURSE: ['VIEW', 'CREATE', 'EDIT', 'VERIFY'],
  WARD_INCHARGE: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'VERIFY'],
  LAB_TECHNICIAN: ['VIEW', 'CREATE', 'EDIT', 'VERIFY'],
  PATHOLOGIST: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'VERIFY', 'SIGN'],
  RADIOLOGIST: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'VERIFY', 'SIGN'],
  RADIOLOGY_TECHNICIAN: ['VIEW', 'CREATE', 'EDIT', 'VERIFY'],
  PHARMACIST: ['VIEW', 'CREATE', 'EDIT', 'VERIFY'],
  FINANCE_MANAGER: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'VERIFY', 'SIGN', 'DISCOUNT', 'SETTLE'],
  INSURANCE_OFFICER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'VERIFY'],
  HR_MANAGER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE'],
  INVENTORY_MANAGER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'VERIFY'],
  STORE_KEEPER: ['VIEW', 'CREATE', 'EDIT', 'VERIFY'],
  PURCHASE_OFFICER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'VERIFY'],
  OT_TECHNICIAN: ['VIEW', 'CREATE', 'EDIT', 'VERIFY'],
  OT_NURSE: ['VIEW', 'CREATE', 'EDIT', 'VERIFY'],
  ANESTHETIST: ['VIEW', 'CREATE', 'EDIT', 'VERIFY', 'SIGN'],
  ICU_STAFF: ['VIEW', 'CREATE', 'EDIT', 'VERIFY'],
  EMERGENCY_STAFF: ['VIEW', 'CREATE', 'EDIT', 'VERIFY', 'SETTLE'],
  AMBULANCE_STAFF: ['VIEW', 'CREATE', 'EDIT'],
  BLOOD_BANK_STAFF: ['VIEW', 'CREATE', 'EDIT', 'VERIFY'],
  BIOMEDICAL_ENGINEER: ['VIEW', 'CREATE', 'EDIT'],
  IT_ADMIN: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'CONFIGURE'],
  QUALITY_MANAGER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'VERIFY'],
  AUDITOR: ['VIEW'],
  PATIENT: ['VIEW'],
};

export function maitriRoleHasAction(role: string, action: MaitriAction): boolean {
  if (isMaitriAdminRole(role)) return true;
  return (MAITRI_ROLE_ACTIONS[role] || []).includes(action);
}

/** A tool is authorized only when EVERY (module, action) pair passes. */
export function maitriCanUseTool(
  role: string,
  required: MaitriRequiredPermission[],
): boolean {
  // Admin roles bypass everything, mirroring the HMS PermissionsGuard.
  if (isMaitriAdminRole(role)) return true;
  return required.every(
    (p) =>
      (MAITRI_MODULE_ROLES[p.module] || []).includes(role) &&
      maitriRoleHasAction(role, p.action),
  );
}
