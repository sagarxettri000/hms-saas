'use client';

import { useState, useEffect } from 'react';
import { api, API_URL } from '@/lib/api';
import { formatDateTime, formatDate, formatMoney } from '@/lib/hooks';

type Tab = 'lookup' | 'dashboard' | 'appointments' | 'results' | 'invoices' | 'records';

const TAB_LABELS: Record<Tab, string> = {
  lookup: 'Lookup',
  dashboard: 'Dashboard',
  appointments: 'Appointments',
  results: 'Results',
  invoices: 'Invoices',
  records: 'Medical Records',
};

const STATUS_TONES: Record<string, string> = {
  SCHEDULED: 'badge-blue',
  CONFIRMED: 'badge-yellow',
  COMPLETED: 'badge-green',
  CANCELLED: 'badge-red',
  DRAFT: 'badge-gray',
  PAID: 'badge-green',
  PARTIAL: 'badge-yellow',
  PENDING: 'badge-yellow',
  UNPAID: 'badge-red',
  ORDERED: 'badge-blue',
  RESULT_READY: 'badge-purple',
  VERIFIED: 'badge-green',
  APPROVED: 'badge-green',
  REPORTED: 'badge-gray',
  PROCESSING: 'badge-yellow',
};

function unwrap(r: any): any {
  return r?.data?.data ?? r?.data ?? r;
}

function listOf(r: any): any[] {
  const u = unwrap(r);
  if (Array.isArray(u)) return u;
  if (Array.isArray(u?.data)) return u.data;
  return [];
}

function objOf(r: any): any {
  const u = unwrap(r);
  return u && typeof u === 'object' && !Array.isArray(u) ? u : {};
}

function safe(p: Promise<any>): Promise<any> {
  return p.catch(() => null);
}

function personName(p: any): string {
  if (!p) return '—';
  if (typeof p === 'string') return p;
  const joined = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return joined || p.name || p.id || '—';
}

function doctorName(d: any): string {
  if (!d) return '—';
  if (d.user) return [d.user.firstName, d.user.lastName].filter(Boolean).join(' ') || d.name || '—';
  return d.name || '—';
}

function paidOf(inv: any): number {
  const payments = Array.isArray(inv.payments) ? inv.payments : [];
  return payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
}

function balanceOf(inv: any): number {
  return Number(inv.total || 0) - paidOf(inv);
}

