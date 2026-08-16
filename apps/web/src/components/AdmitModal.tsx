'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const ADMISSION_TYPES = [
  { value: 'GENERAL', label: 'General' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'PLANNED', label: 'Planned' },
  { value: 'TRANSFER', label: 'Transfer' },
];

export default function AdmitModal({
  patient,
  onClose,
  onDone,
}: {
  patient: { id: string; firstName?: string; middleName?: string; lastName?: string; mrn?: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, any>>({
    patientId: patient.id,
    admissionType: 'GENERAL',
  });
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [beds, setBeds] = useState<{ value: string; label: string }[]>([]);
  const [doctors, setDoctors] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api('/departments?limit=500')
      .then((res: any) => {
        if (!active) return;
        const payload = res?.data as any;
        const list = Array.isArray(payload) ? payload : payload?.data ?? [];
        setDepartments(list.map((d: any) => ({ value: d.id, label: d.name || d.id })));
      })
      .catch(() => {});
    api('/departments/beds?limit=500')
      .then((res: any) => {
        if (!active) return;
        const payload = res?.data as any;
        const list = Array.isArray(payload) ? payload : payload?.data ?? [];
        setBeds(
          (list as any[])
            .filter((b) => b.status === 'AVAILABLE')
            .map((b) => ({ value: b.id, label: b.bedNumber || b.id })),
        );
      })
      .catch(() => {});
    api('/doctors?limit=500')
      .then((res: any) => {
        if (!active) return;
        const payload = res?.data as any;
        const list = Array.isArray(payload) ? payload : payload?.data ?? [];
        setDoctors(
          list.map((d: any) => ({
            value: d.id,
            label:
              [d.user?.firstName, d.user?.lastName].filter(Boolean).join(' ') || d.id,
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function set(name: string, value: any) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, any> = {
        ...values,
        admittingDoctorId: values.admittingDoctorId || undefined,
      };
      await api('/admissions', { method: 'POST', body: JSON.stringify(body) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to admit patient');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Admit patient</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="note" style={{ marginTop: 4 }}>
          {[patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')}
          {patient.mrn ? ` · ${patient.mrn}` : ''}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label className="label">Admission type</label>
              <select className="input" value={values.admissionType} onChange={(e) => set('admissionType', e.target.value)}>
                {ADMISSION_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Attending doctor</label>
              <select className="input" value={values.admittingDoctorId || ''} onChange={(e) => set('admittingDoctorId', e.target.value)}>
                <option value="">— Select —</option>
                {doctors.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Department</label>
              <select className="input" value={values.departmentId || ''} onChange={(e) => set('departmentId', e.target.value)}>
                <option value="">— Select —</option>
                {departments.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Bed</label>
              <select className="input" value={values.bedId || ''} onChange={(e) => set('bedId', e.target.value)}>
                <option value="">— Select —</option>
                {beds.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field field-full">
              <label className="label">Provisional diagnosis</label>
              <input className="input" value={values.provisionalDiagnosis || ''} placeholder="Provisional diagnosis" onChange={(e) => set('provisionalDiagnosis', e.target.value)} />
            </div>
            <div className="field field-full">
              <label className="label">Notes</label>
              <textarea className="input" style={{ minHeight: 80 }} value={values.notes || ''} placeholder="Notes" onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Admitting...' : 'Admit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}