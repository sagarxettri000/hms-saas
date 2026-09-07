'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, safe } from '@/lib/api';
import { formatMoney, formatDate, formatDateTime, badgeTone } from '@/lib/hooks';
import {
  BarList,
  DashboardSkeletons,
  DeltaText,
  IconTile,
  LabPipeline,
  Leaderboard,
  OccupancyBar,
  Sparkline,
  StockHealth,
  TrendChart,
  WidgetCard,
  deltaOf,
  toneColor,
} from './DashboardWidgets';

interface Stat {
  label: string;
  value: string | number;
  tone?: 'blue' | 'green' | 'purple' | 'amber' | 'red';
  icon?: string;
  href?: string;
  spark?: number[];
  delta?: { current: number; previous: number; money?: boolean };
}

interface FocusTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  badgeCol?: number;
  href?: string;
}

interface QuickLink {
  label: string;
  href: string;
  icon: string;
}

interface ActivityItem {
  icon: string;
  text: string;
  actor: string;
  at: string | null;
}

const ROLE_GROUPS: Record<string, string[]> = {
  ADMIN: ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER'],
  SUPER: ['PLATFORM_SUPER_ADMIN', 'IT_ADMIN'],
  CLINICAL: ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'EMERGENCY_STAFF'],
  RECEPTION: ['RECEPTIONIST', 'RECEPTION_SUPERVISOR'],
  FINANCE: ['FINANCE_MANAGER'],
  LAB: ['LAB_TECHNICIAN', 'PATHOLOGIST'],
  RAD: ['RADIOLOGIST', 'RADIOLOGY_TECHNICIAN'],
  PHARMACY: ['PHARMACIST'],
  HR: ['HR_MANAGER'],
  INVENTORY: ['INVENTORY_MANAGER', 'STORE_KEEPER', 'PURCHASE_OFFICER'],
  QUALITY: ['QUALITY_MANAGER'],
  DEPT: ['DEPARTMENT_HEAD'],
};

function getRoleGroup(role: string): string {
  for (const [group, roles] of Object.entries(ROLE_GROUPS)) {
    if (roles.includes(role)) return group;
  }
  return 'ADMIN';
}

function unwrapResponse(r: any): any {
  if (!r) return null;
  const nested = r?.data?.data;
  if (Array.isArray(nested)) return { data: nested, total: r.data.total ?? nested.length };
  if (nested && typeof nested === 'object') return nested;
  return r?.data ?? r;
}

function listOf(r: any): any[] {
  const u = unwrapResponse(r);
  if (!u) return [];
  if (Array.isArray(u)) return u;
  if (Array.isArray(u.data)) return u.data;
  if (Array.isArray(u.items)) return u.items;
  if (Array.isArray(u.appointments)) return u.appointments;
  if (Array.isArray(u.invoices)) return u.invoices;
  return [];
}

function toList(v: any): any[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return [];
}

function countOf(r: any): number {
  const u = unwrapResponse(r);
  if (u == null) return 0;
  if (typeof u === 'number') return u;
  if (Array.isArray(u)) return u.length;
  if (typeof u.total === 'number') return u.total;
  if (Array.isArray(u.data)) return u.data.length;
  if (Array.isArray(u.items)) return u.items.length;
  return 0;
}

function summaryOf(r: any): any {
  return unwrapResponse(r) || {};
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfYesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const TYPE_LABELS: Record<string, string> = {
  GENERAL: 'General',
  PHARMACY: 'Pharmacy',
  LAB: 'Laboratory',
  LABORATORY: 'Laboratory',
  RADIOLOGY: 'Radiology',
  DISCHARGE: 'Discharge',
  IPD: 'Inpatient',
  OPD: 'Outpatient',
};

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK: 'Bank',
  ONLINE: 'Online',
};

function startOfMonth(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

function isThisMonth(v: any): boolean {
  if (!v) return false;
  const t = new Date(v).getTime();
  return !isNaN(t) && t >= startOfMonth().getTime();
}

function startedOnOrAfter(v: any, from: Date): boolean {
  if (!v) return false;
  const t = new Date(v).getTime();
  return !isNaN(t) && t >= from.getTime();
}

function timeOf(v: any): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function personName(p: any): string {
  if (!p) return '—';
  if (typeof p === 'string') return p;
  const joined = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return joined || p.name || p.email || '—';
}

const ENTITY_ICONS: [string, string][] = [
  ['patient', '👤'],
  ['appointment', '📅'],
  ['invoice', '💰'],
  ['payment', '₨'],
  ['refund', '↩'],
  ['prescription', '💊'],
  ['lab', '🔬'],
  ['radiology', '📷'],
  ['admission', '🛏'],
  ['discharge', '🏥'],
  ['encounter', '🩺'],
  ['user', '👥'],
  ['medicine', '💊'],
  ['inventory', '📦'],
];

function iconFor(entity: any): string {
  const e = String(entity || '').toLowerCase();
  for (const [key, icon] of ENTITY_ICONS) {
    if (e.includes(key)) return icon;
  }
  return '📋';
}

const ACTION_VERBS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  APPROVE: 'Approved',
  CANCEL: 'Cancelled',
};

