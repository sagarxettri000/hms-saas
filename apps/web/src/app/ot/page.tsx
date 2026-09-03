'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

interface OtCase {
  id: string;
  otNumber?: string;
  patient?: any;
  patientId?: string;
  surgeon?: any;
  surgeonId?: string;
  assistant?: any;
  assistantId?: string;
  anesthetist?: any;
  anesthetistId?: string;
  nurses?: any;
  procedureName?: string;
  procedureCode?: string;
  otType?: string;
  anesthesiaType?: string;
  otRoom?: string;
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  startedAt?: string;
  endedAt?: string;
  status?: string;
  checklist?: any;
}

const STATUS_TONES: Record<string, string> = {
  SCHEDULED: 'badge-blue',
  IN_PROGRESS: 'badge-yellow',
  COMPLETED: 'badge-green',
  CANCELLED: 'badge-red',
};

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7);

const CHECKLIST_CATEGORIES: { name: string; items: string[] }[] = [
  {
    name: 'Sign In',
    items: [
      'Patient identity confirmed',
      'Surgical site marked',
      'Consent verified',
      'Allergy check completed',
      'Airway / aspiration risk assessed',
    ],
  },
  {
    name: 'Time Out',
    items: [
      'Team introductions completed',
      'Procedure and site confirmed',
      'Antibiotic prophylaxis given',
      'Essential imaging displayed',
    ],
  },
  {
    name: 'Sign Out',
    items: [
      'Instrument and sponge count verified',
      'Specimen labelled correctly',
      'Equipment issues noted',
    ],
  },
];

function unwrap(r: any): any {
  return r?.data?.data ?? r?.data ?? r;
}

function personName(p: any): string {
  if (!p) return '';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || p.mrn || '';
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseHourFloat(t?: string): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.getHours() + d.getMinutes() / 60;
  return null;
}

function caseStart(c: OtCase): number | null {
  if (c.startTime) return parseHourFloat(c.startTime);
  if (c.startedAt) return parseHourFloat(c.startedAt);
  if (c.scheduledDate) return parseHourFloat(c.scheduledDate);
  return null;
}

function caseEnd(c: OtCase, start: number | null): number | null {
  if (c.endTime) return parseHourFloat(c.endTime);
  if (c.endedAt) return parseHourFloat(c.endedAt);
  return start != null ? start + 2 : null;
}

function durationMinutes(c: OtCase): number | null {
  let startMs: number | null = null;
  let endMs: number | null = null;
  if (c.startedAt && c.endedAt) {
    startMs = new Date(c.startedAt).getTime();
    endMs = new Date(c.endedAt).getTime();
  } else if (c.scheduledDate && c.startTime && c.endTime) {
    const key = toDateKey(new Date(c.scheduledDate));
    startMs = new Date(`${key}T${c.startTime}`).getTime();
    endMs = new Date(`${key}T${c.endTime}`).getTime();
  }
  if (startMs == null || endMs == null || isNaN(startMs) || isNaN(endMs)) return null;
  const mins = Math.round((endMs - startMs) / 60000);
  return mins > 0 ? mins : null;
}

