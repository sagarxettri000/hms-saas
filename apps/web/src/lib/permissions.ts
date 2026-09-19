'use client';

/**
 * Client-side permission model — the mirror of the server's authorization.
 *
 * The server is the source of truth: `apps/server/src/common/guards/permissions.guard.ts`
 * checks the JWT's `permissions` claim (from ROLE_PERMISSIONS in @hms/shared)
 * against each route's `@Permissions(...)` decorator, with admin bypass, and
 * the data layer is tenant-scoped. Nothing here is a security mechanism — it
 * drives which dashboard widgets / quick actions render, so each role sees
 * only what it can actually do.
 *
 * - ACTION_MATRIX reproduces packages/shared/src/permissions/index.ts
 * - MODULE_ROLES reproduces AppShell.tsx nav gating
 * Keep both in sync with their sources.
 */

export type Role = string;

/** Mirrors PermissionAction from @hms/shared (redeclared: web does not depend on the package). */
export const PermissionAction = {
  VIEW: 'VIEW',
  CREATE: 'CREATE',
  EDIT: 'EDIT',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  PRINT: 'PRINT',
  EXPORT: 'EXPORT',
  REFUND: 'REFUND',
  DISCOUNT: 'DISCOUNT',
  SETTLE: 'SETTLE',
  ADMINISTER: 'ADMINISTER',
  ADMINISTER_ROLE: 'ADMINISTER',
  VERIFY: 'VERIFY',
  SIGN: 'SIGN',
  CONFIGURE: 'CONFIGURE',
} as const;

export type Action = (typeof PermissionAction)[keyof typeof PermissionAction];

// ---------------------------------------------------------------------------
// Role groups (labels mirror AppShell)
// ---------------------------------------------------------------------------

export const R = {
  ADMIN: ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER'],
  SUPER: ['PLATFORM_SUPER_ADMIN', 'IT_ADMIN'],
  FRONT: ['RECEPTIONIST', 'RECEPTION_SUPERVISOR'],
  CLINICAL: ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'EMERGENCY_STAFF'],
  NURSING: ['NURSE', 'WARD_INCHARGE', 'ICU_STAFF'],
  OT: ['OT_TECHNICIAN', 'OT_NURSE', 'ANESTHETIST'],
  LAB: ['LAB_TECHNICIAN', 'PATHOLOGIST'],
  RAD: ['RADIOLOGIST', 'RADIOLOGY_TECHNICIAN'],
  PHARMACY: ['PHARMACIST'],
  FINANCE: ['FINANCE_MANAGER'],
  INVENTORY: ['INVENTORY_MANAGER', 'STORE_KEEPER', 'PURCHASE_OFFICER'],
  INSURANCE: ['INSURANCE_OFFICER'],
  QUALITY: ['QUALITY_MANAGER', 'DEPARTMENT_HEAD'],
  BLOOD_BANK: ['BLOOD_BANK_STAFF'],
  DEPT_HEAD: ['DEPARTMENT_HEAD'],
  ANESTHETIST: ['ANESTHETIST'],
} as const;

type Group = keyof typeof R;

/** Flatten group names + literal roles into one deduped role list. */
function roles(...parts: (Group | Role)[]): Role[] {
  const out: Role[] = [];
  for (const p of parts) {
    const list = R[p as Group];
    if (Array.isArray(list)) out.push(...list);
    else out.push(p);
  }
  return [...new Set(out)];
}

/** roles(...) minus the given roles/groups. */
function without(list: Role[], ...drop: (Group | Role)[]): Role[] {
  const dropped = new Set(roles(...drop));
  return list.filter((r) => !dropped.has(r));
}

// ---------------------------------------------------------------------------
// Module access — one entry per reachable app module. Mirrors AppShell nav
// (single source of truth for navigation). Admin roles bypass via canAccess.
// ---------------------------------------------------------------------------

