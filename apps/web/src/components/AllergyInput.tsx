'use client';

import { useState, useEffect } from 'react';

interface Allergy {
  allergen: string;
  reaction?: string;
  severity?: string;
  notes?: string;
}

const SEVERITIES = [
  { value: 'MILD', label: 'Mild' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'SEVERE', label: 'Severe' },
  { value: 'LIFE_THREATENING', label: 'Life Threatening' },
];

export default function AllergyInput({
  value,
  onChange,
  required = false,
  label = 'Allergies',
}: {
  value: Allergy[];
  onChange: (value: Allergy[]) => void;
  required?: boolean;
  label?: string;
}) {
  const [allergies, setAllergies] = useState<Allergy[]>(value || []);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setAllergies(value || []);
  }, [value]);

  useEffect(() => {
    const errs: string[] = [];
    allergies.forEach((a, i) => {
      if (!a.allergen?.trim()) errs.push(`Allergy ${i + 1}: allergen is required`);
    });
    setErrors(errs);
  }, [allergies]);

  function updateAllergy(index: number, field: keyof Allergy, val: string) {
    const next = [...allergies];
    next[index] = { ...next[index], [field]: val };
    setAllergies(next);
    onChange(next);
  }

  function addAllergy() {
    const next = [...allergies, { allergen: '', reaction: '', severity: 'MILD', notes: '' }];
    setAllergies(next);
    onChange(next);
  }

  function removeAllergy(index: number) {
    const next = allergies.filter((_, i) => i !== index);
    setAllergies(next);
    onChange(next);
  }

  const hasErrors = errors.length > 0;

  return (
    <div className="field">
      <label className="label">
        {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allergies.length === 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={addAllergy} style={{ alignSelf: 'flex-start', width: 'auto' }}>
            + Add allergy
          </button>
        )}
        {allergies.map((allergy, index) => (
          <div key={index} className="allergy-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)' }}>
            <div className="field" style={{ flex: '1 1 200px' }}>
              <label className="label">Allergen <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                className="input"
                value={allergy.allergen}
                onChange={(e) => updateAllergy(index, 'allergen', e.target.value)}
                placeholder="e.g. Penicillin"
                required
              />
            </div>
            <div className="field" style={{ flex: '1 1 150px' }}>
              <label className="label">Reaction</label>
              <input
                className="input"
                value={allergy.reaction || ''}
                onChange={(e) => updateAllergy(index, 'reaction', e.target.value)}
                placeholder="e.g. Rash, anaphylaxis"
              />
            </div>
            <div className="field" style={{ flex: '1 1 120px' }}>
              <label className="label">Severity</label>
              <select
                className="input"
                value={allergy.severity || 'MILD'}
                onChange={(e) => updateAllergy(index, 'severity', e.target.value)}
              >
                {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: '1 1 150px' }}>
              <label className="label">Notes</label>
              <input
                className="input"
                value={allergy.notes || ''}
                onChange={(e) => updateAllergy(index, 'notes', e.target.value)}
                placeholder="Additional notes"
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => removeAllergy(index)}
              style={{ alignSelf: 'flex-end', marginBottom: 22 }}
              aria-label="Remove allergy"
            >
              ×
            </button>
          </div>
        ))}
        {allergies.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={addAllergy} style={{ alignSelf: 'flex-start', width: 'auto' }}>
            + Add another
          </button>
        )}
        {hasErrors && (
          <div className="alert alert-error" style={{ marginTop: 8 }}>
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
        <p className="note" style={{ marginTop: 8, fontSize: 12 }}>
          Each allergy requires an allergen name. Reaction, severity, and notes are optional.
        </p>
      </div>
    </div>
  );
}