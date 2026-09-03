'use client';

import { useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import DischargeModal from '@/components/DischargeModal';
import { api } from '@/lib/api';
import { GENDERS } from '@/lib/options';
import type { ApiResponse, Row } from '@/lib/types';

const CLINICAL_ROLES = ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'EMERGENCY_STAFF', 'ANESTHETIST'];
const ADMIN_ROLES = ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN', 'DEPARTMENT_HEAD'];

interface Patient {
  id: string;
  firstName?: string;
  lastName?: string;
  mrn?: string;
  mobile?: string;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
}

interface AdmissionForm {
  patientId: string;
  admittingDoctorId: string;
  departmentId: string;
  admissionType: string;
  provisionalDiagnosis: string;
  referringDoctor: string;
  notes: string;
}

interface QuickPatient {
  firstName: string;
  lastName: string;
  mobile: string;
  gender: string;
  dateOfBirth: string;
}

export default function AdmissionsPage() {
  const [role, setRole] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [admissions, setAdmissions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctors, setDoctors] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<Row[]>([]);
  const [beds, setBeds] = useState<Row[]>([]);
  const [wardFilter, setWardFilter] = useState('');
  const [searchAdmissions, setSearchAdmissions] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dischargeTarget, setDischargeTarget] = useState<Row | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quickPatient, setQuickPatient] = useState<QuickPatient>({
    firstName: '', lastName: '', mobile: '', gender: 'MALE', dateOfBirth: '',
  });
  const [savingPatient, setSavingPatient] = useState(false);
  const [patientError, setPatientError] = useState('');
  const [admissionForm, setAdmissionForm] = useState<AdmissionForm>({
    patientId: '', admittingDoctorId: '', departmentId: '', admissionType: 'GENERAL',
    provisionalDiagnosis: '', referringDoctor: '', notes: '',
  });
  const [savingAdmission, setSavingAdmission] = useState(false);
  const [admissionError, setAdmissionError] = useState('');

  function handleOpenAdmit() {
    setShowAdmitModal(false);
    setSelectedPatient(null);
    setSearchQuery('');
    setSearchResults([]);
    setShowNewPatient(true);
  }

  const canDischarge = CLINICAL_ROLES.concat(ADMIN_ROLES).includes(role);

  useEffect(() => {
    setRole(localStorage.getItem('role') || '');
    loadData();
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  async function loadData() {
    setLoading(true);
    try {
      const [admRes, docRes, deptRes, bedRes] = await Promise.allSettled([
        api(`/admissions?limit=15&page=${page}` + (searchAdmissions ? `&search=${encodeURIComponent(searchAdmissions)}` : '')),
        api('/doctors?limit=500'),
        api('/departments?limit=500'),
        api('/bed-management/beds?limit=100'),
      ]);
      const admPayload = (admRes.status === 'fulfilled' ? admRes.value.data : null) as any;
      const admList: Row[] = admPayload ? (Array.isArray(admPayload) ? admPayload : (admPayload.data ?? [])) : [];
      setAdmissions(admList);
      setTotal(admPayload && !Array.isArray(admPayload) ? (admPayload.total ?? 0) : admList.length);
      const docPayload = (docRes.status === 'fulfilled' ? docRes.value.data : null) as any;
      const docList: Row[] = docPayload ? (Array.isArray(docPayload) ? docPayload : (docPayload.data ?? [])) : [];
      setDoctors(docList);
      const deptPayload = (deptRes.status === 'fulfilled' ? deptRes.value.data : null) as any;
      const deptList: Row[] = deptPayload ? (Array.isArray(deptPayload) ? deptPayload : (deptPayload.data ?? [])) : [];
      setDepartments(deptList);
      const bedPayload = (bedRes.status === 'fulfilled' ? bedRes.value.data : null) as any;
      const bedList: Row[] = bedPayload ? (Array.isArray(bedPayload) ? bedPayload : (bedPayload.data ?? [])) : [];
      setBeds(bedList);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [page, searchAdmissions]);

  function handleSearchPatients(term: string) {
    setSearchQuery(term);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res: ApiResponse<any> = await api(`/patients?search=${encodeURIComponent(term.trim())}&limit=10`);
        const payload = res.data as any;
        const list = Array.isArray(payload) ? payload : payload.data ?? [];
        setSearchResults(list);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function selectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setAdmissionForm((f) => ({ ...f, patientId: patient.id }));
    setShowNewPatient(false);
    setSearchResults([]);
    setSearchQuery('');
    setShowAdmitModal(true);
  }

  async function handleQuickRegister(e: React.FormEvent) {
    e.preventDefault();
    setSavingPatient(true);
    setPatientError('');
    try {
      const payload: Record<string, any> = {};
      if (quickPatient.firstName.trim()) payload.firstName = quickPatient.firstName.trim();
      if (quickPatient.lastName.trim()) payload.lastName = quickPatient.lastName.trim();
      if (quickPatient.mobile.trim()) payload.mobile = quickPatient.mobile.trim();
      if (quickPatient.gender) payload.gender = quickPatient.gender;
      if (quickPatient.dateOfBirth) payload.dateOfBirth = new Date(quickPatient.dateOfBirth).toISOString();
      const res: ApiResponse<any> = await api('/patients', { method: 'POST', body: JSON.stringify(payload) });
      const patientData = (res.data as any)?.data ?? res.data ?? res;
      const newPatient: Patient = {
        id: patientData.id,
        firstName: patientData.firstName,
        lastName: patientData.lastName,
        mrn: patientData.mrn,
        mobile: patientData.mobile,
        gender: patientData.gender,
      };
      selectPatient(newPatient);
      setFlash('Patient registered');
    } catch (err) {
      setPatientError(err instanceof Error ? err.message : 'Failed to register patient');
    } finally {
      setSavingPatient(false);
    }
  }

  async function handleAdmit(e: React.FormEvent) {
    e.preventDefault();
    if (!admissionForm.patientId) return;
    setSavingAdmission(true);
    setAdmissionError('');
    try {
      const payload: Record<string, any> = { patientId: admissionForm.patientId };
      if (admissionForm.admittingDoctorId) payload.admittingDoctorId = admissionForm.admittingDoctorId;
      if (admissionForm.departmentId) payload.departmentId = admissionForm.departmentId;
      if (admissionForm.admissionType) payload.admissionType = admissionForm.admissionType;
      if (admissionForm.provisionalDiagnosis.trim()) payload.provisionalDiagnosis = admissionForm.provisionalDiagnosis.trim();
      if (admissionForm.referringDoctor.trim()) payload.referringDoctor = admissionForm.referringDoctor.trim();
      if (admissionForm.notes.trim()) payload.notes = admissionForm.notes.trim();
      await api('/admissions', { method: 'POST', body: JSON.stringify(payload) });
      setShowAdmitModal(false);
      setSelectedPatient(null);
      setAdmissionForm({ patientId: '', admittingDoctorId: '', departmentId: '', admissionType: 'GENERAL', provisionalDiagnosis: '', referringDoctor: '', notes: '' });
      setFlash('Patient admitted successfully');
      loadData();
    } catch (err) {
      setAdmissionError(err instanceof Error ? err.message : 'Failed to admit patient');
    } finally {
      setSavingAdmission(false);
    }
  }

  const availableBeds = beds.filter((b: any) => b.status === 'AVAILABLE' && (!wardFilter || b.wardId === wardFilter));
  const totalPages = Math.max(1, Math.ceil(total / 15));
  const uniqueWards = [...new Set(beds.map((b: any) => b.wardId).filter(Boolean))];

  function patientName(r: Row) {
    return [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId;
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admit</h1>
          <p className="page-subtitle">IPD admissions &amp; bed management</p>
        </div>
        <button className="btn" onClick={handleOpenAdmit}>
          + Admit patient
        </button>
      </div>

      {flash && <div className="alert alert-success">{flash}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', position: 'relative' }}>
          <input
            id="admit-search-input"
            className="input search-input"
            placeholder="Search patients by name, MRN, or phone to admit..."
            value={searchQuery}
            onChange={(e) => handleSearchPatients(e.target.value)}
            style={{ width: '100%', paddingRight: 32 }}
          />
          {searching && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>...</span>}
          {searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', marginTop: 4 }}>
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPatient(p)}
                  style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: 14 }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{p.firstName} {p.lastName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {p.mrn && <span className="mono" style={{ marginRight: 8 }}>{p.mrn}</span>}
                      {p.mobile && <span>{p.mobile}</span>}
                    </div>
                  </div>
                  <span className="badge badge-blue" style={{ fontSize: 11 }}>Admit</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setShowNewPatient(true); setShowAdmitModal(false); }}
                style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: 14, color: 'var(--primary)' }}
              >
                <span>+</span>
                <span>Patient not found? Register new patient</span>
              </button>
            </div>
          )}
          {searchQuery && !searching && searchResults.length === 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
              <div style={{ marginBottom: 8 }}>No patients found for &quot;{searchQuery}&quot;</div>
              <button className="btn btn-sm" onClick={() => { setShowNewPatient(true); }}>
                + Register new patient &amp; admit
              </button>
            </div>
          )}
        </div>
        <input
          className="input search-input"
          placeholder="Filter admissions..."
          value={searchAdmissions}
          onChange={(e) => { setSearchAdmissions(e.target.value); setPage(1); }}
          style={{ width: 240 }}
        />
      </div>

      {showNewPatient && (
        <div className="modal-backdrop" onClick={() => setShowNewPatient(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Quick Register &amp; Admit</h3>
              <button className="modal-close" onClick={() => setShowNewPatient(false)}>×</button>
            </div>
            <form onSubmit={handleQuickRegister}>
              <p className="note" style={{ marginBottom: 12 }}>Register a new patient and proceed directly to admission.</p>
              <div className="form-grid">
                <div className="field">
                  <label className="label">First name <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="input" value={quickPatient.firstName} onChange={(e) => setQuickPatient((p) => ({ ...p, firstName: e.target.value }))} required />
                </div>
                <div className="field">
                  <label className="label">Last name</label>
                  <input className="input" value={quickPatient.lastName} onChange={(e) => setQuickPatient((p) => ({ ...p, lastName: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Phone</label>
                  <input className="input" value={quickPatient.mobile} onChange={(e) => setQuickPatient((p) => ({ ...p, mobile: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Gender</label>
                  <select className="input" value={quickPatient.gender} onChange={(e) => setQuickPatient((p) => ({ ...p, gender: e.target.value }))}>
                    {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
                <div className="field field-full">
                  <label className="label">Date of birth</label>
                  <input className="input" type="date" value={quickPatient.dateOfBirth} onChange={(e) => setQuickPatient((p) => ({ ...p, dateOfBirth: e.target.value }))} />
                </div>
              </div>
              {patientError && <div className="alert alert-error" style={{ marginTop: 12 }}>{patientError}</div>}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewPatient(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={savingPatient || !quickPatient.firstName.trim()}>
                  {savingPatient ? 'Registering...' : 'Register & Admit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdmitModal && selectedPatient && (
        <div className="modal-backdrop" onClick={() => setShowAdmitModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3 className="modal-title">Admit Patient</h3>
              <button className="modal-close" onClick={() => setShowAdmitModal(false)}>×</button>
            </div>

            <div style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
                {(selectedPatient.firstName?.[0] || '').toUpperCase()}{(selectedPatient.lastName?.[0] || '').toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{selectedPatient.firstName} {selectedPatient.lastName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {selectedPatient.mrn && <span className="mono">{selectedPatient.mrn}</span>}
                  {selectedPatient.gender && <span style={{ marginLeft: 8 }}>{selectedPatient.gender}</span>}
                  {selectedPatient.mobile && <span style={{ marginLeft: 8 }}>{selectedPatient.mobile}</span>}
                </div>
              </div>
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => { setSelectedPatient(null); setShowAdmitModal(false); setSearchQuery(''); }}>
                Change
              </button>
            </div>

            <form onSubmit={handleAdmit}>
              <div className="form-grid">
                <div className="field">
                  <label className="label">Admission type</label>
                  <select className="input" value={admissionForm.admissionType} onChange={(e) => setAdmissionForm((f) => ({ ...f, admissionType: e.target.value }))}>
                    <option value="GENERAL">General</option>
                    <option value="EMERGENCY">Emergency</option>
                    <option value="PLANNED">Planned</option>
                    <option value="TRANSFER">Transfer</option>
                  </select>
                </div>
                <div className="field">
                  <label className="label">Attending doctor</label>
                  <select className="input" value={admissionForm.admittingDoctorId} onChange={(e) => setAdmissionForm((f) => ({ ...f, admittingDoctorId: e.target.value }))}>
                    <option value="">— Select —</option>
                    {doctors.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.user?.firstName} {d.user?.lastName}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Department</label>
                  <select className="input" value={admissionForm.departmentId} onChange={(e) => { setAdmissionForm((f) => ({ ...f, departmentId: e.target.value })); setWardFilter(''); }}>
                    <option value="">— Select —</option>
                    {departments.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Provisional diagnosis</label>
                  <input className="input" value={admissionForm.provisionalDiagnosis} onChange={(e) => setAdmissionForm((f) => ({ ...f, provisionalDiagnosis: e.target.value }))} placeholder="e.g. Pneumonia" />
                </div>
                <div className="field">
                  <label className="label">Referring doctor</label>
                  <input className="input" value={admissionForm.referringDoctor} onChange={(e) => setAdmissionForm((f) => ({ ...f, referringDoctor: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Available beds</label>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '6px 0' }}>
                    {availableBeds.length} bed{availableBeds.length !== 1 ? 's' : ''} available
                  </div>
                </div>
                <div className="field field-full">
                  <label className="label">Notes</label>
                  <textarea className="textarea" value={admissionForm.notes} onChange={(e) => setAdmissionForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
                </div>
              </div>
              {admissionError && <div className="alert alert-error" style={{ marginTop: 12 }}>{admissionError}</div>}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdmitModal(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={savingAdmission}>
                  {savingAdmission ? 'Admitting...' : 'Admit Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {dischargeTarget && (
        <DischargeModal
          admission={{ id: dischargeTarget.id, admissionNumber: dischargeTarget.admissionNumber, patientName: patientName(dischargeTarget) }}
          patientId={dischargeTarget.patientId}
          patientName={patientName(dischargeTarget)}
          onClose={() => setDischargeTarget(null)}
          onDone={() => { setDischargeTarget(null); loadData(); }}
        />
      )}

      {loading ? (
        <div className="loading">Loading admissions...</div>
      ) : admissions.length === 0 ? (
        <div className="empty">
          <div className="empty-state">No admissions found. Click &quot;Admit patient&quot; or search above to begin.</div>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Bed</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Admitted</th>
                  {canDischarge && <th style={{ width: 1 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {admissions.map((r: any, i: number) => (
                  <tr key={r.id ?? i}>
                    <td>{patientName(r)}</td>
                    <td>{r.bedAllocations?.[0]?.bed?.bedNumber || '—'}</td>
                    <td><span className={`badge badge-${r.admissionType === 'EMERGENCY' ? 'red' : r.admissionType === 'PLANNED' ? 'blue' : 'gray'}`}>{r.admissionType || '—'}</span></td>
                    <td><span className={`badge badge-${r.status === 'ADMITTED' ? 'green' : r.status === 'DISCHARGED' ? 'gray' : 'yellow'}`}>{r.status || '—'}</span></td>
                    <td>{r.admissionDate?.slice(0, 10) || '—'}</td>
                    {canDischarge && (
                      <td>
                        {r.status !== 'DISCHARGED' && !r.isDischarged && (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => setDischargeTarget({ ...r, patientName: patientName(r) })}
                          >
                            Discharge
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap" style={{ borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
            <div className="pagination">
              <span>{total} admission{total === 1 ? '' : 's'}</span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                <span>Page {page} / {totalPages}</span>
                <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
