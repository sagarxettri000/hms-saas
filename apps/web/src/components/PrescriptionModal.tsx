'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/hooks';

interface RxItem {
  key: string;
  medicineName: string;
  genericName: string;
  brandName: string;
  medicineId: string;
  route: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
}

interface PrescriptionModalProps {
  patient: {
    id: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    mrn?: string;
    age?: number;
    gender?: string;
    dateOfBirth?: string;
    allergies?: any[];
  };
  encounters: { id: string; type?: string; diagnosis?: string; chiefComplaint?: string; createdAt?: string }[];
  role?: string;
  onClose: () => void;
  onCreated: () => void;
}

const SIGN_ROLES = ['DOCTOR', 'ANESTHETIST', 'PATHOLOGIST', 'RADIOLOGIST', 'FINANCE_MANAGER', 'DEPARTMENT_HEAD', 'HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN'];

const ROUTES = ['Oral', 'Intravenous (IV)', 'Intramuscular (IM)', 'Subcutaneous (SC)', 'Topical', 'Inhalation', 'Sublingual', 'Ophthalmic', 'Otic (Ear)', 'Nasal', 'Rectal', 'Vaginal', 'Intradermal'];

const FREQ_PRESETS = ['1-0-0', '0-0-1', '1-0-1', '1-1-1', 'OD', 'BD', 'TID', 'QID', 'Q6H', 'Q8H', 'HS (bedtime)', 'PRN (as needed)', 'STAT', 'Alternate days', 'Once a week'];

function freshItem(): RxItem {
  return {
    key: Math.random().toString(36).slice(2),
    medicineName: '',
    genericName: '',
    brandName: '',
    medicineId: '',
    route: 'Oral',
    dosage: '',
    frequency: '',
    duration: '',
    quantity: '',
    instructions: '',
  };
}

function allergyList(allergies: any[] | undefined): string[] {
  return (allergies || [])
    .map((a: any) =>
      typeof a === 'string' ? a : `${a.allergen || a.name || ''}${a.severity ? ` (${a.severity})` : ''}`,
    )
    .filter(Boolean);
}

