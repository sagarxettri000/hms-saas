'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import { api } from '@/lib/api';

// AppShell renders the persistent app shell. It now lives in the root layout so
// the sidebar stays mounted across navigations (preserving its scroll position
// natively with no flicker). Public/auth pages render children without the shell.
const PUBLIC_PATHS = ['/login', '/pharmacy-login', '/register', '/forgot-password', '/reset-password', '/select-tenant', '/about', '/security', '/help', '/2fa-setup'];

const ADMIN = ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER'];
const SUPER = ['PLATFORM_SUPER_ADMIN', 'IT_ADMIN'];
const FRONT = ['RECEPTIONIST', 'RECEPTION_SUPERVISOR'];
const CLINICAL = ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'EMERGENCY_STAFF'];
const CLINICAL_WIDE = [...CLINICAL, ...FRONT, ...ADMIN, ...SUPER, 'ANESTHETIST'];
const CLINICAL_NO_DOCTOR = CLINICAL_WIDE.filter((r) => r !== 'DOCTOR');
const CLINICAL_NO_DOCTOR_NURSE = CLINICAL_NO_DOCTOR.filter((r) => r !== 'NURSE');
const CLINICAL_WIDE_NO_NURSE = CLINICAL_WIDE.filter((r) => r !== 'NURSE');
// Receptionist scope: diagnostics (hematology/lab/radiology/blood bank) and
// pharmacy billing/medicines are not part of the receptionist workflow, so
// these nav items exclude RECEPTIONIST while every other role is unchanged.
const CLINICAL_WIDE_NO_RECEPTION = CLINICAL_WIDE.filter((r) => r !== 'RECEPTIONIST');
const CLINICAL_NO_DOCTOR_NO_RECEPTION = CLINICAL_NO_DOCTOR.filter((r) => r !== 'RECEPTIONIST');
const CLINICAL_NO_DOCTOR_NURSE_NO_RECEPTION = CLINICAL_NO_DOCTOR_NURSE.filter((r) => r !== 'RECEPTIONIST');
// Dedicated Emergency-department workspace: a separate sidebar section only
// for ER staff (plus admins).
const EMERGENCY_ONLY = ['EMERGENCY_STAFF'];
// ER staff work exclusively from the Emergency section: the generic Clinical,
// Diagnostics and Pharmacy items exclude EMERGENCY_STAFF so they get no
// duplicate or out-of-scope entries.
const CLINICAL_WIDE_NO_ER = CLINICAL_WIDE.filter((r) => r !== 'EMERGENCY_STAFF');
const CLINICAL_NO_ER = CLINICAL.filter((r) => r !== 'EMERGENCY_STAFF');
const CLINICAL_WIDE_NO_NURSE_NO_ER = CLINICAL_WIDE_NO_ER.filter((r) => r !== 'NURSE');
const CLINICAL_WIDE_NO_RECEPTION_NO_ER = CLINICAL_WIDE_NO_ER.filter((r) => r !== 'RECEPTIONIST');
const CLINICAL_NO_DOCTOR_NO_RECEPTION_NO_ER = CLINICAL_WIDE_NO_ER.filter((r) => r !== 'DOCTOR' && r !== 'RECEPTIONIST');
const CLINICAL_NO_DOCTOR_NURSE_NO_RECEPTION_NO_ER = CLINICAL_NO_DOCTOR_NO_RECEPTION_NO_ER.filter((r) => r !== 'NURSE');
const FINANCE = ['RECEPTIONIST', 'RECEPTION_SUPERVISOR', 'FINANCE_MANAGER'];
const LAB = ['LAB_TECHNICIAN', 'PATHOLOGIST'];
const RAD = ['RADIOLOGIST', 'RADIOLOGY_TECHNICIAN'];
const INVENTORY = ['INVENTORY_MANAGER', 'STORE_KEEPER', 'PURCHASE_OFFICER'];
const PHARMACY = ['PHARMACIST'];
const OT = ['OT_TECHNICIAN', 'OT_NURSE', 'ANESTHETIST'];
const QUALITY = ['QUALITY_MANAGER', 'DEPARTMENT_HEAD'];
const INSURANCE = ['INSURANCE_OFFICER'];

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles?: string[];
  flag?: string;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Clinical',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: '▦' },
      { label: 'Patients', href: '/patients', icon: '☺', roles: [...CLINICAL_WIDE_NO_ER, 'DEPARTMENT_HEAD'] },
      { label: 'Billing', href: '/billing', icon: '₨', roles: [...FINANCE, ...ADMIN, ...SUPER, ...INSURANCE] },
      { label: 'Service Master', href: '/billing/service-master', icon: '☰', roles: [...FINANCE, ...ADMIN, ...SUPER] },
      { label: 'Admit', href: '/admissions', icon: '▣', roles: [...CLINICAL_WIDE_NO_ER, 'DEPARTMENT_HEAD'] },
      { label: 'Beds', href: '/bed-management', icon: '⊞', roles: [...CLINICAL_WIDE_NO_ER] },
      { label: 'Appointments', href: '/appointments', icon: '◷', roles: [...CLINICAL_WIDE_NO_ER, 'DEPARTMENT_HEAD'] },
      { label: 'Doctors', href: '/doctors', icon: '✚', roles: [...CLINICAL_WIDE_NO_NURSE_NO_ER] },
      { label: 'Encounters', href: '/encounters', icon: '✎', roles: [...CLINICAL_NO_ER, ...ADMIN, ...SUPER, 'DEPARTMENT_HEAD'] },
      { label: 'Nursing', href: '/nursing', icon: '♡', roles: ['NURSE', 'OT_NURSE', 'WARD_INCHARGE', 'ICU_STAFF', ...ADMIN, ...SUPER], flag: 'ipd_nursing' },
      { label: 'Adverse Events', href: '/adverse-events', icon: '✖', roles: [...CLINICAL_NO_ER, ...ADMIN, ...SUPER, ...QUALITY] },
      { label: 'Theatre (OT)', href: '/ot', icon: '⌁', roles: [...CLINICAL_WIDE_NO_ER, ...OT], flag: 'ot_management' },
      { label: 'Approvals', href: '/approvals', icon: '✓', roles: ['DEPARTMENT_HEAD', 'WARD_INCHARGE', ...ADMIN, ...SUPER] },
    ],
  },
  {
    title: 'Emergency',
    items: [
      { label: 'ER Dashboard', href: '/emergency?tab=dashboard', icon: '⚡', roles: [...EMERGENCY_ONLY] },
      { label: 'Register Patient', href: '/emergency?tab=register', icon: '✚', roles: [...EMERGENCY_ONLY] },
      { label: 'ER Patients', href: '/emergency?tab=patients', icon: '☺', roles: [...EMERGENCY_ONLY] },
      { label: 'ER Beds', href: '/emergency?tab=beds', icon: '⊞', roles: [...EMERGENCY_ONLY] },
      { label: 'ER Billing', href: '/emergency?tab=billing', icon: '₨', roles: [...EMERGENCY_ONLY] },
      { label: 'ER Reports', href: '/emergency?tab=reports', icon: '▦', roles: [...EMERGENCY_ONLY] },
    ],
  },
  {
    title: 'Diagnostics',
    items: [
      { label: 'Hematology', href: '/hematology', icon: '◒', roles: [...LAB, ...RAD, ...CLINICAL_WIDE_NO_RECEPTION_NO_ER], flag: 'laboratory' },
      { label: 'Laboratory', href: '/laboratory', icon: '◉', roles: [...LAB, ...CLINICAL_WIDE_NO_RECEPTION_NO_ER], flag: 'laboratory' },
      { label: 'Radiology', href: '/radiology', icon: '▤', roles: [...RAD, ...CLINICAL_WIDE_NO_RECEPTION_NO_ER], flag: 'radiology' },
      { label: 'DICOM', href: '/dicom', icon: '◫', roles: [...RAD, ...ADMIN, ...SUPER], flag: 'radiology' },
      { label: 'Blood Bank', href: '/blood-bank', icon: '✖', roles: [...CLINICAL_NO_DOCTOR_NO_RECEPTION_NO_ER, 'BLOOD_BANK_STAFF'], flag: 'blood_bank' },
    ],
  },
  {
    title: 'Pharmacy',
    items: [
      { label: 'Billing', href: '/pharmacy?tab=billing', icon: '₨', roles: [...PHARMACY, ...CLINICAL_NO_DOCTOR_NURSE_NO_RECEPTION_NO_ER, ...ADMIN, ...SUPER], flag: 'pharmacy' },
      { label: 'Medicines', href: '/pharmacy?tab=medicines', icon: '☤', roles: [...PHARMACY, ...CLINICAL_NO_DOCTOR_NURSE_NO_RECEPTION_NO_ER, ...ADMIN, ...SUPER], flag: 'pharmacy' },
      { label: 'Bills', href: '/pharmacy?tab=bills', icon: '▧', roles: [...PHARMACY, ...ADMIN, ...SUPER], flag: 'pharmacy' },
      { label: 'Stores & Stock', href: '/pharmacy?tab=stores', icon: '▥', roles: [...PHARMACY, ...INVENTORY, ...ADMIN, ...SUPER], flag: 'pharmacy' },
    ],
  },
  {
    title: 'Revenue',
    items: [
      { label: 'Insurance', href: '/insurance', icon: '◈', roles: [...FINANCE, ...ADMIN, ...SUPER, ...INSURANCE], flag: 'insurance' },
      { label: 'Memberships', href: '/memberships', icon: '★', roles: [...FINANCE, ...ADMIN, ...SUPER, ...FRONT] },
      { label: 'Doctor Share', href: '/doctor-share', icon: '➗', roles: [...ADMIN, ...SUPER] },
      { label: 'Accounting', href: '/accounting', icon: '⇄', roles: [...ADMIN, ...SUPER], flag: 'accounting' },
      { label: 'Analytics', href: '/analytics', icon: '📊', roles: [...ADMIN, ...SUPER, 'FINANCE_MANAGER'] },
      { label: 'Reports', href: '/reports', icon: '▦', roles: [...ADMIN, ...SUPER] },
      { label: 'Procurement', href: '/procurement', icon: '↦', roles: [...ADMIN, ...SUPER, 'INVENTORY_MANAGER', 'PURCHASE_OFFICER', 'STORE_KEEPER', 'PHARMACIST', 'FINANCE_MANAGER'] },
      { label: 'CRM', href: '/crm', icon: '⊞', roles: [...ADMIN, ...SUPER], flag: 'crm' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Quality', href: '/quality', icon: '◆', roles: ['QUALITY_MANAGER', 'DEPARTMENT_HEAD', ...ADMIN, ...SUPER] },
      { label: 'Equipment', href: '/equipment', icon: '⚙', roles: ['BIOMEDICAL_ENGINEER', ...ADMIN, ...SUPER] },
      { label: 'Ambulance', href: '/ambulance', icon: '✦', roles: ['AMBULANCE_STAFF', ...ADMIN, ...SUPER] },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Departments', href: '/departments', icon: '❏', roles: [...ADMIN, ...SUPER] },

      { label: 'HR & Staff', href: '/hr', icon: '☷', roles: [...ADMIN, ...SUPER], flag: 'hrms' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Notifications', href: '/notifications', icon: '◐', roles: [...ADMIN, ...SUPER] },
      { label: 'Audit Logs', href: '/audit', icon: '▤', roles: [...ADMIN, ...SUPER] },
      { label: 'Webhooks & Keys', href: '/webhooks', icon: '⇌', roles: [...ADMIN, ...SUPER] },
      { label: 'Settings', href: '/settings', icon: '⚙', roles: [...ADMIN, ...SUPER] },
    ],
  },
];

function canAccess(item: NavItem, role: string): boolean {
  if (role === 'HOSPITAL_ADMIN' || role === 'HOSPITAL_OWNER') return true;
  return !item.roles || item.roles.includes(role);
}

function isFlagDisabled(item: NavItem, flags: Record<string, boolean>): boolean {
  return !!item.flag && Object.keys(flags).length > 0 && flags[item.flag] === false;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = pathname === '/' || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState('');
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isPublic) {
      // On public/auth routes (login, register, ...) the shell is not rendered.
      // Reset identity state so a fresh login never inherits the previous
      // session's name/role/tenant in its React state (AppShell persists across
      // navigations, so a plain 1x mount effect would stay stale forever).
      setUserName('');
      setRole('');
      return;
    }
    if (!localStorage.getItem('role')) { router.replace('/login'); return; }
    // Apply whatever identity we already have so the UI is never blank.
    setUserName(localStorage.getItem('userName') || 'User');
    setRole(localStorage.getItem('role') || '');
    // Reconcile identity/role from the server once per session (not on every
    // soft navigation) so the sidebar's role-gated items render correctly even
    // for stale localStorage. Refetching /auth/me per navigation added a full
    // API round trip to every page change.
    let cancelled = false;
    async function syncIdentity() {
      try {
        const res: any = await api('/auth/me');
        if (cancelled || !res?.data) return;
        const u = res.data;
        const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
        if (fullName) {
          localStorage.setItem('userName', fullName);
          setUserName(fullName);
        }
        if (u.role) {
          localStorage.setItem('role', u.role);
          setRole(u.role);
        }
        if (u.tenantId) localStorage.setItem('tenantId', u.tenantId);
        if (u.tenant?.name) localStorage.setItem('tenantName', u.tenant.name);
        if (Array.isArray(u.featureFlags)) {
          const map: Record<string, boolean> = {};
          for (const f of u.featureFlags) map[f.key] = f.enabled === true;
          setFlags(map);
        }
      } catch {
        // Keep the local values already applied above.
      }
    }
    syncIdentity();
    return () => { cancelled = true; };
  }, [isPublic]);

  function handleLogout() {
    api('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }).catch(() => {});
    localStorage.clear();
    router.replace('/login');
  }

  const isActive = (href: string) => {
    const base = href.split('?')[0];
    // Tabbed items (…?tab=x) only light up for their exact tab.
    if (href.includes('?')) return pathname + search === href;
    return pathname === base || pathname.startsWith(base + '/');
  };

  const allItems = SECTIONS.flatMap((s) => s.items);
  // Access gate: a page is denied only when EVERY nav item targeting it is
  // inaccessible to this role. Several items can share one path (e.g. the
  // generic Clinical "Emergency" link and the ER workspace tabs both live on
  // /emergency) — blocking on the first match locked ER staff out of their
  // own workspace because the one generic item excludes them.
  const pathItems = allItems.filter((i) => i.href.split('?')[0] === pathname);
  const denied = pathItems.length > 0 && pathItems.every((i) => !canAccess(i, role));

  const [menuOpen, setMenuOpen] = useState(false);
  // usePathname() excludes the query string, so tab switches within the same
  // page (/emergency?tab=a → ?tab=b) never re-fire it. Next performs those
  // navigations through history.pushState, so wrap it (and replaceState) to
  // re-sync the search string on every soft navigation.
  const [search, setSearch] = useState('');
  useEffect(() => {
    setSearch(window.location.search || '');
    const readSearch = () => setSearch(new URL(window.location.href).search || '');
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = (...args: any[]) => {
      origPush(...(args as Parameters<typeof origPush>));
      readSearch();
    };
    window.history.replaceState = (...args: any[]) => {
      origReplace(...(args as Parameters<typeof origReplace>));
      readSearch();
    };
    window.addEventListener('popstate', readSearch);
    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      window.removeEventListener('popstate', readSearch);
    };
  }, []);

  useEffect(() => {
    if (isPublic) return;
    setMenuOpen(false);
  }, [pathname]);

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="shell">
      {menuOpen && <div className="sidebar-overlay open" onClick={() => setMenuOpen(false)} />}
      <aside
        className={`sidebar ${menuOpen ? 'open' : ''}`}
      >
        <div className="sidebar-brand">
          <span className="dot" />
          <span>
            <span className="sidebar-brand-name">Swasthya</span>
            <span className="sidebar-brand-sub">Hospital Management System</span>
          </span>
        </div>

        {SECTIONS.map((section) => {
          const items = section.items.filter((item) => canAccess(item, role) && !isFlagDisabled(item, flags));
          if (items.length === 0) return null;
          return (
            <div key={section.title}>
              <div className="sidebar-section">{section.title}</div>
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
                >
                  <span className="ico">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          );
        })}

        <div className="sidebar-footer">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{userName || 'User'}</div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button
            className="mobile-toggle"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            ☰
          </button>
          <GlobalSearch />
          <div className="topbar-right">
            <NotificationBell />
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
        <div className="page">
          {denied ? (
            <div className="card" style={{ padding: 32, textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 8px' }}>Not authorized</h2>
              <p style={{ margin: 0, color: '#64748b' }}>
                Your role ({role || 'unknown'}) does not grant access to this page.
              </p>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
