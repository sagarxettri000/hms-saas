'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';
import { api } from '@/lib/api';

const ALL = undefined;

const ADMIN = ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER'];
const SUPER = ['PLATFORM_SUPER_ADMIN', 'IT_ADMIN'];
const MANAGER = [...SUPER, ...ADMIN, 'DEPARTMENT_HEAD'];
const FRONT = ['RECEPTIONIST', 'RECEPTION_SUPERVISOR'];
const CLINICAL = ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'EMERGENCY_STAFF'];
const CLINICAL_WIDE = [...CLINICAL, ...FRONT, ...ADMIN, ...SUPER, 'ANESTHETIST'];
const FINANCE = ['RECEPTIONIST', 'RECEPTION_SUPERVISOR', 'FINANCE_MANAGER'];
const LAB = ['LAB_TECHNICIAN', 'PATHOLOGIST'];
const RAD = ['RADIOLOGIST', 'RADIOLOGY_TECHNICIAN'];
const INVENTORY = ['INVENTORY_MANAGER', 'STORE_KEEPER', 'PURCHASE_OFFICER'];
const PHARMACY = ['PHARMACIST'];

interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles?: string[];
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Clinical',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: '▦' },
      { label: 'Patients', href: '/patients', icon: '☺', roles: [...CLINICAL_WIDE] },
      { label: 'Billing', href: '/billing', icon: '₨', roles: [...FINANCE, ...ADMIN, ...SUPER, 'INSURANCE_OFFICER'] },
      { label: 'Admit', href: '/admissions', icon: '▣', roles: [...CLINICAL_WIDE] },
      { label: 'Appointments', href: '/appointments', icon: '◷', roles: [...CLINICAL_WIDE] },
      { label: 'Doctors', href: '/doctors', icon: '✚', roles: [...CLINICAL_WIDE] },
      { label: 'Encounters', href: '/encounters', icon: '✎', roles: [...CLINICAL, ...ADMIN, ...SUPER] },
      { label: 'Emergency', href: '/emergency', icon: '⚠', roles: [...CLINICAL_WIDE] },
      { label: 'Nursing', href: '/nursing', icon: '♡', roles: ['NURSE', 'OT_NURSE', 'WARD_INCHARGE', 'ICU_STAFF', ...ADMIN, ...SUPER] },
      {
        label: 'Adverse Events',
        href: '/adverse-events',
        icon: '✖',
        roles: [...CLINICAL, ...ADMIN, ...SUPER, 'QUALITY_MANAGER'],
      },
      {
        label: 'Theatre (OT)',
        href: '/ot',
        icon: '⌁',
        roles: [...CLINICAL_WIDE, 'OT_TECHNICIAN', 'OT_NURSE', 'ANESTHETIST'],
      },
    ],
  },
  {
    title: 'Diagnostics',
    items: [
      { label: 'Laboratory', href: '/laboratory', icon: '◉', roles: [...LAB, ...CLINICAL_WIDE] },
      { label: 'Radiology', href: '/radiology', icon: '▤', roles: [...RAD, ...CLINICAL_WIDE] },
      { label: 'Blood Bank', href: '/blood-bank', icon: '✖', roles: [...CLINICAL_WIDE, 'BLOOD_BANK_STAFF'] },
      { label: 'Pharmacy', href: '/pharmacy', icon: '▥', roles: [...CLINICAL_WIDE, ...PHARMACY] },
    ],
  },
  {
    title: 'Pharmacy',
    items: [
      { label: 'Medicines', href: '/pharmacy?tab=medicines', icon: '💊', roles: [...PHARMACY, ...CLINICAL_WIDE, ...ADMIN, ...SUPER] },
      { label: 'Dispensing', href: '/pharmacy?tab=dispensing', icon: '📋', roles: [...PHARMACY, ...CLINICAL_WIDE, ...ADMIN, ...SUPER] },
      { label: 'Sales', href: '/pharmacy?tab=sales', icon: '₨', roles: [...PHARMACY, ...ADMIN, ...SUPER] },
      { label: 'Stores & Stock', href: '/pharmacy?tab=stores', icon: '🗄', roles: [...PHARMACY, ...INVENTORY, ...ADMIN, ...SUPER] },
      { label: 'Stock Alerts', href: '/pharmacy?tab=alerts', icon: '⚠', roles: [...PHARMACY, ...INVENTORY, ...ADMIN, ...SUPER] },
    ],
  },
  {
    title: 'Revenue',
    items: [
      { label: 'Insurance', href: '/insurance', icon: '◈', roles: [...FINANCE, ...ADMIN, ...SUPER, 'INSURANCE_OFFICER'] },
      { label: 'Memberships', href: '/memberships', icon: '★', roles: [...FINANCE, ...ADMIN, ...SUPER, ...FRONT] },
      { label: 'Doctor Share', href: '/doctor-share', icon: '➗', roles: [...ADMIN, ...SUPER] },
      { label: 'Accounting', href: '/accounting', icon: '⇄', roles: [...FINANCE, ...ADMIN, ...SUPER] },
      { label: 'Reports', href: '/reports', icon: '▦', roles: [...ADMIN, ...SUPER, 'AUDITOR', 'QUALITY_MANAGER', 'FINANCE_MANAGER', 'RECEPTIONIST'] },
      { label: 'Procurement', href: '/procurement', icon: '↦', roles: [...INVENTORY, ...ADMIN, ...SUPER] },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Departments', href: '/departments', icon: '❏', roles: [...MANAGER, 'HR_MANAGER'] },
      { label: 'HR & Staff', href: '/hr', icon: '☷', roles: [...ADMIN, ...SUPER, 'HR_MANAGER', 'FINANCE_MANAGER'] },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Notifications', href: '/notifications', icon: '◐' },
      { label: 'Audit Logs', href: '/audit', icon: '▤', roles: [...ADMIN, ...SUPER, 'AUDITOR'] },
      { label: 'Tenants', href: '/tenants', icon: '▦', roles: [...SUPER] },
      { label: 'Webhooks & Keys', href: '/webhooks', icon: '⇌', roles: [...ADMIN, ...SUPER] },
      { label: 'Settings', href: '/settings', icon: '⚙', roles: [...ADMIN, ...SUPER] },
    ],
  },
];

