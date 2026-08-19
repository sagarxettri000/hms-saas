'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useData, formatDateTime } from '@/lib/hooks';
import type { ApiResponse } from '@/lib/types';
import AppShell from '@/components/AppShell';

const BED_TYPES = [
  { value: 'GENERAL', label: 'General' },
  { value: 'SEMI_PRIVATE', label: 'Semi-Private' },
  { value: 'PRIVATE', label: 'Private' },
  { value: 'DELUXE', label: 'Deluxe' },
  { value: 'ICU', label: 'ICU' },
  { value: 'NICU', label: 'NICU' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'MATERNITY', label: 'Maternity' },
  { value: 'PEDIATRIC', label: 'Pediatric' },
  { value: 'ISOLATION', label: 'Isolation' },
  { value: 'SURGICAL', label: 'Surgical' },
];

const BED_STATUSES = [
  { value: 'AVAILABLE', label: 'Available', color: '#16a34a' },
  { value: 'OCCUPIED', label: 'Occupied', color: '#dc2626' },
  { value: 'RESERVED', label: 'Reserved', color: '#d97706' },
  { value: 'CLEANING', label: 'Cleaning', color: '#0891b2' },
  { value: 'MAINTENANCE', label: 'Maintenance', color: '#7c3aed' },
  { value: 'BLOCKED', label: 'Blocked', color: '#64748b' },
];

const MAINTENANCE_TYPES = ['Cleaning', 'Repair', 'Deep Clean', 'Painting', 'Equipment', 'Inspection', 'Other'];

function statusColor(status: string) {
  return BED_STATUSES.find((s) => s.value === status)?.color || '#64748b';
}