export type ModuleKey =
  | 'dashboard'
  | 'patients'
  | 'appointments'
  | 'encounters'
  | 'admissions'
  | 'beds'
  | 'doctors'
  | 'emergency'
  | 'nursing'
  | 'adverseEvents'
  | 'ot'
  | 'approvals'
  | 'billing'
  | 'serviceMaster'
  | 'hematology'
  | 'laboratory'
  | 'radiology'
  | 'dicom'
  | 'bloodBank'
  | 'pharmacyBilling'
  | 'pharmacyMedicines'
  | 'pharmacyBills'
  | 'pharmacyStores'
  | 'insurance'
  | 'memberships'
  | 'doctorShare'
  | 'accounting'
  | 'analytics'
  | 'reports'
  | 'procurement'
  | 'crm'
  | 'quality'
  | 'equipment'
  | 'ambulance'
  | 'departments'
  | 'hr'
  | 'notifications'
  | 'audit'
  | 'tenants'
  | 'webhooks'
  | 'settings';

const CLINICAL_WIDE = roles(
  ...R.CLINICAL, ...R.FRONT, ...R.ADMIN, ...R.SUPER, 'ANESTHETIST',
);
const CLINICAL_WIDE_NO_ER = without(CLINICAL_WIDE, 'EMERGENCY_STAFF');
const CLINICAL_NO_ER = without(R.CLINICAL as unknown as Role[], 'EMERGENCY_STAFF');

export const MODULE_ROLES: Record<ModuleKey, Role[]> = {
  dashboard: [],
  patients: [...CLINICAL_WIDE_NO_ER, 'DEPARTMENT_HEAD'],
  appointments: [...CLINICAL_WIDE_NO_ER, 'DEPARTMENT_HEAD'],
  admissions: [...CLINICAL_WIDE_NO_ER, 'DEPARTMENT_HEAD'],
  beds: CLINICAL_WIDE_NO_ER,
  doctors: without(CLINICAL_WIDE_NO_ER, 'NURSE'),
  encounters: [...CLINICAL_NO_ER, ...R.ADMIN, ...R.SUPER, 'DEPARTMENT_HEAD'],
  emergency: CLINICAL_WIDE_NO_ER,
  nursing: roles('NURSE', 'OT_NURSE', 'WARD_INCHARGE', 'ICU_STAFF', ...R.ADMIN, ...R.SUPER),
  adverseEvents: [...CLINICAL_NO_ER, ...R.ADMIN, ...R.SUPER, ...R.QUALITY],
  ot: [...CLINICAL_WIDE_NO_ER, ...R.OT, 'DEPARTMENT_HEAD'],
  approvals: roles('DEPARTMENT_HEAD', 'WARD_INCHARGE', ...R.ADMIN, ...R.SUPER),
  billing: roles(...R.FRONT, 'FINANCE_MANAGER', ...R.ADMIN, ...R.SUPER, ...R.INSURANCE),
  serviceMaster: roles(...R.FRONT, 'FINANCE_MANAGER', ...R.ADMIN, ...R.SUPER),
  hematology: [...R.LAB, ...R.RAD, ...without(CLINICAL_WIDE, 'RECEPTIONIST', 'EMERGENCY_STAFF')],
  laboratory: [...R.LAB, ...without(CLINICAL_WIDE, 'RECEPTIONIST', 'EMERGENCY_STAFF')],
  radiology: [...R.RAD, ...without(CLINICAL_WIDE, 'RECEPTIONIST', 'EMERGENCY_STAFF')],
  dicom: [...R.RAD, ...R.ADMIN, ...R.SUPER],
  bloodBank: [...without(CLINICAL_WIDE, 'DOCTOR', 'RECEPTIONIST', 'EMERGENCY_STAFF'), ...R.BLOOD_BANK],
  pharmacyBilling: [...R.PHARMACY, ...without(CLINICAL_WIDE, 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'EMERGENCY_STAFF'), ...R.ADMIN, ...R.SUPER],
  pharmacyMedicines: [...R.PHARMACY, ...without(CLINICAL_WIDE, 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'EMERGENCY_STAFF'), ...R.ADMIN, ...R.SUPER],
  pharmacyBills: [...R.PHARMACY, ...R.ADMIN, ...R.SUPER],
  pharmacyStores: [...R.PHARMACY, ...R.INVENTORY, ...R.ADMIN, ...R.SUPER],
  insurance: [...R.FRONT, 'FINANCE_MANAGER', ...R.ADMIN, ...R.SUPER, ...R.INSURANCE],
  memberships: [...R.FRONT, 'FINANCE_MANAGER', ...R.ADMIN, ...R.SUPER],
  doctorShare: [...R.ADMIN, ...R.SUPER],
  accounting: [...R.ADMIN, ...R.SUPER],
  analytics: [...R.ADMIN, ...R.SUPER, 'FINANCE_MANAGER'],
  reports: [...R.ADMIN, ...R.SUPER],
  procurement: [...R.ADMIN, ...R.SUPER, ...R.INVENTORY, ...R.PHARMACY, 'FINANCE_MANAGER'],
  crm: [...R.ADMIN, ...R.SUPER],
  quality: ['QUALITY_MANAGER', 'DEPARTMENT_HEAD', ...R.ADMIN, ...R.SUPER],
  equipment: ['BIOMEDICAL_ENGINEER', ...R.ADMIN, ...R.SUPER],
  ambulance: ['AMBULANCE_STAFF', ...R.ADMIN, ...R.SUPER],
  departments: [...R.ADMIN, ...R.SUPER],
  hr: [...R.ADMIN, ...R.SUPER],
  notifications: [...R.ADMIN, ...R.SUPER],
  audit: [...R.ADMIN, ...R.SUPER],
  tenants: [...R.ADMIN, ...R.SUPER],
  webhooks: [...R.ADMIN, ...R.SUPER],
  settings: [...R.ADMIN, ...R.SUPER],
};