function fmtMinutes(m: number): string {
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function loadChecklists(): Record<string, any> {
  try {
    const raw = localStorage.getItem('surgical_checklists');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveChecklists(all: Record<string, any>) {
  try {
    localStorage.setItem('surgical_checklists', JSON.stringify(all));
  } catch {}
}

export default function OtPage() {
  const [tab, setTab] = useState<'schedule' | 'active' | 'checklist' | 'analytics'>('schedule');
  const [cases, setCases] = useState<OtCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [checklists, setChecklists] = useState<Record<string, any>>({});
  const [selectedSurgery, setSelectedSurgery] = useState('');

  // Schedule Surgery form
  const [showSchedule, setShowSchedule] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState('');
  const [form, setForm] = useState({
    procedureName: '',
    procedureCode: '',
    otType: 'ELECTIVE',
    surgeonId: '',
    assistantId: '',
    anesthetistId: '',
    otRoom: '',
    date: '',
    startTime: '',
    endTime: '',
    nurses: [] as any[],
    nurseInput: '',
  });
  const OT_TYPES = ['ELECTIVE', 'EMERGENCY', 'URGENT', 'SAME_DAY', 'INPATIENT'];
  const OT_ROOMS = ['OT 1', 'OT 2', 'OT 3', 'OT 4'];

  useEffect(() => {
    api('/ot?limit=100')
      .then((r) => {
        const data = unwrap(r);
        setCases(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load OT cases'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'analytics') return;
    api('/ot?limit=200')
      .then((r) => {
        const data = unwrap(r);
        setCases(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      })
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    setChecklists(loadChecklists());
  }, []);

  useEffect(() => {
    if (!showSchedule) return;
    if (patients.length === 0) {
      api('/patients?limit=500').then((r) => setPatients(Array.isArray(unwrap(r)) ? unwrap(r) : [])).catch(() => {});
    }
    if (doctors.length === 0) {
      api('/doctors?limit=200').then((r) => {
        const d = unwrap(r);
        setDoctors(Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : []);
      }).catch(() => {});
    }
  }, [showSchedule, patients.length, doctors.length]);

  useEffect(() => {
    if (tab !== 'active') return;
    const t = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, [tab]);

  const todayKey = toDateKey(new Date());
  const todaysCases = cases.filter((c) => c.scheduledDate && toDateKey(new Date(c.scheduledDate)) === todayKey);
  const scheduleList = todaysCases.length ? todaysCases : cases.slice(0, 50);
  const activeCases = cases.filter((c) => String(c.status).toUpperCase() === 'IN_PROGRESS');

  const updateStatus = async (c: OtCase, status: string) => {
    if (busyId) return;
    setBusyId(c.id);
    try {
      await api(`/ot/${c.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setCases((prev) => prev.map((x) => (x.id === c.id ? { ...x, status } : x)));
    } catch {}
    setBusyId(null);
  };

  const rooms = Array.from(new Set(scheduleList.map((c) => c.otRoom || 'Unassigned'))).sort();

  const persistChecklist = (surgeryId: string, surgery: Record<string, any>) => {
    api(`/ot/${surgeryId}/checklist`, {
      method: 'PATCH',
      body: JSON.stringify({ checklist: surgery }),
    }).catch(() => {});
  };

  const toggleItem = (surgeryId: string, category: string, item: string) => {
    const prevSurgery: Record<string, any> = checklists[surgeryId] || {};
    const surgery = { ...prevSurgery };
    const current: string[] = surgery[category] || [];
    surgery[category] = current.includes(item) ? current.filter((i) => i !== item) : [...current, item];
    const next = { ...checklists, [surgeryId]: surgery };
    setChecklists(next);
    saveChecklists(next);
    persistChecklist(surgeryId, surgery);
  };

  useEffect(() => {
    if (!selectedSurgery) return;
    const c = cases.find((x) => x.id === selectedSurgery);
    if (!c || !c.checklist) return;
    setChecklists((prev) => {
      if (prev[selectedSurgery]) return prev;
      const next = { ...prev, [selectedSurgery]: c.checklist };
      saveChecklists(next);
      return next;
    });
  }, [selectedSurgery, cases]);

  const ptResults = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    if (!term) return [];
    return patients
      .filter((p: any) =>
        [p.firstName, p.lastName, p.mrn, p.uid]
          .filter(Boolean)
          .some((v: string) => String(v).toLowerCase().includes(term)),
      )
      .slice(0, 20);
  }, [patients, patientSearch]);

  const addNurse = () => {
    const name = form.nurseInput.trim();
    if (!name) return;
    setForm((f) => ({
      ...f,
      nurses: [...f.nurses, { name, id: `n-${Date.now()}-${f.nurses.length}` }],
      nurseInput: '',
    }));
  };

  const removeNurse = (id: string) => {
    setForm((f) => ({ ...f, nurses: f.nurses.filter((n: any) => n.id !== id) }));
  };

  const submitSchedule = async () => {
    setFormMsg('');
    if (!selectedPatient) { setFormMsg('Please select a patient.'); return; }
    if (!form.procedureName.trim()) { setFormMsg('Please enter the surgery / procedure.'); return; }
    if (!form.date) { setFormMsg('Please choose the surgery date.'); return; }
    setSaving(true);
    try {
      const payload: any = {
        patientId: selectedPatient.id,
        procedureName: form.procedureName.trim(),
        procedureCode: form.procedureCode.trim() || undefined,
        otType: form.otType,
        surgeonId: form.surgeonId || undefined,
        assistantId: form.assistantId || undefined,
        anesthetistId: form.anesthetistId || undefined,
        nurses: form.nurses.filter((n: any) => n.name).map((n: any) => ({ name: n.name })),
        otRoom: form.otRoom || undefined,
        scheduledDate: form.date ? `${form.date}T${form.startTime || '09:00'}` : undefined,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
      };
      await api('/ot', { method: 'POST', body: JSON.stringify(payload) });
      setFormMsg('Surgery scheduled successfully.');
      setSelectedPatient(null);
      setPatientSearch('');
      setForm((f) => ({
        ...f,
        procedureName: '', procedureCode: '', surgeonId: '', assistantId: '',
        anesthetistId: '', otRoom: '', date: '', startTime: '', endTime: '', nurses: [],
      }));
      api('/ot?limit=100').then((r) => {
        const data = unwrap(r);
        setCases(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      }).catch(() => {});
    } catch (e: any) {
      setFormMsg(e?.message || 'Failed to schedule surgery.');
    }
    setSaving(false);
  };

  const stats = (() => {
    const total = cases.length;
    const completed = cases.filter((c) => String(c.status).toUpperCase() === 'COMPLETED').length;
    const cancelled = cases.filter((c) => String(c.status).toUpperCase() === 'CANCELLED').length;
    const inProgress = cases.filter((c) => String(c.status).toUpperCase() === 'IN_PROGRESS').length;
    const durations = cases.map(durationMinutes).filter((d): d is number => d != null);
    const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const typeCounts: Record<string, number> = {};
    cases.forEach((c) => {
      const t = c.procedureName || c.otType || 'Other';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const byType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
    const maxType = Math.max(1, ...byType.map((t) => t.count));
    const bookedMinutes = scheduleList.reduce((sum, c) => {
      const s = caseStart(c);
      const e = caseEnd(c, s);
      return s != null && e != null && e > s ? sum + (e - s) * 60 : sum;
    }, 0);
    const capacityMinutes = Math.max(1, rooms.length * HOURS.length * 60);
    const utilization = Math.min(100, Math.round((bookedMinutes / capacityMinutes) * 100));
    return { total, completed, cancelled, inProgress, avgDuration, byType, maxType, utilization };
  })();

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Operation Theatres</h1>
          <p className="page-subtitle">Surgical schedule, live cases and safety checklists</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button className={`tab ${tab === 'schedule' ? 'active' : ''}`} onClick={() => setTab('schedule')}>Schedule</button>
        <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
          Active Surgery{activeCases.length ? ` (${activeCases.length})` : ''}
        </button>
        <button className={`tab ${tab === 'checklist' ? 'active' : ''}`} onClick={() => setTab('checklist')}>Checklist</button>
        <button className={`tab ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>Analytics</button>
      </div>

      {error && <div className="banner-danger">{error}</div>}
      {loading && <div className="loading">Loading OT cases…</div>}

      {!loading && tab === 'schedule' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button type="button" className="btn" onClick={() => setShowSchedule((s) => !s)}>
              {showSchedule ? 'Close Schedule Form' : '+ Schedule Surgery'}
            </button>
          </div>

          {showSchedule && (
            <div className="card" style={{ marginBottom: 16 }} role="region" aria-label="Schedule surgery">
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 14px' }}>Schedule Surgery</h3>

              <div className="form-grid">
                <div className="field">
                  <label className="label">Patient (search by name or MRN)</label>
                  <input
                    className="input"
                    type="search"
                    placeholder="Search patient…"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    aria-label="Search patient"
                  />
                  {selectedPatient && (
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>
                      {personName(selectedPatient)}{selectedPatient.mrn ? ` · MRN ${selectedPatient.mrn}` : ''}
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ marginLeft: 8 }}
                        onClick={() => { setSelectedPatient(null); setPatientSearch(''); }}
                      >
                        Change
                      </button>
                    </div>
                  )}
                  {!selectedPatient && ptResults.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 6, maxHeight: 180, overflow: 'auto' }}>
                      {ptResults.map((p: any) => (
                        <button
                          type="button"
                          key={p.id}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 13, background: 'transparent', border: 'none', cursor: 'pointer' }}
                          onClick={() => { setSelectedPatient(p); setPatientSearch(''); }}
                        >
                          <strong>{personName(p)}</strong>
                          {p.mrn ? <span style={{ color: 'var(--text-muted)' }}> · MRN {p.mrn}</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="field">
                  <label className="label">Surgery / Procedure<span style={{ color: 'var(--danger)' }}> *</span></label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. Laparoscopic cholecystectomy"
                    value={form.procedureName}
                    onChange={(e) => setForm((f) => ({ ...f, procedureName: e.target.value }))}
                    aria-label="Procedure name"
                  />
                </div>

                <div className="field">
                  <label className="label">Procedure code (optional)</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. CPT-47562"
                    value={form.procedureCode}
                    onChange={(e) => setForm((f) => ({ ...f, procedureCode: e.target.value }))}
                    aria-label="Procedure code"
                  />
                </div>

                <div className="field">
                  <label className="label">OT Type</label>
                  <select className="input" value={form.otType} onChange={(e) => setForm((f) => ({ ...f, otType: e.target.value }))} aria-label="OT type">
                    {OT_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label">Attending Surgeon</label>
                  <select className="input" value={form.surgeonId} onChange={(e) => setForm((f) => ({ ...f, surgeonId: e.target.value }))} aria-label="Surgeon">
                    <option value="">Select surgeon…</option>
                    {doctors.map((d: any) => (
                      <option key={d.id} value={d.id}>{personName(d.user) || d.id}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label">Assistant Surgeon</label>
                  <select className="input" value={form.assistantId} onChange={(e) => setForm((f) => ({ ...f, assistantId: e.target.value }))} aria-label="Assistant surgeon">
                    <option value="">Select assistant…</option>
                    {doctors.map((d: any) => (
                      <option key={d.id} value={d.id}>{personName(d.user) || d.id}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label">Anesthetist</label>
                  <select className="input" value={form.anesthetistId} onChange={(e) => setForm((f) => ({ ...f, anesthetistId: e.target.value }))} aria-label="Anesthetist">
                    <option value="">Select anesthetist…</option>
                    {doctors.map((d: any) => (
                      <option key={d.id} value={d.id}>{personName(d.user) || d.id}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label">Attending Nurses</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="input"
                      type="text"
                      placeholder="Enter nurse name…"
                      value={form.nurseInput}
                      onChange={(e) => setForm((f) => ({ ...f, nurseInput: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNurse(); } }}
                      aria-label="Nurse name"
                    />
                    <button type="button" className="btn" onClick={addNurse}>Add</button>
                  </div>
                  {form.nurses.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {form.nurses.map((n: any) => (
                        <span key={n.id} className="badge" style={{ background: 'var(--primary)', color: '#fff' }}>
                          {n.name}
                          <button
                            type="button"
                            aria-label={`Remove ${n.name}`}
                            onClick={() => removeNurse(n.id)}
                            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: 6, fontWeight: 700 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="field">
                  <label className="label">OT Room</label>
                  <select className="input" value={form.otRoom} onChange={(e) => setForm((f) => ({ ...f, otRoom: e.target.value }))} aria-label="OT room">
                    <option value="">Select room…</option>
                    {OT_ROOMS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label">Surgery Date<span style={{ color: 'var(--danger)' }}> *</span></label>
                  <input
                    className="input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    aria-label="Surgery date"
                  />
                </div>

                <div className="field">
                  <label className="label">Start Time</label>
                  <input
                    className="input"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    aria-label="Start time"
                  />
                </div>

                <div className="field">
                  <label className="label">End Time</label>
                  <input
                    className="input"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                    aria-label="End time"
                  />
                </div>
              </div>

              {formMsg && (
                <div className={String(formMsg).toLowerCase().includes('success') ? 'alert alert-success' : 'alert alert-error'} role="status">
                  {formMsg}
                </div>
              )}

              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <button type="button" className="btn" onClick={submitSchedule} disabled={saving}>
                  {saving ? 'Scheduling…' : 'Schedule Surgery'}
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ background: 'var(--border)', color: 'inherit' }}
                  onClick={() => { setShowSchedule(false); setFormMsg(''); }}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Procedure</th>
                  <th>Surgeon</th>
                  <th>Team</th>
                  <th>OT Room</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {scheduleList.map((c) => {
                  const nurses = Array.isArray(c.nurses)
                    ? c.nurses.map((n: any) => (typeof n === 'string' ? n : n?.name)).filter(Boolean).join(', ')
                    : '';
                  const date = c.scheduledDate ? new Date(c.scheduledDate).toLocaleDateString() : '—';
                  return (
                    <tr key={c.id}>
                      <td><strong>{personName(c.patient) || c.patientId || '—'}</strong></td>
                      <td>{c.procedureName || '—'}</td>
                      <td>{personName(c.surgeon) || c.surgeonId || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {[
                          c.anesthesiaType ? `Anes: ${c.anesthesiaType}` : '',
                          personName(c.anesthetist) ? `Anes: ${personName(c.anesthetist)}` : '',
                          nurses ? `Nurses: ${nurses}` : '',
                        ].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td>{c.otRoom || 'Unassigned'}</td>
                      <td>{date} · {c.startTime || '—'}{c.endTime ? ` – ${c.endTime}` : ''}</td>
                      <td>
                        <span className={`badge ${STATUS_TONES[String(c.status).toUpperCase()] || 'badge-gray'}`}>
                          {String(c.status || 'UNKNOWN').replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!scheduleList.length && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No OT cases scheduled.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Timeline — Rooms × Hours</h3>
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0 }}>Room</th>
                    {HOURS.map((h) => (
                      <th key={h} style={{ textAlign: 'center', fontSize: 11 }}>{String(h).padStart(2, '0')}:00</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((room) => (
                    <tr key={room}>
                      <td style={{ position: 'sticky', left: 0, fontWeight: 600, whiteSpace: 'nowrap' }}>{room}</td>
                      {HOURS.map((h) => {
                        const inRoom = scheduleList.filter(
                          (c) => (c.otRoom || 'Unassigned') === room
                        );
                        const blocks = inRoom.filter((c) => {
                          const s = caseStart(c);
                          const e = caseEnd(c, s);
                          return s != null && e != null && h >= Math.floor(s) && h < Math.ceil(e);
                        });
                        const block = blocks[0];
                        const s = block ? caseStart(block) : null;
                        const e = block ? caseEnd(block, s) : null;
                        const partialStart = s != null && h < s;
                        const partialEnd = e != null && h + 1 > e;
                        const tone =
                          String(block?.status).toUpperCase() === 'IN_PROGRESS'
                            ? 'var(--warning)'
                            : String(block?.status).toUpperCase() === 'COMPLETED'
                              ? 'var(--success)'
                              : String(block?.status).toUpperCase() === 'CANCELLED'
                                ? 'var(--danger)'
                                : 'var(--primary)';
                        return (
                          <td
                            key={h}
                            style={{
                              padding: 2,
                              background: block ? tone : 'transparent',
                              opacity: block ? (partialStart || partialEnd ? 0.45 : 1) : 1,
                              borderRadius: 4,
                              color: '#fff',
                              fontSize: 11,
                              textAlign: 'center',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={block ? `${personName(block.patient)} — ${block.procedureName || ''}` : undefined}
                          >
                            {block && !partialStart ? personName(block.patient).split(' ')[0] || 'Case' : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && tab === 'active' && (
        activeCases.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {activeCases.map((c) => {
              const startMs = c.startedAt ? new Date(c.startedAt).getTime() : null;
              const elapsed = startMs ? Math.max(0, Math.round((tick - startMs) / 60000)) : null;
              return (
                <div className="card" key={c.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{personName(c.patient) || c.patientId}</h3>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{c.procedureName || 'Procedure'}</p>
                    </div>
                    <span className="badge badge-yellow">IN PROGRESS</span>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 13, display: 'grid', gap: 4 }}>
                    <span>Surgeon: <strong>{personName(c.surgeon) || c.surgeonId || '—'}</strong></span>
                    <span>OT Room: <strong>{c.otRoom || 'Unassigned'}</strong></span>
                    <span>Started: <strong>{c.startedAt ? new Date(c.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : c.startTime || '—'}</strong></span>
                    <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {elapsed != null ? fmtMinutes(elapsed) : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button className="btn btn-sm" disabled={busyId === c.id} onClick={() => updateStatus(c, 'COMPLETED')}>
                      Complete Surgery
                    </button>
                    <button className="btn btn-sm btn-secondary" disabled={busyId === c.id} onClick={() => updateStatus(c, 'CANCELLED')}>
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty">No surgeries currently in progress.</div>
        )
      )}

      {!loading && tab === 'checklist' && (
        <>
          <div className="toolbar">
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label">Surgery</label>
              <select className="input" value={selectedSurgery} onChange={(e) => setSelectedSurgery(e.target.value)}>
                <option value="">Select a surgery…</option>
                {cases.slice(0, 100).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.otNumber || c.id.slice(0, 8)} — {personName(c.patient) || c.patientId} — {c.procedureName || 'Procedure'}
                  </option>
                ))}
              </select>
            </div>
            {selectedSurgery && checklists[selectedSurgery] && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  const next = { ...checklists };
                  delete next[selectedSurgery];
                  setChecklists(next);
                  saveChecklists(next);
                  persistChecklist(selectedSurgery, {});
                }}
              >
                Reset checklist
              </button>
            )}
          </div>

          {!selectedSurgery ? (
            <div className="empty">Select a surgery to run the WHO Surgical Safety Checklist.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
              {CHECKLIST_CATEGORIES.map((cat) => {
                const checked: string[] = checklists[selectedSurgery]?.[cat.name] || [];
                const pct = cat.items.length ? Math.round((checked.length / cat.items.length) * 100) : 0;
                return (
                  <div className="card" key={cat.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{cat.name}</h3>
                      <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? 'var(--success)' : 'var(--text-muted)' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--success)' : 'var(--primary)' }} />
                    </div>
                    {cat.items.map((item) => (
                      <label key={item} className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={checked.includes(item)}
                          onChange={() => toggleItem(selectedSurgery, cat.name, item)}
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {!loading && tab === 'analytics' && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Total Cases</div>
              <div className="stat-value">{stats.total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Completed</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.completed}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Cancelled</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.cancelled}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">In Progress</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{stats.inProgress}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Cases by Type / Procedure</h3>
            {!stats.byType.length ? (
              <div className="empty">No cases recorded.</div>
            ) : (
              stats.byType.map((t) => (
                <div key={t.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{t.count}</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--border)', borderRadius: 5 }}>
                    <div
                      style={{
                        width: `${Math.round((t.count / stats.maxType) * 100)}%`,
                        height: '100%',
                        background: 'var(--primary)',
                        borderRadius: 5,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div className="stat-card">
              <div className="stat-label">Average Surgery Duration</div>
              <div className="stat-value">{stats.avgDuration ? fmtMinutes(stats.avgDuration) : '—'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">OT Utilization Rate</div>
              <div className="stat-value">{stats.utilization}%</div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
