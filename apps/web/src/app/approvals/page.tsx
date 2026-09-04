'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, unwrap } from '@/lib/api';
import { formatDate } from '@/lib/hooks';

interface ApprovalAction {
  path: string;
  method: 'PATCH' | 'POST';
}

interface ApprovalItem {
  id: string;
  type: string;
  endpoint: string;
  patient: string;
  requestedBy: string;
  date: string;
  status: string;
  actionFor: (id: string, status: 'APPROVED' | 'REJECTED') => ApprovalAction | null;
}

interface ApprovalSource {
  type: string;
  listPath: string;
  actionFor: (id: string, status: 'APPROVED' | 'REJECTED') => ApprovalAction | null;
}

const SOURCES: ApprovalSource[] = [
  {
    type: 'Lab Order',
    listPath: '/lab/orders',
    actionFor: (id) => ({ path: `/lab/orders/${id}/status`, method: 'PATCH' }),
  },
  {
    type: 'Radiology Order',
    listPath: '/radiology/orders',
    actionFor: (id) => ({ path: `/radiology/orders/${id}/status`, method: 'PATCH' }),
  },
  {
    type: 'Prescription',
    listPath: '/encounters/prescriptions',
    actionFor: (id, status) =>
      status === 'APPROVED' ? { path: `/encounters/prescriptions/${id}/approve`, method: 'PATCH' } : null,
  },
  {
    type: 'Discharge Request',
    listPath: '/admissions',
    actionFor: (id, status) =>
      status === 'APPROVED' ? { path: `/admissions/${id}/discharge`, method: 'POST' } : null,
  },
];

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

const TABS: { key: Tab; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

const STATUS_TONES: Record<string, string> = {
  PENDING: 'badge-yellow',
  APPROVED: 'badge-green',
  REJECTED: 'badge-red',
  COMPLETED: 'badge-blue',
};

function personName(p: any): string {
  if (!p) return '—';
  if (p.user) return [p.user.firstName, p.user.lastName].filter(Boolean).join(' ') || '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || '—';
}

function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && v !== '') return v;
  }
  return null;
}

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('PENDING');
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(SOURCES.map((s) => api(`${s.listPath}?limit=50`)));
      const rows: ApprovalItem[] = [];
      results.forEach((res, i) => {
        if (res.status !== 'fulfilled') return;
        const data = unwrap(res.value);
        const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.items) ? data.items : [];
        list.forEach((r: any) => {
          if (!r?.id) return;
          rows.push({
            id: r.id,
            type: SOURCES[i].type,
            endpoint: SOURCES[i].listPath,
            patient: r.patient ? personName(r.patient) : r.admission?.patient ? personName(r.admission.patient) : r.patientId || '—',
            requestedBy: personName(pick(r, ['doctor', 'prescribedBy', 'requestedBy']) || r.doctor || r.encounter?.doctor),
            date: r.createdAt || r.orderedAt || r.prescribedAt || r.admittedAt || r.updatedAt || '',
            status: String(pick(r, ['status', 'approvalStatus', 'dischargeStatus']) ?? 'PENDING').toUpperCase(),
            actionFor: SOURCES[i].actionFor,
          });
        });
      });
      rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load approvals');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = new Date().toDateString();

  const pendingCount = items.filter((i) => i.status === 'PENDING').length;
  const approvedToday = items.filter((i) => i.status === 'APPROVED' && new Date(i.date).toDateString() === today).length;
  const rejectedToday = items.filter((i) => i.status === 'REJECTED' && new Date(i.date).toDateString() === today).length;

  const filtered = useMemo(() => {
    let rows = items;
    if (tab !== 'ALL') rows = rows.filter((i) => i.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((i) => i.patient.toLowerCase().includes(q) || i.type.toLowerCase().includes(q));
    }
    return rows;
  }, [items, tab, search]);

  const decide = async (item: ApprovalItem, status: 'APPROVED' | 'REJECTED') => {
    if (busyId) return;
    const action = item.actionFor(item.id, status);
    if (!action) return;
    const body: Record<string, unknown> = { status };
    if (status === 'REJECTED') {
      const reason = prompt('Rejection reason:');
      if (!reason) return;
      body.reason = reason;
    }
    setBusyId(item.id);
    try {
      await api(action.path, { method: action.method, body: JSON.stringify(body) });
      await load();
    } catch {}
    setBusyId(null);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Approvals</h1>
          <p className="page-subtitle">Review and approve clinical requests</p>
        </div>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Pending</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{pendingCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved Today</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{approvedToday}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rejected Today</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{rejectedToday}</div>
        </div>
      </div>

      {error && <div className="banner-danger">{error}</div>}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input
          className="input search-input"
          placeholder="Search by patient name or type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading approvals…</div>
      ) : !filtered.length ? (
        <div className="empty">No approval items found.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Patient</th>
                <th>Requested By</th>
                <th>Date</th>
                <th>Status</th>
                <th style={{ width: 1 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={`${item.endpoint}-${item.id}`}>
                  <td><strong>{item.type}</strong></td>
                  <td>{item.patient}</td>
                  <td>{item.requestedBy}</td>
                  <td>{item.date ? formatDate(item.date) : '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_TONES[item.status] || 'badge-gray'}`}>
                      {item.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    {item.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-sm"
                          style={{ background: 'var(--success)' }}
                          disabled={busyId === item.id}
                          onClick={() => decide(item, 'APPROVED')}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={busyId === item.id}
                          onClick={() => decide(item, 'REJECTED')}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}