function statusBadge(status: string) {
  const tone =
    status === 'AVAILABLE' ? 'badge-green' :
    status === 'OCCUPIED' ? 'badge-red' :
    status === 'RESERVED' ? 'badge-yellow' :
    status === 'CLEANING' ? 'badge-cyan' :
    status === 'MAINTENANCE' ? 'badge-purple' :
    'badge-gray';
  return <span className={`badge ${tone}`}>{status}</span>;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const color = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function BedBox({ bed, onAllocate, onDeallocate, onTransfer, onStatusChange }: {
  bed: any;
  onAllocate: (bed: any) => void;
  onDeallocate: (bed: any) => void;
  onTransfer: (bed: any) => void;
  onStatusChange: (bed: any) => void;
}) {
  const allocation = bed.allocations?.[0];
  const patient = allocation?.admission?.patient;
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      style={{
        border: `2px solid ${statusColor(bed.status)}`,
        borderRadius: 10,
        padding: '12px 14px',
        background: 'var(--surface)',
        position: 'relative',
        transition: 'box-shadow 0.15s',
        boxShadow: showMenu ? '0 4px 16px rgba(0,0,0,0.12)' : 'none',
        cursor: 'default',
        minWidth: 160,
      }}
      onMouseLeave={() => setShowMenu(false)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{bed.bedNumber}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {bed.bedType} {bed.room ? `/ ${bed.room.name}` : ''}
          </div>
        </div>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: statusColor(bed.status),
            flexShrink: 0,
          }}
        />
      </div>

      {patient ? (
        <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--text-muted)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>
            {patient.firstName} {patient.lastName}
          </div>
          {patient.mrn && <span className="mono">{patient.mrn}</span>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {bed.status === 'AVAILABLE' ? 'Ready for use' :
           bed.status === 'CLEANING' ? 'Being cleaned' :
           bed.status === 'MAINTENANCE' ? 'Under maintenance' :
           bed.status === 'RESERVED' ? 'Reserved' :
           bed.status === 'BLOCKED' ? 'Blocked' : '—'}
        </div>
      )}

      {bed.status === 'AVAILABLE' ? (
        <button
          className="btn btn-sm"
          style={{ marginTop: 8, width: '100%' }}
          onClick={() => onAllocate(bed)}
        >
          Allocate
        </button>
      ) : bed.status === 'OCCUPIED' ? (
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <button className="btn btn-sm btn-secondary" style={{ flex: 1 }} onClick={() => onTransfer(bed)}>
            Transfer
          </button>
          <button className="btn btn-sm btn-danger" style={{ flex: 1 }} onClick={() => onDeallocate(bed)}>
            Free
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-sm btn-ghost"
            style={{ marginTop: 8, width: '100%' }}
            onClick={() => setShowMenu(!showMenu)}
          >
            Actions
          </button>
          {showMenu && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginBottom: 4,
            }}>
              <button
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
                  cursor: 'pointer', fontSize: 13,
                }}
                onClick={() => { setShowMenu(false); onStatusChange(bed); }}
              >
                Set Available
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AllocateModal({ bed, onClose, onDone }: { bed: any; onClose: () => void; onDone: () => void }) {
  const [admissionId, setAdmissionId] = useState('');
  const [admissions, setAdmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api('/admissions?status=ADMITTED&limit=100')
      .then((res: any) => {
        const list = res?.data?.data ?? res?.data ?? [];
        setAdmissions(Array.isArray(list) ? list : list.data ?? []);
      })
      .catch(() => setAdmissions([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleAllocate() {
    if (!admissionId) return;
    setSaving(true);
    setError('');
    try {
      await api('/bed-management/allocate', {
        method: 'POST',
        body: JSON.stringify({ bedId: bed.id, admissionId }),
      });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Allocation failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Allocate Bed {bed.bedNumber}</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label className="label">Select Admission *</label>
          {loading ? (
            <div className="loading">Loading admissions...</div>
          ) : (
            <select className="input" value={admissionId} onChange={(e) => setAdmissionId(e.target.value)}>
              <option value="">-- Select admission --</option>
              {admissions.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.patient?.firstName} {a.patient?.lastName} ({a.patient?.mrn || 'N/A'}) - {a.admissionNumber || a.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={handleAllocate} disabled={!admissionId || saving}>
            {saving ? 'Allocating...' : 'Allocate Bed'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferModal({ bed, onClose, onDone }: { bed: any; onClose: () => void; onDone: () => void }) {
  const [toBedId, setToBedId] = useState('');
  const [reason, setReason] = useState('');
  const [availableBeds, setAvailableBeds] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const allocation = bed.allocations?.[0];
  const admissionId = allocation?.admissionId || '';

  useEffect(() => {
    api('/bed-management/beds?status=AVAILABLE&limit=100')
      .then((res: any) => {
        const data = res?.data?.data ?? res?.data ?? [];
        setAvailableBeds(Array.isArray(data) ? data : data.data ?? []);
      })
      .catch(() => setAvailableBeds([]));
  }, []);

  async function handleTransfer() {
    if (!toBedId || !admissionId) return;
    setSaving(true);
    setError('');
    try {
      await api('/bed-management/transfer', {
        method: 'POST',
        body: JSON.stringify({ toBedId, admissionId, reason }),
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
          <h3 className="modal-title">Transfer from Bed {bed.bedNumber}</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="label">To Bed *</label>
            <select className="input" value={toBedId} onChange={(e) => setToBedId(e.target.value)}>
              <option value="">-- Select bed --</option>
              {availableBeds
                .filter((b: any) => b.id !== bed.id)
                .map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.bedNumber} - {b.ward?.name || 'No Ward'} ({b.bedType})
                  </option>
                ))}
            </select>
          </div>
          <div className="field field-full">
            <label className="label">Reason</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Transfer reason (optional)" />
          </div>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={handleTransfer} disabled={!toBedId || saving}>
            {saving ? 'Transferring...' : 'Transfer Patient'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeallocateModal({ bed, onClose, onDone }: { bed: any; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleDeallocate() {
    setSaving(true);
    setError('');
    try {
      await api(`/bed-management/deallocate/${bed.id}`, { method: 'POST' });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  const patient = bed.allocations?.[0]?.admission?.patient;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Deallocate Bed {bed.bedNumber}</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <p style={{ fontSize: 14, marginBottom: 12 }}>
          Release this bed from patient {patient ? `${patient.firstName} ${patient.lastName}` : 'N/A'}?
          The bed status will be set to <strong>CLEANING</strong>.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={handleDeallocate} disabled={saving}>
            {saving ? 'Processing...' : 'Deallocate Bed'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateBedModal({ onClose, onDone, wards, rooms }: { onClose: () => void; onDone: () => void; wards: any[]; rooms: any[] }) {
  const [values, setValues] = useState({ bedNumber: '', wardId: '', roomId: '', bedType: 'GENERAL', ratePerDay: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredRooms = values.wardId ? rooms.filter((r: any) => r.wardId === values.wardId) : rooms;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.bedNumber) return;
    setSaving(true);
    setError('');
    try {
      await api('/bed-management/beds', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          wardId: values.wardId || undefined,
          roomId: values.roomId || undefined,
          ratePerDay: Number(values.ratePerDay),
        }),
      });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add New Bed</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label className="label">Bed Number *</label>
              <input className="input" value={values.bedNumber} onChange={(e) => setValues({ ...values, bedNumber: e.target.value })} required placeholder="e.g. A-101" />
            </div>
            <div className="field">
              <label className="label">Bed Type</label>
              <select className="input" value={values.bedType} onChange={(e) => setValues({ ...values, bedType: e.target.value })}>
                {BED_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Ward</label>
              <select className="input" value={values.wardId} onChange={(e) => setValues({ ...values, wardId: e.target.value, roomId: '' })}>
                <option value="">-- Select ward --</option>
                {wards.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Room</label>
              <select className="input" value={values.roomId} onChange={(e) => setValues({ ...values, roomId: e.target.value })}>
                <option value="">-- No room --</option>
                {filteredRooms.map((r: any) => <option key={r.id} value={r.id}>{r.name} ({r.roomNumber || '-'})</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Rate per Day</label>
              <input className="input" type="number" min="0" step="0.01" value={values.ratePerDay} onChange={(e) => setValues({ ...values, ratePerDay: Number(e.target.value) })} />
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Creating...' : 'Create Bed'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateWardModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [values, setValues] = useState({ name: '', code: '', location: '', floor: '', capacity: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name) return;
    setSaving(true);
    setError('');
    try {
      await api('/bed-management/wards', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          code: values.code || undefined,
          location: values.location || undefined,
          floor: values.floor ? Number(values.floor) : undefined,
          capacity: values.capacity ? Number(values.capacity) : undefined,
        }),
      });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add New Ward</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label className="label">Ward Name *</label>
              <input className="input" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} required placeholder="e.g. Cardiology" />
            </div>
            <div className="field">
              <label className="label">Code</label>
              <input className="input" value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value })} placeholder="e.g. CARD" />
            </div>
            <div className="field">
              <label className="label">Location</label>
              <input className="input" value={values.location} onChange={(e) => setValues({ ...values, location: e.target.value })} placeholder="e.g. Building A, Floor 3" />
            </div>
            <div className="field">
              <label className="label">Floor</label>
              <input className="input" type="number" min="0" value={values.floor} onChange={(e) => setValues({ ...values, floor: e.target.value })} placeholder="e.g. 3" />
            </div>
            <div className="field">
              <label className="label">Capacity</label>
              <input className="input" type="number" min="0" value={values.capacity} onChange={(e) => setValues({ ...values, capacity: e.target.value })} placeholder="Max beds" />
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Creating...' : 'Create Ward'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateMaintenanceModal({ onClose, onDone, wards, beds }: { onClose: () => void; onDone: () => void; wards: any[]; beds: any[] }) {
  const [values, setValues] = useState({ type: 'Cleaning', wardId: '', bedId: '', description: '', scheduledAt: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/bed-management/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          wardId: values.wardId || undefined,
          bedId: values.bedId || undefined,
          scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : undefined,
        }),
      });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Schedule Maintenance</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label className="label">Type *</label>
              <select className="input" value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })}>
                {MAINTENANCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Scheduled At</label>
              <input className="input" type="datetime-local" value={values.scheduledAt} onChange={(e) => setValues({ ...values, scheduledAt: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Ward</label>
              <select className="input" value={values.wardId} onChange={(e) => setValues({ ...values, wardId: e.target.value })}>
                <option value="">-- Select ward --</option>
                {wards.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Bed</label>
              <select className="input" value={values.bedId} onChange={(e) => setValues({ ...values, bedId: e.target.value })}>
                <option value="">-- Select bed --</option>
                {beds.map((b: any) => <option key={b.id} value={b.id}>{b.bedNumber} ({b.ward?.name || 'N/A'})</option>)}
              </select>
            </div>
            <div className="field field-full">
              <label className="label">Description</label>
              <textarea className="textarea" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="Describe the maintenance needed..." />
            </div>
            <div className="field field-full">
              <label className="label">Notes</label>
              <input className="input" value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} placeholder="Additional notes" />
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving...' : 'Schedule Maintenance'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BedDetailModal({ bedId, onClose }: { bedId: string; onClose: () => void }) {
  const [bed, setBed] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/bed-management/beds/${bedId}`)
      .then((res: any) => setBed(res?.data?.data ?? res?.data ?? res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bedId]);

  if (loading) return <div className="modal-backdrop"><div className="modal"><div className="loading">Loading...</div></div></div>;
  if (!bed) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Bed {bed.bedNumber} Details</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card"><div className="stat-label">Status</div><div style={{ marginTop: 4 }}>{statusBadge(bed.status)}</div></div>
          <div className="stat-card"><div className="stat-label">Type</div><div className="stat-value" style={{ fontSize: 16 }}>{bed.bedType}</div></div>
          <div className="stat-card"><div className="stat-label">Rate/Day</div><div className="stat-value" style={{ fontSize: 16 }}>Rs. {Number(bed.ratePerDay).toLocaleString()}</div></div>
          <div className="stat-card"><div className="stat-label">Ward</div><div className="stat-value" style={{ fontSize: 16 }}>{bed.ward?.name || 'N/A'}</div></div>
        </div>
        {bed.allocations?.length > 0 && (
          <>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Recent Allocations</h4>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table className="table">
                <thead><tr><th>Patient</th><th>Admitted</th><th>Released</th><th>Status</th></tr></thead>
                <tbody>
                  {bed.allocations.map((a: any) => (
                    <tr key={a.id}>
                      <td>{a.admission?.patient?.firstName} {a.admission?.patient?.lastName}</td>
                      <td>{formatDateTime(a.allocatedAt)}</td>
                      <td>{a.releasedAt ? formatDateTime(a.releasedAt) : '—'}</td>
                      <td>{statusBadge(a.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {bed.movements?.length > 0 && (
          <>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Transfer History</h4>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Reason</th><th>Moved By</th></tr></thead>
                <tbody>
                  {bed.movements.map((m: any) => (
                    <tr key={m.id}>
                      <td>{formatDateTime(m.movedAt)}</td>
                      <td>{m.reason || '—'}</td>
                      <td>{m.movedBy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function BedManagementPage() {
  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [loadingDash, setLoadingDash] = useState(true);
  const [beds, setBeds] = useState<any[]>([]);
  const [loadingBeds, setLoadingBeds] = useState(true);
  const [wards, setWards] = useState<any[]>([]);
  const [loadingWards, setLoadingWards] = useState(true);
  const [rooms, setRooms] = useState<any[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<any[]>([]);
  const [loadingMaintenance, setLoadingMaintenance] = useState(true);

  const [filterWard, setFilterWard] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchBeds, setSearchBeds] = useState('');
  const [selectedWard, setSelectedWard] = useState<any>(null);

  const [showAllocate, setShowAllocate] = useState<any>(null);
  const [showTransfer, setShowTransfer] = useState<any>(null);
  const [showDeallocate, setShowDeallocate] = useState<any>(null);
  const [showCreateBed, setShowCreateBed] = useState(false);
  const [showCreateWard, setShowCreateWard] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showBedDetail, setShowBedDetail] = useState<string | null>(null);

  const loadDashboard = useCallback(() => {
    setLoadingDash(true);
    api('/bed-management/dashboard')
      .then((res: any) => setDashboard(res?.data?.data ?? res?.data ?? res))
      .catch(() => {})
      .finally(() => setLoadingDash(false));
  }, []);

  const loadBeds = useCallback(() => {
    setLoadingBeds(true);
    const params = new URLSearchParams({ limit: '200' });
    if (filterWard) params.set('wardId', filterWard);
    if (filterStatus) params.set('status', filterStatus);
    if (filterType) params.set('bedType', filterType);
    if (searchBeds) params.set('search', searchBeds);
    api(`/bed-management/beds?${params.toString()}`)
      .then((res: any) => {
        const data = res?.data?.data ?? res?.data ?? [];
        setBeds(Array.isArray(data) ? data : data.data ?? []);
      })
      .catch(() => setBeds([]))
      .finally(() => setLoadingBeds(false));
  }, [filterWard, filterStatus, filterType, searchBeds]);

  const loadWards = useCallback(() => {
    setLoadingWards(true);
    api('/bed-management/wards?limit=200')
      .then((res: any) => {
        const data = res?.data?.data ?? res?.data ?? [];
        setWards(Array.isArray(data) ? data : data.data ?? []);
      })
      .catch(() => setWards([]))
      .finally(() => setLoadingWards(false));
  }, []);

  const loadRooms = useCallback(() => {
    api('/bed-management/rooms?limit=200')
      .then((res: any) => {
        const data = res?.data?.data ?? res?.data ?? [];
        setRooms(Array.isArray(data) ? data : data.data ?? []);
      })
      .catch(() => setRooms([]));
  }, []);

  const loadMaintenance = useCallback(() => {
    setLoadingMaintenance(true);
    api('/bed-management/maintenance?limit=50')
      .then((res: any) => {
        const data = res?.data?.data ?? res?.data ?? [];
        setMaintenanceRecords(Array.isArray(data) ? data : data.data ?? []);
      })
      .catch(() => setMaintenanceRecords([]))
      .finally(() => setLoadingMaintenance(false));
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { loadWards(); loadRooms(); }, [loadWards, loadRooms]);
  useEffect(() => { if (tab === 'beds') loadBeds(); }, [tab, loadBeds]);
  useEffect(() => { if (tab === 'maintenance') loadMaintenance(); }, [tab, loadMaintenance]);

  function refreshAll() {
    loadDashboard();
    loadBeds();
    loadWards();
    loadRooms();
    loadMaintenance();
  }

  const summary = dashboard?.summary;
  const wardStats = dashboard?.byWard || [];
  const typeStats = dashboard?.byType || [];

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Bed Management</h1>
            <p className="page-subtitle">Monitor occupancy, allocate beds, and manage ward resources</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={refreshAll}>Refresh</button>
          </div>
        </div>

        <div className="tabs">
          {[
            { key: 'dashboard', label: 'Overview' },
            { key: 'beds', label: 'Beds' },
            { key: 'wards', label: 'Wards' },
            { key: 'maintenance', label: 'Maintenance' },
          ].map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && (
          <>
            {loadingDash ? (
              <div className="loading">Loading dashboard...</div>
            ) : (
              <>
                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="stat-label">Total Beds</div>
                    <div className="stat-value stat-blue">{summary?.totalBeds || 0}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Available</div>
                    <div className="stat-value stat-green">{summary?.available || 0}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Occupied</div>
                    <div className="stat-value stat-red">{summary?.occupied || 0}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Reserved</div>
                    <div className="stat-value stat-amber">{summary?.reserved || 0}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Cleaning</div>
                    <div className="stat-value" style={{ color: '#0891b2' }}>{summary?.cleaning || 0}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Maintenance</div>
                    <div className="stat-value stat-purple">{summary?.maintenance || 0}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Occupancy Rate</div>
                    <div className="stat-value" style={{ color: (summary?.occupancyRate || 0) > 90 ? 'var(--danger)' : 'var(--primary)' }}>
                      {summary?.occupancyRate || 0}%
                    </div>
                  </div>
                </div>

                {summary?.totalBeds > 0 && (
                  <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-title">Bed Status Distribution</div>
                    <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
                      {summary.occupied > 0 && <div style={{ width: `${(summary.occupied / summary.totalBeds) * 100}%`, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>{summary.occupied}</div>}
                      {summary.available > 0 && <div style={{ width: `${(summary.available / summary.totalBeds) * 100}%`, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>{summary.available}</div>}
                      {summary.reserved > 0 && <div style={{ width: `${(summary.reserved / summary.totalBeds) * 100}%`, background: '#d97706' }} />}
                      {summary.cleaning > 0 && <div style={{ width: `${(summary.cleaning / summary.totalBeds) * 100}%`, background: '#0891b2' }} />}
                      {summary.maintenance > 0 && <div style={{ width: `${(summary.maintenance / summary.totalBeds) * 100}%`, background: '#7c3aed' }} />}
                      {summary.blocked > 0 && <div style={{ width: `${(summary.blocked / summary.totalBeds) * 100}%`, background: '#64748b' }} />}
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                      {BED_STATUSES.map((s) => (
                        <div key={s.value} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
                          <span>{s.label}: {summary[s.value.toLowerCase()] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {wardStats.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 20 }}>
                    <div className="card">
                      <div className="card-title">Occupancy by Ward</div>
                      {wardStats.map((w: any) => (
                        <div key={w.id} className="bar-row">
                          <div className="bar-label">
                            <span>{w.name} {w.department ? `(${w.department})` : ''}</span>
                            <span className="bar-count">{w.occupied}/{w.totalBeds} ({w.occupancyRate}%)</span>
                          </div>
                          <ProgressBar value={w.occupied} max={w.totalBeds} />
                        </div>
                      ))}
                    </div>
                    {typeStats.length > 0 && (
                      <div className="card">
                        <div className="card-title">By Bed Type</div>
                        {typeStats.map((t: any) => (
                          <div key={t.type} className="bar-row">
                            <div className="bar-label">
                              <span>{BED_TYPES.find((bt) => bt.value === t.type)?.label || t.type}</span>
                              <span className="bar-count">{t.occupied}/{t.total}</span>
                            </div>
                            <ProgressBar value={t.occupied} max={t.total} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {dashboard?.recentAllocations?.length > 0 && (
                  <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-title">Recent Occupied Beds</div>
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr><th>Bed</th><th>Ward</th><th>Patient</th><th>Admitted</th></tr></thead>
                        <tbody>
                          {dashboard.recentAllocations.map((a: any) => (
                            <tr key={a.id}>
                              <td style={{ fontWeight: 600 }}>{a.bed?.bedNumber}</td>
                              <td>{a.bed?.ward?.name || '—'}</td>
                              <td>{a.admission?.patient?.firstName} {a.admission?.patient?.lastName}</td>
                              <td className="note">{formatDateTime(a.allocatedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'beds' && (
          <>
            <div className="toolbar" style={{ marginBottom: 16 }}>
              <input className="input search-input" placeholder="Search beds..." value={searchBeds} onChange={(e) => setSearchBeds(e.target.value)} />
              <select className="input" style={{ width: 160 }} value={filterWard} onChange={(e) => setFilterWard(e.target.value)}>
                <option value="">All Wards</option>
                {wards.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <select className="input" style={{ width: 150 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All Statuses</option>
                {BED_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select className="input" style={{ width: 150 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">All Types</option>
                {BED_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button className="btn" onClick={() => setShowCreateBed(true)}>+ Add Bed</button>
            </div>

            {filterWard || filterStatus || filterType || searchBeds ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bed #</th>
                      <th>Type</th>
                      <th>Ward</th>
                      <th>Room</th>
                      <th>Status</th>
                      <th>Patient</th>
                      <th>Rate</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingBeds ? (
                      <tr><td colSpan={8}><div className="loading">Loading beds...</div></td></tr>
                    ) : beds.length === 0 ? (
                      <tr><td colSpan={8}><div className="empty">No beds found matching filters.</div></td></tr>
                    ) : beds.map((bed: any) => (
                      <tr key={bed.id}>
                        <td style={{ fontWeight: 600 }}>{bed.bedNumber}</td>
                        <td>{BED_TYPES.find((t) => t.value === bed.bedType)?.label || bed.bedType}</td>
                        <td>{bed.ward?.name || '—'}</td>
                        <td>{bed.room?.name || '—'}</td>
                        <td>{statusBadge(bed.status)}</td>
                        <td>
                          {bed.allocations?.[0]?.admission?.patient
                            ? `${bed.allocations[0].admission.patient.firstName} ${bed.allocations[0].admission.patient.lastName}`
                            : '—'}
                        </td>
                        <td className="mono">Rs. {Number(bed.ratePerDay).toLocaleString()}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-ghost" onClick={() => setShowBedDetail(bed.id)}>View</button>
                            {bed.status === 'AVAILABLE' && <button className="btn btn-sm" onClick={() => setShowAllocate(bed)}>Allocate</button>}
                            {bed.status === 'OCCUPIED' && <button className="btn btn-sm btn-danger" onClick={() => setShowDeallocate(bed)}>Free</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                {loadingBeds ? (
                  <div className="loading">Loading beds...</div>
                ) : wards.length === 0 ? (
                  <div className="empty">
                    <p>No wards found. Create a ward first.</p>
                    <button className="btn" onClick={() => setShowCreateWard(true)}>+ Create First Ward</button>
                  </div>
                ) : (
                  wards.map((ward: any) => {
                    const wardBeds = beds.filter((b: any) => b.wardId === ward.id || (!b.wardId && ward === wards[0]));
                    if (wardBeds.length === 0) return null;
                    const occupied = wardBeds.filter((b: any) => b.status === 'OCCUPIED').length;
                    return (
                      <div key={ward.id} className="card" style={{ marginBottom: 20 }}>
                        <div className="row-between" style={{ marginBottom: 14 }}>
                          <div>
                            <span className="card-title" style={{ margin: 0 }}>{ward.name}</span>
                            <span className="note" style={{ marginLeft: 8 }}>
                              {occupied}/{wardBeds.length} beds occupied
                            </span>
                          </div>
                          <ProgressBar value={occupied} max={wardBeds.length} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                          {wardBeds.map((bed: any) => (
                            <BedBox
                              key={bed.id}
                              bed={bed}
                              onAllocate={(b) => setShowAllocate(b)}
                              onDeallocate={(b) => setShowDeallocate(b)}
                              onTransfer={(b) => setShowTransfer(b)}
                              onStatusChange={async (b) => {
                                await api(`/bed-management/beds/${b.id}/status`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: 'AVAILABLE' }),
                                });
                                refreshAll();
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </>
        )}

        {tab === 'wards' && (
          <>
            <div className="toolbar" style={{ marginBottom: 16 }}>
              <button className="btn" onClick={() => setShowCreateWard(true)}>+ Add Ward</button>
            </div>
            {loadingWards ? (
              <div className="loading">Loading wards...</div>
            ) : wards.length === 0 ? (
              <div className="empty">
                <p>No wards found.</p>
                <button className="btn" onClick={() => setShowCreateWard(true)}>+ Create First Ward</button>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Code</th>
                      <th>Floor</th>
                      <th>Location</th>
                      <th>Department</th>
                      <th>Capacity</th>
                      <th>Beds</th>
                      <th>Available</th>
                      <th>Occupied</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wards.map((w: any) => (
                      <tr key={w.id} className="row-clickable" onClick={() => { setSelectedWard(w); setTab('beds'); setFilterWard(w.id); }}>
                        <td style={{ fontWeight: 600 }}>{w.name}</td>
                        <td className="mono">{w.code || '—'}</td>
                        <td>{w.floor ?? '—'}</td>
                        <td>{w.location || '—'}</td>
                        <td>{w.department?.name || '—'}</td>
                        <td>{w.capacity || '—'}</td>
                        <td>{w.totalBeds ?? 0}</td>
                        <td style={{ color: 'var(--success)', fontWeight: 600 }}>{w.available ?? 0}</td>
                        <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{w.occupied ?? 0}</td>
                        <td>
                          <span className={`badge ${w.isActive ? 'badge-green' : 'badge-gray'}`}>
                            {w.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'maintenance' && (
          <>
            <div className="toolbar" style={{ marginBottom: 16 }}>
              <button className="btn" onClick={() => setShowMaintenance(true)}>+ Schedule Maintenance</button>
            </div>
            {loadingMaintenance ? (
              <div className="loading">Loading maintenance records...</div>
            ) : maintenanceRecords.length === 0 ? (
              <div className="empty">No maintenance records found.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Ward</th>
                      <th>Bed</th>
                      <th>Description</th>
                      <th>Scheduled</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceRecords.map((m: any) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 600 }}>{m.type}</td>
                        <td>{m.ward?.name || '—'}</td>
                        <td>{m.bed?.bedNumber || '—'}</td>
                        <td>{m.description || '—'}</td>
                        <td>{formatDateTime(m.scheduledAt)}</td>
                        <td>
                          <span className={`badge ${m.status === 'COMPLETED' ? 'badge-green' : m.status === 'IN_PROGRESS' ? 'badge-blue' : 'badge-yellow'}`}>
                            {m.status}
                          </span>
                        </td>
                        <td>
                          {m.status !== 'COMPLETED' && (
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={async () => {
                                await api(`/bed-management/maintenance/${m.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: 'COMPLETED' }),
                                });
                                loadMaintenance();
                              }}
                            >
                              Complete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showAllocate && <AllocateModal bed={showAllocate} onClose={() => setShowAllocate(null)} onDone={() => { setShowAllocate(null); refreshAll(); }} />}
      {showTransfer && <TransferModal bed={showTransfer} onClose={() => setShowTransfer(null)} onDone={() => { setShowTransfer(null); refreshAll(); }} />}
      {showDeallocate && <DeallocateModal bed={showDeallocate} onClose={() => setShowDeallocate(null)} onDone={() => { setShowDeallocate(null); refreshAll(); }} />}
      {showCreateBed && <CreateBedModal onClose={() => setShowCreateBed(false)} onDone={() => { setShowCreateBed(false); refreshAll(); }} wards={wards} rooms={rooms} />}
      {showCreateWard && <CreateWardModal onClose={() => setShowCreateWard(false)} onDone={() => { setShowCreateWard(false); refreshAll(); }} />}
      {showMaintenance && <CreateMaintenanceModal onClose={() => setShowMaintenance(false)} onDone={() => { setShowMaintenance(false); refreshAll(); }} wards={wards} beds={beds} />}
      {showBedDetail && <BedDetailModal bedId={showBedDetail} onClose={() => setShowBedDetail(null)} />}
    </AppShell>
  );
}