export default function PrescriptionModal({ patient, encounters, role, onClose, onCreated }: PrescriptionModalProps) {
  const [view, setView] = useState<'compose' | 'review'>('compose');
  const [items, setItems] = useState<RxItem[]>([freshItem()]);
  const [advice, setAdvice] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [encounterId, setEncounterId] = useState(encounters[0]?.id ?? '');
  const [meds, setMeds] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<any[]>([]);
  const [override, setOverride] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [signature, setSignature] = useState('');
  const [consent, setConsent] = useState(false);
  const [signing, setSigning] = useState(false);

  const canSign = SIGN_ROLES.includes(role || '');

  useEffect(() => {
    let active = true;
    api('/pharmacy/medicines?limit=200')
      .then((res: any) => {
        if (!active) return;
        const payload = res?.data;
        setMeds(Array.isArray(payload) ? payload : payload?.data ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const medOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const m of meds) {
      const name = m.name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(m);
    }
    return out;
  }, [meds]);

  const allergies = allergyList(patient.allergies);

  function matchingMedicine(name: string) {
    const n = name.trim().toLowerCase();
    return medOptions.find((m) => m.name.trim().toLowerCase() === n);
  }

  function updateItem(key: string, field: keyof RxItem, value: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, [field]: value } as RxItem;
        if (field === 'medicineName') {
          const m = matchingMedicine(value);
          if (m && m.id !== it.medicineId) {
            next.medicineId = m.id;
            next.genericName = m.genericName || next.genericName;
            next.brandName = m.brandName || next.brandName;
            if (m.strength && !it.dosage) next.dosage = m.strength;
            if (m.form && !it.route && ROUTES.some((r) => r.toLowerCase() === String(m.form).toLowerCase())) {
              next.route = m.form;
            }
          } else if (!m) {
            next.medicineId = '';
          }
        }
        return next;
      }),
    );
  }

  function addItem() {
    setItems((prev) => [...prev, freshItem()]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const valid = items.filter((it) => it.medicineName.trim());
    if (!valid.length) {
      setError('Add at least one medicine with a name.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        patientId: patient.id,
        encounterId: encounterId || undefined,
        items: valid.map((it) => ({
          medicineName: it.medicineName.trim(),
          genericName: it.genericName.trim() || undefined,
          brandName: it.brandName.trim() || undefined,
          medicineId: it.medicineId || undefined,
          route: it.route.trim() || undefined,
          dosage: it.dosage.trim() || undefined,
          frequency: it.frequency.trim() || undefined,
          duration: it.duration.trim() || undefined,
          quantity: it.quantity ? Number(it.quantity) : undefined,
          instructions: it.instructions.trim() || undefined,
        })),
        advice: advice.trim() || undefined,
        followUp: followUp.trim() || undefined,
        ...(warnings.length ? { overrideAllergyWarning: override } : {}),
      };
      const res: any = await api('/encounters/prescriptions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const rx = res?.data ?? res;
      try {
        const detail: any = await api(`/encounters/prescriptions/${(rx as any)?.id}`);
        const d = detail?.data ?? detail;
        setCreated(d ?? rx);
      } catch {
        setCreated({ ...rx, items: valid, patient });
      }
      setView('review');
    } catch (err: any) {
      if (err?.warnings?.length) {
        setWarnings(err.warnings);
        setOverride(false);
      }
      setError(err?.message || 'Failed to save prescription');
    } finally {
      setSaving(false);
    }
  }

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!signature.trim()) {
      setError('Enter your full name to sign.');
      return;
    }
    if (!consent) {
      setError('Confirm that the prescription is correct before signing.');
      return;
    }
    setSigning(true);
    try {
      await api(`/encounters/prescriptions/${created.id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({
          signatureData: signature.trim(),
          consentText: 'I confirm that the above prescription is accurate and clinically appropriate.',
        }),
      });
      setCreated((prev: any) => ({ ...(prev || {}), status: 'APPROVED', signedAt: new Date().toISOString(), signerName: signature.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign prescription');
    } finally {
      setSigning(false);
    }
  }

  const patientName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ') || 'Patient';
  const signed = created?.status === 'APPROVED';
  const encounterLabel = encounters.find((e) => e.id === encounterId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        {view === 'compose' ? (
          <>
            <div className="modal-header">
              <h3 className="modal-title">✎ New prescription</h3>
              <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="rx-patient-strip">
              <div>
                <strong>{patientName}</strong>
                <div className="muted">
                  {patient.mrn && <span className="mono">{patient.mrn}</span>}
                  {patient.mrn && patient.age !== undefined ? ' · ' : ''}
                  {patient.age !== undefined ? `${patient.age} yrs` : ''}
                  {patient.gender ? ` · ${patient.gender}` : ''}
                  {patient.dateOfBirth ? ` · DOB ${formatDate(patient.dateOfBirth)}` : ''}
                </div>
              </div>
              <div className="rx-date">Rx date: {formatDate(new Date().toISOString())}</div>
            </div>
            {allergies.length > 0 && (
              <div className="alert alert-error" style={{ marginBottom: 14 }}>
                <strong>Allergies on record:</strong> {allergies.join('; ')}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="label" htmlFor="rx-encounter">Link to encounter (optional)</label>
                <select
                  id="rx-encounter"
                  className="input"
                  value={encounterId}
                  onChange={(e) => setEncounterId(e.target.value)}
                >
                  <option value="">— No encounter —</option>
                  {encounters.map((enc) => (
                    <option key={enc.id} value={enc.id}>
                      {formatDate(enc.createdAt || '')} · {enc.type || 'OPD'} · {enc.diagnosis || enc.chiefComplaint || 'Encounter'}
                    </option>
                  ))}
                </select>
              </div>

              <datalist id="rx-medicine-list">
                {medOptions.map((m) => (
                  <option key={m.id} value={m.name}>
                    {[m.strength, m.form, m.genericName].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </datalist>
              <datalist id="rx-freq-list">
                {FREQ_PRESETS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>

              <div className="rx-items">
                <div className="rx-row rx-row-head">
                  <span className="rx-col-med">Medicine</span>
                  <span className="rx-col-route">Route</span>
                  <span className="rx-col-dose">Dosage</span>
                  <span className="rx-col-freq">Frequency</span>
                  <span className="rx-col-dur">Duration</span>
                  <span className="rx-col-qty">Qty</span>
                  <span className="rx-col-x" />
                </div>
                {items.map((it, idx) => (
                  <div key={it.key} className="rx-row">
                    <div className="rx-col-med">
                      <input
                        className="input"
                        list="rx-medicine-list"
                        placeholder="Medicine name…"
                        value={it.medicineName}
                        onChange={(e) => updateItem(it.key, 'medicineName', e.target.value)}
                        required
                        style={{ width: '100%' }}
                      />
                      {it.medicineId ? (
                        <div className="muted rx-note" style={{ fontSize: 11 }}>
                          #{idx + 1} · {it.genericName || ''} {it.brandName ? `(${it.brandName})` : ''}
                        </div>
                      ) : null}
                    </div>
                    <div className="rx-col-route">
                      <input
                        className="input"
                        list="rx-route-list"
                        placeholder="Route"
                        value={it.route}
                        onChange={(e) => updateItem(it.key, 'route', e.target.value)}
                      />
                    </div>
                    <div className="rx-col-dose">
                      <input
                        className="input"
                        placeholder="e.g. 500 mg"
                        value={it.dosage}
                        onChange={(e) => updateItem(it.key, 'dosage', e.target.value)}
                      />
                    </div>
                    <div className="rx-col-freq">
                      <input
                        className="input"
                        list="rx-freq-list"
                        placeholder="e.g. 1-0-1"
                        value={it.frequency}
                        onChange={(e) => updateItem(it.key, 'frequency', e.target.value)}
                      />
                    </div>
                    <div className="rx-col-dur">
                      <input
                        className="input"
                        placeholder="e.g. 5 days"
                        value={it.duration}
                        onChange={(e) => updateItem(it.key, 'duration', e.target.value)}
                      />
                    </div>
                    <div className="rx-col-qty">
                      <input
                        className="input"
                        type="number"
                        min={0}
                        placeholder="0"
                        value={it.quantity}
                        onChange={(e) => updateItem(it.key, 'quantity', e.target.value)}
                      />
                    </div>
                    <div className="rx-col-x">
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeItem(it.key)} aria-label="Remove">×</button>
                    </div>
                    <div className="rx-instructions">
                      <input
                        className="input"
                        placeholder="Instructions (optional) — e.g. after food, take with water…"
                        value={it.instructions}
                        onChange={(e) => updateItem(it.key, 'instructions', e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>+ Add medicine</button>
              </div>
              <datalist id="rx-route-list">
                {ROUTES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>

              <div className="form-grid" style={{ marginTop: 16 }}>
                <div className="field">
                  <label className="label" htmlFor="rx-advice">Advice</label>
                  <textarea
                    id="rx-advice"
                    className="input"
                    style={{ minHeight: 72 }}
                    placeholder="Diet, rest, lifestyle instructions…"
                    value={advice}
                    onChange={(e) => setAdvice(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="rx-followup">Follow-up</label>
                  <input
                    id="rx-followup"
                    className="input"
                    placeholder="e.g. Review in 1 week"
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                  />
                </div>
              </div>

              {warnings.length > 0 && (
                <div className="alert alert-error" style={{ marginTop: 14 }}>
                  <strong>Allergy interaction detected</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {warnings.map((w, i) => (
                      <li key={i}>
                        {w.matchedMedicine} matches {w.allergen} allergy{w.severity ? ` (${w.severity})` : ''}.
                      </li>
                    ))}
                  </ul>
                  <label className="checkbox-row" style={{ padding: '8px 0 0' }}>
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                    Prescribe anyway (clinical override)
                  </label>
                </div>
              )}

              {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Saving…' : 'Save prescription'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="modal-header">
              <h3 className="modal-title">
                Prescription {created?.id ? <span className="mono" style={{ fontWeight: 400 }}>· {String(created.id).slice(0, 8).toUpperCase()}</span> : ''}
              </h3>
              <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="rx-paper">
              <div className="receipt-header">
                <div>
                  <h2 style={{ margin: 0, fontSize: 18 }}>Medical Prescription</h2>
                  <div className="muted">Rx ref: <span className="mono">{created?.id || '—'}</span></div>
                </div>
                <div className="rx-date">
                  {signed ? <span className="badge badge-green">✓ Signed</span> : <span className="badge badge-yellow">Draft</span>}
                  <div className="muted" style={{ marginTop: 4 }}>{formatDate(created?.signedAt || new Date().toISOString())}</div>
                </div>
              </div>
              <div className="receipt-meta">
                <div className="receipt-patient">
                  <span className="label">Patient</span>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{patientName}</div>
                  <div className="muted">
                    {patient.mrn ? <span className="mono">{patient.mrn}</span> : ''}
                    {patient.age !== undefined ? ` · ${patient.age} yrs` : ''}
                    {patient.gender ? ` · ${patient.gender}` : ''}
                  </div>
                </div>
                <div>
                  <span className="label">Physician</span>
                  <div>{created?.doctor?.user ? `${created.doctor.user.firstName} ${created.doctor.user.lastName}`.trim() : created?.signerName || '—'}</div>
                </div>
                {encounterLabel && (
                  <div>
                    <span className="label">Encounter</span>
                    <div>{encounterLabel.type || 'OPD'} · {encounterLabel.diagnosis || encounterLabel.chiefComplaint || '—'}</div>
                  </div>
                )}
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Medicine</th>
                    <th>Dosage</th>
                    <th>Frequency</th>
                    <th>Duration</th>
                    <th>Instructions</th>
                  </tr>
                </thead>
                <tbody>
                  {(created?.items || []).map((it: any, i: number) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <strong>{it.medicineName}</strong>
                        {it.genericName ? <div className="muted" style={{ fontSize: 12 }}>{it.genericName}</div> : null}
                      </td>
                      <td>{it.dosage || '—'}</td>
                      <td>{it.frequency || '—'}</td>
                      <td>{it.duration || '—'}</td>
                      <td style={{ fontSize: 12.5 }}>{it.instructions || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {created?.advice ? (
                <p className="rx-advice">
                  <span className="label">Advice</span> {created.advice}
                </p>
              ) : null}
              {created?.followUp ? (
                <p className="rx-advice">
                  <span className="label">Follow-up</span> {created.followUp}
                </p>
              ) : null}
              <div className="rx-sign-row">
                <div className="rx-sign-line">
                  {signed ? (
                    <span style={{ fontFamily: 'cursive, serif', fontSize: 18 }}>{created.signerName}</span>
                  ) : (
                    <span className="muted">Unsigned</span>
                  )}
                </div>
                <div className="muted" style={{ textAlign: 'right' }}>Signature · {formatDate(created?.signedAt || new Date().toISOString())}</div>
              </div>
            </div>
            {canSign && !signed ? (
              <form onSubmit={handleSign} style={{ marginTop: 16 }}>
                <div className="field">
                  <label className="label" htmlFor="rx-signature">Type your full name to sign</label>
                  <input
                    id="rx-signature"
                    className="input"
                    placeholder="Dr. Full Name"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  I confirm the above prescription is accurate and clinically appropriate.
                </label>
                {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={onClose} disabled={signing}>Close</button>
                  <button type="submit" className="btn" disabled={signing || saving}>
                    {signing ? 'Signing…' : 'Sign & finalize'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="form-actions" style={{ marginTop: 16 }}>
                <button className="btn" onClick={onCreated}>Done</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}