'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { formatMoney, formatDate } from '@/lib/hooks';

interface Stat {
  label: string;
  value: string | number;
  tone?: 'blue' | 'green' | 'purple' | 'amber' | 'red';
  icon?: string;
  sparkline?: number[];
}

function MiniBar({ data, color = 'var(--primary)' }: { data: number[]; color?: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 24, marginTop: 6 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, height: `${Math.max((v / max) * 100, 4)}%`, background: color, borderRadius: 2, opacity: 0.7 }} />
      ))}
    </div>
  );
}

interface QuickLink {
  label: string;
  href: string;
  icon: string;
}

const ROLE_GROUPS: Record<string, string[]> = {
  ADMIN: ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN', 'DEPARTMENT_HEAD'],
  PHARMACY: ['PHARMACIST'],
  RECEPTION: ['RECEPTIONIST', 'RECEPTION_SUPERVISOR'],
  CLINICAL: ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'EMERGENCY_STAFF', 'ANESTHETIST'],
  FINANCE: ['FINANCE_MANAGER', 'INSURANCE_OFFICER'],
  LAB: ['LAB_TECHNICIAN', 'PATHOLOGIST'],
  RAD: ['RADIOLOGIST', 'RADIOLOGY_TECHNICIAN'],
  HR: ['HR_MANAGER'],
};

