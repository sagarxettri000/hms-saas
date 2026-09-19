import {
  canAccessModule,
  can,
  isAdminRole,
  quickActionsFor,
  roleHasAction,
  MODULE_ROLES,
} from '../permissions';

describe('permission model', () => {
  it('grants admin roles everything (server-bypass parity)', () => {
    for (const r of ['PLATFORM_SUPER_ADMIN', 'HOSPITAL_ADMIN', 'HOSPITAL_OWNER']) {
      expect(isAdminRole(r)).toBe(true);
      expect(canAccessModule(r, 'audit')).toBe(true);
      expect(canAccessModule(r, 'settings')).toBe(true);
      expect(quickActionsFor(r).length).toBeGreaterThan(0);
    }
    expect(isAdminRole('DOCTOR')).toBe(false);
  });

  it('auditor is view-only: no create actions, no audit/billing modules', () => {
    expect(quickActionsFor('AUDITOR')).toHaveLength(0);
    expect(roleHasAction('AUDITOR', 'CREATE')).toBe(false);
    expect(canAccessModule('AUDITOR', 'audit')).toBe(false);
    expect(canAccessModule('AUDITOR', 'billing')).toBe(false);
  });

  it('receptionist: registration/appointments/billing, no diagnostics modules', () => {
    expect(can('RECEPTIONIST', 'patients', 'CREATE')).toBe(true);
    expect(can('RECEPTIONIST', 'appointments', 'CREATE')).toBe(true);
    expect(can('RECEPTIONIST', 'billing', 'CREATE')).toBe(true);
    expect(can('RECEPTIONIST', 'laboratory', 'CREATE')).toBe(false);
    expect(canAccessModule('RECEPTIONIST', 'hematology')).toBe(false);
    expect(canAccessModule('RECEPTIONIST', 'radiology')).toBe(false);
  });

  it('doctor: clinical actions, no billing/pharmacy/audit', () => {
    expect(can('DOCTOR', 'encounters', 'CREATE')).toBe(true);
    expect(can('DOCTOR', 'laboratory', 'CREATE')).toBe(true);
    expect(can('DOCTOR', 'patients', 'CREATE')).toBe(true);
    expect(can('DOCTOR', 'billing', 'CREATE')).toBe(false);
    expect(canAccessModule('DOCTOR', 'bloodBank')).toBe(false);
    expect(canAccessModule('DOCTOR', 'pharmacyBilling')).toBe(false);
    expect(canAccessModule('DOCTOR', 'audit')).toBe(false);
  });

  it('nurse: clinical verify/edit, no billing, no audit', () => {
    expect(can('NURSE', 'nursing', 'EDIT')).toBe(true);
    expect(can('NURSE', 'laboratory', 'VIEW')).toBe(true);
    expect(canAccessModule('NURSE', 'billing')).toBe(false);
    expect(canAccessModule('NURSE', 'audit')).toBe(false);
  });

  it('pharmacist: dispense + add medicine, no audit', () => {
    expect(can('PHARMACIST', 'pharmacyBilling', 'CREATE')).toBe(true);
    expect(can('PHARMACIST', 'pharmacyMedicines', 'CREATE')).toBe(true);
    expect(canAccessModule('PHARMACIST', 'audit')).toBe(false);
  });

  it('finance manager: invoices/refunds, no encounters', () => {
    expect(can('FINANCE_MANAGER', 'billing', 'CREATE')).toBe(true);
    expect(can('FINANCE_MANAGER', 'billing', 'REFUND')).toBe(true);
    expect(canAccessModule('FINANCE_MANAGER', 'encounters')).toBe(false);
  });

  it('IT admin: system modules + action matrix limits (no APPROVE, unlike admins)', () => {
    expect(canAccessModule('IT_ADMIN', 'settings')).toBe(true);
    expect(canAccessModule('IT_ADMIN', 'tenants')).toBe(true);
    expect(canAccessModule('IT_ADMIN', 'webhooks')).toBe(true);
    // AppShell nav grants IT_ADMIN clinical visibility via the SUPER group —
    // mirrored here. The differentiator is the ACTION matrix: IT_ADMIN cannot
    // APPROVE, REFUND, or SETTLE anything.
    expect(roleHasAction('IT_ADMIN', 'APPROVE')).toBe(false);
    expect(roleHasAction('IT_ADMIN', 'REFUND')).toBe(false);
    expect(roleHasAction('IT_ADMIN', 'SETTLE')).toBe(false);
    expect(roleHasAction('IT_ADMIN', 'CONFIGURE')).toBe(true);
  });

  it('quick actions are module- and action-gated', () => {
    const doctor = quickActionsFor('DOCTOR').map((q) => q.key);
    expect(doctor).toContain('start-encounter');
    expect(doctor).toContain('order-lab');
    expect(doctor).not.toContain('create-invoice');
    expect(doctor).not.toContain('dispense');

    const reception = quickActionsFor('RECEPTIONIST').map((q) => q.key);
    expect(reception).toContain('register-patient');
    expect(reception).toContain('new-appointment');
    expect(reception).not.toContain('order-lab');
    expect(reception).not.toContain('start-encounter');

    const labTech = quickActionsFor('LAB_TECHNICIAN').map((q) => q.key);
    expect(labTech).toContain('order-lab');
    expect(labTech).toContain('verify-results');
    expect(labTech).not.toContain('register-patient');

    const pharmacist = quickActionsFor('PHARMACIST').map((q) => q.key);
    expect(pharmacist).toContain('dispense');
    expect(pharmacist).not.toContain('register-patient');
  });

  it('module map is complete', () => {
    expect(Object.keys(MODULE_ROLES).length).toBeGreaterThan(30);
  });
});
