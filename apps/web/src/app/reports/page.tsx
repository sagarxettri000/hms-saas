'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { badgeTone, formatMoney } from '@/lib/hooks';
import type { Row } from '@/lib/types';

function Bar({ label, count, total, tone }: { label: string; count: number; total: number; tone?: string }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="bar-row">
      <div className="bar-label">
        <span>{label}</span>
        <span className="bar-count">{count}</span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill bar-${tone || 'blue'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {children}
    </div>
  );
}

type StatusRow = { status: string; count: number };

export default function ReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const [revenueByStatus, setRevenueByStatus] = useState<any[]>([]);
  const [apptByStatus, setApptByStatus] = useState<StatusRow[]>([]);
  const [admByStatus, setAdmByStatus] = useState<StatusRow[]>([]);
  const [labByStatus, setLabByStatus] = useState<StatusRow[]>([]);
  const [doctorWorkload, setDoctorWorkload] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api('/reports/summary'),
      api('/reports/revenue-by-status'),
      api('/reports/appointments-by-status'),
      api('/reports/admissions-by-status'),
      api('/reports/lab-by-status'),
      api('/reports/doctor-workload'),
    ])
      .then(([s, rev, appt, adm, lab, workload]) => {
        if (!active) return;
        setSummary(s.data ?? s);
        setRevenueByStatus(rev.data ?? rev);
        setApptByStatus(appt.data ?? appt);
        setAdmByStatus(adm.data ?? adm);
        setLabByStatus(lab.data ?? lab);
        setDoctorWorkload(workload.data ?? workload);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reports'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <AppShell><div className="loading">Generating reports…</div></AppShell>;

  const revenueByStatusArr = Array.isArray(revenueByStatus) ? revenueByStatus : [];
  const doctorWorkloadArr = Array.isArray(doctorWorkload) ? doctorWorkload : [];
  const apptByStatusArr = Array.isArray(apptByStatus) ? apptByStatus : [];
  const admByStatusArr = Array.isArray(admByStatus) ? admByStatus : [];
  const labByStatusArr = Array.isArray(labByStatus) ? labByStatus : [];

  const totalRevenue = summary?.totalRevenue ?? 0;
  const collected = summary?.collected ?? 0;
  const outstanding = summary?.outstanding ?? 0;
  const occupancy = summary?.bedOccupancy ?? { occupied: 0, total: 0 };

  const maxRevenue = Math.max(1, ...revenueByStatusArr.map((r) => Number(r.amount || 0)));
  const maxAppt = Math.max(1, ...apptByStatusArr.map((r) => Number(r.count || 0)));
  const maxAdm = Math.max(1, ...admByStatusArr.map((r) => Number(r.count || 0)));
  const maxLab = Math.max(1, ...labByStatusArr.map((r) => Number(r.count || 0)));
  const maxWorkload = Math.max(1, ...doctorWorkloadArr.map((r) => Number(r.count || 0)));

  const summaryCards = [
    { label: 'Total revenue', value: formatMoney(totalRevenue), tone: 'green' },
    { label: 'Collected', value: formatMoney(collected), tone: 'green' },
    { label: 'Unpaid bills', value: formatMoney(outstanding), tone: 'amber' },
    { label: 'Patients', value: summary?.patients ?? 0, tone: 'blue' },
    { label: 'Appointments', value: summary?.appointments ?? 0, tone: 'blue' },
    { label: 'Active admits', value: summary?.activeAdmissions ?? 0, tone: 'purple' },
    { label: 'Bed occupancy', value: `${occupancy.occupied}/${occupancy.total}`, tone: occupancy.total ? (occupancy.occupied / occupancy.total > 0.8 ? 'red' : 'green') : 'gray' },
    { label: 'Doctors', value: summary?.doctors ?? 0, tone: 'purple' },
  ];

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Reports & Analytics</h1>
          <p>Hospital-wide operational overview</p>
        </div>
      </div>

      {error && <div className="banner-danger">{error}</div>}

      <div className="stats-grid">
        {summaryCards.map((s) => (
          <div key={s.label} className="card stat-card">
            <p className="muted">{s.label}</p>
            <p className={`stat-value stat-${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="detail-grid">
        <Card title="Revenue by invoice status">
          {revenueByStatusArr.length ? (
            revenueByStatusArr
              .sort((a, b) => b.amount - a.amount)
              .map((r) => (
                <Bar key={r.status} label={r.status} count={Number(r.amount)} total={maxRevenue} tone={badgeTone(r.status)} />
              ))
          ) : (
            <p className="muted">No invoice data.</p>
          )}
        </Card>

        <Card title="Appointments by status">
          {apptByStatusArr.length ? (
            apptByStatusArr
              .sort((a, b) => b.count - a.count)
              .map((r) => (
                <Bar key={r.status} label={r.status} count={r.count} total={maxAppt} tone={badgeTone(r.status)} />
              ))
          ) : (
            <p className="muted">No appointment data.</p>
          )}
        </Card>

        <Card title="Admit by status">
          {admByStatusArr.length ? (
            admByStatusArr
              .sort((a, b) => b.count - a.count)
              .map((r) => (
                <Bar key={r.status} label={r.status} count={r.count} total={maxAdm} tone={badgeTone(r.status)} />
              ))
          ) : (
            <p className="muted">No admit data.</p>
          )}
        </Card>

        <Card title="Laboratory orders by status">
          {labByStatusArr.length ? (
            labByStatusArr
              .sort((a, b) => b.count - a.count)
              .map((r) => (
                <Bar key={r.status} label={r.status} count={r.count} total={maxLab} tone={badgeTone(r.status)} />
              ))
          ) : (
            <p className="muted">No lab data.</p>
          )}
        </Card>
      </div>

      <div className="detail-grid">
        <Card title="Doctor workload (appointments)">
          {doctorWorkloadArr.length ? (
            doctorWorkloadArr.map((d) => (
              <Bar key={d.doctorId} label={d.name} count={d.count} total={maxWorkload} tone="blue" />
            ))
          ) : (
            <p className="muted">No appointment data.</p>
          )}
        </Card>

        <Card title="Quick access">
          <div className="link-grid" style={{ gridTemplateColumns: '1fr' }}>
            <button className="card link-card" onClick={() => router.push('/billing')}>Open Billing</button>
            <button className="card link-card" onClick={() => router.push('/appointments')}>Open Appointments</button>
            <button className="card link-card" onClick={() => router.push('/admissions')}>Open Admit</button>
            <button className="card link-card" onClick={() => router.push('/laboratory')}>Open Laboratory</button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
