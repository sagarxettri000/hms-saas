'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/hooks';
import PaymentModal from '@/components/PaymentModal';
import ReceiptModal from '@/components/ReceiptModal';
import AsyncSearchSelect from '@/components/AsyncSearchSelect';

// Dedicated Emergency-department workspace. Visible only to EMERGENCY_STAFF
// (plus admins) via the sidebar; the ER billing surfaces here read the
// ER-only endpoints so EMERGENCY revenue never mixes with shared billing.

const VALID_TABS = ['dashboard', 'register', 'cases', 'beds', 'billing', 'reports'];

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  register: 'Register Patient',
  cases: 'Patients',
  beds: 'Beds',
  billing: 'Billing',
  reports: 'Reports',
};

const TRIAGE_LEVELS = [
  { value: 'IMMEDIATE', label: 'Immediate (Red)', color: '#dc2626' },
  { value: 'EMERGENT', label: 'Emergent (Orange)', color: '#ea580c' },
  { value: 'URGENT', label: 'Urgent (Yellow)', color: '#ca8a04' },
  { value: 'NON_URGENT', label: 'Non-urgent (Green)', color: '#16a34a' },
];

const ARRIVAL_MODES = [
  { value: 'AMBULANCE', label: 'Ambulance' },
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'POLICE', label: 'Police' },
  { value: 'OTHER', label: 'Other' },
];