function verbFor(action: any): string {
  const a = String(action || '').toUpperCase();
  if (ACTION_VERBS[a]) return ACTION_VERBS[a];
  const lower = a.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function humanEntity(entity: any): string {
  return String(entity || 'record')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ');
}

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState('');
  const [group, setGroup] = useState('');
  const [stats, setStats] = useState<Stat[]>([]);
  const [focus, setFocus] = useState<FocusTable | null>(null);
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const [finance, setFinance] = useState<any>(null);
  const [yesterday, setYesterday] = useState<any>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [stockHealth, setStockHealth] = useState<any>(null);
  const [labPipeline, setLabPipeline] = useState<any>(null);
  const [bedsState, setBedsState] = useState<any>({ occupied: 0, total: 0 });

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    const storedRole = localStorage.getItem('role') || '';
    setUserName(localStorage.getItem('userName') || '');
    setRole(storedRole);
    const g = getRoleGroup(storedRole);
    setGroup(g);
    load(g);
  }, []);

  useEffect(() => {
    if (!group) return;
    let timer: number | undefined;
    const schedule = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      timer = window.setTimeout(() => {
        load(group);
        schedule();
      }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
    };
    schedule();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [group]);

  useEffect(() => {
    if (!group) return;
    const iv = window.setInterval(() => {
      if (!loadingRef.current) load(group);
    }, 60000);
    return () => window.clearInterval(iv);
  }, [group]);

  async function load(g: string) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadGroupData(g), loadActivity(), loadExtras(g)]);
    } catch {
      setError('Some dashboard data could not be loaded');
    }
    loadingRef.current = false;
    setLoading(false);
  }

  async function loadExtras(g: string) {
    if (!['ADMIN', 'FINANCE', 'RECEPTION'].includes(g)) return;
    const from = startOfYesterday().toISOString();
    const to = startOfToday().toISOString();
    const [yesterdayR, doctorsR, usersR] = await Promise.all([
      safe(api(`/reports/summary?from=${from}&to=${to}`)),
      safe(api('/doctors?limit=200')),
      safe(api('/users?limit=200')),
    ]);
    setYesterday(summaryOf(yesterdayR));
    setDoctors(listOf(doctorsR));
    setUsers(listOf(usersR));
  }

  async function loadActivity() {
    const r = await safe(api('/audit?limit=10'));
    const rows = listOf(r);
    setActivity(
      rows.map((row: any) => ({
        icon: iconFor(row.entity),
        text: `${verbFor(row.action)} ${humanEntity(row.entity)}`,
        actor: row.user ? `${personName(row.user)}${row.user.role ? ' · ' + String(row.user.role).replace(/_/g, ' ').toLowerCase() : ''}` : 'System',
        at: row.timestamp ?? row.createdAt ?? null,
      })),
    );
  }

  async function loadGroupData(g: string) {
    if (g === 'CLINICAL') await loadClinicalData();
    else if (g === 'RECEPTION') await loadReceptionData();
    else if (g === 'FINANCE') await loadFinanceData();
    else if (g === 'LAB') await loadLabData();
    else if (g === 'RAD') await loadRadData();
    else if (g === 'PHARMACY') await loadPharmacyData();
    else if (g === 'HR') await loadHrData();
    else if (g === 'INVENTORY') await loadInventoryData();
    else if (g === 'QUALITY') await loadQualityData();
    else if (g === 'DEPT') await loadDeptData();
    else await loadAdminData(g === 'SUPER');
  }

  async function loadAdminData(isSuper: boolean) {
    const todayStart = startOfToday().toISOString();
    const [summaryR, todayR, analyticsR, usersStatsR, todaySummaryR, alertsR, pharmSummaryR] = await Promise.all([
      safe(api('/reports/summary')),
      safe(api('/appointments/today')),
      safe(api('/billing/analytics')),
      safe(api('/users/stats')),
      safe(api(`/reports/summary?from=${todayStart}`)),
      safe(api('/pharmacy/alerts')),
      safe(api('/pharmacy/summary')),
    ]);
    const s = summaryOf(summaryR);
    const appts = listOf(todayR);
    const sum = summaryOf(todayR)?.summary || {};
    const analytics = summaryOf(analyticsR);
    const uStats = unwrapResponse(usersStatsR) || {};
    const totalStaff = uStats.total ?? 0;
    const todaySum = summaryOf(todaySummaryR);
    const beds = s.bedOccupancy || { occupied: 0, total: 0 };
    const occupancy = beds.total > 0 ? Math.round((beds.occupied / beds.total) * 100) : 0;
    const pharmAlerts = summaryOf(alertsR);
    const pharmSummary = summaryOf(pharmSummaryR);
    const pharmTotal = pharmSummary.totalMedicines ?? 0;
    const pharmLow = toList(pharmAlerts?.lowStock).length;
    const pharmOut = toList(pharmAlerts?.outOfStock).length;

    setFinance(analytics);
    setBedsState(beds);

    const revSpark = (analytics.trend || []).slice(-14).map((t: any) => Number(t.revenue) || 0);

    setStats([
      {
        label: "Today's patients",
        value: todaySum.patients ?? 0,
        tone: 'blue',
        icon: '👤',
        ...(yesterday && yesterday.patients !== undefined
          ? { delta: { current: todaySum.patients ?? 0, previous: yesterday.patients as number } }
          : {}),
      },
      {
        label: "Today's admit",
        value: todaySum.admissions ?? 0,
        tone: 'green',
        icon: '🛏',
        ...(yesterday && yesterday.admissions !== undefined
          ? { delta: { current: todaySum.admissions ?? 0, previous: yesterday.admissions as number } }
          : {}),
      },
      {
        label: "Today's appointments",
        value: sum.total ?? appts.length,
        tone: 'green',
        icon: '📅',
        ...(yesterday && yesterday.appointments !== undefined
          ? { delta: { current: sum.total ?? appts.length, previous: yesterday.appointments as number } }
          : {}),
      },
      { label: 'Bed occupancy', value: `${occupancy}%`, tone: occupancy >= 90 ? 'red' : occupancy >= 70 ? 'amber' : 'green', icon: '🛌' },
      {
        label: "Today's revenue",
        value: formatMoney(analytics.today?.revenue ?? 0),
        tone: 'purple',
        icon: '₨',
        spark: revSpark,
        ...(yesterday && yesterday.totalRevenue !== undefined
          ? { delta: { current: analytics.today?.revenue ?? 0, previous: yesterday.totalRevenue as number, money: true } }
          : {}),
      },
      { label: 'Total staff', value: totalStaff, tone: 'blue', icon: '👥' },
    ]);

    setStockHealth({
      pct: pharmTotal > 0 ? ((pharmTotal - pharmLow - pharmOut) / pharmTotal) * 100 : 100,
      low: pharmLow,
      out: pharmOut,
      expiring: pharmAlerts?.summary?.nearExpiryCount ?? 0,
      total: pharmTotal,
    });

    setFocus({
      title: "Today's schedule",
      headers: ['Patient', 'Doctor', 'Time', 'Status'],
      badgeCol: 3,
      href: '/appointments',
      rows: appts.slice(0, 8).map((a: any) => [
        personName(a.patient),
        a.doctor?.user ? personName(a.doctor.user) : '—',
        timeOf(a.startTime),
        String(a.status || '—'),
      ]),
    });

    setQuickLinks(
      isSuper
        ? [
            { label: 'Tenants', href: '/tenants', icon: '▦' },
            { label: 'Audit logs', href: '/audit', icon: '▤' },
            { label: 'Settings', href: '/settings', icon: '⚙' },
          ]
        : [
            { label: 'Register patient', href: '/patients', icon: '👤' },
            { label: 'Book appointment', href: '/appointments', icon: '📅' },
            { label: 'Patients', href: '/patients', icon: '☺' },
            { label: 'Billing', href: '/billing', icon: '💳' },
            { label: 'Service Master', href: '/billing/service-master', icon: '☰' },
            { label: 'Admit patient', href: '/admissions', icon: '🛏' },
            { label: 'Beds & Wards', href: '/bed-management', icon: '⊞' },
            { label: 'Pharmacy', href: '/pharmacy?tab=medicines', icon: '💊' },
            { label: 'Laboratory', href: '/laboratory', icon: '🔬' },
            { label: 'Radiology', href: '/radiology', icon: '▤' },
            { label: 'Insurance', href: '/insurance', icon: '◈' },
            { label: 'Memberships', href: '/memberships', icon: '★' },
            { label: 'Accounting', href: '/accounting', icon: '⇄' },
            { label: 'Reports & analytics', href: '/reports', icon: '📊' },
            { label: 'HR & staff', href: '/hr', icon: '👥' },
            { label: 'Users & roles', href: '/settings', icon: '⚙' },
            { label: 'Tenants', href: '/tenants', icon: '▦' },
          ],
    );
  }

  async function loadClinicalData() {
    const [todayR, activeEncR, rxR, labSummaryR] = await Promise.all([
      safe(api('/appointments/today')),
      safe(api('/encounters?limit=1&status=ACTIVE')),
      safe(api('/pharmacy/prescriptions?limit=100')),
      safe(api('/lab/summary')),
    ]);
    const appts = listOf(todayR);
    const sum = summaryOf(todayR)?.summary || {};
    const queue = appts.filter((a: any) => ['CHECKED_IN', 'WAITING', 'IN_CONSULTATION'].includes(a.status)).length;
    const pendingRx = listOf(rxR).filter((p: any) => p.status === 'DRAFT' || p.status === 'APPROVED').length;
    const lab = summaryOf(labSummaryR);

    setStats([
      { label: "Today's appointments", value: sum.total ?? appts.length, tone: 'blue', icon: '📅', href: '/appointments' },
      { label: 'My patients in queue', value: queue, tone: queue > 0 ? 'purple' : 'green', icon: '🩺', href: '/appointments' },
      { label: 'Pending encounters', value: countOf(activeEncR), tone: 'blue', icon: '📋', href: '/encounters' },
      { label: 'Pending prescriptions', value: pendingRx, tone: pendingRx > 0 ? 'amber' : 'green', icon: '💊', href: '/pharmacy?tab=billing' },
      { label: 'Pending lab orders', value: lab.pendingOrders ?? 0, tone: (lab.pendingOrders ?? 0) > 0 ? 'amber' : 'green', icon: '🔬', href: '/laboratory' },
    ]);

    setLabPipeline({
      pending: lab.pendingOrders ?? 0,
      collected: lab.sampleCollected ?? 0,
      completed: lab.completedToday ?? 0,
      total: lab.totalOrders ?? 0,
    });

    setFocus({
      title: 'Patient queue today',
      headers: ['Patient', 'Department', 'Time', 'Status'],
      badgeCol: 3,
      href: '/appointments',
      rows: appts.slice(0, 8).map((a: any) => [
        personName(a.patient),
        a.department?.name || '—',
        timeOf(a.startTime),
        String(a.status || '—'),
      ]),
    });

    setQuickLinks([
      { label: 'My appointments', href: '/appointments', icon: '📅' },
      { label: 'Start encounter', href: '/encounters', icon: '🩺' },
      { label: 'Laboratory', href: '/laboratory', icon: '🔬' },
    ]);
  }

  async function loadReceptionData() {
    const todayStart = startOfToday().toISOString();
    const [todayR, invoicesR, analyticsR, todaySummaryR] = await Promise.all([
      safe(api('/appointments/today')),
      safe(api('/billing/invoices?limit=200&page=1')),
      safe(api('/billing/analytics')),
      safe(api(`/reports/summary?from=${todayStart}`)),
    ]);
    const appts = listOf(todayR);
    const walkIns = appts.filter((a: any) => a.isWalkIn).length;
    const openStatuses = ['DRAFT', 'PENDING', 'PARTIAL', 'OVERDUE'];
    const pendingBills = listOf(invoicesR).filter((i: any) => openStatuses.includes(i.status));
    const analytics = summaryOf(analyticsR);
    const todaySum = summaryOf(todaySummaryR);

    setFinance(analytics);

    const revSpark = (analytics.trend || []).slice(-14).map((t: any) => Number(t.revenue) || 0);

    setStats([
      {
        label: "Today's patients",
        value: todaySum.patients ?? 0,
        tone: 'blue',
        icon: '👤',
        ...(yesterday && yesterday.patients !== undefined
          ? { delta: { current: todaySum.patients ?? 0, previous: yesterday.patients as number } }
          : {}),
      },
      {
        label: "Today's admit",
        value: todaySum.admissions ?? 0,
        tone: 'green',
        icon: '🛏',
        ...(yesterday && yesterday.admissions !== undefined
          ? { delta: { current: todaySum.admissions ?? 0, previous: yesterday.admissions as number } }
          : {}),
      },
      {
        label: "Today's appointments",
        value: appts.length,
        tone: 'blue',
        icon: '📅',
        ...(yesterday && yesterday.appointments !== undefined
          ? { delta: { current: appts.length, previous: yesterday.appointments as number } }
          : {}),
      },
      {
        label: "Today's revenue",
        value: formatMoney(analytics.today?.revenue ?? 0),
        tone: 'green',
        icon: '₨',
        spark: revSpark,
        ...(yesterday && yesterday.totalRevenue !== undefined
          ? { delta: { current: analytics.today?.revenue ?? 0, previous: yesterday.totalRevenue as number, money: true } }
          : {}),
      },
      { label: 'Walk-ins today', value: walkIns, tone: 'purple', icon: '🚶' },
      { label: 'Pending billing', value: pendingBills.length, tone: pendingBills.length > 0 ? 'amber' : 'green', icon: '📄' },
    ]);

    setFocus({
      title: 'Bills awaiting payment',
      headers: ['Invoice', 'Patient', 'Amount due', 'Status'],
      badgeCol: 3,
      href: '/billing',
      rows: pendingBills.slice(0, 8).map((i: any) => [
        i.invoiceNumber || i.id,
        personName(i.patient),
        formatMoney(i.dueAmount ?? i.totalAmount),
        String(i.status || '—'),
      ]),
    });

    setQuickLinks([
      { label: 'Book appointment', href: '/appointments', icon: '📅' },
      { label: 'Register patient', href: '/patients', icon: '👤' },
      { label: 'New invoice', href: '/billing', icon: '💳' },
    ]);
  }

  async function loadFinanceData() {
    const [analyticsR, invoicesR, refundsR] = await Promise.all([
      safe(api('/billing/analytics')),
      safe(api('/billing/invoices?limit=200&page=1')),
      safe(api('/billing/refunds?limit=100')),
    ]);
    const a = summaryOf(analyticsR);
    const unpaidStatuses = ['PENDING', 'PARTIAL', 'OVERDUE'];
    const unpaid = listOf(invoicesR)
      .filter((i: any) => unpaidStatuses.includes(i.status))
      .sort((x: any, y: any) => Number(y.dueAmount || 0) - Number(x.dueAmount || 0));
    const outstanding = unpaid.reduce((s: number, i: any) => s + Number(i.dueAmount || 0), 0);
    const refundsThisMonth = listOf(refundsR).filter((r: any) => isThisMonth(r.refundedAt));
    const refundTotal = refundsThisMonth.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    setFinance(a);

    const revSpark = (a.trend || []).slice(-14).map((t: any) => Number(t.revenue) || 0);
    const colSpark = (a.trend || []).slice(-14).map((t: any) => Number(t.collection) || 0);

    setStats([
      { label: 'Total revenue', value: formatMoney(a.month?.revenue ?? 0), tone: 'green', icon: '📈', spark: revSpark },
      { label: 'Pending payments', value: formatMoney(outstanding), tone: outstanding > 0 ? 'red' : 'green', icon: '⏳' },
      { label: 'Outstanding invoices', value: unpaid.length, tone: unpaid.length > 0 ? 'amber' : 'green', icon: '📄' },
      { label: 'Refunds this month', value: formatMoney(refundTotal), tone: 'purple', icon: '↩' },
      {
        label: 'Collections today',
        value: formatMoney(a.today?.collection ?? 0),
        tone: 'green',
        icon: '₨',
        spark: colSpark,
        ...(yesterday && yesterday.collected !== undefined
          ? { delta: { current: a.today?.collection ?? 0, previous: yesterday.collected as number, money: true } }
          : {}),
      },
    ]);

    setFocus({
      title: 'Largest unpaid invoices',
      headers: ['Invoice', 'Patient', 'Amount due', 'Issued', 'Status'],
      badgeCol: 4,
      href: '/billing',
      rows: unpaid.slice(0, 8).map((i: any) => [
        i.invoiceNumber || i.id,
        personName(i.patient),
        formatMoney(i.dueAmount ?? i.totalAmount),
        formatDate(i.issuedDate),
        String(i.status || '—'),
      ]),
    });

    setQuickLinks([
      { label: 'Invoices & payments', href: '/billing', icon: '📄' },
      { label: 'Accounting', href: '/accounting', icon: '⇄' },
      { label: 'Reports', href: '/reports', icon: '📊' },
    ]);
  }

  async function loadLabData() {
    const [summaryR, verifiedR, recentR] = await Promise.all([
      safe(api('/lab/summary')),
      safe(api('/lab/orders?limit=1&status=VERIFIED')),
      safe(api('/lab/orders?limit=8')),
    ]);
    const s = summaryOf(summaryR);

    setLabPipeline({
      pending: s.pendingOrders ?? 0,
      collected: s.sampleCollected ?? 0,
      completed: s.completedToday ?? 0,
      total: s.totalOrders ?? 0,
    });

    setStats([
      { label: 'Total orders', value: s.totalOrders ?? 0, tone: 'blue', icon: '🧪' },
      { label: 'Pending results', value: s.pendingOrders ?? 0, tone: (s.pendingOrders ?? 0) > 0 ? 'amber' : 'green', icon: '⏳' },
      { label: 'Completed today', value: s.completedToday ?? 0, tone: 'green', icon: '✅' },
      { label: 'Verified', value: countOf(verifiedR), tone: 'purple', icon: '✔' },
      { label: 'Samples collected', value: s.sampleCollected ?? 0, tone: 'blue', icon: '🩸' },
    ]);

    setFocus({
      title: 'Recent lab orders',
      headers: ['Order', 'Patient', 'Ordered', 'Status'],
      badgeCol: 3,
      href: '/laboratory',
      rows: listOf(recentR).slice(0, 8).map((o: any) => [
        o.orderNumber || o.id,
        personName(o.patient),
        formatDate(o.orderedAt || o.createdAt),
        String(o.status || '—'),
      ]),
    });

    setQuickLinks([
      { label: 'Lab orders', href: '/laboratory', icon: '🔬' },
      { label: 'Enter results', href: '/laboratory', icon: '🧪' },
      { label: 'Verify reports', href: '/laboratory', icon: '📋' },
    ]);
  }

  async function loadRadData() {
    const [summaryR, verifiedR, recentR] = await Promise.all([
      safe(api('/radiology/summary')),
      safe(api('/radiology/orders?limit=1&status=VERIFIED')),
      safe(api('/radiology/orders?limit=8')),
    ]);
    const s = summaryOf(summaryR);
    const pendingReports = (s.newOrders ?? 0) + (s.inProgress ?? 0);

    setStats([
      { label: 'Total orders', value: s.totalOrders ?? 0, tone: 'blue', icon: '📷' },
      { label: 'Pending reports', value: pendingReports, tone: pendingReports > 0 ? 'amber' : 'green', icon: '⏳' },
      { label: 'Completed today', value: s.completedToday ?? 0, tone: 'green', icon: '✅' },
      { label: 'Verified', value: countOf(verifiedR), tone: 'purple', icon: '✔' },
    ]);

    setFocus({
      title: 'Recent imaging orders',
      headers: ['Order', 'Patient', 'Modality', 'Ordered', 'Status'],
      badgeCol: 4,
      href: '/radiology',
      rows: listOf(recentR).slice(0, 8).map((o: any) => [
        o.orderNumber || o.id,
        personName(o.patient),
        String(o.modality || '—'),
        formatDate(o.orderedAt || o.createdAt),
        String(o.status || '—'),
      ]),
    });

    setQuickLinks([
      { label: 'Worklist', href: '/radiology', icon: '📷' },
      { label: 'Upload images', href: '/radiology', icon: '🖼' },
      { label: 'Reports', href: '/radiology', icon: '📊' },
    ]);
  }

  async function loadPharmacyData() {
    const [summaryR, alertsR, analyticsR] = await Promise.all([
      safe(api('/pharmacy/summary')),
      safe(api('/pharmacy/alerts')),
      safe(api('/billing/analytics')),
    ]);
    const s = summaryOf(summaryR);
    const alerts = summaryOf(alertsR);
    const pharmacyRevenue = summaryOf(analyticsR)?.today?.revenueByType?.PHARMACY ?? 0;
    const lowStock = Array.isArray(alerts.lowStock) ? alerts.lowStock : [];
    const outOfStock = Array.isArray(alerts.outOfStock) ? alerts.outOfStock : [];
    const totalMedicines = s.totalMedicines ?? 0;
    const lowCount = lowStock.length;
    const outCount = outOfStock.length;

    setStockHealth({
      pct: totalMedicines > 0 ? ((totalMedicines - lowCount - outCount) / totalMedicines) * 100 : 100,
      low: lowCount,
      out: outCount,
      expiring: alerts.summary?.nearExpiryCount ?? 0,
      total: totalMedicines,
    });

    setStats([
      { label: 'Total medicines', value: totalMedicines, tone: 'blue', icon: '💊' },
      { label: 'Low stock items', value: s.lowStockCount ?? alerts.summary?.lowStockCount ?? 0, tone: (s.lowStockCount ?? 0) > 0 ? 'amber' : 'green', icon: '⚠' },
      { label: 'Dispensed today', value: s.dispensedToday ?? 0, tone: 'green', icon: '✅' },
      { label: 'Revenue today', value: formatMoney(pharmacyRevenue), tone: 'green', icon: '₨' },
      { label: 'Expiring soon', value: alerts.summary?.nearExpiryCount ?? 0, tone: (alerts.summary?.nearExpiryCount ?? 0) > 0 ? 'red' : 'green', icon: '⏰' },
    ]);

    setFocus({
      title: 'Low stock items',
      headers: ['Medicine', 'Store', 'Stock', 'Reorder level'],
      href: '/pharmacy?tab=alerts',
      rows: lowStock.slice(0, 8).map((item: any) => [
        item.medicine?.name || item.name || '—',
        item.store?.name || '—',
        Number(item.currentStock ?? 0),
        Number(item.reorderLevel ?? 0),
      ]),
    });

    setQuickLinks([
      { label: 'Dispense medicines', href: '/pharmacy?tab=billing', icon: '📋' },
      { label: 'Walk-in sales', href: '/pharmacy?tab=billing', icon: '₨' },
      { label: 'Stock alerts', href: '/pharmacy?tab=alerts', icon: '⚠' },
    ]);
  }

  async function loadHrData() {
    const [staffR, leavesR, rostersR] = await Promise.all([
      safe(api('/users?limit=1')),
      safe(api('/hr/leaves')),
      safe(api('/hr/rosters')),
    ]);
    const leaves = listOf(leavesR);
    const dayStart = startOfToday();
    const onLeaveToday = leaves.filter((l: any) => {
      if (l.status !== 'APPROVED') return false;
      const start = new Date(l.startDate).getTime();
      const end = new Date(l.endDate).getTime();
      return !isNaN(start) && !isNaN(end) && start <= Date.now() && end >= dayStart.getTime();
    }).length;
    const pendingLeaves = leaves.filter((l: any) => l.status === 'PENDING');
    const upcomingShifts = listOf(rostersR).filter((r: any) => startedOnOrAfter(r.date, dayStart)).length;

    setStats([
      { label: 'Total staff', value: countOf(staffR), tone: 'blue', icon: '👥' },
      { label: 'On leave today', value: onLeaveToday, tone: onLeaveToday > 0 ? 'amber' : 'green', icon: '🏖' },
      { label: 'Pending leave requests', value: pendingLeaves.length, tone: pendingLeaves.length > 0 ? 'amber' : 'green', icon: '📝' },
      { label: 'Upcoming shifts', value: upcomingShifts, tone: 'purple', icon: '🗓' },
    ]);

    setFocus({
      title: 'Leave requests awaiting approval',
      headers: ['Employee', 'Type', 'From', 'To', 'Status'],
      badgeCol: 4,
      href: '/hr',
      rows: (pendingLeaves.length > 0 ? pendingLeaves : leaves.slice(0, 8)).slice(0, 8).map((l: any) => [
        personName(l.user),
        String(l.type || '—'),
        formatDate(l.startDate),
        formatDate(l.endDate),
        String(l.status || '—'),
      ]),
    });

    setQuickLinks([
      { label: 'Staff directory', href: '/hr', icon: '👥' },
      { label: 'Leave requests', href: '/hr', icon: '📝' },
      { label: 'Departments', href: '/departments', icon: '🏢' },
    ]);
  }

  async function loadInventoryData() {
    const [invR, alertsR, posR, grnR] = await Promise.all([
      safe(api('/pharmacy/inventory?limit=1')),
      safe(api('/pharmacy/alerts')),
      safe(api('/procurement/purchase-orders?limit=100')),
      safe(api('/procurement/goods-receipts?limit=100')),
    ]);
    const alerts = summaryOf(alertsR);
    const openPoStatuses = ['DRAFT', 'SENT', 'CONFIRMED', 'PARTIAL_RECEIVED'];
    const pendingPos = listOf(posR).filter((p: any) => openPoStatuses.includes(p.status));
    const receivedThisMonth = listOf(grnR).filter((g: any) => isThisMonth(g.receivedDate)).length;
    const invCount = countOf(invR);
    const lowCount = alerts.summary?.lowStockCount ?? 0;
    const outCount = alerts.summary?.outOfStockCount ?? 0;

    setStockHealth({
      pct: invCount > 0 ? ((invCount - lowCount - outCount) / invCount) * 100 : 100,
      low: lowCount,
      out: outCount,
      expiring: alerts.summary?.nearExpiryCount ?? 0,
      total: invCount,
    });

    setStats([
      { label: 'Total items', value: invCount, tone: 'blue', icon: '📦' },
      { label: 'Low stock alerts', value: lowCount, tone: lowCount > 0 ? 'amber' : 'green', icon: '⚠' },
      { label: 'Out of stock', value: outCount, tone: outCount > 0 ? 'red' : 'green', icon: '🚫' },
      { label: 'Pending purchase orders', value: pendingPos.length, tone: pendingPos.length > 0 ? 'amber' : 'green', icon: '↦' },
      { label: 'Received this month', value: receivedThisMonth, tone: 'green', icon: '📥' },
    ]);

    setFocus({
      title: 'Purchase orders in flight',
      headers: ['PO', 'Supplier', 'Order date', 'Amount', 'Status'],
      badgeCol: 4,
      href: '/procurement',
      rows: pendingPos.slice(0, 8).map((p: any) => [
        p.poNumber || p.id,
        personName(p.supplier),
        formatDate(p.orderDate),
        formatMoney(p.totalAmount),
        String(p.status || '—'),
      ]),
    });

    setQuickLinks([
      { label: 'Procurement', href: '/procurement', icon: '↦' },
      { label: 'Goods receipts', href: '/procurement', icon: '📥' },
      { label: 'Stock alerts', href: '/pharmacy?tab=alerts', icon: '⚠' },
    ]);
  }

  async function loadQualityData() {
    const [dashR, capaR, closedR, openR] = await Promise.all([
      safe(api('/adverse-events/dashboard')),
      safe(api('/adverse-events?status=INVESTIGATING&limit=1')),
      safe(api('/adverse-events?status=CLOSED&limit=100')),
      safe(api('/adverse-events?status=OPEN&limit=8')),
    ]);
    const d = summaryOf(dashR);
    const resolvedThisMonth = listOf(closedR).filter((e: any) => isThisMonth(e.closedAt || e.updatedAt)).length;
    const compliance = d.total > 0 ? Math.round(((d.total - (d.open ?? 0)) / d.total) * 100) : 100;

    setStats([
      { label: 'Open incidents', value: d.open ?? 0, tone: (d.open ?? 0) > 0 ? 'red' : 'green', icon: '✖' },
      { label: 'In CAPA', value: countOf(capaR), tone: 'amber', icon: '🔍' },
      { label: 'Resolved this month', value: resolvedThisMonth, tone: 'green', icon: '✅' },
      { label: 'Compliance score', value: `${compliance}%`, tone: compliance >= 90 ? 'green' : compliance >= 70 ? 'amber' : 'red', icon: '◆' },
      { label: 'Severe events', value: d.severe ?? 0, tone: (d.severe ?? 0) > 0 ? 'red' : 'green', icon: '⚠' },
    ]);

    setFocus({
      title: 'Open adverse events',
      headers: ['Type', 'Severity', 'Occurred', 'Status'],
      badgeCol: 3,
      href: '/adverse-events',
      rows: listOf(openR).slice(0, 8).map((e: any) => [
        humanEntity(e.type),
        String(e.severity || '—'),
        formatDate(e.occurredAt),
        String(e.status || '—'),
      ]),
    });

    setQuickLinks([
      { label: 'Adverse events', href: '/adverse-events', icon: '✖' },
      { label: 'Approvals', href: '/approvals', icon: '✓' },
      { label: 'Reports', href: '/reports', icon: '📊' },
    ]);
  }

  async function loadDeptData() {
    const [patientsR, encountersR, doctorsR, recentEncR, labR, radR, rxR, admR] = await Promise.all([
      safe(api('/patients?limit=1')),
      safe(api('/encounters?limit=1')),
      safe(api('/doctors?limit=1')),
      safe(api('/encounters?limit=8')),
      safe(api('/lab/orders?limit=50')),
      safe(api('/radiology/orders?limit=50')),
      safe(api('/encounters/prescriptions?limit=50')),
      safe(api('/admissions?limit=50')),
    ]);

    const pendingStatus = (v: any) => {
      const s = String(v?.status ?? v?.approvalStatus ?? '').toUpperCase();
      return s === 'PENDING' || s === 'ORDERED' || s === 'DRAFT' || s === 'REQUESTED';
    };
    const pendingApprovals =
      listOf(labR).filter((o: any) => pendingStatus(o)).length +
      listOf(radR).filter((o: any) => pendingStatus(o)).length +
      listOf(rxR).filter((o: any) => o.status === 'DRAFT' || o.status === 'APPROVED').length +
      listOf(admR).filter((a: any) => pendingStatus(a) || a.dischargeStatus === 'PENDING').length;

    setStats([
      { label: 'Department patients', value: countOf(patientsR), tone: 'blue', icon: '👤' },
      { label: 'Pending approvals', value: pendingApprovals, tone: pendingApprovals > 0 ? 'amber' : 'green', icon: '✓' },
      { label: 'Department encounters', value: countOf(encountersR), tone: 'purple', icon: '🩺' },
      { label: 'Department doctors', value: countOf(doctorsR), tone: 'green', icon: '✚' },
    ]);

    setFocus({
      title: 'Latest encounters',
      headers: ['Patient', 'Doctor', 'Department', 'Date', 'Status'],
      badgeCol: 4,
      href: '/encounters',
      rows: listOf(recentEncR).slice(0, 8).map((e: any) => [
        personName(e.patient),
        e.doctor?.user ? personName(e.doctor.user) : '—',
        e.department?.name || '—',
        formatDate(e.createdAt),
        String(e.status || '—'),
      ]),
    });

    setQuickLinks([
      { label: 'Review approvals', href: '/approvals', icon: '✓' },
      { label: 'Encounters', href: '/encounters', icon: '🩺' },
      { label: 'Department reports', href: '/reports', icon: '📊' },
    ]);
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const roleLabel = role
    ? role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())
    : 'Workspace';

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const finRole = group === 'ADMIN' || group === 'FINANCE' || group === 'RECEPTION';
  const trend = (finance?.trend || []).map((t: any) => ({
    date: t.date,
    revenue: Number(t.revenue) || 0,
    collection: Number(t.collection) || 0,
  }));
  const revenueByType = Object.entries(finance?.today?.revenueByType || {}).map(([k, v]) => ({
    label: TYPE_LABELS[k] || String(k).replace(/_/g, ' '),
    value: Number(v) || 0,
  }));
  const collectionByMethod = Object.entries(finance?.today?.collectionByMethod || {}).map(([k, v]) => ({
    label: METHOD_LABELS[k] || String(k).replace(/_/g, ' '),
    value: Number(v) || 0,
  }));
  const doctorRows = Object.entries(finance?.doctorIncome || {})
    .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
    .slice(0, 5)
    .map(([id, amt]: any) => {
      const byId = doctors.find((x: any) => x.id === id);
      const byUser = doctors.find((x: any) => x.user?.id === id);
      const d = byId || byUser;
      const name = d?.user
        ? [d.user.firstName, d.user.middleName, d.user.lastName].filter(Boolean).join(' ')
        : d?.name || d?.user?.email || 'Doctor';
      return {
        label: name,
        sublabel: d?.specialization || d?.department?.name || 'Physician',
        value: formatMoney(Number(amt) || 0),
      };
    });
  const cashierRows = Object.entries(finance?.userCollection || {})
    .sort((a: any, b: any) => Number(b[1]?.total || 0) - Number(a[1]?.total || 0))
    .slice(0, 5)
    .map(([id, u]: any) => {
      const usr = users.find((x: any) => x.id === id);
      const name = usr ? [usr.firstName, usr.lastName].filter(Boolean).join(' ') || usr.email || 'Staff' : 'Staff';
      const cash = Number(u?.CASH || 0);
      return {
        label: name,
        sublabel:
          cash > 0 ? `Cash ${formatMoney(cash)}` : `${u?.total ?? 0} transactions`,
        value: formatMoney(Number(u?.total) || 0),
      };
    });
  const beds = bedsState;
  const bedsPct = beds?.total > 0 ? Math.round((beds.occupied / beds.total) * 100) : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{greeting}, {userName || 'User'}</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
            {roleLabel} dashboard · {todayLabel}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => load(group)} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <div className="banner-danger">{error}</div>}

      {loading && stats.length === 0 ? (
        <DashboardSkeletons stats={6} cards={2} />
      ) : (
        <>
          <div className="stat-grid">
            {stats.map((s) => (
              <div
                key={s.label}
                className="card stat-card"
                onClick={s.href ? () => router.push(s.href!) : undefined}
                role={s.href ? 'link' : undefined}
                tabIndex={s.href ? 0 : undefined}
                onKeyDown={
                  s.href
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(s.href!);
                        }
                      }
                    : undefined
                }
                style={s.href ? { cursor: 'pointer' } : undefined}
              >
                <div className="dash-stat-top">
                  <IconTile glyph={s.icon} tone={s.tone} />
                  {s.spark && s.spark.length > 1 && (
                    <Sparkline values={s.spark} color={toneColor(s.tone)} />
                  )}
                </div>
                <p className="stat-label">{s.label}</p>
                <p className={`stat-value stat-${s.tone || 'blue'}`}>{s.value}</p>
                {s.delta && (
                  <DeltaText delta={deltaOf(s.delta.current, s.delta.previous)} money={s.delta.money} />
                )}
              </div>
            ))}
          </div>

          {finRole && finance && (
            <div className="dash-widget-grid">
              <WidgetCard title="Revenue vs collections · 30 days" style={{ gridColumn: '1 / -1' }}>
                <TrendChart data={trend} />
              </WidgetCard>
              <WidgetCard title="Collections today by method">
                <BarList data={collectionByMethod} />
              </WidgetCard>
              <WidgetCard title="Revenue today by type">
                <BarList data={revenueByType} />
              </WidgetCard>
              <WidgetCard
                title="Top doctors by revenue"
                action={
                  <a className="dash-link" href="/reports">
                    View all
                  </a>
                }
              >
                <Leaderboard rows={doctorRows} empty="No physician revenue recorded yet." />
              </WidgetCard>
              <WidgetCard
                title="Cashier collections"
                action={
                  <a className="dash-link" href="/billing">
                    View all
                  </a>
                }
              >
                <Leaderboard rows={cashierRows} empty="No collections recorded yet." />
              </WidgetCard>
            </div>
          )}

          {group === 'ADMIN' && (
            <div className="dash-widget-grid">
              <WidgetCard title="Bed occupancy">
                <OccupancyBar occupied={beds?.occupied ?? 0} total={beds?.total ?? 0} pct={bedsPct} />
              </WidgetCard>
              {stockHealth && (
                <WidgetCard
                  title="Pharmacy stock health"
                  action={
                    <a className="dash-link" href="/pharmacy?tab=alerts">
                      View alerts
                    </a>
                  }
                >
                  <StockHealth
                    pct={stockHealth.pct}
                    low={stockHealth.low}
                    out={stockHealth.out}
                    expiring={stockHealth.expiring}
                    total={stockHealth.total}
                  />
                </WidgetCard>
              )}
            </div>
          )}

          {stockHealth && group !== 'ADMIN' && ['PHARMACY', 'INVENTORY'].includes(group) && (
            <div className="dash-widget-grid">
              <WidgetCard
                title="Stock health"
                action={
                  <a className="dash-link" href="/pharmacy?tab=alerts">
                    View alerts
                  </a>
                }
              >
                <StockHealth
                  pct={stockHealth.pct}
                  low={stockHealth.low}
                  out={stockHealth.out}
                  expiring={stockHealth.expiring}
                  total={stockHealth.total}
                />
              </WidgetCard>
            </div>
          )}

          {labPipeline && ['CLINICAL', 'LAB'].includes(group) && (
            <div className="dash-widget-grid">
              <WidgetCard
                title="Lab order pipeline today"
                action={
                  <a className="dash-link" href="/laboratory">
                    View lab
                  </a>
                }
              >
                <LabPipeline
                  pending={labPipeline.pending}
                  collected={labPipeline.collected}
                  completed={labPipeline.completed}
                  total={labPipeline.total}
                />
              </WidgetCard>
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
              gap: 20,
              alignItems: 'start',
            }}
          >
            <div>
              {quickLinks.length > 0 && (
                <>
                  <h2 className="section-title">Quick actions</h2>
                  <div className="link-grid" style={{ marginBottom: 24 }}>
                    {quickLinks.map((l) => (
                      <button key={l.href + l.label} className="card link-card" onClick={() => router.push(l.href)}>
                        <span style={{ fontSize: 22 }}>{l.icon}</span>
                        <span>{l.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {focus && focus.rows.length > 0 ? (
                <>
                  <div className="row-between">
                    <h2 className="section-title" style={{ marginBottom: 0 }}>
                      {focus.title}
                    </h2>
                    {focus.href && (
                      <a className="dash-link" href={focus.href}>
                        View all
                      </a>
                    )}
                  </div>
                  <div className="table-wrap" style={{ marginTop: 12 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          {focus.headers.map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {focus.rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) =>
                              focus.badgeCol === ci ? (
                                <td key={ci}>
                                  <span className={`badge badge-${badgeTone(String(cell))}`}>
                                    {String(cell).replace(/_/g, ' ')}
                                  </span>
                                </td>
                              ) : (
                                <td key={ci}>{cell}</td>
                              ),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="empty">Nothing needs your attention right now</div>
              )}
            </div>

            <div>
              <h2 className="section-title">Recent activity</h2>
              <div className="card" style={{ padding: 0 }}>
                {activity.length === 0 ? (
                  <div className="empty">No recent activity</div>
                ) : (
                  activity.map((a, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '12px 16px',
                        borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1.3 }}>{a.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{a.text}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.actor}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDateTime(a.at)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}