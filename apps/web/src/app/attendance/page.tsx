'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/hooks';

interface Row {
  id: string | null;
  userId: string;
  employeeCode: string | null;
  name: string;
  email: string;
  role: string;
  department: string | null;
  designation: string | null;
  status: string;
  clockIn: string | null;
  clockOut: string | null;
  hours: number | null;
  shift: string | null;
}

interface HistoryRow {
  id: string;
  date: string;
  status: string;
  clockIn: string;
  clockOut: string | null;
  hours: number | null;
}

const STATUS_TONE: Record<string, string> = {
  PRESENT: 'green',
  CLOCKED_OUT: 'blue',
  ABSENT: 'red',
  NOT_CLOCKED_IN: 'gray',
};

const ROLES = [
  'DOCTOR', 'NURSE', 'WARD_INCHARGE', 'RECEPTIONIST', 'RECEPTION_SUPERVISOR',
  'PHARMACIST', 'LAB_TECHNICIAN', 'PATHOLOGIST', 'RADIOLOGIST', 'RADIOLOGY_TECHNICIAN',
  'FINANCE_MANAGER', 'HR_MANAGER', 'INVENTORY_MANAGER', 'STORE_KEEPER', 'PURCHASE_OFFICER',
  'OT_TECHNICIAN', 'OT_NURSE', 'ANESTHETIST', 'ICU_STAFF', 'EMERGENCY_STAFF',
  'AMBULANCE_STAFF', 'BLOOD_BANK_STAFF', 'BIOMEDICAL_ENGINEER', 'IT_ADMIN', 'QUALITY_MANAGER',
];

function timeOf(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function hoursLabel(h: number | null): string {
  if (h == null) return '—';
  const total = Math.round(h * 3600);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  return `${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m`;
}

function dayValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, notClockedIn: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [historyFor, setHistoryFor] = useState<Row | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (role) params.set('role', role);
      if (departmentId) params.set('departmentId', departmentId);
      if (search) params.set('search', search);
      const r = await api(`/hr/attendance/admin/roster?${params.toString()}`);
      const rosterList = r?.data ?? r?.roster ?? [];
      setRows(Array.isArray(rosterList) ? rosterList : Array.isArray(rosterList?.rows) ? rosterList.rows : Array.isArray(rosterList?.roster) ? rosterList.roster : []);
      setSummary(r?.summary ?? { present: 0, absent: 0, notClockedIn: 0 });
    } catch (e: any) {
      setError(e?.message || 'Could not load attendance');
    }
    setLoading(false);
  }, [role, departmentId, search]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    api('/departments?limit=200')
      .then((r) => setDepartments((Array.isArray(r?.data?.data) ? r.data.data : Array.isArray(r?.data) ? r.data : []).map((d: any) => ({ id: d.id, name: d.name }))))
      .catch(() => {});
  }, []);

  async function loadHistory(row: Row) {
    setHistoryFor(row);
    setHistoryLoading(true);
    try {
      const r = await api(`/hr/attendance/admin/${row.userId}`);
      const hist = r?.data ?? r?.history ?? r?.records ?? [];
      setHistory(Array.isArray(hist) ? hist : Array.isArray(hist?.data) ? hist.data : Array.isArray(hist?.results) ? hist.results : []);
    } catch {
      setHistory([]);
    }
    setHistoryLoading(false);
  }

  // Roster is a live view: poll every 30s so admin sees clock-ins without a manual refresh.
  useEffect(() => {
    const iv = window.setInterval(() => {
      if (!historyFor && !loading) loadRoster();
    }, 30000);
    return () => window.clearInterval(iv);
  }, [loadRoster, historyFor, loading]);

  const csvHref = useMemo(() => {
    const header = ['Name', 'Employee Code', 'Role', 'Department', 'Status', 'Clock In', 'Clock Out', 'Hours', 'Shift'];
    const lines = rows.map((r) =>
      [r.name, r.employeeCode ?? '', r.role, r.department ?? '', r.status, r.clockIn ?? '', r.clockOut ?? '', r.hours ?? '', r.shift ?? '']
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    return URL.createObjectURL(blob);
  }, [rows]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Attendance</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
            Staff attendance monitoring for today
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-secondary" href={csvHref} download="attendance-today.csv">
            Export CSV
          </a>
          <button className="btn btn-secondary" onClick={loadRoster} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="banner-danger">{error}</div>}

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Present today</div>
          <div className="stat-value stat-green">{summary.present}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Absent today</div>
          <div className="stat-value stat-red">{summary.absent}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Not clocked in</div>
          <div className="stat-value stat-blue">{summary.notClockedIn}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label className="field-label" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ minWidth: 150 }}>
              <option value="">All statuses</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="NOT_CLOCKED_IN">Not clocked in</option>
            </select>
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)} style={{ minWidth: 170 }}>
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Department</label>
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ minWidth: 170 }}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="field-label" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Search</label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchInput);
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                className="input"
                placeholder="Name, email or employee code"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary">Search</button>
            </form>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Department</th>
              <th>Shift</th>
              <th>Status</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Worked</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={9} className="empty">Loading attendance…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="empty">No staff found for the current filters</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.userId}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {[r.employeeCode, r.email].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </td>
                  <td>{r.role.replace(/_/g, ' ')}</td>
                  <td>{r.department || '—'}</td>
                  <td>{r.shift || '—'}</td>
                  <td>
                    <span className={`badge badge-${STATUS_TONE[r.status] || 'gray'}`}>
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>{timeOf(r.clockIn)}</td>
                  <td>{timeOf(r.clockOut)}</td>
                  <td>{hoursLabel(r.hours)}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => loadHistory(r)}>
                      History
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {historyFor && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20,
          }}
          onClick={() => setHistoryFor(null)}
        >
          <div
            className="card"
            style={{ width: 'min(720px, 100%)', maxHeight: '80vh', overflow: 'auto', padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row-between" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>{historyFor.name}</h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                  {historyFor.role.replace(/_/g, ' ')}{historyFor.department ? ` · ${historyFor.department}` : ''}
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setHistoryFor(null)}>Close</button>
            </div>
            {historyLoading ? (
              <div className="empty">Loading history…</div>
            ) : history.length === 0 ? (
              <div className="empty">No attendance records yet</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Worked</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{formatDate(h.date)}</td>
                      <td>
                        <span className={`badge badge-${STATUS_TONE[h.status] || 'gray'}`}>
                          {h.status}
                        </span>
                      </td>
                      <td>{timeOf(h.clockIn)}</td>
                      <td>{timeOf(h.clockOut)}</td>
                      <td>{hoursLabel(h.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