function canAccess(item: NavItem, role: string): boolean {
  return !item.roles || item.roles.includes(role);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    const tid = localStorage.getItem('tenantId');
    if (!tid) {
      const token = localStorage.getItem('accessToken');
      if (!token) { router.replace('/login'); return; }
      api('/tenants?limit=1')
        .then((res: any) => {
          const list = res?.data?.data ?? (Array.isArray(res?.data) ? res.data : []);
          if (list.length > 0) {
            localStorage.setItem('tenantId', list[0].id);
            localStorage.setItem('tenantName', list[0].name);
            setTenantName(list[0].name);
          }
        })
        .catch(() => {});
    }
    setUserName(localStorage.getItem('userName') || '');
    setTenantName(localStorage.getItem('tenantName') || 'Workspace');
    setRole(localStorage.getItem('role') || '');
  }, []);

  function handleLogout() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    localStorage.clear();
    router.replace('/login');
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const allItems = SECTIONS.flatMap((s) => s.items);
  const currentPage = allItems.find((i) => isActive(i.href));
  const denied = currentPage ? !canAccess(currentPage, role) : false;

  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="shell">
      {menuOpen && <div className="sidebar-overlay open" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="dot" />
          <span>
            <span className="sidebar-brand-name">Swasthya</span>
            <span className="sidebar-brand-sub">Hospital Management System</span>
          </span>
        </div>

        {SECTIONS.map((section) => {
          const items = section.items.filter((item) => canAccess(item, role));
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
            style={{
              display: 'none',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 16,
              cursor: 'pointer',
              lineHeight: 1,
            }}
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen((v) => !v)}
          >
            ☰
          </button>
          <GlobalSearch />
          <div className="topbar-right">
            <NotificationBell />
            <span style={{ fontSize: 13, color: '#64748b' }}>{tenantName}</span>
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
