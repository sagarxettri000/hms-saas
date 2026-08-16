'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { badgeTone, formatDateTime, formatMoney, pick } from '@/lib/hooks';
import type { Row } from '@/lib/types';

interface Section {
  title: string;
  rows: Row[];
  columns: { key: string; label: string; render?: (r: Row) => any }[];
}

function SectionTable({ title, rows, columns }: Section) {
  if (!rows.length) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 className="card-title">{title}</h3>
      <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? i}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(r) : pick(r, c.key) ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DoctorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [doctor, setDoctor] = useState<Row | null>(null);
  const [dashboard, setDashboard] = useState<Row | null>(null);
  const [schedules, setSchedules] = useState<Row[]>([]);
  const [appointments, setAppointments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState('overview');

  useEffect(() => {
    if (!id) return;
    let activeFlag = true;
    Promise.all([
      api(`/doctors/${id}`),
      api(`/doctors/${id}/dashboard`).catch(() => null),
      api(`/doctors/schedules`),
      api(`/appointments?doctorId=${id}&limit=50`),
    ])
      .then(([doc, dash, sched, appts]) => {
        if (!activeFlag) return;
        const list = (r: any) =>
          Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.data) ? r.data.data : [];
        setDoctor(doc.data ?? doc);
        setDashboard(dash ? (dash.data ?? dash) : null);
        const allSched = list(sched);
        setSchedules(
          Array.isArray(allSched)
            ? allSched.filter((s: any) => s.doctorId === id || s.doctorProfileId === id)
            : [],
        );
        setAppointments(list(appts));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load doctor'))
      .finally(() => activeFlag && setLoading(false));
    return () => {
      activeFlag = false;
    };
  }, [id]);

  if (!doctor && loading) return <AppShell><div className="loading">Loading doctor profile…</div></AppShell>;
  if (error && !doctor) return <AppShell><div className="banner-danger">{error}</div></AppShell>;
  if (!doctor) return <AppShell><div className="empty">Doctor not found.</div></AppShell>;

  const fullName = [doctor.firstName, doctor.lastName].filter(Boolean).join(' ');
  const d = dashboard as any;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'appointments', label: `Appointments (${appointments.length})` },
    { key: 'schedules', label: `Schedules (${schedules.length})` },
  ];

  const apptCols = [
    { key: 'appointmentDate', label: 'Date', render: (r: Row) => formatDateTime(r.appointmentDate) },
    { key: 'startTime', label: 'Time', render: (r: Row) => r.startTime || '—' },
    { key: 'patient', label: 'Patient', render: (r: Row) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId },
    { key: 'type', label: 'Type', render: (r: Row) => <span className={`badge badge-${badgeTone(r.type)}`}>{r.type}</span> },
    { key: 'status', label: 'Status', render: (r: Row) => <span className={`badge badge-${badgeTone(r.status)}`}>{r.status}</span> },
  ];

  const schedCols = [
    { key: 'dayOfWeek', label: 'Day' },
    { key: 'startTime', label: 'From' },
    { key: 'endTime', label: 'To' },
    { key: 'status', label: 'Status', render: (r: Row) => <span className={`badge badge-${badgeTone(r.status)}`}>{r.status}</span> },
  ];

  const stats = d
    ? [
        { label: "Today's appointments", value: d.stats?.todayAppointments ?? 0 },
        { label: 'Upcoming', value: Array.isArray(d.stats?.upcomingAppointments) ? d.stats.upcomingAppointments.length : 0 },
        { label: 'Pending lab orders', value: d.stats?.pendingLabOrders ?? 0 },
        { label: 'Active IPD patients', value: d.stats?.activeIPDPatients ?? 0 },
        { label: 'Follow-ups', value: d.stats?.followUps ?? 0 },
        { label: 'Today revenue', value: formatMoney(d.stats?.revenue ?? 0) },
      ]
    : [];

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>
            ← Back
          </button>
          <h1>{fullName}</h1>
          <p>
            {doctor.specialization || '—'} · {doctor.department?.name || '—'} ·{' '}
            <span className={`badge badge-${badgeTone(doctor.status)}`}>{doctor.status || 'ACTIVE'}</span>
          </p>
        </div>
      </div>

      {stats.length ? (
        <div className="stats-grid">
          {stats.map((s) => (
            <div key={s.label} className="card stat-card">
              <p className="muted">{s.label}</p>
              <p className="stat-value stat-blue">{s.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${t.key === active ? 'active' : ''}`} onClick={() => setActive(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {active === 'overview' && (
        <div className="detail-grid">
          <div className="card">
            <h3 className="card-title">Profile</h3>
            <dl className="kv">
              <dt>Qualification</dt><dd>{doctor.qualification || '—'}</dd>
              <dt>License no.</dt><dd><span className="mono">{doctor.licenseNumber || '—'}</span></dd>
              <dt>Experience</dt><dd>{doctor.experienceYears ? `${doctor.experienceYears} years` : '—'}</dd>
              <dt>Consultation fee</dt><dd>{formatMoney(doctor.consultationFee)}</dd>
              <dt>Email</dt><dd>{doctor.email || '—'}</dd>
              <dt>Phone</dt><dd>{doctor.phone || '—'}</dd>
            </dl>
          </div>
          <div className="card">
            <h3 className="card-title">Bio</h3>
            <p style={{ margin: 0 }}>{doctor.bio || 'No bio available.'}</p>
          </div>
        </div>
      )}

      {active === 'appointments' && <SectionTable title="Appointments" rows={appointments} columns={apptCols} />}
      {active === 'schedules' && <SectionTable title="Weekly schedules" rows={schedules} columns={schedCols} />}
      {active !== 'overview' && !(active === 'appointments' ? appointments.length : schedules.length) && (
        <div className="empty">No records in this section.</div>
      )}
    </AppShell>
  );
}
