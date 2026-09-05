'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import AsyncSearchSelect from '@/components/AsyncSearchSelect';
import { formatDate } from '@/lib/hooks';
import type { ApiResponse, Row } from '@/lib/types';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export default function FollowUpsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const r = localStorage.getItem('role') || '';
    if (
      !['RECEPTIONIST', 'RECEPTION_SUPERVISOR', 'HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN'].includes(r)
    ) {
      router.replace('/patients');
    }
  }, [router]);
  const [createPatientId, setCreatePatientId] = useState('');
  const [selectedDoctorIds, setSelectedDoctorIds] = useState<string[]>([]);
  const [doctorOptions, setDoctorOptions] = useState<Row[]>([]);
  const [doctorFilter, setDoctorFilter] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const followupStatus = (r: Row) => {
    const map: Record<string, { label: string; tone: string }> = {
      PENDING: { label: 'Pending', tone: 'warning' },
      IN_PROGRESS: { label: 'In progress', tone: 'primary' },
      COMPLETED: { label: 'Completed', tone: 'green' },
      CANCELLED: { label: 'Cancelled', tone: 'secondary' },
    };
    return map[r.status] || { label: r.status || 'Pending', tone: 'secondary' };
  };

  const patientName = (r: Row) =>
    [r.patient?.firstName, r.patient?.middleName, r.patient?.lastName].filter(Boolean).join(' ') || '—';

  const fuDoctorNames = (r: Row) => {
    const names = (r.doctors || [])
      .map((d: any) => [d.doctor?.user?.firstName, d.doctor?.user?.lastName].filter(Boolean).join(' '))
      .filter(Boolean);
    if (names.length) return names.join(', ');
    return [r.assignedDoctor?.user?.firstName, r.assignedDoctor?.user?.lastName].filter(Boolean).join(' ') || '—';
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '200' });
      if (status) qs.set('status', status);
      const res: ApiResponse<any> = await api(`/follow-ups?${qs.toString()}`);
      const payload = res.data?.data ?? res.data;
      const list = Array.isArray(payload) ? payload : payload?.data ?? [];
      setRows(list);
    } catch (err) {
      setRows([]);
      setFlash(err instanceof Error ? err.message : 'Failed to load follow-ups');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  async function loadDoctors() {
    try {
      const res: ApiResponse<any> = await api('/follow-ups/doctors');
      const payload = res.data?.data ?? res.data;
      const list = Array.isArray(payload) ? payload : payload?.data ?? [];
      setDoctorOptions(list);
    } catch {
      setDoctorOptions([]);
    }
  }

  function openCreate() {
    setCreatePatientId('');
    setSelectedDoctorIds([]);
    setNotes('');
    setDoctorFilter('');
    setCreateError(null);
    setShowCreate(true);
    loadDoctors();
  }

  function toggleDoctor(id: string) {
    setSelectedDoctorIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

  async function saveCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createPatientId) {
      setCreateError('Search and select a patient.');
      return;
    }
    if (!selectedDoctorIds.length) {
      setCreateError('Select at least one doctor for the follow-up.');
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      await api('/follow-ups', {
        method: 'POST',
        body: JSON.stringify({
          patientId: createPatientId,
          doctorIds: selectedDoctorIds,
          notes,
        }),
      });
      setShowCreate(false);
      setFlash('Follow-up created successfully');
      load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create follow-up');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(r: Row, next: string) {
    try {
      await api(`/follow-ups/${r.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next }),
      });
      setFlash(`Follow-up marked as ${next.replace('_', ' ').toLowerCase()}`);
      load();
    } catch (err) {
      setFlash(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Follow-ups</h1>
          <p className="page-subtitle">Assign doctor(s) to patients in real time</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={openCreate}>+ Create follow-up</button>
          <button className="btn btn-secondary" onClick={() => router.push('/patients')}>
            Back to patients
          </button>
        </div>
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

      {flash && <div className="alert alert-success">{flash}</div>}

      {loading ? (
        <div className="loading">Loading…</div>
      ) : !rows.length ? (
        <div className="empty">
          No follow-ups found. Click "+ Create follow-up" to assign doctor(s) to a patient.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>MRN</th>
                <th>Created</th>
                <th>Assigned doctor(s)</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Notes</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = followupStatus(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong className="row-clickable" onClick={() => router.push(`/patients/${r.patient?.id}`)}>
                        {patientName(r)}
                      </strong>
                    </td>
                    <td className="mono">{r.patient?.mrn || '—'}</td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td>{fuDoctorNames(r)}</td>
                    <td>
                      <span className={`badge badge-${s.tone}`}>{s.label}</span>
                    </td>
                    <td>{r.encounter?.diagnosis || r.encounter?.chiefComplaint || '—'}</td>
                    <td>{r.notes || '—'}</td>
                    <td>
                      {r.status !== 'COMPLETED' && r.status !== 'CANCELLED' && (
                        <button className="btn btn-sm btn-secondary" onClick={() => changeStatus(r, 'COMPLETED')}>
                          Complete
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

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create follow-up</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={saveCreate}>
              <div className="form-grid">
                <div className="field field-full">
                  <label className="label">Patient *</label>
                  <AsyncSearchSelect
                    endpoint="/patients"
                    valueKey="id"
                    labelKeys={['firstName', 'lastName', 'mrn']}
                    value={createPatientId}
                    onChange={setCreatePatientId}
                    placeholder="Search patient by name, MRN, or mobile…"
                    required
                  />
                </div>
                <div className="field field-full">
                  <label className="label">
                    Assigned doctor(s) * <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(active doctors)</span>
                  </label>
                  <input
                    className="input"
                    placeholder="Filter doctors…"
                    value={doctorFilter}
                    onChange={(e) => setDoctorFilter(e.target.value)}
                  />
                  <div
                    style={{
                      marginTop: 8,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      maxHeight: 200,
                      overflowY: 'auto',
                    }}
                  >
                    {doctorOptions.length === 0 ? (
                      <div className="note" style={{ padding: 12 }}>Loading doctors…</div>
                    ) : (
                      doctorOptions
                        .filter((d) => {
                          const name = [d.user?.firstName, d.user?.lastName].filter(Boolean).join(' ');
                          return !doctorFilter || name?.toLowerCase().includes(doctorFilter.toLowerCase()) || d.specialization?.toLowerCase().includes(doctorFilter.toLowerCase());
                        })
                        .map((d) => {
                          const checked = selectedDoctorIds.includes(d.id);
                          return (
                            <label
                              key={d.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '8px 12px',
                                cursor: 'pointer',
                                background: checked ? 'rgba(59,130,246,0.08)' : 'transparent',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDoctor(d.id)}
                                style={{ width: 16, height: 16 }}
                              />
                              <span style={{ flex: 1 }}>
                                {[d.user?.firstName, d.user?.lastName].filter(Boolean).join(' ')}
                                {d.specialization ? <span className="muted" style={{ marginLeft: 6 }}>{d.specialization}</span> : null}
                              </span>
                              {checked && <span className="badge badge-blue" style={{ fontSize: 10 }}>assigned</span>}
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>
                <div className="field field-full">
                  <label className="label">Notes</label>
                  <textarea
                    className="input"
                    style={{ minHeight: 80 }}
                    placeholder="What should be reviewed at the follow-up?"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
              {createError && <div className="alert alert-error" style={{ marginTop: 14 }}>{createError}</div>}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Saving…' : 'Create follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}