function toList(res: any): any[] {
  const d = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

function triageBadge(level?: string | null) {
  const t = TRIAGE_LEVELS.find((x) => x.value === level);
  if (!t) return <span className="badge">—</span>;
  return (
    <span className="badge" style={{ background: t.color, color: '#fff' }}>
      {t.label}
    </span>
  );
}

// ---------------- Dashboard ----------------

type Dash = {
  total?: number;
  today?: number;
  currentlyAdmitted?: number;
  dischargedToday?: number;
  byTriage?: { triage: string; count: number }[];
  revenueToday?: { billed: number; collected: number; bills: number };
  beds?: { wardId: string | null; wardName: string | null; total: number; free: number };
};

function DashboardTab({ onGo }: { onGo: (tab: string) => void }) {
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api('/emergency/dashboard')
      .then((r: any) => setDash(r?.data ?? r))
      .catch(() => setError('Could not load the emergency dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading ER dashboard...</div>;
  if (error)
    return (
      <div className="empty" role="alert">
        {error}
        <br />
        <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={load}>Retry</button>
      </div>
    );
  if (!dash) return null;

  const stats = [
    { label: 'Cases today', value: dash.today ?? 0, tone: '' },
    { label: 'Currently admitted', value: dash.currentlyAdmitted ?? 0, tone: 'orange' },
    { label: 'Discharged today', value: dash.dischargedToday ?? 0, tone: 'green' },
    { label: `ER beds free${dash.beds?.wardName ? ` · ${dash.beds.wardName}` : ''}`, value: `${dash.beds?.free ?? 0}/${dash.beds?.total ?? 0}`, tone: '' },
    { label: 'ER billed today', value: formatMoney(dash.revenueToday?.billed ?? 0), tone: '' },
    { label: 'ER collected today', value: formatMoney(dash.revenueToday?.collected ?? 0), tone: 'green' },
  ];

  return (
    <>
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        {stats.map((s) => (
          <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
            <div className="note">{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.tone === 'green' ? '#16a34a' : s.tone === 'orange' ? '#ea580c' : undefined }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
        <div className="card">
          <h3>Active cases by triage</h3>
          {(dash.byTriage || []).length === 0 ? (
            <p className="empty">No active cases.</p>
          ) : (
            (dash.byTriage || []).map((t) => {
              const meta = TRIAGE_LEVELS.find((x) => x.value === t.triage);
              return (
                <div key={t.triage} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                  {triageBadge(t.triage)}
                  <strong>{t.count}</strong>
                  <span className="note">{meta?.label ?? t.triage}</span>
                </div>
              );
            })
          )}
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => onGo('cases')}>
            Open patient list →
          </button>
        </div>
        <div className="card">
          <h3>Quick actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => onGo('register')}>＋ Register emergency patient</button>
            <button className="btn btn-secondary" onClick={() => onGo('billing')}>₨ Emergency billing</button>
            <button className="btn btn-secondary" onClick={() => onGo('beds')}>⊞ Emergency beds</button>
            <button className="btn btn-secondary" onClick={() => onGo('reports')}>▦ ER reports</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------- Register patient → start case ----------------

function RegisterTab({ onRegistered }: { onRegistered: () => void }) {
  const [form, setForm] = useState<Record<string, any>>({
    firstName: '', lastName: '', gender: 'MALE', age: '', phone: '', addressLine1: '', city: '',
  });
  const [caseForm, setCaseForm] = useState<Record<string, any>>({
    triageLevel: 'URGENT', arrivalMode: 'WALK_IN', chiefComplaint: '', doctorId: '',
  });
  const [doctors, setDoctors] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    api('/doctors?limit=200')
      .then((r: any) => setDoctors(toList(r)))
      .catch(() => setDoctors([]));
  }, []);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const setCase = (k: string, v: any) => setCaseForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!String(form.firstName || '').trim() || !String(form.lastName || '').trim()) {
      setError('First and last name are required.');
      return;
    }
    setSaving(true);
    try {
      const created = await api('/patients', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          age: form.age ? Number(form.age) : undefined,
          consentGiven: true,
        }),
      });
      const patientId = created?.data?.id || created?.id;
      if (!patientId) throw new Error('no id');
      const c = await api('/emergency', {
        method: 'POST',
        body: JSON.stringify({ patientId, ...caseForm, doctorId: caseForm.doctorId || undefined }),
      });
      const caseNumber = c?.data?.caseNumber || c?.caseNumber;
      const docName = doctors.find((d) => d.id === caseForm.doctorId);
      const docLabel = docName ? [docName.user?.firstName, docName.user?.lastName].filter(Boolean).join(' ') : '';
      setSuccess(`Patient registered and ER case ${caseNumber || ''} started.${docLabel ? ` Assigned to Dr. ${docLabel}.` : ''}`);
      setForm({ firstName: '', lastName: '', gender: 'MALE', age: '', phone: '', addressLine1: '', city: '' });
      setCaseForm({ triageLevel: 'URGENT', arrivalMode: 'WALK_IN', chiefComplaint: '', doctorId: '' });
      onRegistered();
    } catch (e: any) {
      setError(e?.message ? `Could not register: ${e.message}` : 'Could not register the patient.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <h3>Register emergency patient</h3>
      <p className="note">Creates the patient record, then immediately opens an ER case with triage.</p>
      {error && <div role="alert" className="note" style={{ color: '#dc2626' }}>{error}</div>}
      {success && <div role="status" className="note" style={{ color: '#16a34a' }}>{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
        <label>First name *<input className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required /></label>
        <label>Last name *<input className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required /></label>
        <label>Gender
          <select className="input" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>Age (years)<input className="input" type="number" min="0" max="130" value={form.age ?? ''} onChange={(e) => set('age', e.target.value)} /></label>
        <label>Phone<input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <label>Address<input className="input" value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} /></label>
        <label>City<input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} /></label>
      </div>

      <h3 style={{ marginTop: 14 }}>Triage</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <label>Triage level
          <select className="input" value={caseForm.triageLevel} onChange={(e) => setCase('triageLevel', e.target.value)}>
            {TRIAGE_LEVELS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label>Arrival mode
          <select className="input" value={caseForm.arrivalMode} onChange={(e) => setCase('arrivalMode', e.target.value)}>
            {ARRIVAL_MODES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </label>
        <label style={{ gridColumn: '1 / -1' }}>Chief complaint
          <input className="input" value={caseForm.chiefComplaint} onChange={(e) => setCase('chiefComplaint', e.target.value)} placeholder="e.g. chest pain, RTA injury…" />
        </label>
        <label style={{ gridColumn: '1 / -1' }}>Attending doctor
          <select className="input" value={caseForm.doctorId} onChange={(e) => setCase('doctorId', e.target.value)}>
            <option value="">— Assign later —</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                Dr. {[d.user?.firstName, d.user?.lastName].filter(Boolean).join(' ') || d.name || d.id}
                {d.specialization ? ` · ${d.specialization}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="note" style={{ marginTop: 6 }}>The selected doctor gets this patient in their "My Patients" list immediately.</p>

      <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={saving} onClick={submit}>
        {saving ? 'Registering…' : 'Register & start ER case'}
      </button>
    </div>
  );
}

// ---------------- Cases (triage / admit / discharge) ----------------

function CasesTab() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [admitting, setAdmitting] = useState<any>(null);
  const [discharging, setDischarging] = useState<any>(null);
  const [erWardId, setErWardId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    params.set('limit', '100');
    api(`/emergency?${params.toString()}`)
      .then((r: any) => setCases(toList(r)))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [search, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // Remember the ER ward so the admit dialog can offer its beds.
    api('/bed-management/wards')
      .then((r: any) => {
        const wards = toList(r);
        const er = wards.find((w) => /emergency/i.test(w.name || ''));
        setErWardId(er?.id ?? null);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <input className="input" placeholder="Search case no / patient / MRN…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 280 }} />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Under care</option>
          <option value="ADMITTED">Admitted</option>
          <option value="DISCHARGED">Discharged</option>
        </select>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
        <span className="note">{cases.length} case(s)</span>
      </div>

      {loading ? (
        <div className="loading">Loading cases...</div>
      ) : cases.length === 0 ? (
        <div className="empty">No emergency cases match.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Case no.</th><th>Patient</th><th>Triage</th><th>Complaint</th><th>Status</th><th>Arrived</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const discharged = !!c.dischargedAt;
                const bed = c.admission?.bedAllocations?.[0]?.bed?.bedNumber;
                return (
                  <tr key={c.id}>
                    <td className="mono">{c.caseNumber}</td>
                    <td>{[c.patient?.firstName, c.patient?.lastName].filter(Boolean).join(' ') || c.patientId}<br /><span className="note">{c.patient?.mrn || ''}</span></td>
                    <td>{triageBadge(c.triageLevel)}</td>
                    <td>{c.chiefComplaint || '—'}</td>
                    <td>{discharged ? 'Discharged' : c.admitted ? `Admitted${bed ? ` · bed ${bed}` : ''}` : 'Under care'}</td>
                    <td>{formatDateTime(c.createdAt)}</td>
                    <td>
                      {!discharged && !c.admitted && (
                        <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => setAdmitting(c)}>Admit</button>
                      )}
                      {!discharged && (
                        <button className="btn btn-secondary" onClick={() => setDischarging(c)}>Discharge</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {admitting && (
        <AdmitModal
          erCase={admitting}
          erWardId={erWardId}
          onClose={() => setAdmitting(null)}
          onDone={() => { setAdmitting(null); load(); }}
        />
      )}
      {discharging && (
        <DischargeCaseModal
          erCase={discharging}
          onClose={() => setDischarging(null)}
          onDone={() => { setDischarging(null); load(); }}
        />
      )}
    </>
  );
}

function AdmitModal({ erCase, erWardId, onClose, onDone }: {
  erCase: any; erWardId: string | null; onClose: () => void; onDone: () => void;
}) {
  const [beds, setBeds] = useState<any[]>([]);
  const [bedId, setBedId] = useState('');
  const [admittedTo, setAdmittedTo] = useState('Emergency Ward');
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ limit: '100', isActive: 'true' });
    if (erWardId) params.set('wardId', erWardId);
    api(`/bed-management/beds?${params.toString()}`)
      .then((r: any) => setBeds(toList(r).filter((b) => b.status !== 'OCCUPIED')))
      .catch(() => setBeds([]));
    api('/doctors?limit=200')
      .then((r: any) => setDoctors(toList(r)))
      .catch(() => setDoctors([]));
  }, [erWardId]);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api(`/emergency/${erCase.id}/admit`, {
        method: 'PATCH',
        body: JSON.stringify({ bedId: bedId || undefined, admittedTo, doctorId: doctorId || undefined }),
      });
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Could not admit the patient.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3>Admit — {erCase.caseNumber}</h3>
        {error && <div role="alert" className="note" style={{ color: '#dc2626' }}>{error}</div>}
        <label style={{ display: 'block', margin: '10px 0' }}>Emergency bed
          <select className="input" value={bedId} onChange={(e) => setBedId(e.target.value)}>
            <option value="">— No bed (hold in ER) —</option>
            {beds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bedNumber}{b.room?.name ? ` · ${b.room.name}` : ''}{b.ward?.name ? ` · ${b.ward.name}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'block', margin: '10px 0' }}>Admitting to
          <input className="input" value={admittedTo} onChange={(e) => setAdmittedTo(e.target.value)} />
        </label>
        <label style={{ display: 'block', margin: '10px 0' }}>Attending doctor
          <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">— None —</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                Dr. {[d.user?.firstName, d.user?.lastName].filter(Boolean).join(' ') || d.name || d.id}
              </option>
            ))}
          </select>
        </label>
        <p className="note">Creates a real IPD admission (type EMERGENCY) and claims the selected bed. The patient then appears on the bed board and supports transfers.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Admitting…' : 'Admit'}</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DischargeCaseModal({ erCase, onClose, onDone }: {
  erCase: any; onClose: () => void; onDone: () => void;
}) {
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api(`/emergency/${erCase.id}/discharge`, {
        method: 'PATCH',
        body: JSON.stringify({ dischargeSummary: summary }),
      });
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Could not discharge.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3>Discharge — {erCase.caseNumber}</h3>
        {error && <div role="alert" className="note" style={{ color: '#dc2626' }}>{error}</div>}
        <label style={{ display: 'block', margin: '10px 0' }}>Discharge summary
          <textarea className="input" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <p className="note">Releases the ER bed and closes the linked admission.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Discharging…' : 'Discharge'}</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Beds (ER ward board with transfers) ----------------

function BedsTab() {
  const [wardId, setWardId] = useState<string | null>(null);
  const [beds, setBeds] = useState<any[]>([]);
  const [erCases, setErCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<any>(null);

  useEffect(() => {
    api('/bed-management/wards')
      .then((r: any) => {
        const wards = toList(r);
        const er = wards.find((w) => /emergency/i.test(w.name || ''));
        setWardId(er?.id ?? null);
      })
      .catch(() => setError('Could not load wards.'));
    // ER cases are needed to map an admission back to its EmergencyCase id
    // (the transfer endpoint is ER-scoped and keyed by case id).
    api('/emergency?limit=200')
      .then((r: any) => setErCases(toList(r)))
      .catch(() => setErCases([]));
  }, []);

  const load = useCallback(() => {
    if (!wardId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api(`/bed-management/beds?wardId=${wardId}&limit=100`)
      .then((r: any) => setBeds(toList(r)))
      .catch(() => setError('Could not load ER beds.'))
      .finally(() => setLoading(false));
  }, [wardId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="loading">Loading ER beds...</div>;
  if (error) return <div className="empty" role="alert">{error}</div>;

  const free = beds.filter((b) => b.status !== 'OCCUPIED').length;

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <span className="note">{beds.length} bed(s) · {free} free</span>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {beds.map((b) => {
          const occupant = b.allocations?.[0]?.admission?.patient;
          const occupied = b.status === 'OCCUPIED';
          return (
            <div key={b.id} className="card" style={{ padding: 12, borderLeft: `4px solid ${occupied ? '#dc2626' : '#16a34a'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong className="mono">{b.bedNumber}</strong>
                <span className="badge" style={{ background: occupied ? '#dc2626' : '#16a34a', color: '#fff' }}>{occupied ? 'Occupied' : 'Free'}</span>
              </div>
              <div className="note">{b.room?.name || ''}{b.ward?.name ? ` · ${b.ward.name}` : ''}</div>
              {occupant && (
                <div style={{ marginTop: 6 }}>
                  {[occupant.firstName, occupant.lastName].filter(Boolean).join(' ')}
                  <div className="note">{occupant.mrn || ''}</div>
                </div>
              )}
              {occupied && b.allocations?.[0]?.admission?.id && (
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    const adm = b.allocations[0].admission;
                    const erCase = erCases.find((c) => c.admissionId === adm.id);
                    setTransferring({ ...adm, emergencyCaseId: erCase?.id });
                  }}
                >
                  Transfer
                </button>
              )}
            </div>
          );
        })}
      </div>
      {transferring && (
        <TransferModal
          admission={transferring}
          currentBedId={beds.find((b) => b.allocations?.[0]?.admission?.id === transferring.id)?.id}
          onClose={() => setTransferring(null)}
          onDone={() => { setTransferring(null); load(); }}
        />
      )}
    </>
  );
}

function TransferModal({ admission, currentBedId, onClose, onDone }: {
  admission: any; currentBedId?: string; onClose: () => void; onDone: () => void;
}) {
  const [mode, setMode] = useState<'bed' | 'ward'>('bed');
  const [target, setTarget] = useState('');
  const [wardId, setWardId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeBeds, setFreeBeds] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);

  useEffect(() => {
    api('/bed-management/beds?status=AVAILABLE&limit=200')
      .then((r: any) => setFreeBeds(toList(r)))
      .catch(() => setFreeBeds([]));
    api('/bed-management/wards?limit=100')
      .then((r: any) => setWards(toList(r).filter((w: any) => !/emergency/i.test(w.name || ''))))
      .catch(() => setWards([]));
    api('/doctors?limit=200')
      .then((r: any) => setDoctors(toList(r)))
      .catch(() => setDoctors([]));
  }, []);

  async function submit() {
    if (mode === 'bed' && !target) { setError('Pick a destination bed.'); return; }
    if (mode === 'ward' && !wardId) { setError('Pick a destination ward.'); return; }
    setError(null);
    setBusy(true);
    try {
      await api(`/emergency/${admission.emergencyCaseId || admission.id}/transfer`, {
        method: 'PATCH',
        body: JSON.stringify(
          mode === 'bed'
            ? { toBedId: target, reason: reason || undefined }
            : {
                toWardId: wardId,
                doctorId: doctorId || undefined,
                reason: reason || undefined,
              },
        ),
      });
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Transfer failed.');
    } finally {
      setBusy(false);
    }
  }

  const wardOptions = wards.map((w) => (
    <option key={w.id} value={w.id}>{w.name}{w.location ? ` · ${w.location}` : ''}</option>
  ));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3>Transfer patient</h3>
        <p className="note">{[admission.patient?.firstName, admission.patient?.lastName].filter(Boolean).join(' ')} — move to another ER bed, or transfer out to a ward (updates the main admission record).</p>
        {error && <div role="alert" className="note" style={{ color: '#dc2626' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
          <button
            className={`btn btn-sm ${mode === 'bed' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setMode('bed'); setError(null); }}
            type="button"
          >
            ⊞ Another bed
          </button>
          <button
            className={`btn btn-sm ${mode === 'ward' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setMode('ward'); setError(null); }}
            type="button"
          >
            ⇢ To ward
          </button>
        </div>

        {mode === 'bed' ? (
          <label style={{ display: 'block', margin: '10px 0' }}>Destination bed
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">— Select a free bed —</option>
              {freeBeds.filter((b) => b.id !== currentBedId).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bedNumber}{b.room?.name ? ` · ${b.room.name}` : ''}{b.ward?.name ? ` · ${b.ward.name}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label style={{ display: 'block', margin: '10px 0' }}>Destination ward
              <select className="input" value={wardId} onChange={(e) => setWardId(e.target.value)}>
                <option value="">— Select ward —</option>
                {wardOptions}
              </select>
            </label>
            <label style={{ display: 'block', margin: '10px 0' }}>Receiving doctor
              <select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">— Keep current —</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    Dr. {[d.user?.firstName, d.user?.lastName].filter(Boolean).join(' ') || d.name || d.id}
                  </option>
                ))}
              </select>
            </label>
            <p className="note">The main Admit record moves to the chosen ward and department, and the receiving doctor gets the patient in their "My Patients" list.</p>
          </>
        )}

        <label style={{ display: 'block', margin: '10px 0' }}>Reason
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. deteriorating, ICU needed" />
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Transferring…' : 'Transfer'}</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Billing (ER-only invoices + services) ----------------

type ErServicePreset = { code: string; name: string; rate: number };

function BillingTab() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [payTarget, setPayTarget] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100' });
    if (search) params.set('search', search);
    api(`/emergency/billing/invoices?${params.toString()}`)
      .then((r: any) => setInvoices(toList(r)))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
    api('/emergency/billing/summary')
      .then((r: any) => setSummary(r?.data ?? r))
      .catch(() => setSummary(null));
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const outstanding = invoices.reduce(
    (s, i) => s + Math.max(0, Number(i.totalAmount || 0) - Number(i.paidAmount || 0)),
    0,
  );

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <span className="note">
          EMERGENCY billing{summary ? ` · today ${formatMoney(summary.today?.billed ?? 0)} billed / ${formatMoney(summary.today?.collected ?? 0)} collected` : ''} · Outstanding {formatMoney(outstanding)}
        </span>
        <input className="input" placeholder="Search invoice / patient…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 240 }} />
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>＋ New ER bill</button>
      </div>

      {loading ? (
        <div className="loading">Loading ER bills...</div>
      ) : invoices.length === 0 ? (
        <div className="empty">No emergency bills yet. Create one with “New ER bill”.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr><th>Invoice</th><th>Patient</th><th>Date</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td>{[inv.patient?.firstName, inv.patient?.lastName].filter(Boolean).join(' ') || '—'}</td>
                  <td>{formatDateTime(inv.issuedDate)}</td>
                  <td>{formatMoney(inv.totalAmount)}</td>
                  <td>{formatMoney(inv.paidAmount)}</td>
                  <td>{formatMoney(inv.dueAmount)}</td>
                  <td><span className="badge">{inv.status}</span></td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => setPayTarget(inv)}>Pay</button>
                    <button className="btn btn-ghost" style={{ marginLeft: 6 }} onClick={() => setReceipt(inv)}>Receipt</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NewErBillModal
          onClose={() => setCreating(false)}
          onDone={() => { setCreating(false); load(); }}
        />
      )}
      {payTarget && (
        <PaymentModal invoice={payTarget} onClose={() => setPayTarget(null)} onDone={() => { setPayTarget(null); load(); }} />
      )}
      {receipt && <ReceiptModal invoice={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}

function NewErBillModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [patientId, setPatientId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [presets, setPresets] = useState<ErServicePreset[]>([]);
  const [lines, setLines] = useState<Array<{ serviceName: string; serviceCode?: string; quantity: number; rate: number }>>([]);
  const [isCredit, setIsCredit] = useState(false);
  const [takePayment, setTakePayment] = useState(true);
  const [method, setMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api('/emergency/billing/services')
      .then((r: any) => setPresets(toList(r)))
      .catch(() => setPresets([]));
  }, []);

  const total = lines.reduce((s, l) => s + l.quantity * l.rate, 0);

  function addPreset(p: ErServicePreset) {
    setLines((ls) => [...ls, { serviceName: p.name, serviceCode: p.code, quantity: 1, rate: p.rate }]);
  }
  function addCustom() {
    setLines((ls) => [...ls, { serviceName: '', quantity: 1, rate: 0 }]);
  }
  function setLine(i: number, patch: Partial<{ serviceName: string; quantity: number; rate: number }>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setError(null);
    if (!patientId) { setError('Select the patient.'); return; }
    if (lines.length === 0 || lines.some((l) => !l.serviceName.trim() || l.rate <= 0 || l.quantity <= 0)) {
      setError('Every line needs a service name, quantity > 0 and rate > 0.');
      return;
    }
    setBusy(true);
    try {
      await api('/emergency/billing/invoices', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          emergencyCaseId: caseId || undefined,
          items: lines,
          isCredit,
          payment: !isCredit && takePayment ? { method, amount: total } : undefined,
          notes: 'Emergency services',
        }),
      });
      onDone();
    } catch (e: any) {
      setError(e?.message || 'Could not create the ER bill.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' }}>
        <h3>New Emergency bill</h3>
        <p className="note">Billed as type EMERGENCY — appears only in ER billing and ER reports.</p>
        {error && <div role="alert" className="note" style={{ color: '#dc2626' }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '10px 0' }}>
          <label>Patient *
            <AsyncSearchSelect
              endpoint="/patients"
              valueKey="id"
              labelKeys={['firstName', 'lastName', 'mrn']}
              value={patientId}
              onChange={(v: string) => setPatientId(v)}
              placeholder="Search patient by name / MRN…"
            />
          </label>
          <label>Linked ER case (optional)
            <AsyncSearchSelect
              endpoint="/emergency"
              valueKey="id"
              labelKeys={['caseNumber', 'chiefComplaint']}
              value={caseId}
              onChange={(v: string) => setCaseId(v)}
              placeholder="Search case no…"
            />
          </label>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
          {presets.map((p) => (
            <button key={p.code} className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => addPreset(p)}>
              ＋ {p.name} ({formatMoney(p.rate)})
            </button>
          ))}
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={addCustom}>＋ Custom line</button>
        </div>

        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px auto', gap: 6, margin: '6px 0', alignItems: 'center' }}>
            <input className="input" placeholder="Service" value={l.serviceName} onChange={(e) => setLine(i, { serviceName: e.target.value })} />
            <input className="input" type="number" min="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} aria-label="Quantity" />
            <input className="input" type="number" min="0" step="0.01" value={l.rate} onChange={(e) => setLine(i, { rate: Number(e.target.value) })} aria-label="Rate" />
            <button className="btn btn-ghost" onClick={() => removeLine(i)} aria-label="Remove line">✕</button>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <strong>Total: {formatMoney(total)}</strong>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} /> Credit bill
          </label>
        </div>

        {!isCredit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={takePayment} onChange={(e) => setTakePayment(e.target.checked)} /> Take payment now
            </label>
            {takePayment && (
              <select className="input" style={{ maxWidth: 140 }} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="ONLINE">Online</option>
                <option value="BANK">Bank</option>
              </select>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Create ER bill'}</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Reports (ER scope) ----------------

function ReportsTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<{ rows: any[]; cards?: any[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api(`/reports/analysis/er-statistics?${params.toString()}`)
      .then((r: any) => setData(r?.data ?? r))
      .catch(() => setError('Could not load ER statistics.'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <label>From <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn btn-secondary" onClick={load}>Apply</button>
        <a className="btn btn-secondary" href="/reports">Open full reports →</a>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>ER Statistics</h3>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : error ? (
          <div className="empty" role="alert">{error}</div>
        ) : (
          <>
            {(data?.cards || []).length > 0 && (
              <div style={{ display: 'flex', gap: 16, margin: '8px 0' }}>
                {data!.cards!.map((c: any) => (
                  <div key={c.label}><span className="note">{c.label}: </span><strong>{String(c.value)}</strong></div>
                ))}
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Patient</th><th>Triage</th><th>Complaint</th><th>Admitted</th><th>Disposition</th></tr>
                </thead>
                <tbody>
                  {(data?.rows || []).slice(0, 50).map((r: any, i: number) => (
                    <tr key={i}>
                      <td>{formatDateTime(r.date)}</td>
                      <td>{r.patient}</td>
                      <td>{triageBadge(r.triageLevel)}</td>
                      <td>{r.chiefComplaint}</td>
                      <td>{r.admitted}</td>
                      <td>{r.disposition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">Showing up to 50 rows. The ER Revenue report is available under Reports → Statistics → ER REVENUE REPORT.</p>
          </>
        )}
      </div>
    </>
  );
}

// ---------------- Page shell ----------------

function EmergencyPageInner() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab');
    return t && VALID_TABS.includes(t) ? t : 'dashboard';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && VALID_TABS.includes(t)) setActiveTab(t);
  }, [searchParams]);

  function switchTab(tab: string) {
    setActiveTab(tab);
    window.history.replaceState(null, '', `/emergency?tab=${tab}`);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Emergency Department</h1>
          <p className="page-subtitle">Triage, ER patients, beds and emergency-only billing</p>
        </div>
      </div>

      <div className="tabs">
        {VALID_TABS.map((t) => (
          <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => switchTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && <DashboardTab onGo={switchTab} />}
      {activeTab === 'register' && <RegisterTab onRegistered={() => switchTab('cases')} />}
      {activeTab === 'cases' && <CasesTab />}
      {activeTab === 'beds' && <BedsTab />}
      {activeTab === 'billing' && <BillingTab />}
      {activeTab === 'reports' && <ReportsTab />}
    </>
  );
}

export default function EmergencyPage() {
  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <EmergencyPageInner />
    </Suspense>
  );
}
