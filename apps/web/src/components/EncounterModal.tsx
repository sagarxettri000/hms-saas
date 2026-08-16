'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ENCOUNTER_TYPES } from '@/lib/options';

interface EncounterModalProps {
  patient: { id: string; firstName?: string; middleName?: string; lastName?: string; mrn?: string };
  onClose: () => void;
  onCreated: (id?: string) => void;
}

export default function EncounterModal({ patient, onClose, onCreated }: EncounterModalProps) {
  const [values, setValues] = useState<Record<string, any>>({
    patientId: patient.id,
    type: 'OPD',
  });
  const [doctors, setDoctors] = useState<{ value: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api('/doctors?limit=500')
      .then((res: any) => {
        if (!active) return;
        const payload = res?.data as any;
        const list = Array.isArray(payload) ? payload : payload?.data ?? [];
        setDoctors(
          list.map((d: any) => ({
            value: d.id,
            label:
              [d.user?.firstName, d.user?.lastName].filter(Boolean).join(' ') ||
              [d.firstName, d.lastName].filter(Boolean).join(' ') ||
              d.id,
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
    if (!values.type) {
      setError('Type is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, any> = {
        patientId: patient.id,
        type: values.type,
      };
      for (const k of [
        'doctorId',
        'symptoms',
        'history',
        'examination',
        'diagnosis',
        'icd10Code',
        'clinicalNotes',
      ]) {
        if (values[k]) body[k] = values[k];
      }
      const res: any = await api('/encounters', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const created = res?.data as any;
      onCreated(created?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start encounter');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Start encounter</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field field-full">
              <label className="label">Patient</label>
              <input
                className="input"
                value={
                  [patient.firstName, patient.middleName, patient.lastName]
                    .filter(Boolean)
                    .join(' ') || patient.mrn
                }
                readOnly
              />
            </div>
            <div className="field">
              <label className="label">
                Type <span style={{ color: 'var(--danger)' }}> *</span>
              </label>
              <select
                className="input"
                value={values.type ?? ''}
                onChange={(e) => set('type', e.target.value)}
                required
              >
                <option value="">— Select —</option>
                {ENCOUNTER_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Doctor</label>
              <select
                className="input"
                value={values.doctorId ?? ''}
                onChange={(e) => set('doctorId', e.target.value)}
              >
                <option value="">— Select —</option>
                {doctors.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-full">
              <label className="label">Chief complaint / symptoms</label>
              <textarea
                className="textarea"
                value={values.symptoms ?? ''}
                placeholder="e.g. Fever, cough, headache since 2 days"
                onChange={(e) => set('symptoms', e.target.value)}
              />
            </div>
            <div className="field field-full">
              <label className="label">History</label>
              <textarea
                className="textarea"
                value={values.history ?? ''}
                placeholder="Past medical / surgical history, medications…"
                onChange={(e) => set('history', e.target.value)}
              />
            </div>
            <div className="field field-full">
              <label className="label">Examination findings</label>
              <textarea
                className="textarea"
                value={values.examination ?? ''}
                placeholder="General and systemic examination…"
                onChange={(e) => set('examination', e.target.value)}
              />
            </div>
            <div className="field field-full">
              <label className="label">Diagnosis</label>
              <input
                className="input"
                value={values.diagnosis ?? ''}
                placeholder="Working diagnosis"
                onChange={(e) => set('diagnosis', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">ICD-10 code</label>
              <input
                className="input"
                value={values.icd10Code ?? ''}
                placeholder="e.g. J06.9"
                onChange={(e) => set('icd10Code', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">Clinical notes</label>
              <input
                className="input"
                value={values.clinicalNotes ?? ''}
                onChange={(e) => set('clinicalNotes', e.target.value)}
              />
            </div>
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Starting…' : 'Start encounter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}