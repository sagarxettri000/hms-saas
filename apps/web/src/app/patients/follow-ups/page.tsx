'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import AppShell from '@/components/AppShell';
import { badgeTone, formatDate } from '@/lib/hooks';
import type { ApiResponse, Row } from '@/lib/types';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'today', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
];

export default function FollowUpsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const patientName = (r: Row) =>
    [r.patient?.firstName, r.patient?.middleName, r.patient?.lastName]
      .filter(Boolean)
      .join(' ') || '—';

  const doctorName = (r: Row) =>
    [r.doctor?.user?.firstName, r.doctor?.user?.lastName].filter(Boolean).join(' ') ||
    [r.doctor?.firstName, r.doctor?.lastName].filter(Boolean).join(' ') ||
    r.doctorId ||
    '—';

  function followupStatus(r: Row) {
    if (r.status === 'COMPLETED' || r.status === 'DISCHARGED' || r.status === 'CANCELLED') {
      return { label: r.status === 'CANCELLED' ? 'Cancelled' : 'Completed', tone: 'secondary' };
    }
    const raw = r.followUpDate ? new Date(r.followUpDate) : null;
    if (!raw || isNaN(raw.getTime())) return { label: 'Unscheduled', tone: 'secondary' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(raw);
    date.setHours(0, 0, 0, 0);
    const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return { label: `Overdue ${Math.abs(diff)}d`, tone: 'danger' };
    if (diff === 0) return { label: 'Due today', tone: 'warning' };
    return { label: `In ${diff}d`, tone: 'primary' };
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '200' });
      if (status) qs.set('status', status);
      if (search.trim()) qs.set('search', search.trim());
      const res: ApiResponse<any> = await api(`/encounters/follow-ups?${qs.toString()}`);
      const payload = res.data as any;
      setRows(Array.isArray(payload) ? payload : payload.data ?? []);
    } catch (err) {
      setRows([]);
      setFlash(err instanceof Error ? err.message : 'Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!search) return;
    const id = setTimeout(load, 350);
    return () => clearTimeout(id);
  }, [search, load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Follow-ups</h1>
          <p className="page-subtitle">All scheduled patient follow-ups</p>
        </div>
        <button className="btn btn-secondary" onClick={() => router.push('/patients')}>
          Back to patients
        </button>
      </div>

      <div className="tabs" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            className={`tab ${status === f.key ? 'active' : ''}`}
            onClick={() => setStatus(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {flash && <div className="alert alert-error">{flash}</div>}

      <div className="toolbar">
        <input
          className="input search-input"
          placeholder="Search patient name or MRN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : !rows.length ? (
        <div className="empty">No follow-ups found.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>MRN</th>
                <th>Follow-up</th>
                <th>Status</th>
                <th>Doctor</th>
                <th>Reason</th>
                <th>Notes</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = followupStatus(r);
                return (
                  <tr key={r.id} className="row-clickable" onClick={() => router.push(`/patients/${r.patient?.id}`)}>
                    <td>
                      <strong>{patientName(r)}</strong>
                    </td>
                    <td className="mono">{r.patient?.mrn || '—'}</td>
                    <td>
                      <strong>{formatDate(r.followUpDate)}</strong>
                    </td>
                    <td>
                      <span className={`badge badge-${s.tone}`}>{s.label}</span>
                    </td>
                    <td>{doctorName(r)}</td>
                    <td>{r.diagnosis || r.chiefComplaint || '—'}</td>
                    <td>{r.followUpNotes || '—'}</td>
                    <td>
                      <button className="btn btn-sm btn-ghost" onClick={() => router.push(`/patients/${r.patient?.id}`)}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
