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
      { label: 'Patients', href: '/patients', icon: '☺', roles: [...CLINICAL_WIDE, 'DEPARTMENT_HEAD'] },
      { label: 'Billing', href: '/billing', icon: '₨', roles: [...FINANCE, ...ADMIN, ...SUPER, ...INSURANCE] },
      { label: 'Service Master', href: '/billing/service-master', icon: '☰', roles: [...FINANCE, ...ADMIN, ...SUPER] },
      { label: 'Admit', href: '/admissions', icon: '▣', roles: [...CLINICAL_WIDE, 'DEPARTMENT_HEAD'] },
      { label: 'Beds', href: '/bed-management', icon: '⊞', roles: [...CLINICAL_WIDE] },
      { label: 'Appointments', href: '/appointments', icon: '◷', roles: [...CLINICAL_WIDE, 'DEPARTMENT_HEAD'] },
      { label: 'Doctors', href: '/doctors', icon: '✚', roles: [...CLINICAL_WIDE_NO_NURSE] },
      { label: 'Encounters', href: '/encounters', icon: '✎', roles: [...CLINICAL, ...ADMIN, ...SUPER, 'DEPARTMENT_HEAD'] },
      { label: 'Emergency', href: '/emergency', icon: '⚠', roles: [...CLINICAL_WIDE] },
      { label: 'Nursing', href: '/nursing', icon: '♡', roles: ['NURSE', 'OT_NURSE', 'WARD_INCHARGE', 'ICU_STAFF', ...ADMIN, ...SUPER], flag: 'ipd_nursing' },
      { label: 'Adverse Events', href: '/adverse-events', icon: '✖', roles: [...CLINICAL, ...ADMIN, ...SUPER, ...QUALITY] },
      { label: 'Theatre (OT)', href: '/ot', icon: '⌁', roles: [...CLINICAL_WIDE, ...OT], flag: 'ot_management' },
      { label: 'Approvals', href: '/approvals', icon: '✓', roles: ['DEPARTMENT_HEAD', 'WARD_INCHARGE', ...ADMIN, ...SUPER] },
    ],
  },
  {
    title: 'Diagnostics',
    items: [
      { label: 'Hematology', href: '/hematology', icon: '◒', roles: [...LAB, ...RAD, ...CLINICAL_WIDE], flag: 'laboratory' },
      { label: 'Laboratory', href: '/laboratory', icon: '◉', roles: [...LAB, ...CLINICAL_WIDE], flag: 'laboratory' },
      { label: 'Radiology', href: '/radiology', icon: '▤', roles: [...RAD, ...CLINICAL_WIDE], flag: 'radiology' },
      { label: 'DICOM', href: '/dicom', icon: '◫', roles: [...RAD, ...ADMIN, ...SUPER], flag: 'radiology' },
      { label: 'Blood Bank', href: '/blood-bank', icon: '✖', roles: [...CLINICAL_NO_DOCTOR, 'BLOOD_BANK_STAFF'], flag: 'blood_bank' },
    ],
  },
  {
    title: 'Pharmacy',
    items: [
      { label: 'Billing', href: '/pharmacy?tab=billing', icon: '₨', roles: [...PHARMACY, ...CLINICAL_NO_DOCTOR_NURSE, ...ADMIN, ...SUPER], flag: 'pharmacy' },
      { label: 'Medicines', href: '/pharmacy?tab=medicines', icon: '☤', roles: [...PHARMACY, ...CLINICAL_NO_DOCTOR_NURSE, ...ADMIN, ...SUPER], flag: 'pharmacy' },
      { label: 'Bills', href: '/pharmacy?tab=bills', icon: '▧', roles: [...PHARMACY, ...ADMIN, ...SUPER], flag: 'pharmacy' },
      { label: 'Stores & Stock', href: '/pharmacy?tab=stores', icon: '▥', roles: [...PHARMACY, ...INVENTORY, ...ADMIN, ...SUPER], flag: 'pharmacy' },
      { label: 'Stock Alerts', href: '/pharmacy?tab=alerts', icon: '▲', roles: [...PHARMACY, ...INVENTORY, ...ADMIN, ...SUPER], flag: 'pharmacy' },
    ],
  },
  {
    title: 'Revenue',
    items: [
      { label: 'Insurance', href: '/insurance', icon: '◈', roles: [...FINANCE, ...ADMIN, ...SUPER, ...INSURANCE], flag: 'insurance' },
      { label: 'Memberships', href: '/memberships', icon: '★', roles: [...FINANCE, ...ADMIN, ...SUPER, ...FRONT] },
      { label: 'Doctor Share', href: '/doctor-share', icon: '➗', roles: [...ADMIN, ...SUPER] },
      { label: 'Accounting', href: '/accounting', icon: '⇄', roles: [...ADMIN, ...SUPER], flag: 'accounting' },
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
{ label: 'Attendance', href: '/attendance', icon: '◷'},
      { label: 'HR & Staff', href: '/hr', icon: '☷', roles: [...ADMIN, ...SUPER], flag: 'hrms' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Notifications', href: '/notifications', icon: '◐', roles: [...ADMIN, ...SUPER] },
      { label: 'Audit Logs', href: '/audit', icon: '▤', roles: [...ADMIN, ...SUPER] },
      { label: 'Tenants', href: '/tenants', icon: '▦', roles: [...ADMIN, ...SUPER] },
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
  const [tenantName, setTenantName] = useState('');
  const [role, setRole] = useState('');
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isPublic) {
      // On public/auth routes (login, register, ...) the shell is not rendered.
      // Reset identity state so a fresh login never inherits the previous
      // session's name/role/tenant in its React state (AppShell persists across
      // navigations, so a plain 1x mount effect would stay stale forever).
      setUserName('');
      setTenantName('');
      setRole('');
      return;
    }
    if (!localStorage.getItem('role')) { router.replace('/login'); return; }
    // Apply whatever identity we already have so the UI is never blank.
    setUserName(localStorage.getItem('userName') || 'User');
    setTenantName(localStorage.getItem('tenantName') || 'Workspace');
    setRole(localStorage.getItem('role') || '');
    // Reconcile identity/role from the server so the sidebar's role-gated items
    // render correctly for every session (even stale localStorage).
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
        const tenantName = u.tenant?.name;
        if (tenantName) {
          localStorage.setItem('tenantName', tenantName);
          setTenantName(tenantName);
        }
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
  }, [isPublic, pathname]);

  function handleLogout() {
    api('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }).catch(() => {});
    localStorage.clear();
    router.replace('/login');
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const allItems = SECTIONS.flatMap((s) => s.items);
  const currentPage = allItems.find((i) => isActive(i.href));
  const denied = currentPage ? !canAccess(currentPage, role) : false;

  const [menuOpen, setMenuOpen] = useState(false);

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
          <div>{tenantName}</div>
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
            <span className="topbar-tenant" style={{ fontSize: 13, color: '#64748b' }}>{tenantName}</span>
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