/** Roles that bypass module checks (same as PermissionsGuard's admin bypass). */
export function isAdminRole(role: Role): boolean {
  if (!role) return false;
  if (role === 'PLATFORM_SUPER_ADMIN') return true;
  return (R.ADMIN as readonly Role[]).includes(role);
}

export function canAccessModule(role: Role, module: ModuleKey): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  return (MODULE_ROLES[module] || []).includes(role);
}

// ---------------------------------------------------------------------------
// Action permissions — reproduced from @hms/shared ROLE_PERMISSIONS. Keep in
// sync with packages/shared/src/permissions/index.ts.
// ---------------------------------------------------------------------------

const ACTION_MATRIX: Record<Role, Action[]> = {
  PLATFORM_SUPER_ADMIN: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'REFUND', 'DISCOUNT', 'SETTLE', 'ADMINISTER', 'VERIFY', 'SIGN', 'CONFIGURE'],
  HOSPITAL_ADMIN: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'REFUND', 'DISCOUNT', 'SETTLE', 'ADMINISTER', 'VERIFY', 'SIGN', 'CONFIGURE'],
  HOSPITAL_OWNER: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'REFUND', 'DISCOUNT', 'SETTLE', 'ADMINISTER', 'VERIFY', 'SIGN', 'CONFIGURE'],
  DEPARTMENT_HEAD: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY', 'SIGN'],
  RECEPTIONIST: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'EXPORT', 'DISCOUNT', 'APPROVE', 'REJECT', 'VERIFY'],
  RECEPTION_SUPERVISOR: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'DISCOUNT'],
  DOCTOR: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'EXPORT', 'SIGN', 'VERIFY'],
  NURSE: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'],
  WARD_INCHARGE: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY'],
  LAB_TECHNICIAN: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'],
  PATHOLOGIST: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY', 'SIGN'],
  RADIOLOGIST: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY', 'SIGN'],
  RADIOLOGY_TECHNICIAN: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'],
  PHARMACIST: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'EXPORT', 'VERIFY'],
  FINANCE_MANAGER: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'REFUND', 'DISCOUNT', 'SETTLE', 'ADMINISTER', 'VERIFY', 'SIGN'],
  INSURANCE_OFFICER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY'],
  HR_MANAGER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'ADMINISTER'],
  INVENTORY_MANAGER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY'],
  STORE_KEEPER: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'],
  PURCHASE_OFFICER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY'],
  OT_TECHNICIAN: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'],
  OT_NURSE: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'],
  ANESTHETIST: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY', 'SIGN'],
  ICU_STAFF: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'],
  EMERGENCY_STAFF: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY', 'SETTLE'],
  AMBULANCE_STAFF: ['VIEW', 'CREATE', 'EDIT', 'PRINT'],
  BLOOD_BANK_STAFF: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'],
  BIOMEDICAL_ENGINEER: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'EXPORT'],
  IT_ADMIN: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ADMINISTER', 'CONFIGURE'],
  QUALITY_MANAGER: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY'],
  AUDITOR: ['VIEW', 'PRINT', 'EXPORT'],
  PATIENT: ['VIEW', 'PRINT'],
};

