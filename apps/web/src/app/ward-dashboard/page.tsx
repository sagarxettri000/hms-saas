'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/hooks';
import AppShell from '@/components/AppShell';

const DISCHARGE_READY_KEY = 'discharge_ready';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'transfers', label: 'Transfer Queue' },
  { key: 'discharge', label: 'Discharge Tracker' },
  { key: 'grid', label: 'Bed Status Grid' },
];

const BED_COLORS: Record<string, string> = {
  AVAILABLE: '#16a34a',
  OCCUPIED: '#dc2626',
  MAINTENANCE: '#d97706',
  RESERVED: '#64748b',
  CLEANING: '#0891b2',
  BLOCKED: '#64748b',
};

function toList(res: any): any[] {
  const d = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(d)) return d;
  return d?.data ?? [];
}

function daysSince(value: any): number {
  if (!value) return 0;
  const ms = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function occupancyTone(rate: number) {
  if (rate >= 90) return 'badge-red';
  if (rate >= 70) return 'badge-yellow';
  return 'badge-green';
}

function occupancyLabel(rate: number) {
  if (rate >= 90) return 'Full';
  if (rate >= 70) return 'Busy';
  return 'Open';
}

function OccupancyBar({ occupied, total }: { occupied: number; total: number }) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#16a34a';
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function TransferModal({ record, onClose, onDone }: { record: any; onClose: () => void; onDone: () => void }) {
  const [toBedId, setToBedId] = useState('');
  const [reason, setReason] = useState('');
  const [availableBeds, setAvailableBeds] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/bed-management/beds?status=AVAILABLE&limit=200')
      .then((res: any) => setAvailableBeds(toList(res)))
      .catch(() => setAvailableBeds([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!toBedId || !record.admissionId) return;
    setSaving(true);
    setError('');
    try {
      await api('/bed-management/transfer', {
        method: 'POST',
        body: JSON.stringify({ admissionId: record.admissionId, toBedId, reason }),
      });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Transfer from {record.bedNumber}</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">To Bed *</label>
            <select className="input" value={toBedId} onChange={(e) => setToBedId(e.target.value)} required>
              <option value="">-- Select bed --</option>
              {availableBeds.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.bedNumber} - {b.ward?.name || 'No Ward'} ({b.bedType})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Reason</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Transfer reason (optional)" />
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={!toBedId || saving}>
              {saving ? 'Transferring...' : 'Transfer Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TransferQueue({ onChanged }: { onChanged: () => void }) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    api('/bed-management/beds?status=OCCUPIED&limit=200')
      .then((res: any) => {
        const beds = toList(res);
        setRecords(
          beds
            .filter((b: any) => b.allocations?.[0]?.admission)
            .map((b: any) => {
              const alloc = b.allocations[0];
              return {
                id: b.id,
                bedId: b.id,
                bedNumber: b.bedNumber,
                wardName: b.ward?.name || '—',
                bedType: b.bedType,
                admissionId: alloc.admissionId || alloc.admission?.id,
                allocatedAt: alloc.allocatedAt,
                patient: alloc.admission?.patient,
              };
            })
        );
      })
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row-between">
          <span className="card-title">Patients currently occupying beds</span>
          <button className="btn btn-sm btn-secondary" onClick={load}>Refresh</button>
        </div>
      </div>
      {loading ? (
        <div className="loading">Loading transfer queue...</div>
      ) : records.length === 0 ? (
        <div className="empty">No patients waiting on bed transfers.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Bed</th>
                <th>Ward</th>
                <th>Patient</th>
                <th>MRN</th>
                <th>Bed Type</th>
                <th>In Bed Since</th>
                <th>Days</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.bedNumber}</td>
                  <td>{r.wardName}</td>
                  <td>{r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : '—'}</td>
                  <td className="mono">{r.patient?.mrn || '—'}</td>
                  <td>{r.bedType}</td>
                  <td>{formatDateTime(r.allocatedAt)}</td>
                  <td>{daysSince(r.allocatedAt)}</td>
                  <td>
                    <button className="btn btn-sm btn-primary" onClick={() => setTarget(r)}>Transfer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target && (
        <TransferModal
          record={target}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); load(); onChanged(); }}
        />
      )}
    </>
  );
}

function DischargeTracker() {
  const [admissions, setAdmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [readyIds, setReadyIds] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    api('/admissions?limit=100')
      .then((res: any) => setAdmissions(toList(res)))
      .catch(() => setAdmissions([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    try {
      const raw = localStorage.getItem(DISCHARGE_READY_KEY);
      if (raw) setReadyIds(JSON.parse(raw));
    } catch {
      setReadyIds([]);
    }
  }, [load]);

  function isReady(id: string) {
    return readyIds.includes(id);
  }

  function toggleReady(id: string) {
    const next = isReady(id) ? readyIds.filter((x) => x !== id) : [...readyIds, id];
    setReadyIds(next);
    try {
      localStorage.setItem(DISCHARGE_READY_KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <span className="note">{readyIds.length} patient(s) marked discharge ready</span>
        <button className="btn btn-sm btn-secondary" onClick={load}>Refresh</button>
      </div>
      {loading ? (
        <div className="loading">Loading admissions...</div>
      ) : admissions.length === 0 ? (
        <div className="empty">No admissions found.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Bed</th>
                <th>Ward</th>
                <th>Admission Date</th>
                <th>Days Admitted</th>
                <th>Status</th>
                <th>Discharge Ready?</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {admissions.map((a: any) => {
                const bed = a.bedAllocations?.[0]?.bed;
                const ready = isReady(a.id);
                return (
                  <tr key={a.id} style={ready ? { background: '#ecfdf5' } : undefined}>
                    <td style={{ fontWeight: 600 }}>
                      {a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : '—'}
                      {a.patient?.mrn && <span className="mono" style={{ marginLeft: 6, fontSize: 12 }}>{a.patient.mrn}</span>}
                    </td>
                    <td>{bed?.bedNumber || a.bedAllocations?.[0]?.bed?.bedNumber || '—'}</td>
                    <td>{bed?.ward?.name || '—'}</td>
                    <td>{formatDate(a.admissionDate)}</td>
                    <td>{daysSince(a.admissionDate)}</td>
                    <td>
                      <span className={`badge ${a.status === 'ADMITTED' ? 'badge-blue' : a.status === 'DISCHARGED' ? 'badge-green' : 'badge-yellow'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${ready ? 'badge-green' : 'badge-gray'}`}>
                        {ready ? 'READY' : 'PENDING'}
                      </span>
                    </td>
                    <td>
                      {a.status !== 'DISCHARGED' && (
                        <button
                          className={`btn btn-sm ${ready ? 'btn-secondary' : 'btn-primary'}`}
                          onClick={() => toggleReady(a.id)}
                        >
                          {ready ? 'Undo Ready' : 'Mark Discharge Ready'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </>
  );
}

function BedStatusGrid({ beds, loading }: { beds: any[]; loading: boolean }) {
  const wardGroups = beds.reduce<Record<string, { name: string; beds: any[] }>>((acc, b) => {
    const key = b.ward?.id || 'unassigned';
    if (!acc[key]) acc[key] = { name: b.ward?.name || 'Unassigned', beds: [] };
    acc[key].beds.push(b);
    return acc;
  }, {});

  const groups = Object.values(wardGroups).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
          {[
            { label: 'Available', color: BED_COLORS.AVAILABLE },
            { label: 'Occupied', color: BED_COLORS.OCCUPIED },
            { label: 'Maintenance', color: BED_COLORS.MAINTENANCE },
            { label: 'Other (Reserved / Cleaning / Blocked)', color: BED_COLORS.RESERVED },
          ].map((l) => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: l.color, display: 'inline-block' }} />
              <span>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="loading">Loading beds...</div>
      ) : groups.length === 0 ? (
        <div className="empty">No beds found.</div>
      ) : (
        groups.map((g) => {
          const occupied = g.beds.filter((b) => b.status === 'OCCUPIED').length;
          return (
            <div key={g.name} className="card" style={{ marginBottom: 20 }}>
              <div className="row-between" style={{ marginBottom: 12 }}>
                <span className="card-title">{g.name}</span>
                <span className="note">{occupied}/{g.beds.length} occupied</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {g.beds.map((b) => {
                  const color = BED_COLORS[b.status] || BED_COLORS.RESERVED;
                  const patient = b.allocations?.[0]?.admission?.patient;
                  return (
                    <div
                      key={b.id}
                      title={`${b.bedNumber} - ${b.status}`}
                      style={{
                        border: `2px solid ${color}`,
                        background: `${color}18`,
                        borderRadius: 8,
                        padding: '10px 12px',
                        minHeight: 72,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{b.bedNumber}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{b.bedType}</div>
                      <div style={{ fontSize: 12, marginTop: 4, color: color, fontWeight: 600 }}>
                        {patient ? `${patient.firstName} ${patient.lastName}` : b.status === 'AVAILABLE' ? 'Free' : b.status}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

export default function WardDashboardPage() {
  const [tab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState<any>(null);
  const [loadingDash, setLoadingDash] = useState(true);
  const [beds, setBeds] = useState<any[]>([]);
  const [loadingBeds, setLoadingBeds] = useState(true);

  const loadDashboard = useCallback(() => {
    setLoadingDash(true);
    api('/bed-management/dashboard')
      .then((res: any) => setDashboard(res?.data?.data ?? res?.data ?? res))
      .catch(() => {})
      .finally(() => setLoadingDash(false));
  }, []);

  const loadBeds = useCallback(() => {
    setLoadingBeds(true);
    api('/bed-management/beds?limit=200')
      .then((res: any) => setBeds(toList(res)))
      .catch(() => setBeds([]))
      .finally(() => setLoadingBeds(false));
  }, []);

  useEffect(() => {
    loadDashboard();
    loadBeds();
  }, [loadDashboard, loadBeds]);

  function refreshAll() {
    loadDashboard();
    loadBeds();
  }

  const summary = dashboard?.summary || {};
  const byWard = dashboard?.byWard || [];

  const wardRows = (() => {
    const source = byWard.length > 0
      ? byWard.map((w: any) => ({ ...w }))
      : (() => {
          const map: Record<string, any> = {};
          beds.forEach((b) => {
            const key = b.ward?.id || 'unassigned';
            if (!map[key]) map[key] = { id: key, name: b.ward?.name || 'Unassigned', totalBeds: 0, occupied: 0, available: 0 };
            map[key].totalBeds += 1;
            if (b.status === 'OCCUPIED') map[key].occupied += 1;
            if (b.status === 'AVAILABLE') map[key].available += 1;
          });
          return Object.values(map);
        })();
    return source.map((w: any) => {
      const wardBeds = beds.filter((b) => (b.ward?.id || 'unassigned') === (w.id || 'unassigned'));
      const rates = wardBeds.map((b) => Number(b.ratePerDay) || 0).filter((r) => r > 0);
      const avgRate = rates.length > 0 ? Math.round(rates.reduce((a, c) => a + c, 0) / rates.length) : 0;
      const total = Number(w.totalBeds) || wardBeds.length;
      const occupied = Number(w.occupied) || 0;
      const available = w.available !== undefined ? Number(w.available) : Math.max(0, total - occupied);
      const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
      return { ...w, total, occupied, available, avgRate, rate };
    });
  })();

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ward Dashboard</h1>
          <p className="page-subtitle">Live ward occupancy, transfers, discharges, and bed status</p>
        </div>
        <button className="btn btn-secondary" onClick={refreshAll}>Refresh</button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {loadingDash ? (
            <div className="loading">Loading dashboard...</div>
          ) : (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-label">Total Beds</div>
                  <div className="stat-value stat-blue">{summary.totalBeds || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Occupied</div>
                  <div className="stat-value stat-red">{summary.occupied || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Available</div>
                  <div className="stat-value stat-green">{summary.available || 0}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Maintenance</div>
                  <div className="stat-value stat-purple">{summary.maintenance || 0}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div className="card">
                  <div className="card-title">Occupancy per Ward</div>
                  {wardRows.length === 0 ? (
                    <div className="empty">No ward data.</div>
                  ) : (
                    wardRows.map((w: any) => (
                      <div key={w.id} className="bar-row">
                        <div className="bar-label">
                          <span>{w.name}</span>
                          <span className="bar-count">{w.occupied}/{w.total} ({w.rate}%)</span>
                        </div>
                        <OccupancyBar occupied={w.occupied} total={w.total} />
                      </div>
                    ))
                  )}
                </div>

                <div className="card">
                  <div className="card-title">Ward-wise Breakdown</div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Ward Name</th>
                          <th>Total Beds</th>
                          <th>Occupied</th>
                          <th>Available</th>
                          <th>Rate/Day</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wardRows.map((w: any) => (
                          <tr key={w.id}>
                            <td style={{ fontWeight: 600 }}>{w.name}</td>
                            <td>{w.total}</td>
                            <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{w.occupied}</td>
                            <td style={{ color: 'var(--success)', fontWeight: 600 }}>{w.available}</td>
                            <td>{w.avgRate > 0 ? `Rs. ${w.avgRate.toLocaleString()}` : '—'}</td>
                            <td><span className={`badge ${occupancyTone(w.rate)}`}>{occupancyLabel(w.rate)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'transfers' && <TransferQueue onChanged={refreshAll} />}

      {tab === 'discharge' && <DischargeTracker />}

      {tab === 'grid' && <BedStatusGrid beds={beds} loading={loadingBeds} />}
    </AppShell>
  );
}
