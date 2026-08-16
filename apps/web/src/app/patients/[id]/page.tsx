'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import AppShell from '@/components/AppShell';
import EncounterModal from '@/components/EncounterModal';
import AdmitModal from '@/components/AdmitModal';
import DischargeModal from '@/components/DischargeModal';
import { badgeTone, formatDate, formatDateTime, formatMoney, pick } from '@/lib/hooks';
import { BLOOD_GROUPS, GENDERS, MARITAL_STATUS, PATIENT_TYPES } from '@/lib/options';
import type { FormField, Row } from '@/lib/types';

interface Section {
  title: string;
  rows: Row[];
  columns: { key: string; label: string; render?: (r: Row) => any }[];
  endpoint?: string;
}

function EditFieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: any;
  onChange: (v: any) => void;
}) {
  const common = { id: field.name, className: 'input', value: value ?? '', onChange: (e: any) => onChange(e.target.value) };
  if (field.type === 'select') {
    return (
      <select {...common} className="input">
        <option value="">— Select —</option>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }
  if (field.type === 'date') {
    return <input {...common} type="date" />;
  }
  if (field.type === 'number') {
    return <input {...common} type="number" step="0.01" />;
  }
  if (field.type === 'textarea') {
    return <textarea {...common} className="input" style={{ minHeight: 80 }} />;
  }
  if (field.type === 'email') {
    return <input {...common} type="email" />;
  }
  return <input {...common} type="text" />;
}

function SectionTable({ title, rows, columns }: Section) {
  if (!rows.length) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 className="card-title">{title}</h3>
      <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? i}>
                {columns.map((c) => (
                  <td key={c.key}>
                    {c.render ? c.render(r) : pick(r, c.key) ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [patient, setPatient] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState('overview');
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [showEncounter, setShowEncounter] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [role, setRole] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showAdmit, setShowAdmit] = useState(false);
  const [dischargeTarget, setDischargeTarget] = useState<Row | null>(null);

  useEffect(() => {
    setRole(localStorage.getItem('role') || '');
  }, []);

  const CLINICAL_ROLES = ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'EMERGENCY_STAFF', 'ANESTHETIST'];
  const ADMIN_ROLES = ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN', 'DEPARTMENT_HEAD'];
  const FRONT_ROLES = ['RECEPTIONIST', 'RECEPTION_SUPERVISOR'];
  const canViewPatient = true;
  const canManageClinical = CLINICAL_ROLES.concat(ADMIN_ROLES).includes(role);
  const canAdmit = CLINICAL_ROLES.concat(FRONT_ROLES).concat(ADMIN_ROLES).includes(role);
  const canDischarge = canManageClinical;
  const canManageEncounters = canManageClinical;

  const PATIENT_FIELDS: FormField[] = [
    { name: 'firstName', label: 'First name', required: true },
    { name: 'middleName', label: 'Middle name' },
    { name: 'lastName', label: 'Last name', required: true },
    { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
    { name: 'gender', label: 'Gender', type: 'select', options: GENDERS },
    { name: 'bloodGroup', label: 'Blood group', type: 'select', options: BLOOD_GROUPS },
    { name: 'maritalStatus', label: 'Marital status', type: 'select', options: MARITAL_STATUS },
    { name: 'patientType', label: 'Patient type', type: 'select', options: PATIENT_TYPES, defaultValue: 'GENERAL' },
    { name: 'mobile', label: 'Mobile' },
    { name: 'phone', label: 'Phone' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'nationality', label: 'Nationality' },
    { name: 'nationalId', label: 'National ID' },
    { name: 'addressLine1', label: 'Address line 1' },
    { name: 'city', label: 'City' },
    { name: 'district', label: 'District' },
    { name: 'province', label: 'Province' },
    { name: 'country', label: 'Country' },
    { name: 'emergencyContactName', label: 'Emergency contact' },
    { name: 'emergencyContactRelationship', label: 'Emergency relation' },
    { name: 'emergencyContactMobile', label: 'Emergency mobile' },
    { name: 'occupation', label: 'Occupation' },
  ];

  useEffect(() => {
    if (!id) return;
    let activeFlag = true;
    Promise.all([
      api(`/patients/${id}`),
      api(`/encounters?patientId=${id}&limit=50`),
      api(`/encounters/vitals/patient/${id}`),
      api(`/encounters/prescriptions/patient/${id}`),
      api(`/lab/orders?patientId=${id}&limit=50`),
      api(`/billing/invoices?patientId=${id}&limit=50`),
      api(`/admissions?patientId=${id}&limit=50`),
      api(`/appointments?patientId=${id}&limit=50`),
      api(`/insurance/claims?patientId=${id}&limit=50`),
    ])
      .then(([pat, enc, vitals, rx, labs, inv, adm, appts, claims]) => {
        if (!activeFlag) return;
        const list = (r: any) =>
          Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.data) ? r.data.data : [];
        setPatient(pat.data ?? pat);
        setData({
          encounters: list(enc),
          vitals: list(vitals),
          prescriptions: (list(rx) as any[]).flatMap((p) =>
            (p.items?.length ? p.items : [p]).map((it: any) => ({
              ...it,
              prescriptionId: p.id,
              createdAt: p.createdAt,
            })),
          ),
          labs: list(labs),
          invoices: list(inv),
          admissions: list(adm),
          appointments: list(appts),
          claims: list(claims),
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load patient'))
      .finally(() => activeFlag && setLoading(false));
    return () => {
      activeFlag = false;
    };
  }, [id, reloadTick]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  function reload() {
    setReloadTick((t) => t + 1);
  }

  function handleEncounterCreated() {
    setShowEncounter(false);
    setActive('encounters');
    setFlash('Encounter started successfully');
    reload();
  }

  function handleAdmitted() {
    setShowAdmit(false);
    setActive('admissions');
    setFlash('Patient admitted successfully');
    reload();
  }

  function handleDischarged() {
    setDischargeTarget(null);
    setActive('admissions');
    setFlash('Patient discharged successfully');
    reload();
  }

  function openEdit() {
    const init: Record<string, any> = {};
    for (const f of PATIENT_FIELDS) {
      if (f.type === 'date' && typeof patient?.[f.name] === 'string') {
        init[f.name] = patient[f.name].slice(0, 10);
      } else if (patient?.[f.name] !== undefined && patient[f.name] !== null) {
        init[f.name] = patient[f.name];
      }
    }
    setEditValues(init);
    setEditError(null);
    setShowEdit(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    setEditError(null);
    try {
      const body: Record<string, any> = {};
      for (const f of PATIENT_FIELDS) {
        let v = editValues[f.name];
        if (v === '' || v === undefined || v === null) continue;
        if (f.type === 'number') v = Number(v);
        if (f.type === 'date') v = new Date(v).toISOString();
        body[f.name] = v;
      }
      await api(`/patients/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setShowEdit(false);
      setFlash('Patient updated successfully');
      reload();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update patient');
    } finally {
      setSavingEdit(false);
    }
  }

  if (!patient && loading) return <AppShell><div className="loading">Loading patient record…</div></AppShell>;
  if (error && !patient) return <AppShell><div className="banner-danger">{error}</div></AppShell>;
  if (!patient) return <AppShell><div className="empty">Patient not found.</div></AppShell>;

  const fullName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ');
  const age = patient.age ?? '—';

  const allergies = (patient.allergies || []).map((a: any) =>
    typeof a === 'string' ? a : `${a.allergen || a.name || ''}${a.severity ? ` (${a.severity})` : ''}`,
  );

  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...(canManageEncounters ? [{ key: 'encounters', label: `Encounters (${data.encounters?.length ?? 0})` }] : []),
    { key: 'vitals', label: `Vitals (${data.vitals?.length ?? 0})` },
    { key: 'prescriptions', label: `Prescriptions (${data.prescriptions?.length ?? 0})` },
    { key: 'lab', label: `Lab (${data.labs?.length ?? 0})` },
    { key: 'billing', label: `Billing (${data.invoices?.length ?? 0})` },
    { key: 'admissions', label: `Admit (${data.admissions?.length ?? 0})` },
    { key: 'appointments', label: `Appointments (${data.appointments?.length ?? 0})` },
  ];

  const encCols = [
    { key: 'type', label: 'Type', render: (r: Row) => <span className={`badge badge-${badgeTone(r.type)}`}>{r.type}</span> },
    { key: 'doctor', label: 'Doctor', render: (r: Row) => [r.doctor?.user?.firstName, r.doctor?.user?.lastName].filter(Boolean).join(' ') || [r.doctor?.firstName, r.doctor?.lastName].filter(Boolean).join(' ') || r.doctorId },
    { key: 'diagnosis', label: 'Diagnosis' },
    { key: 'status', label: 'Status', render: (r: Row) => <span className={`badge badge-${badgeTone(r.status)}`}>{r.status}</span> },
    { key: 'createdAt', label: 'Date', render: (r: Row) => formatDateTime(r.createdAt) },
  ];

  const vitalsCols = [
    { key: 'recordedAt', label: 'Recorded', render: (r: Row) => formatDateTime(r.recordedAt) },
    { key: 'bloodPressure', label: 'BP', render: (r: Row) => r.bloodPressure || '—' },
    { key: 'temperature', label: 'Temp', render: (r: Row) => (r.temperature ? r.temperature + '°C' : '—') },
    { key: 'pulse', label: 'Pulse', render: (r: Row) => r.pulse || '—' },
    { key: 'respiratoryRate', label: 'Resp' },
    { key: 'spo2', label: 'SpO2', render: (r: Row) => (r.spo2 ? r.spo2 + '%' : '—') },
    { key: 'weight', label: 'Weight' },
  ];

  const rxCols = [
    { key: 'createdAt', label: 'Date', render: (r: Row) => formatDateTime(r.createdAt) },
    { key: 'medicine', label: 'Medicine', render: (r: Row) => r.medicineName || r.medicine?.name || r.medicineId },
    { key: 'dosage', label: 'Dosage' },
    { key: 'frequency', label: 'Frequency' },
    { key: 'duration', label: 'Duration' },
    { key: 'status', label: 'Status', render: (r: Row) => <span className={`badge badge-${badgeTone(r.status)}`}>{r.status}</span> },
  ];

  const labCols = [
    { key: 'orderNumber', label: 'Order no.', render: (r: Row) => <span className="mono">{r.orderNumber}</span> },
    { key: 'status', label: 'Status', render: (r: Row) => <span className={`badge badge-${badgeTone(r.status)}`}>{r.status}</span> },
    { key: 'createdAt', label: 'Ordered', render: (r: Row) => formatDateTime(r.orderedAt || r.createdAt) },
  ];

  const invCols = [
    { key: 'invoiceNumber', label: 'Invoice', render: (r: Row) => <span className="mono">{r.invoiceNumber}</span> },
    { key: 'type', label: 'Type', render: (r: Row) => <span className={`badge badge-${badgeTone(r.type)}`}>{r.type}</span> },
    { key: 'totalAmount', label: 'Total', render: (r: Row) => formatMoney(r.totalAmount) },
    { key: 'paidAmount', label: 'Paid', render: (r: Row) => formatMoney(r.paidAmount) },
    { key: 'status', label: 'Status', render: (r: Row) => <span className={`badge badge-${badgeTone(r.status)}`}>{r.status}</span> },
  ];

  const admCols = [
    { key: 'admissionDate', label: 'Admitted', render: (r: Row) => formatDate(r.admissionDate) },
    { key: 'admissionNumber', label: 'No.', render: (r: Row) => <span className="mono">{r.admissionNumber}</span> },
    { key: 'ward', label: 'Ward', render: (r: Row) => r.ward?.name || '—' },
    { key: 'room', label: 'Room', render: (r: Row) => r.room?.name || '—' },
    { key: 'status', label: 'Status', render: (r: Row) => <span className={`badge badge-${badgeTone(r.status)}`}>{r.status}</span> },
    ...(canDischarge
      ? [{
          key: '_action',
          label: 'Action',
          render: (r: Row) =>
            r.status === 'DISCHARGED' ? (
              <span className="note">Discharged</span>
            ) : (
              <button
                className="btn btn-secondary btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setDischargeTarget({ ...r, patientName: fullName });
                }}
                disabled={Boolean(r.isDischarged)}
              >
                Discharge
              </button>
            ),
        }]
      : []
    ),
  ];

  const apptCols = [
    { key: 'appointmentDate', label: 'Date', render: (r: Row) => formatDate(r.appointmentDate) },
    { key: 'startTime', label: 'Time', render: (r: Row) => r.startTime || '—' },
    { key: 'doctor', label: 'Doctor', render: (r: Row) => [r.doctor?.user?.firstName, r.doctor?.user?.lastName].filter(Boolean).join(' ') || [r.doctor?.firstName, r.doctor?.lastName].filter(Boolean).join(' ') || r.doctorId },
    { key: 'status', label: 'Status', render: (r: Row) => <span className={`badge badge-${badgeTone(r.status)}`}>{r.status}</span> },
  ];

  const activeAdmission = (data.admissions || []).find((a: Row) => a.status === 'ADMITTED' && !a.isDischarged);

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>
            ← Back
          </button>
          <h1>{fullName}</h1>
          <p>
            <span className="mono">{patient.mrn}</span> · {age} yrs · {patient.gender || '—'} ·{' '}
            {patient.patientType || '—'} · <span className={`badge badge-${badgeTone(patient.status)}`}>{patient.status || 'ACTIVE'}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={openEdit}>✎ Edit</button>
          <button className="btn" onClick={() => router.push(`/billing?patientId=${patient.id}`)}>₨ Billing</button>
          {canManageEncounters && (
            <button className="btn" onClick={() => setShowEncounter(true)}>+ Start encounter</button>
          )}
          {canAdmit && (
            <button className="btn" onClick={() => setShowAdmit(true)}>+ Admit</button>
          )}
          {canDischarge && activeAdmission && (
            <button
              className="btn"
              style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}
              onClick={() => setDischargeTarget({ ...activeAdmission, patientName: fullName })}
            >
              Discharge
            </button>
          )}
        </div>
      </div>

      {flash && <div className="alert alert-success">{flash}</div>}

      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${t.key === active ? 'active' : ''}`} onClick={() => setActive(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {active === 'overview' && (
        <div className="detail-grid">
          <div className="card">
            <h3 className="card-title">Demographics</h3>
            <dl className="kv">
              <dt>Date of birth</dt><dd>{formatDate(patient.dateOfBirth)}</dd>
              <dt>Blood group</dt><dd>{patient.bloodGroup?.replace('_', ' ') || '—'}</dd>
              <dt>Marital status</dt><dd>{patient.maritalStatus || '—'}</dd>
              <dt>Nationality</dt><dd>{patient.nationality || '—'}</dd>
              <dt>National ID</dt><dd><span className="mono">{patient.nationalId || '—'}</span></dd>
              <dt>Occupation</dt><dd>{patient.occupation || '—'}</dd>
            </dl>
          </div>
          <div className="card">
            <h3 className="card-title">Contact</h3>
            <dl className="kv">
              <dt>Mobile</dt><dd>{patient.mobile || '—'}</dd>
              <dt>Phone</dt><dd>{patient.phone || '—'}</dd>
              <dt>Email</dt><dd>{patient.email || '—'}</dd>
              <dt>Address</dt><dd>{[patient.addressLine1, patient.city, patient.district, patient.province, patient.country].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Emergency</dt><dd>{[patient.emergencyContactName, patient.emergencyContactRelationship, patient.emergencyContactMobile].filter(Boolean).join(' · ') || '—'}</dd>
            </dl>
          </div>
          <div className="card">
            <h3 className="card-title">Allergies</h3>
            {allergies.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {allergies.map((a: string, i: number) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No known allergies.</p>
            )}
          </div>
          <div className="card">
            <h3 className="card-title">Financial</h3>
            <dl className="kv">
              <dt>Unpaid bills</dt>
              <dd>
                {formatMoney(
                  (data.invoices || []).reduce(
                    (s: number, i: Row) => s + Math.max(0, Number(i.totalAmount || 0) - Number(i.paidAmount || 0)),
                    0,
                  ),
                )}
              </dd>
              <dt>Insurance claims</dt><dd>{(data.claims || []).length}</dd>
              <dt>Total admits</dt><dd>{(data.admissions || []).length}</dd>
            </dl>
          </div>
        </div>
      )}

      {active === 'encounters' && <SectionTable title="Encounters" rows={data.encounters || []} columns={encCols} />}
      {active === 'vitals' && <SectionTable title="Vital history" rows={data.vitals || []} columns={vitalsCols} />}
      {active === 'prescriptions' && <SectionTable title="Prescriptions" rows={data.prescriptions || []} columns={rxCols} />}
      {active === 'lab' && <SectionTable title="Laboratory orders" rows={data.labs || []} columns={labCols} />}
      {active === 'billing' && <SectionTable title="Invoices" rows={data.invoices || []} columns={invCols} />}
      {active === 'admissions' && <SectionTable title="Admit history" rows={data.admissions || []} columns={admCols} />}
      {active === 'appointments' && <SectionTable title="Appointments" rows={data.appointments || []} columns={apptCols} />}
      {active !== 'overview' && !(data[active]?.length) && <div className="empty">No records in this section.</div>}

      {showEncounter && (
        <EncounterModal
          patient={{ id: patient.id, firstName: patient.firstName, middleName: patient.middleName, lastName: patient.lastName, mrn: patient.mrn }}
          onClose={() => setShowEncounter(false)}
          onCreated={handleEncounterCreated}
        />
      )}

      {showAdmit && (
        <AdmitModal
          patient={{ id: patient.id, firstName: patient.firstName, middleName: patient.middleName, lastName: patient.lastName, mrn: patient.mrn }}
          onClose={() => setShowAdmit(false)}
          onDone={handleAdmitted}
        />
      )}

      {dischargeTarget && (
        <DischargeModal
          admission={{ id: dischargeTarget.id, admissionNumber: dischargeTarget.admissionNumber, patientName: dischargeTarget.patientName }}
          patientId={id as string}
          patientName={fullName}
          onClose={() => setDischargeTarget(null)}
          onDone={handleDischarged}
        />
      )}

      {showEdit && (
        <div className="modal-backdrop" onClick={() => setShowEdit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit patient</h3>
              <button className="modal-close" onClick={() => setShowEdit(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={saveEdit}>
              <div className="form-grid">
                {PATIENT_FIELDS.map((f) => (
                  <div key={f.name} className={`field ${f.full ? 'field-full' : ''}`}>
                    <label className="label">
                      {f.label}
                      {f.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                    </label>
                    <EditFieldInput field={f} value={editValues[f.name]} onChange={(v) => setEditValues((prev) => ({ ...prev, [f.name]: v }))} />
                  </div>
                ))}
              </div>
              {editError && <div className="alert alert-error" style={{ marginTop: 14 }}>{editError}</div>}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
