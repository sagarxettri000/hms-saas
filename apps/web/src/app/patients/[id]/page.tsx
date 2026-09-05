'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
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
  const [followupTarget, setFollowupTarget] = useState<Row | null>(null);
  const [showFollowup, setShowFollowup] = useState(false);
  const [followupValues, setFollowupValues] = useState<{
    id: string;
    encounterId: string;
    doctorIds: string[];
    notes: string;
  }>({ id: '', encounterId: '', doctorIds: [], notes: '' });
  const [savingFollowup, setSavingFollowup] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [doctorOptions, setDoctorOptions] = useState<Row[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [doctorFilter, setDoctorFilter] = useState('');

  useEffect(() => {
    setRole(localStorage.getItem('role') || '');
  }, []);

  const CLINICAL_ROLES = ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'EMERGENCY_STAFF', 'ANESTHETIST'];
  const ADMIN_ROLES = ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN', 'DEPARTMENT_HEAD'];
  const FRONT_ROLES = ['RECEPTIONIST', 'RECEPTION_SUPERVISOR'];
  const canManageClinical = CLINICAL_ROLES.concat(ADMIN_ROLES).includes(role);
  const canAdmit = CLINICAL_ROLES.concat(FRONT_ROLES).concat(ADMIN_ROLES).includes(role);
  const canDischarge = canManageClinical;
  const canManageEncounters = canManageClinical;
  const canFollowup = FRONT_ROLES
    .concat(['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN'])
    .includes(role);
  const canSeeBilling = FRONT_ROLES
    .concat(['FINANCE_MANAGER', 'HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN', 'INSURANCE_OFFICER'])
    .includes(role);

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
      api(`/encounters?patientId=${id}&limit=50`).catch(() => ({})),
      api(`/encounters/vitals/patient/${id}`).catch(() => ({})),
      api(`/encounters/prescriptions/patient/${id}`).catch(() => ({})),
      api(`/lab/orders?patientId=${id}&limit=50`).catch(() => ({})),
      api(`/billing/invoices?patientId=${id}&limit=50`).catch(() => ({})),
      api(`/admissions?patientId=${id}&limit=50`).catch(() => ({})),
      api(`/appointments?patientId=${id}&limit=50`).catch(() => ({})),
      api(`/insurance/claims?patientId=${id}&limit=50`).catch(() => ({})),
      api(`/follow-ups?patientId=${id}&limit=50`).catch(() => ({})),
    ])
      .then(([pat, enc, vitals, rx, labs, inv, adm, appts, claims, followups]) => {
        if (!activeFlag) return;
        const list = (r: any) =>
          Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.data) ? r.data.data : [];
        setPatient(pat.data ?? pat);
        const fuPayload = followups?.data?.data ?? followups?.data ?? followups;
        const fuList = Array.isArray(fuPayload) ? fuPayload : Array.isArray(fuPayload?.data) ? fuPayload.data : [];
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
          followups: fuList,
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

  if (!patient && loading) return <><button className="btn btn-secondary btn-sm" onClick={() => router.back()} style={{ marginBottom: 12 }}>← Back</button><div className="loading">Loading patient record…</div></>;
  if (error && !patient) return <><button className="btn btn-secondary btn-sm" onClick={() => router.back()} style={{ marginBottom: 12 }}>← Back</button><div className="banner-danger">{error}</div></>;
  if (!patient) return <><button className="btn btn-secondary btn-sm" onClick={() => router.back()} style={{ marginBottom: 12 }}>← Back</button><div className="empty">Patient not found.</div></>;

  const fullName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ');
  const age = patient.age ?? '—';

  const allergies = (patient.allergies || []).map((a: any) =>
    typeof a === 'string' ? a : `${a.allergen || a.name || ''}${a.severity ? ` (${a.severity})` : ''}`,
  );

  const followups = (data.followups || []).sort((a: Row, b: Row) =>
    (a.createdAt > b.createdAt ? -1 : 1),
  );

  const fuDoctorNames = (r: Row) => {
    const docs =
      (r.doctors || []).map((d: any) =>
        [d.doctor?.user?.firstName, d.doctor?.user?.lastName].filter(Boolean).join(' '),
      ) ||
      [];
    const names = docs.filter(Boolean);
    if (names.length) return names.join(', ');
    return [r.assignedDoctor?.user?.firstName, r.assignedDoctor?.user?.lastName].filter(Boolean).join(' ') || '—';
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    ...(canManageEncounters ? [{ key: 'encounters', label: `Encounters (${data.encounters?.length ?? 0})` }] : []),
    { key: 'vitals', label: `Vitals (${data.vitals?.length ?? 0})` },
    { key: 'prescriptions', label: `Prescriptions (${data.prescriptions?.length ?? 0})` },
    { key: 'lab', label: `Lab (${data.labs?.length ?? 0})` },
    ...(canSeeBilling ? [{ key: 'billing', label: `Billing (${data.invoices?.length ?? 0})` }] : []),
    { key: 'admissions', label: `Admit (${data.admissions?.length ?? 0})` },
    { key: 'appointments', label: `Appointments (${data.appointments?.length ?? 0})` },
    { key: 'followup', label: `Follow-up (${followups.length})` },
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

  const doctorName = (r: Row) =>
    [r.doctor?.user?.firstName, r.doctor?.user?.lastName].filter(Boolean).join(' ') ||
    [r.doctor?.firstName, r.doctor?.lastName].filter(Boolean).join(' ') ||
    r.doctorId ||
    '—';

  function followupStatus(r: Row) {
    const map: Record<string, { label: string; tone: string }> = {
      PENDING: { label: 'Pending', tone: 'warning' },
      IN_PROGRESS: { label: 'In progress', tone: 'primary' },
      COMPLETED: { label: 'Completed', tone: 'green' },
      CANCELLED: { label: 'Cancelled', tone: 'secondary' },
    };
    return map[r.status] || { label: r.status || 'Pending', tone: 'secondary' };
  }

  const followupCols = [
    { key: 'createdAt', label: 'Created', render: (r: Row) => <strong>{formatDate(r.createdAt)}</strong> },
    { key: 'doctors', label: 'Assigned doctor(s)', render: (r: Row) => fuDoctorNames(r) },
    { key: 'encounterType', label: 'Source', render: (r: Row) => (r.encounter ? <span className={`badge badge-${badgeTone(r.encounter.type)}`}>{r.encounter.type}</span> : '—') },
    { key: 'reason', label: 'Reason', render: (r: Row) => r.encounter?.diagnosis || r.encounter?.chiefComplaint || 'Follow-up' },
    { key: 'notes', label: 'Notes', render: (r: Row) => r.notes || '—' },
    {
      key: '_status',
      label: 'Status',
      render: (r: Row) => {
        const s = followupStatus(r);
        return <span className={`badge badge-${s.tone}`}>{s.label}</span>;
      },
    },
    ...(canManageClinical
      ? [{
          key: '_action',
          label: 'Action',
          render: (r: Row) => (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setFollowupValues({
                  id: r.id,
                  encounterId: r.encounterId || '',
                  doctorIds: (r.doctors || []).map((d: any) => d.doctorId),
                  notes: r.notes || '',
                });
                setDoctorFilter('');
                setFollowupError(null);
                setShowFollowup(true);
                loadDoctors();
              }}
            >
              Assign
            </button>
          ),
        }]
      : []),
  ];

  async function loadDoctors() {
    if (doctorOptions.length) return;
    setLoadingDoctors(true);
    try {
      const res: any = await api('/follow-ups/doctors');
      const payload = res?.data?.data ?? res?.data ?? res;
      const todoctors = Array.isArray(payload) ? payload : payload?.data ?? [];
      setDoctorOptions(todoctors);
    } catch {
      setDoctorOptions([]);
    } finally {
      setLoadingDoctors(false);
    }
  }

  function openScheduleFollowup() {
    const first = (data.encounters || [])[0];
    setFollowupValues({
      id: '',
      encounterId: first?.id || '',
      doctorIds: [],
      notes: '',
    });
    setDoctorFilter('');
    setFollowupError(null);
    setShowFollowup(true);
    loadDoctors();
  }

  function toggleDoctor(id: string) {
    setFollowupValues((prev) => ({
      ...prev,
      doctorIds: prev.doctorIds.includes(id)
        ? prev.doctorIds.filter((d) => d !== id)
        : [...prev.doctorIds, id],
    }));
  }

  async function saveFollowup(e: React.FormEvent) {
    e.preventDefault();
    if (!followupValues.doctorIds.length) {
      setFollowupError('Select at least one doctor to create the follow-up.');
      return;
    }
    setSavingFollowup(true);
    setFollowupError(null);
    try {
      const body = {
        patientId: id,
        encounterId: followupValues.encounterId || undefined,
        doctorIds: followupValues.doctorIds,
        notes: followupValues.notes,
      };
      if (followupValues.id) {
        await api(`/follow-ups/${followupValues.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            doctorIds: followupValues.doctorIds,
            notes: followupValues.notes,
          }),
        });
      } else {
        await api('/follow-ups', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setShowFollowup(false);
      setFlash(followupValues.id ? 'Follow-up updated successfully' : 'Follow-up created successfully');
      reload();
    } catch (err) {
      setFollowupError(err instanceof Error ? err.message : 'Failed to save follow-up');
    } finally {
      setSavingFollowup(false);
    }
  }

  const activeAdmission = (data.admissions || []).find((a: Row) => a.status === 'ADMITTED' && !a.isDischarged);

  return (
    <>
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
          {canSeeBilling && (
            <button className="btn" onClick={() => router.push(`/billing?patientId=${patient.id}`)}>₨ Billing</button>
          )}
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
          {canSeeBilling && (
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
          )}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="card-title" style={{ margin: 0 }}>Follow-up</h3>
              {canFollowup && (
                <button className="btn btn-secondary btn-sm" onClick={openScheduleFollowup}>+ Follow up</button>
              )}
            </div>
            {followups.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {followups.slice(0, 4).map((r: Row) => {
                  const s = followupStatus(r);
                  return (
                    <li key={r.id} style={{ marginBottom: 8 }}>
                      <strong>{fuDoctorNames(r)}</strong>{' '}
                      <span className={`badge badge-${s.tone}`}>{s.label}</span>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {formatDate(r.createdAt)} · {r.encounter?.diagnosis || r.encounter?.chiefComplaint || 'Follow-up'}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">No follow-ups assigned.</p>
            )}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setActive('followup')}>
              View all →
            </button>
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
      {active === 'followup' && (
        <>
          {canFollowup && (
            <div style={{ marginBottom: 12, textAlign: 'right' }}>
              <button className="btn" onClick={openScheduleFollowup}>+ Follow up</button>
            </div>
          )}
          <SectionTable title="Follow-ups" rows={followups} columns={followupCols} />
          {!followups.length && (
            <div className="empty">
              No follow-ups yet. Click “+ Follow up” to assign doctor(s) in real time.
            </div>
          )}
        </>
      )}
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

      {showFollowup && (
        <div className="modal-backdrop" onClick={() => setShowFollowup(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{followupValues.id ? 'Assign doctor(s)' : 'Create follow-up'}</h3>
              <button className="modal-close" onClick={() => setShowFollowup(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={saveFollowup}>
              <div className="form-grid">
                <div className="field field-full">
                  <label className="label" htmlFor="fu-encounter">Source encounter (optional)</label>
                  <select
                    id="fu-encounter"
                    className="input"
                    value={followupValues.encounterId}
                    onChange={(e) => setFollowupValues((prev) => ({ ...prev, encounterId: e.target.value }))}
                  >
                    <option value="">— No encounter —</option>
                    {(data.encounters || []).map((enc: Row) => (
                      <option key={enc.id} value={enc.id}>
                        {formatDate(enc.createdAt)} · {enc.type || 'OPD'} · {enc.diagnosis || enc.chiefComplaint || 'Encounter'}
                      </option>
                    ))}
                  </select>
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
                    {loadingDoctors ? (
                      <div className="note" style={{ padding: 12 }}>Loading doctors…</div>
                    ) : doctorOptions.length === 0 ? (
                      <div className="note" style={{ padding: 12 }}>No active doctors available.</div>
                    ) : (
                      doctorOptions
                        .filter((d) => {
                          const name = [d.user?.firstName, d.user?.lastName].filter(Boolean).join(' ');
                          return !doctorFilter || name?.toLowerCase().includes(doctorFilter.toLowerCase()) || d.specialization?.toLowerCase().includes(doctorFilter.toLowerCase());
                        })
                        .map((d) => {
                          const checked = followupValues.doctorIds.includes(d.id);
                          return (
                            <label
                              key={d.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '8px 12px',
                                cursor: 'pointer',
                                background: checked ? 'var(--primary-light, rgba(59,130,246,0.08))' : 'transparent',
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
                  <label className="label" htmlFor="fu-notes">Notes</label>
                  <textarea
                    id="fu-notes"
                    className="input"
                    style={{ minHeight: 80 }}
                    placeholder="What should be reviewed at the follow-up?"
                    value={followupValues.notes}
                    onChange={(e) => setFollowupValues((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>
              {followupError && <div className="alert alert-error" style={{ marginTop: 14 }}>{followupError}</div>}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowFollowup(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={savingFollowup}>
                  {savingFollowup ? 'Saving...' : followupValues.id ? 'Update follow-up' : 'Create follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
    </>
  );
}