export function roleHasAction(role: Role, action: Action): boolean {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  return (ACTION_MATRIX[role] || []).includes(action);
}

/** A capability requires BOTH module reachability and the action permission. */
export function can(role: Role, module: ModuleKey, action: Action): boolean {
  return canAccessModule(role, module) && roleHasAction(role, action);
}

// ---------------------------------------------------------------------------
// Quick actions — gated by their real capability pair. Actions whose module is
// unreachable, or whose action the role lacks, simply do not render.
// ---------------------------------------------------------------------------

export interface QuickAction {
  key: string;
  label: string;
  icon: string;
  href: string;
  module: ModuleKey;
  action: Action;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { key: 'register-patient', label: 'Register patient', icon: '👤', href: '/patients', module: 'patients', action: 'CREATE' },
  { key: 'new-appointment', label: 'New appointment', icon: '📅', href: '/appointments', module: 'appointments', action: 'CREATE' },
  { key: 'admit-patient', label: 'Admit patient', icon: '🛏', href: '/admissions', module: 'admissions', action: 'CREATE' },
  { key: 'start-encounter', label: 'Start encounter', icon: '🩺', href: '/encounters', module: 'encounters', action: 'CREATE' },
  { key: 'order-lab', label: 'Order lab test', icon: '🔬', href: '/laboratory', module: 'laboratory', action: 'CREATE' },
  { key: 'order-radiology', label: 'Order imaging', icon: '📷', href: '/radiology', module: 'radiology', action: 'CREATE' },
  { key: 'dispense', label: 'Dispense medicine', icon: '💊', href: '/pharmacy?tab=billing', module: 'pharmacyBilling', action: 'CREATE' },
  { key: 'add-medicine', label: 'Add medicine', icon: '☤', href: '/pharmacy?tab=medicines', module: 'pharmacyMedicines', action: 'CREATE' },
  { key: 'create-invoice', label: 'New invoice', icon: '💳', href: '/billing', module: 'billing', action: 'CREATE' },
  { key: 'record-payment', label: 'Record payment', icon: '₨', href: '/billing', module: 'billing', action: 'CREATE' },
  { key: 'verify-results', label: 'Verify results', icon: '✔', href: '/laboratory', module: 'laboratory', action: 'VERIFY' },
  { key: 'approve-requests', label: 'Approve requests', icon: '✓', href: '/approvals', module: 'approvals', action: 'APPROVE' },
];

export function quickActionsFor(role: Role): QuickAction[] {
  return QUICK_ACTIONS.filter((qa) => can(role, qa.module, qa.action));
}
