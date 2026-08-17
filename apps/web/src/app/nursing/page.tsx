'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/hooks';
import { PATIENT_REF } from '@/lib/options';
import ModulePage from '@/components/ModulePage';

type Tab = 'vitals' | 'notes' | 'mar' | 'summary';

export default function NursingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [patientId, setPatientId] = useState('');
  const [admissionId, setAdmissionId] = useState('');
  const [vitals, setVitals] = useState<any[]>([]);
  const [loadingVitals, setLoadingVitals] = useState(false);
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [meds, setMeds] = useState<any[]>([]);
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [admissions, setAdmissions] = useState<any[]>([]);

  const tabBtn = (key: Tab, label: string) => (
    <button className="btn btn-sm" style={{ background: activeTab === key ? 'var(--primary)' : 'var(--bg-secondary)', color: activeTab === key ? '#fff' : undefined }} onClick={() => setActiveTab(key)}>{label}</button>
  );

  useEffect(() => {
    api('/patients?limit=500').then((r) => setPatients(r?.data?.data ?? r?.data ?? [])).catch(() => {});
    api('/admissions?limit=500&status=ADMITTED').then((r) => setAdmissions(r?.data?.data ?? r?.data ?? [])).catch(() => {});
  }, []);

  const loadVitals = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoadingVitals(true);
    try {
      const r = await api(`/encounters/vitals/patient/${pid}`);
      setVitals(r?.data?.data ?? r?.data ?? []);
    } catch { setVitals([]); }
    setLoadingVitals(false);
  }, []);

  const loadNotes = useCallback(async (admId: string) => {
    if (!admId) return;
    setLoadingNotes(true);
    try {
      const r = await api(`/admissions/${admId}/nursing-notes`);
      setNotes(r?.data?.data ?? r?.data ?? []);
    } catch { setNotes([]); }
    setLoadingNotes(false);
  }, []);

  const loadMeds = useCallback(async (admId: string) => {
    if (!admId) return;
    setLoadingMeds(true);
    try {
      const r = await api(`/admissions/${admId}/medications`);
      setMeds(r?.data?.data ?? r?.data ?? []);
    } catch { setMeds([]); }
    setLoadingMeds(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'vitals' && patientId) loadVitals(patientId);
    if (activeTab === 'notes' && admissionId) loadNotes(admissionId);
    if (activeTab === 'mar' && admissionId) loadMeds(admissionId);
    if (activeTab === 'summary') {
      setLoadingSummary(true);
      api('/admissions?limit=1&status=ADMITTED').then((r) => {
        const d = r?.data?.data ?? r?.data ?? [];
        setSummary({ activeAdmissions: Array.isArray(d) ? d.length : 0 });
        setLoadingSummary(false);
      }).catch(() => setLoadingSummary(false));
    }
  }, [activeTab, patientId, admissionId, loadVitals, loadNotes, loadMeds]);

  const recordVital = async (data: any) => {
    try {
      await api('/encounters/vitals', { method: 'POST', body: JSON.stringify(data) });
      if (patientId) loadVitals(patientId);
    } catch {}
  };

  const addNote = async (data: any) => {
    if (!admissionId) return;
    try {
      await api(`/admissions/${admissionId}/nursing-notes`, { method: 'POST', body: JSON.stringify(data) });
      loadNotes(admissionId);
    } catch {}
  };

  const administerMed = async (medId: string) => {
    if (!admissionId) return;
    try {
      await api(`/admissions/${admissionId}/medications/${medId}/administer`, { method: 'POST', body: JSON.stringify({ status: 'GIVEN', givenTime: new Date().toISOString() }) });
      loadMeds(admissionId);
    } catch {}
  };

  const VitalForm = () => {
    const [form, setForm] = useState({ temperature: '', pulse: '', respiratoryRate: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', oxygenSaturation: '', weight: '', painScore: '', bloodGlucose: '', notes: '' });
    const submit = () => {
      const payload: any = { patientId, notes: form.notes || undefined };
      if (form.temperature) payload.temperature = parseFloat(form.temperature);
      if (form.pulse) payload.pulse = parseInt(form.pulse);
      if (form.respiratoryRate) payload.respiratoryRate = parseInt(form.respiratoryRate);
      if (form.bloodPressureSystolic) payload.bloodPressureSystolic = parseInt(form.bloodPressureSystolic);
      if (form.bloodPressureDiastolic) payload.bloodPressureDiastolic = parseInt(form.bloodPressureDiastolic);
      if (form.oxygenSaturation) payload.oxygenSaturation = parseFloat(form.oxygenSaturation);
      if (form.weight) payload.weight = parseFloat(form.weight);
      if (form.painScore) payload.painScore = parseInt(form.painScore);
      if (form.bloodGlucose) payload.bloodGlucose = parseFloat(form.bloodGlucose);
      recordVital(payload);
      setForm({ temperature: '', pulse: '', respiratoryRate: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', oxygenSaturation: '', weight: '', painScore: '', bloodGlucose: '', notes: '' });
    };
    return (
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Record Vitals</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {[
            { key: 'temperature', label: 'Temp (°F)', step: '0.1' },
            { key: 'pulse', label: 'Pulse', step: '1' },
            { key: 'respiratoryRate', label: 'Resp Rate', step: '1' },
            { key: 'bloodPressureSystolic', label: 'BP Systolic', step: '1' },
            { key: 'bloodPressureDiastolic', label: 'BP Diastolic', step: '1' },
            { key: 'oxygenSaturation', label: 'SpO2 (%)', step: '0.1' },
            { key: 'weight', label: 'Weight (kg)', step: '0.1' },
            { key: 'painScore', label: 'Pain (0-10)', step: '1' },
            { key: 'bloodGlucose', label: 'Glucose', step: '0.1' },
          ].map(({ key, label, step }) => (
            <div key={key}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{label}</label>
              <input className="input" type="number" step={step} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} style={{ width: '100%' }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Notes</label>
          <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ width: '100%' }} placeholder="Optional notes" />
        </div>
        <button className="btn" style={{ marginTop: 12, background: 'var(--primary)', color: '#fff' }} onClick={submit}>Record</button>
      </div>
    );
  };

  const NoteForm = () => {
    const [form, setForm] = useState({ note: '', assessment: '', plan: '' });
    const submit = () => {
      if (!form.note.trim()) return;
      addNote(form);
      setForm({ note: '', assessment: '', plan: '' });
    };
    return (
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Add Nursing Note</div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Note *</label>
          <textarea className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ width: '100%', minHeight: 60 }} placeholder="Nursing note..." />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Assessment</label>
          <textarea className="input" value={form.assessment} onChange={(e) => setForm({ ...form, assessment: e.target.value })} style={{ width: '100%', minHeight: 40 }} placeholder="Assessment..." />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Plan</label>
          <textarea className="input" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} style={{ width: '100%', minHeight: 40 }} placeholder="Plan..." />
        </div>
        <button className="btn" style={{ background: 'var(--primary)', color: '#fff' }} onClick={submit}>Add Note</button>
      </div>
    );
  };

  const statusColors: Record<string, string> = {
    SCHEDULED: 'var(--info)', DUE: 'var(--warning)', GIVEN: 'var(--success)',
    MISSED: 'var(--danger)', HELD: 'var(--muted)', REFUSED: 'var(--danger)',
  };

  const renderContent = () => {
    if (activeTab === 'summary') {
      return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Nursing Dashboard</h2>
          {loadingSummary && <div className="loading">Loading...</div>}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
              <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{summary.activeAdmissions}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Active Admissions</div>
              </div>
            </div>
          )}
          <div style={{ marginTop: 24 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select a patient from the Vitals tab to record vital signs, or an admission from Notes/MAR tabs to manage nursing notes and medications.</p>
          </div>
        </div>
      );
    }

    if (activeTab === 'vitals') {
      return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Vital Signs</h2>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Select Patient</label>
            <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)} style={{ minWidth: 250 }}>
              <option value="">Choose patient...</option>
              {patients.map((p: any) => <option key={p.id} value={p.id}>{[p.firstName, p.lastName].filter(Boolean).join(' ')} ({p.mrn})</option>)}
            </select>
          </div>

          {patientId && <VitalForm />}

          {loadingVitals && <div className="loading">Loading vitals...</div>}
          {vitals.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>BP</th>
                    <th>Temp</th>
                    <th>Pulse</th>
                    <th>Resp</th>
                    <th>SpO2</th>
                    <th>Weight</th>
                    <th>Pain</th>
                    <th>Glucose</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {vitals.map((v: any) => (
                    <tr key={v.id}>
                      <td style={{ fontSize: 12 }}>{formatDateTime(v.recordedAt)}</td>
                      <td>{v.bloodPressureSystolic && v.bloodPressureDiastolic ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}` : '—'}</td>
                      <td>{v.temperature ?? '—'}</td>
                      <td>{v.pulse ?? '—'}</td>
                      <td>{v.respiratoryRate ?? '—'}</td>
                      <td>{v.oxygenSaturation != null ? `${v.oxygenSaturation}%` : '—'}</td>
                      <td>{v.weight ? `${v.weight} kg` : '—'}</td>
                      <td>{v.painScore ?? '—'}</td>
                      <td>{v.bloodGlucose ?? '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 150 }}>{v.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loadingVitals && patientId && vitals.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No vital records found for this patient.</div>
          )}
        </div>
      );
    }

    if (activeTab === 'notes') {
      return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Nursing Notes</h2>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Select Admission</label>
            <select className="input" value={admissionId} onChange={(e) => setAdmissionId(e.target.value)} style={{ minWidth: 300 }}>
              <option value="">Choose admission...</option>
              {admissions.map((a: any) => <option key={a.id} value={a.id}>{a.admissionNumber} — {a.patient?.firstName} {a.patient?.lastName}</option>)}
            </select>
          </div>

          {admissionId && <NoteForm />}

          {loadingNotes && <div className="loading">Loading notes...</div>}
          {notes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notes.map((n: any) => (
                <div key={n.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Nursing Note</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDateTime(n.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>{n.note}</div>
                  {n.assessment && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}><strong>Assessment:</strong> {n.assessment}</div>}
                  {n.plan && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}><strong>Plan:</strong> {n.plan}</div>}
                </div>
              ))}
            </div>
          )}
          {!loadingNotes && admissionId && notes.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No nursing notes for this admission.</div>
          )}
        </div>
      );
    }

    if (activeTab === 'mar') {
      return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Medication Administration Record</h2>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Select Admission</label>
            <select className="input" value={admissionId} onChange={(e) => setAdmissionId(e.target.value)} style={{ minWidth: 300 }}>
              <option value="">Choose admission...</option>
              {admissions.map((a: any) => <option key={a.id} value={a.id}>{a.admissionNumber} — {a.patient?.firstName} {a.patient?.lastName}</option>)}
            </select>
          </div>

          {loadingMeds && <div className="loading">Loading medications...</div>}
          {meds.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Dose</th>
                    <th>Route</th>
                    <th>Scheduled</th>
                    <th>Given</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {meds.map((m: any) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.medicineName}</td>
                      <td>{m.dose}</td>
                      <td>{m.route || '—'}</td>
                      <td style={{ fontSize: 12 }}>{formatDateTime(m.scheduledTime)}</td>
                      <td style={{ fontSize: 12 }}>{m.givenTime ? formatDateTime(m.givenTime) : '—'}</td>
                      <td>
                        <span className="badge" style={{ background: statusColors[m.status] || 'var(--muted)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{m.status}</span>
                      </td>
                      <td>
                        {m.status !== 'GIVEN' && m.status !== 'MISSED' && m.status !== 'REFUSED' && (
                          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--success)' }} onClick={() => administerMed(m.id)}>Give</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loadingMeds && admissionId && meds.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No medications scheduled for this admission.</div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Nursing</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>Vitals, nursing notes, and medication administration</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tabBtn('summary', 'Dashboard')}
          {tabBtn('vitals', 'Vitals')}
          {tabBtn('notes', 'Notes')}
          {tabBtn('mar', 'MAR')}
        </div>
      </div>
      {renderContent()}
    </div>
  );
}