function getRoleGroup(role: string): string {
  for (const [group, roles] of Object.entries(ROLE_GROUPS)) {
    if (roles.includes(role)) return group;
  }
  return 'OTHER';
}

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState('');
  const [roleGroup, setRoleGroup] = useState('');
  const [stats, setStats] = useState<Stat[]>([]);
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    const storedRole = localStorage.getItem('role') || '';
    setUserName(localStorage.getItem('userName') || '');
    setRole(storedRole);
    setRoleGroup(getRoleGroup(storedRole));
    loadDashboard(storedRole);
  }, [router]);

  async function loadDashboard(userRole: string) {
    const safe = (p: Promise<any>) => p.then((r) => r).catch(() => null);
    const group = getRoleGroup(userRole);

    try {
      if (group === 'PHARMACY') {
        await loadPharmacyDashboard(safe);
      } else if (group === 'RECEPTION') {
        await loadReceptionDashboard(safe);
      } else if (group === 'CLINICAL') {
        await loadClinicalDashboard(safe, userRole);
      } else if (group === 'FINANCE') {
        await loadFinanceDashboard(safe);
      } else if (group === 'LAB') {
        await loadLabDashboard(safe);
      } else if (group === 'RAD') {
        await loadRadDashboard(safe);
      } else if (group === 'HR') {
        await loadHRDashboard(safe);
      } else {
        await loadAdminDashboard(safe);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    }
    setLoading(false);
  }

  async function loadPharmacyDashboard(safe: (p: Promise<any>) => Promise<any>) {
    const [prescriptions, alerts, medicines, stores] = await Promise.all([
      safe(api('/pharmacy/prescriptions?limit=100')).then((r) => {
        const list = Array.isArray(r?.data) ? r.data : r?.data?.data ?? [];
        return list;
      }),
      safe(api('/pharmacy/alerts')).then((r) => r?.data ?? r),
      safe(api('/pharmacy/medicines?limit=1')).then((r) => r?.data?.total ?? 0),
      safe(api('/pharmacy/stores')).then((r) => {
        const list = Array.isArray(r?.data) ? r.data : r?.data?.data ?? [];
        return list.length;
      }),
    ]);

    const pendingPrescriptions = prescriptions.filter((p: any) => p.status === 'APPROVED' || p.status === 'DRAFT');
    const dispensedToday = prescriptions.filter((p: any) => {
      if (p.status !== 'DISPENSED') return false;
      const d = new Date(p.updatedAt);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    });

    setStats([
      { label: 'Pending prescriptions', value: pendingPrescriptions.length, tone: pendingPrescriptions.length > 0 ? 'amber' : 'green', icon: '📋' },
      { label: 'Dispensed today', value: dispensedToday.length, tone: 'green', icon: '✅' },
      { label: 'Total medicines', value: medicines, tone: 'blue', icon: '💊' },
      { label: 'Low stock items', value: alerts?.summary?.lowStockCount || 0, tone: (alerts?.summary?.lowStockCount || 0) > 0 ? 'red' : 'green', icon: '⚠' },
      { label: 'Near expiry', value: alerts?.summary?.nearExpiryCount || 0, tone: (alerts?.summary?.nearExpiryCount || 0) > 0 ? 'amber' : 'green', icon: '⏰' },
      { label: 'Out of stock', value: alerts?.summary?.outOfStockCount || 0, tone: (alerts?.summary?.outOfStockCount || 0) > 0 ? 'red' : 'green', icon: '🚫' },
      { label: 'Stores', value: stores, tone: 'blue', icon: '🗄' },
    ]);

    setQuickLinks([
      { label: 'Dispense medicines', href: '/pharmacy#dispensing', icon: '💊' },
      { label: 'Walk-in sales', href: '/pharmacy#sales', icon: '₨' },
      { label: 'Stock alerts', href: '/pharmacy#alerts', icon: '⚠' },
      { label: 'Medicines catalog', href: '/pharmacy#medicines', icon: '📦' },
      { label: 'Stores & inventory', href: '/pharmacy#stores', icon: '🗄' },
    ]);

    setRecentActivity(pendingPrescriptions.slice(0, 5).map((p: any) => ({
      label: `Prescription for ${p.patient?.firstName} ${p.patient?.lastName}`,
      sub: `Dr. ${p.doctor?.user?.firstName} ${p.doctor?.user?.lastName} · ${p.items?.length || 0} items`,
      status: p.status,
    })));
  }

  async function loadReceptionDashboard(safe: (p: Promise<any>) => Promise<any>) {
    const [todayAppts, pendingAppts, patients, revenue, admissions, outstanding, recentBills, recentAdmits] = await Promise.all([
      safe(api('/appointments/today')).then((r) => r?.data?.summary?.total ?? r?.data?.appointments?.length ?? 0),
      safe(api('/appointments?limit=1&status=REQUESTED,CONFIRMED,CHECKED_IN,WAITING')).then((r) => r?.data?.total ?? 0),
      safe(api('/patients?limit=1')).then((r) => r?.data?.total ?? 0),
      safe(api('/billing/invoices?limit=500')).then((r) => {
        const list = Array.isArray(r?.data) ? r.data : r?.data?.data ?? [];
        return list.reduce((s: number, i: any) => s + Number(i.paidAmount || 0), 0);
      }),
      safe(api('/admissions?limit=500')).then((r) => {
        const list = Array.isArray(r?.data) ? r.data : r?.data?.data ?? [];
        return list.filter((a: any) => a.status === 'ADMITTED').length;
      }),
      safe(api('/billing/invoices?limit=500')).then((r) => {
        const list = Array.isArray(r?.data) ? r.data : r?.data?.data ?? [];
        return list.reduce((s: number, i: any) => s + Number(i.dueAmount || 0), 0);
      }),
      safe(api('/billing/invoices?limit=500&status=DRAFT,PENDING')).then((r) => {
        const list = Array.isArray(r?.data) ? r.data : r?.data?.data ?? [];
        return list.slice(0, 5);
      }),
      safe(api('/admissions?limit=500&status=ADMITTED')).then((r) => {
        const list = Array.isArray(r?.data) ? r.data : r?.data?.data ?? [];
        return list.slice(0, 5);
      }),
    ]);

    setStats([
      { label: "Today's appointments", value: todayAppts, tone: 'green', icon: '📅' },
      { label: 'Pending appointments', value: pendingAppts, tone: pendingAppts > 0 ? 'amber' : 'green', icon: '⏳' },
      { label: 'Total patients', value: patients, tone: 'blue', icon: '👤' },
      { label: 'Active admits', value: admissions, tone: 'purple', icon: '🛏' },
      { label: 'Revenue collected', value: formatMoney(revenue), tone: 'green', icon: '₨' },
      { label: 'Unpaid bills', value: formatMoney(outstanding), tone: outstanding > 0 ? 'red' : 'green', icon: '💰' },
    ]);

    setQuickLinks([
      { label: 'Register patient', href: '/patients', icon: '👤' },
      { label: 'Book appointment', href: '/appointments', icon: '📅' },
      { label: 'Admit patient', href: '/admissions', icon: '🛏' },
      { label: 'Discharge patient', href: '/admissions', icon: '🏥' },
      { label: 'New invoice', href: '/billing', icon: '💳' },
      { label: 'Record payment', href: '/billing', icon: '💰' },
      { label: 'Pharmacy sales', href: '/pharmacy', icon: '💊' },
      { label: 'Insurance claims', href: '/insurance', icon: '🛡' },
    ]);

    const activity: any[] = [];
    recentBills.forEach((bill: any) => {
      activity.push({
        label: `Invoice ${bill.invoiceNumber}`,
        sub: `${bill.patient?.firstName || ''} ${bill.patient?.lastName || ''} · ${formatMoney(bill.totalAmount)}`,
        status: bill.status,
      });
    });
    recentAdmits.forEach((adm: any) => {
      activity.push({
        label: `Admitted: ${adm.patient?.firstName || ''} ${adm.patient?.lastName || ''}`,
        sub: `${adm.patient?.mrn || 'No MRN'} · ${adm.patient?.mobile || ''}`,
        status: 'ADMITTED',
      });
    });
    setRecentActivity(activity.slice(0, 8));
  }

  async function loadClinicalDashboard(safe: (p: Promise<any>) => Promise<any>, userRole: string) {
    const isDoctor = userRole === 'DOCTOR';

    const [todayAppts, patients, admissions, encounters, pendingLabs] = await Promise.all([
      safe(api('/appointments/today')).then((r) => r?.data?.summary?.total ?? r?.data?.appointments?.length ?? 0),
      safe(api('/patients?limit=1')).then((r) => r?.data?.total ?? 0),
      safe(api('/admissions?limit=500')).then((r) => {
        const list = Array.isArray(r?.data) ? r.data : r?.data?.data ?? [];
        return list.filter((a: any) => a.status === 'ADMITTED').length;
      }),
      safe(api('/encounters?limit=1')).then((r) => r?.data?.total ?? 0),
      safe(api('/lab/orders?limit=1&status=ORDERED,SAMPLE_COLLECTED,RECEIVED,PROCESSING')).then((r) => r?.data?.total ?? 0),
    ]);

    setStats([
      { label: "Today's appointments", value: todayAppts, tone: 'green', icon: '📅' },
      { label: 'Total patients', value: patients, tone: 'blue', icon: '👤' },
      { label: 'Active admits', value: admissions, tone: 'purple', icon: '🛏' },
      { label: 'Total encounters', value: encounters, tone: 'blue', icon: '🩺' },
      { label: 'Pending lab orders', value: pendingLabs, tone: pendingLabs > 0 ? 'amber' : 'green', icon: '🔬' },
    ]);

    const links: QuickLink[] = [
      { label: 'Patients', href: '/patients', icon: '👤' },
      { label: 'Appointments', href: '/appointments', icon: '📅' },
      { label: 'Encounters', href: '/encounters', icon: '🩺' },
    ];
    if (isDoctor) {
      links.push({ label: 'My schedule', href: '/appointments', icon: '🗓' });
    }
    links.push(
      { label: 'Admissions', href: '/admissions', icon: '🛏' },
      { label: 'Laboratory', href: '/laboratory', icon: '🔬' },
    );
    setQuickLinks(links);
  }

  async function loadFinanceDashboard(safe: (p: Promise<any>) => Promise<any>) {
    const [invoices, revenue, analytics] = await Promise.all([
      safe(api('/billing/invoices?limit=1')).then((r) => r?.data?.total ?? 0),
      safe(api('/billing/invoices?limit=500')).then((r) => {
        const list = Array.isArray(r?.data) ? r.data : r?.data?.data ?? [];
        const total = list.reduce((s: number, i: any) => s + Number(i.totalAmount || 0), 0);
        const paid = list.reduce((s: number, i: any) => s + Number(i.paidAmount || 0), 0);
        return { total, paid, outstanding: total - paid };
      }),
      safe(api('/billing/analytics')).then((r) => r?.data ?? r),
    ]);

    const todayCollection = analytics?.today?.collection || 0;

    setStats([
      { label: 'Total invoices', value: invoices, tone: 'blue', icon: '📄' },
      { label: 'Total revenue', value: formatMoney(revenue.total), tone: 'green', icon: '₨' },
      { label: 'Collected', value: formatMoney(revenue.paid), tone: 'green', icon: '✅' },
      { label: 'Unpaid bills', value: formatMoney(revenue.outstanding), tone: revenue.outstanding > 0 ? 'red' : 'green', icon: '⏳' },
      { label: "Today's collection", value: formatMoney(todayCollection), tone: 'green', icon: '📅' },
    ]);

    setQuickLinks([
      { label: 'Invoices', href: '/billing', icon: '📄' },
      { label: 'Payments', href: '/billing', icon: '₨' },
      { label: 'Insurance claims', href: '/insurance', icon: '🛡' },
      { label: 'Accounting', href: '/accounting', icon: '📊' },
      { label: 'Reports', href: '/reports', icon: '📋' },
    ]);
  }

  async function loadLabDashboard(safe: (p: Promise<any>) => Promise<any>) {
    const [ordered, processing, completed] = await Promise.all([
      safe(api('/lab/orders?limit=1&status=ORDERED')).then((r) => r?.data?.total ?? 0),
      safe(api('/lab/orders?limit=1&status=SAMPLE_COLLECTED,RECEIVED,PROCESSING')).then((r) => r?.data?.total ?? 0),
      safe(api('/lab/orders?limit=1&status=RESULT_READY,VERIFIED,APPROVED,REPORTED')).then((r) => r?.data?.total ?? 0),
    ]);

    setStats([
      { label: 'New orders', value: ordered, tone: ordered > 0 ? 'amber' : 'green', icon: '📋' },
      { label: 'Processing', value: processing, tone: 'blue', icon: '🔬' },
      { label: 'Completed', value: completed, tone: 'green', icon: '✅' },
    ]);

    setQuickLinks([
      { label: 'Lab orders', href: '/laboratory', icon: '🔬' },
      { label: 'Samples', href: '/laboratory', icon: '🧪' },
      { label: 'Results', href: '/laboratory', icon: '📊' },
    ]);
  }

  async function loadRadDashboard(safe: (p: Promise<any>) => Promise<any>) {
    const [ordered, inProgress, reported] = await Promise.all([
      safe(api('/radiology/orders?limit=1&status=ORDERED,SCHEDULED')).then((r) => r?.data?.total ?? 0),
      safe(api('/radiology/orders?limit=1&status=IN_PROGRESS,IMAGES_UPLOADED')).then((r) => r?.data?.total ?? 0),
      safe(api('/radiology/orders?limit=1&status=REPORTED,VERIFIED,APPROVED')).then((r) => r?.data?.total ?? 0),
    ]);

    setStats([
      { label: 'New orders', value: ordered, tone: ordered > 0 ? 'amber' : 'green', icon: '📋' },
      { label: 'In progress', value: inProgress, tone: 'blue', icon: '📷' },
      { label: 'Reported', value: reported, tone: 'green', icon: '✅' },
    ]);

    setQuickLinks([
      { label: 'Radiology orders', href: '/radiology', icon: '📷' },
      { label: 'Upload images', href: '/radiology', icon: '🖼' },
      { label: 'Reports', href: '/radiology', icon: '📊' },
    ]);
  }

  async function loadHRDashboard(safe: (p: Promise<any>) => Promise<any>) {
    const [staff, departments] = await Promise.all([
      safe(api('/hr/staff?limit=1')).then((r) => r?.data?.total ?? 0),
      safe(api('/departments?limit=1')).then((r) => r?.data?.total ?? 0),
    ]);

    setStats([
      { label: 'Total staff', value: staff, tone: 'blue', icon: '👥' },
      { label: 'Departments', value: departments, tone: 'purple', icon: '🏢' },
    ]);

    setQuickLinks([
      { label: 'HR & Staff', href: '/hr', icon: '👥' },
      { label: 'Departments', href: '/departments', icon: '🏢' },
      { label: 'Leave requests', href: '/hr', icon: '📅' },
    ]);
  }

  async function loadAdminDashboard(safe: (p: Promise<any>) => Promise<any>) {
    const [summary, todayAppts, pendingAppts] = await Promise.all([
      safe(api('/reports/summary')),
      safe(api('/appointments/today')).then((r) => r?.data?.summary?.total ?? r?.data?.appointments?.length ?? 0),
      safe(api('/appointments?limit=1&status=REQUESTED,CONFIRMED,CHECKED_IN,WAITING')).then((r) => r?.data?.total ?? 0),
    ]);

    const s = summary?.data ?? summary;

    setStats([
      { label: 'Patients', value: s?.patients ?? 0, tone: 'blue', icon: '👤', sparkline: [s?.patients ? Math.round(s.patients * 0.7) : 0, s?.patients ? Math.round(s.patients * 0.85) : 0, s?.patients ?? 0] },
      { label: 'Doctors', value: s?.doctors ?? 0, tone: 'purple', icon: '👨‍⚕' },
      { label: "Today's Appointments", value: todayAppts, tone: 'green', icon: '📅' },
      { label: 'Pending Appointments', value: pendingAppts, tone: pendingAppts > 0 ? 'amber' : 'green', icon: '⏳' },
      { label: 'Active admits', value: s?.activeAdmissions ?? 0, tone: 'purple', icon: '🏥' },
      {
        label: 'Bed occupancy',
        value: s?.bedOccupancy ? `${s.bedOccupancy.occupied}/${s.bedOccupancy.total}` : '0/0',
        tone: s?.bedOccupancy && s.bedOccupancy.occupied >= s.bedOccupancy.total ? 'red' : 'green',
        icon: '🛏',
        sparkline: s?.bedOccupancy ? [Math.round(s.bedOccupancy.occupied * 0.6), Math.round(s.bedOccupancy.occupied * 0.8), s.bedOccupancy.occupied] : undefined,
      },
      { label: 'Revenue collected', value: formatMoney(s?.collected ?? 0), tone: 'green', icon: '₨' },
      { label: 'Outstanding', value: formatMoney(s?.outstanding ?? 0), tone: (s?.outstanding ?? 0) > 0 ? 'amber' : 'green', icon: '💰' },
    ]);

    setQuickLinks([
      { label: 'Register patient', href: '/patients', icon: '👤' },
      { label: 'Book appointment', href: '/appointments', icon: '📅' },
      { label: 'Start encounter', href: '/encounters', icon: '🩺' },
      { label: 'Admit patient', href: '/admissions', icon: '🛏' },
      { label: 'New invoice', href: '/billing', icon: '💳' },
      { label: 'Pharmacy', href: '/pharmacy', icon: '💊' },
      { label: 'Laboratory', href: '/laboratory', icon: '🔬' },
      { label: 'Reports', href: '/reports', icon: '📊' },
    ]);
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>{greeting}, {userName || 'User'}</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
            {role?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())} dashboard
          </p>
        </div>
      </div>

      {error && <div className="banner-danger">{error}</div>}

      {loading ? (
        <p className="muted">Loading your workspace...</p>
      ) : (
        <>
          <div className="stats-grid">
            {stats.map((s) => (
              <div key={s.label} className="card stat-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {s.icon && <span style={{ fontSize: 24 }}>{s.icon}</span>}
                <div style={{ flex: 1 }}>
                  <p className="muted" style={{ margin: 0, fontSize: 12 }}>{s.label}</p>
                  <p className={`stat-value stat-${s.tone || 'blue'}`} style={{ margin: 0 }}>{s.value}</p>
                  {s.sparkline && <MiniBar data={s.sparkline} />}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: recentActivity.length > 0 ? '1fr 350px' : '1fr', gap: 20 }}>
            <div>
              <h2 className="section-title">Quick actions</h2>
              <div className="link-grid">
                {quickLinks.map((l) => (
                  <button key={l.href + l.label} className="card link-card" onClick={() => router.push(l.href)}>
                    <span style={{ fontSize: 22 }}>{l.icon}</span>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {recentActivity.length > 0 && (
              <div>
                <h2 className="section-title">Recent activity</h2>
                <div className="card" style={{ padding: 0 }}>
                  {recentActivity.map((item, i) => (
                    <div key={i} style={{ padding: '12px 16px', borderBottom: i < recentActivity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
