'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import AppShell from '@/components/AppShell';
import AsyncSearchSelect from '@/components/AsyncSearchSelect';
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
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedulePatientId, setSchedulePatientId] = useState('');
  const [patientEncounters, setPatientEncounters] = useState<Row[]>([]);
  const [loadingEncounters, setLoadingEncounters] = useState(false);
  const [selectedEncounterId, setSelectedEncounterId] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!raw || isNaN(raw.getTime())) return { label: 'Not scheduled', tone: 'secondary' };
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search) {
      load();
      return;
    }
    debounceRef.current = setTimeout(() => { load(); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!schedulePatientId) {
      setPatientEncounters([]);
      setSelectedEncounterId('');
      return;
    }
    let active = true;
    setLoadingEncounters(true);
    (async () => {
      try {
        const res: ApiResponse<any> = await api(`/encounters?patientId=${schedulePatientId}&limit=50`);
        const payload = res.data as any;
        const list: Row[] = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        if (active) setPatientEncounters(list);
      } catch {
        if (active) setPatientEncounters([]);
      } finally {
        if (active) setLoadingEncounters(false);
      }
    })();
    return () => { active = false; };
  }, [schedulePatientId]);

  function openSchedule() {
    setSchedulePatientId('');
    setPatientEncounters([]);
    setSelectedEncounterId('');
    setFollowUpDate('');
    setFollowUpNotes('');
    setScheduleError(null);
    setShowSchedule(true);
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!schedulePatientId) {
      setScheduleError('Search and select a patient.');
      return;
    }
    if (!followUpDate) {
      setScheduleError('Follow-up date is required.');
      return;
    }
    setSaving(true);
    setScheduleError(null);
    try {
      if (selectedEncounterId) {
        await api(`/encounters/${selectedEncounterId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            followUpDate: new Date(followUpDate).toISOString(),
            followUpNotes,
          }),
        });
      } else {
        await api('/encounters', {
          method: 'POST',
          body: JSON.stringify({
            patientId: schedulePatientId,
            type: 'FOLLOWUP',
            followUpDate: new Date(followUpDate).toISOString(),
            followUpNotes,
          }),
        });
      }
      setShowSchedule(false);
      setFlash('Follow-up scheduled successfully');
      load();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Failed to schedule follow-up');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Follow-ups</h1>
          <p className="page-subtitle">Search patients and schedule follow-ups</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={openSchedule}>+ Schedule follow-up</button>
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

      <div className="toolbar">
        <input
          className="input search-input"
          placeholder="Search patient name, MRN, or mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : !rows.length ? (
        <div className="empty">
          {search ? 'No encounters found for this search. Try a different name or schedule a follow-up.' : 'No follow-ups scheduled yet. Click "+ Schedule follow-up" to get started.'}
        </div>
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
                      {r.followUpDate ? <strong>{formatDate(r.followUpDate)}</strong> : <span className="note">Not set</span>}
                    </td>
                    <td>
                      <span className={`badge badge-${s.tone}`}>{s.label}</span>
                    </td>
                    <td>{doctorName(r)}</td>
                    <td>{r.diagnosis || r.chiefComplaint || '—'}</td>
                    <td>{r.followUpNotes || '—'}</td>
                    <td>
                      <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); router.push(`/patients/${r.patient?.id}`); }}>
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

      {showSchedule && (
        <div className="modal-backdrop" onClick={() => setShowSchedule(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Schedule follow-up</h3>
              <button className="modal-close" onClick={() => setShowSchedule(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={saveSchedule}>
              <div className="form-grid">
                <div className="field field-full">
                  <label className="label">Patient *</label>
                  <AsyncSearchSelect
                    endpoint="/patients"
                    valueKey="id"
                    labelKeys={['firstName', 'lastName', 'mrn']}
                    value={schedulePatientId}
                    onChange={setSchedulePatientId}
                    placeholder="Search patient by name, MRN, or mobile…"
                    required
                  />
                </div>
                {schedulePatientId && (
                  <div className="field field-full">
                    <label className="label">Existing encounter (optional)</label>
                    {loadingEncounters ? (
                      <div className="note">Loading encounters…</div>
                    ) : patientEncounters.length > 0 ? (
                      <select
                        className="input"
                        value={selectedEncounterId}
                        onChange={(e) => setSelectedEncounterId(e.target.value)}
                      >
                        <option value="">— Create new follow-up encounter —</option>
                        {patientEncounters.map((enc: Row) => (
                          <option key={enc.id} value={enc.id}>
                            {formatDate(enc.createdAt)} · {enc.type || 'OPD'} · {enc.diagnosis || enc.chiefComplaint || 'Encounter'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="note">No existing encounters. A new encounter will be created.</div>
                    )}
                  </div>
                )}
                <div className="field">
                  <label className="label">Follow-up date *</label>
                  <input
                    type="date"
                    className="input"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    required
                  />
                </div>
                <div className="field field-full">
                  <label className="label">Notes</label>
                  <textarea
                    className="input"
                    style={{ minHeight: 80 }}
                    placeholder="What should be reviewed at the next visit?"
                    value={followUpNotes}
                    onChange={(e) => setFollowUpNotes(e.target.value)}
                  />
                </div>
              </div>
              {scheduleError && <div className="alert alert-error" style={{ marginTop: 14 }}>{scheduleError}</div>}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSchedule(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Saving…' : 'Schedule follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