export default function PortalPage() {
  const [tab, setTab] = useState<Tab>('lookup');
  const [mrn, setMrn] = useState('');
  const [tenantInput, setTenantInput] = useState('');
  const [patient, setPatient] = useState<any>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const [labs, setLabs] = useState<any[]>([]);
  const [radiology, setRadiology] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [encounters, setEncounters] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [payingId, setPayingId] = useState('');

  async function lookup() {
    if (!mrn.trim()) return;
    setLooking(true);
    setLookupError('');
    setPatient(null);
    try {
      const q = tenantInput.trim() ? `&tenantId=${encodeURIComponent(tenantInput.trim())}` : '';
      const r = await api(`/portal/lookup?mrn=${encodeURIComponent(mrn.trim())}${q}`);
      const p = objOf(r);
      if (p?.id) {
        setPatient(p);
        setTenantInput(p.tenantId || tenantInput.trim());
        setTab('dashboard');
      } else {
        setLookupError('Patient not found');
      }
    } catch {
      setLookupError('Lookup failed');
    }
    setLooking(false);
  }

  useEffect(() => {
    if (!patient?.id) return;
    let active = true;
    setLoading(true);
    setMessage('');
    Promise.all([
      safe(api(`/portal/labs?patientId=${patient.id}`)),
      safe(api(`/portal/invoices?patientId=${patient.id}`)),
      safe(api(`/portal/appointments?patientId=${patient.id}`)),
      safe(api(`/radiology/orders?patientId=${patient.id}&limit=100`)),
      safe(api(`/encounters?patientId=${patient.id}&limit=100`)),
      safe(api(`/encounters/prescriptions/patient/${patient.id}`)),
      safe(api('/doctors?limit=200')),
    ]).then(([labsR, invR, aptR, radR, encR, prR, docR]) => {
      if (!active) return;
      setLabs(listOf(labsR));
      setInvoices(listOf(invR));
      setAppointments(listOf(aptR));
      setRadiology(listOf(radR));
      setEncounters(listOf(encR));
      setPrescriptions(listOf(prR));
      setDoctors(listOf(docR));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [patient]);

  async function refreshAppointments() {
    if (!patient?.id) return;
    try {
      const r = await api(`/portal/appointments?patientId=${patient.id}`);
      setAppointments(listOf(r));
    } catch {}
  }

  async function payInvoice(inv: any) {
    const balance = balanceOf(inv);
    if (balance <= 0) return;
    setPayingId(inv.id);
    setMessage('');
    try {
      await api('/billing/payments', {
        method: 'POST',
        body: JSON.stringify({ invoiceId: inv.id, amount: balance, method: 'CASH' }),
      });
      setMessage('Payment successful. Thank you!');
      try {
        const r = await api(`/portal/invoices?patientId=${patient.id}`);
        setInvoices(listOf(r));
      } catch {}
    } catch {
      setMessage('Payment failed. Please try again or visit the billing desk.');
    }
    setPayingId('');
  }

  const fullName = patient ? [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ') : '';
  const upcoming = appointments
    .filter((a) => new Date(a.appointmentDate).getTime() > Date.now() && ['SCHEDULED', 'CONFIRMED'].includes(a.status))
    .sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime());
  const completedVisits = appointments.filter((a) => a.status === 'COMPLETED').length;
  const dueInvoices = invoices.filter((inv) => balanceOf(inv) > 0);

  const rxByEncounter = new Map<string, any[]>();
  for (const rx of prescriptions) {
    const key = rx.encounterId || 'none';
    const list = rxByEncounter.get(key) || [];
    list.push(rx);
    rxByEncounter.set(key, list);
  }

  function medLine(m: any): string {
    return [m.medicineName || m.medicine?.name || m.name, m.dosage || m.dose, m.frequency, m.duration]
      .filter(Boolean)
      .join(' · ');
  }

  const tabBtn = (k: Tab) => (
    <button
      key={k}
      className={`tab ${tab === k ? 'active' : ''}`}
      style={{ opacity: !patient && k !== 'lookup' ? 0.45 : 1 }}
      onClick={() => {
        if (!patient && k !== 'lookup') return;
        setTab(k);
      }}
    >
      {TAB_LABELS[k]}
    </button>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <div className="row-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--primary)', margin: 0 }}>Patient Portal</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
            View your health records, results and invoices
          </p>
        </div>
        {patient && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setPatient(null);
              setTab('lookup');
              setMrn('');
            }}
          >
            Not you? Switch patient
          </button>
        )}
      </div>

      <div className="tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map(tabBtn)}
      </div>

      {message && <div className="alert alert-success">{message}</div>}

      {tab === 'lookup' && (
        <div className="card" style={{ padding: 24, maxWidth: 480, margin: '32px auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 16, textAlign: 'center', fontSize: 17 }}>
            Find Your Records
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="label">MRN (Medical Record Number)</label>
            <input
              className="input"
              value={mrn}
              onChange={(e) => setMrn(e.target.value)}
              placeholder="Enter your MRN"
              onKeyDown={(e) => e.key === 'Enter' && lookup()}
            />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label className="label">Tenant ID (optional)</label>
            <input
              className="input"
              value={tenantInput}
              onChange={(e) => setTenantInput(e.target.value)}
              placeholder="Leave blank for auto-detect"
            />
          </div>
          <button className="btn" style={{ width: '100%' }} onClick={lookup} disabled={looking}>
            {looking ? 'Looking up...' : 'Find Records'}
          </button>
          {lookupError && (
            <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 10, textAlign: 'center' }}>
              {lookupError}
            </div>
          )}
        </div>
      )}

      {!patient && tab !== 'lookup' && (
        <div className="empty">Please look up your MRN first to access the portal.</div>
      )}

      {loading && patient && tab !== 'lookup' && <div className="loading">Loading your records...</div>}

      {!loading && patient && tab === 'dashboard' && (
        <div>
          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Upcoming Appointments</span>
              <span className="stat-value" style={{ color: 'var(--primary)' }}>{upcoming.length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Past Visits</span>
              <span className="stat-value">{completedVisits}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Invoices Due</span>
              <span className="stat-value" style={{ color: dueInvoices.length ? 'var(--danger)' : 'var(--success)' }}>
                {dueInvoices.length}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Lab Reports</span>
              <span className="stat-value">{labs.length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Radiology Reports</span>
              <span className="stat-value">{radiology.length}</span>
            </div>
          </div>

          <div className="detail-grid">
            <div className="card" style={{ padding: 20 }}>
              <div className="card-title">Personal Information</div>
              <dl className="kv" style={{ margin: 0 }}>
                <dt>Name</dt>
                <dd style={{ fontWeight: 600 }}>{fullName}</dd>
                <dt>MRN</dt>
                <dd className="mono">{patient.mrn}</dd>
                <dt>Date of Birth</dt>
                <dd>{formatDate(patient.dateOfBirth)}</dd>
                <dt>Gender</dt>
                <dd>{patient.gender || '—'}</dd>
                <dt>Phone</dt>
                <dd>{patient.phone || '—'}</dd>
                {patient.bloodGroup && (
                  <>
                    <dt>Blood Group</dt>
                    <dd>{String(patient.bloodGroup).replace('_', '')}</dd>
                  </>
                )}
                <dt>Hospital</dt>
                <dd>{patient.tenant?.name || '—'}</dd>
              </dl>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <div className="row-between" style={{ marginBottom: 12 }}>
                <div className="card-title" style={{ margin: 0 }}>Upcoming Appointments</div>
                <button className="btn btn-sm btn-ghost" onClick={() => setTab('appointments')}>
                  Book new
                </button>
              </div>
              {upcoming.length === 0 && (
                <div className="muted" style={{ fontSize: 13 }}>No upcoming appointments scheduled.</div>
              )}
              {upcoming.slice(0, 4).map((a) => (
                <div key={a.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0', fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{formatDateTime(a.appointmentDate)}</div>
                  <div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                    <span>{doctorName(a.doctor)}</span>
                    <span className={`badge ${STATUS_TONES[a.status] || 'badge-gray'}`}>{a.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <div className="card-title" style={{ margin: 0 }}>Recent Visits</div>
              <button className="btn btn-sm btn-ghost" onClick={() => setTab('records')}>
                View medical records
              </button>
            </div>
            {completedVisits === 0 && (
              <div className="muted" style={{ fontSize: 13 }}>No completed visits on record.</div>
            )}
            {appointments
              .filter((a) => a.status === 'COMPLETED')
              .slice(0, 4)
              .map((a) => (
                <div key={a.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0', fontSize: 13 }}>
                  <strong>{formatDateTime(a.appointmentDate)}</strong> — {doctorName(a.doctor)} ({a.type || 'Visit'})
                </div>
              ))}
          </div>
        </div>
      )}

      {!loading && patient && tab === 'appointments' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Doctor</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No appointments found.
                      </td>
                    </tr>
                  )}
                  {[...appointments]
                    .sort((a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime())
                    .map((apt) => (
                      <tr key={apt.id}>
                        <td style={{ fontSize: 13 }}>{formatDateTime(apt.appointmentDate)}</td>
                        <td>{doctorName(apt.doctor)}</td>
                        <td>{apt.type || '—'}</td>
                        <td>
                          <span className={`badge ${STATUS_TONES[apt.status] || 'badge-gray'}`}>{apt.status}</span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <BookAppointmentForm
            doctors={doctors}
            patientId={patient.id}
            onBooked={() => {
              setMessage('Appointment booked successfully!');
              refreshAppointments();
            }}
          />
        </div>
      )}

      {!loading && patient && tab === 'results' && (
        <div>
          <h3 style={{ margin: '0 0 12px' }}>Laboratory Results</h3>
          {labs.length === 0 && (
            <div className="empty">No lab reports available.</div>
          )}
          <div className="form-grid" style={{ marginBottom: 24 }}>
            {labs.map((order) => (
              <div key={order.id} className="card" style={{ padding: 16 }}>
                <div className="row-between" style={{ marginBottom: 6 }}>
                  <span className="mono" style={{ fontWeight: 600 }}>{order.orderNumber}</span>
                  <span className={`badge ${STATUS_TONES[order.status] || 'badge-gray'}`}>
                    {String(order.status || '').replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="note" style={{ marginBottom: 8 }}>{formatDateTime(order.orderedAt)}</div>
                {(order.items || []).length > 0 && (
                  <div style={{ fontSize: 12.5 }}>
                    {order.items.map((item: any, i: number) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '4px 0',
                          borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                        }}
                      >
                        <span>{item.testName}</span>
                        <span
                          style={{
                            color:
                              item.isCritical
                                ? 'var(--danger)'
                                : item.isAbnormal
                                  ? 'var(--warning)'
                                  : 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.resultValue ?? item.result ?? 'Pending'}
                          {item.unit ? ` ${item.unit}` : ''}
                          {item.referenceRange ? ` (ref: ${item.referenceRange})` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => window.open(`${API_URL}/lab/orders/${order.id}/pdf`, '_blank')}
                  >
                    Download PDF
                  </button>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ margin: '0 0 12px' }}>Radiology Results</h3>
          {radiology.length === 0 && (
            <div className="empty">No radiology reports available.</div>
          )}
          <div className="form-grid">
            {radiology.map((r) => (
              <div key={r.id} className="card" style={{ padding: 16 }}>
                <div className="row-between" style={{ marginBottom: 6 }}>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {r.orderNumber || r.id?.slice(0, 8)}
                  </span>
                  <span className={`badge ${STATUS_TONES[r.status] || 'badge-gray'}`}>
                    {String(r.status || '').replace(/_/g, ' ')}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                  {r.studyType || r.type || r.modality || 'Imaging study'}
                </div>
                <div className="note" style={{ marginBottom: 8 }}>{formatDateTime(r.createdAt)}</div>
                {(r.report?.impression || r.impression || r.findings || r.reportText) && (
                  <p style={{ fontSize: 12.5, margin: '0 0 10px', color: 'var(--text-muted)' }}>
                    {String(r.report?.impression || r.impression || r.findings || r.reportText).slice(0, 200)}
                  </p>
                )}
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => window.open(`${API_URL}/radiology/orders/${r.id}/pdf`, '_blank')}
                >
                  Download PDF
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && patient && tab === 'invoices' && (
        <div>
          {invoices.length === 0 ? (
            <div className="empty">No invoices found.</div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Paid</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...invoices]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((inv) => {
                        const paid = paidOf(inv);
                        const balance = balanceOf(inv);
                        return (
                          <tr key={inv.id}>
                            <td className="mono" style={{ fontSize: 12 }}>{inv.invoiceNumber}</td>
                            <td style={{ fontSize: 12 }}>{formatDate(inv.createdAt)}</td>
                            <td>{formatMoney(inv.total)}</td>
                            <td style={{ color: 'var(--success)' }}>{formatMoney(paid)}</td>
                            <td style={{ color: balance > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                              {formatMoney(balance)}
                            </td>
                            <td>
                              <span className={`badge ${STATUS_TONES[inv.status] || 'badge-gray'}`}>{inv.status}</span>
                            </td>
                            <td>
                              {balance > 0 ? (
                                <button
                                  className="btn btn-sm"
                                  onClick={() => payInvoice(inv)}
                                  disabled={payingId === inv.id}
                                >
                                  {payingId === inv.id ? 'Paying...' : 'Pay now'}
                                </button>
                              ) : (
                                <span className="note">Settled</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && patient && tab === 'records' && (
        <div>
          {encounters.length === 0 ? (
            <div className="empty">No medical records found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[...encounters]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((enc) => {
                  const rxList = rxByEncounter.get(enc.id) || [];
                  return (
                    <div key={enc.id} className="card" style={{ padding: 16 }}>
                      <div className="row-between" style={{ marginBottom: 6 }}>
                        <strong style={{ fontSize: 14 }}>{formatDateTime(enc.encounterDate || enc.createdAt)}</strong>
                        <span className={`badge ${(STATUS_TONES[enc.type] || 'badge-blue')}`}>
                          {enc.type || 'Visit'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13.5, marginBottom: 4 }}>
                        <strong>Diagnosis:</strong> {enc.diagnosis || enc.provisionalDiagnosis || '—'}
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                        {doctorName(enc.doctor)}
                        {enc.chiefComplaint ? ` · ${enc.chiefComplaint}` : ''}
                      </div>
                      {enc.notes && (
                        <p className="note" style={{ margin: '0 0 8px' }}>
                          {String(enc.notes).slice(0, 180)}
                        </p>
                      )}
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                        <div className="note" style={{ marginBottom: 4, fontWeight: 600 }}>
                          Prescriptions
                        </div>
                        {rxList.length === 0 && <div className="note">No prescriptions attached.</div>}
                        {rxList.map((rx) => (
                          <div key={rx.id}>
                            {(rx.items || rx.medications || []).length === 0 ? (
                              <div style={{ fontSize: 12.5 }}>{formatDateTime(rx.createdAt)}</div>
                            ) : (
                              (rx.items || rx.medications || []).map((m: any, i: number) => (
                                <div key={i} style={{ fontSize: 12.5, padding: '2px 0' }}>
                                  💊 {medLine(m) || 'Medication'}
                                </div>
                              ))
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BookAppointmentForm({
  doctors,
  patientId,
  onBooked,
}: {
  doctors: any[];
  patientId?: string;
  onBooked?: () => void;
}) {
  const [form, setForm] = useState({ doctorId: '', appointmentDate: '', type: 'OPD', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState('');

  async function submit() {
    if (!patientId || !form.doctorId || !form.appointmentDate) return;
    setSubmitting(true);
    setResult('');
    try {
      await api('/portal/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          doctorId: form.doctorId,
          appointmentDate: form.appointmentDate,
          type: form.type,
          reason: form.reason,
        }),
      });
      setResult('Appointment booked successfully!');
      setForm({ doctorId: '', appointmentDate: '', type: 'OPD', reason: '' });
      onBooked?.();
    } catch {
      setResult('Failed to book appointment');
    }
    setSubmitting(false);
  }

  return (
    <div className="card" style={{ padding: 20, maxWidth: 560 }}>
      <div className="card-title">Book New Appointment</div>
      <div className="form-grid">
        <div className="field field-full">
          <label className="label">Doctor *</label>
          <select
            className="input"
            value={form.doctorId}
            onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
          >
            <option value="">Select doctor...</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {personName(d.user)} — {d.specialization || 'General'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Date & Time *</label>
          <input
            className="input"
            type="datetime-local"
            value={form.appointmentDate}
            onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="label">Type</label>
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="OPD">OPD</option>
            <option value="FOLLOWUP">Follow-up</option>
            <option value="EMERGENCY">Emergency</option>
            <option value="SPECIAL">Specialist</option>
            <option value="TELEMEDICINE">Telemedicine</option>
          </select>
        </div>
        <div className="field field-full">
          <label className="label">Reason</label>
          <textarea
            className="textarea"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            style={{ minHeight: 64 }}
            placeholder="Reason for visit..."
          />
        </div>
      </div>
      <button className="btn" style={{ marginTop: 14 }} onClick={submit} disabled={submitting}>
        {submitting ? 'Booking...' : 'Book Appointment'}
      </button>
      {result && (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: result.includes('success') ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {result}
        </div>
      )}
    </div>
  );
}
