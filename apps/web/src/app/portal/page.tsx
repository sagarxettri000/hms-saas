'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, API_URL } from '@/lib/api';
import { formatDateTime, formatDate, formatMoney } from '@/lib/hooks';

type Tab = 'lookup' | 'labs' | 'invoices' | 'appointments' | 'book';

export default function PortalPage() {
  const [activeTab, setActiveTab] = useState<Tab>('lookup');
  const [mrn, setMrn] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [patient, setPatient] = useState<any>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState('');

  const [labs, setLabs] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    if (!mrn.trim()) return;
    setLooking(true);
    setError('');
    setPatient(null);
    try {
      const url = tenantId ? `/portal/lookup?mrn=${encodeURIComponent(mrn)}&tenantId=${tenantId}` : `/portal/lookup?mrn=${encodeURIComponent(mrn)}`;
      const r = await fetch(`${API_URL}${url}`);
      const data = await r.json();
      const p = data?.data ?? data;
      if (p?.id) {
        setPatient(p);
        setTenantId(p.tenantId || '');
      } else {
        setError('Patient not found');
      }
    } catch { setError('Lookup failed'); }
    setLooking(false);
  };

  const loadTab = useCallback(async (tab: Tab) => {
    if (!patient?.id || !tenantId) return;
    setLoading(true);
    try {
      if (tab === 'labs') {
        const r = await api(`/portal/labs?patientId=${patient.id}`);
        setLabs(r?.data?.data ?? r?.data ?? []);
      }
      if (tab === 'invoices') {
        const r = await api(`/portal/invoices?patientId=${patient.id}`);
        setInvoices(r?.data?.data ?? r?.data ?? []);
      }
      if (tab === 'appointments') {
        const r = await api(`/portal/appointments?patientId=${patient.id}`);
        setAppointments(r?.data?.data ?? r?.data ?? []);
      }
    } catch {}
    setLoading(false);
  }, [patient, tenantId]);

  useEffect(() => {
    if (patient && (activeTab === 'labs' || activeTab === 'invoices' || activeTab === 'appointments')) {
      loadTab(activeTab);
    }
  }, [activeTab, patient, loadTab]);

  const tabBtn = (key: Tab, label: string) => (
    <button className="btn btn-sm" style={{ background: activeTab === key ? 'var(--primary)' : 'var(--bg-secondary)', color: activeTab === key ? '#fff' : undefined, opacity: !patient && key !== 'lookup' ? 0.5 : 1, pointerEvents: !patient && key !== 'lookup' ? 'none' : 'auto' }} onClick={() => setActiveTab(key)}>{label}</button>
  );

  const STATUS_COLORS: Record<string, string> = {
    SCHEDULED: 'var(--info)', CONFIRMED: 'var(--warning)', COMPLETED: 'var(--success)', CANCELLED: 'var(--danger)',
    DRAFT: 'var(--muted)', PAID: 'var(--success)', PARTIAL: 'var(--warning)', UNPAID: 'var(--danger)',
    ORDERED: 'var(--info)', RESULT_READY: 'var(--primary)', VERIFIED: 'var(--success)', REPORTED: 'var(--muted)',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>Patient Portal</h1>
        <p style={{ color: 'var(--text-muted)' }}>View your health records, invoices, and book appointments</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
        {tabBtn('lookup', 'Lookup')}
        {tabBtn('labs', 'Lab Results')}
        {tabBtn('invoices', 'Invoices')}
        {tabBtn('appointments', 'Appointments')}
        {tabBtn('book', 'Book Appointment')}
      </div>

      {activeTab === 'lookup' && (
        <div className="card" style={{ padding: 24, maxWidth: 500, margin: '0 auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>Find Your Records</div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>MRN (Medical Record Number)</label>
            <input className="input" value={mrn} onChange={(e) => setMrn(e.target.value)} placeholder="Enter your MRN" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && lookup()} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Tenant ID (optional)</label>
            <input className="input" value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Leave blank for auto-detect" style={{ width: '100%' }} />
          </div>
          <button className="btn" style={{ width: '100%', background: 'var(--primary)', color: '#fff' }} onClick={lookup} disabled={looking}>
            {looking ? 'Looking up...' : 'Find Records'}
          </button>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8, textAlign: 'center' }}>{error}</div>}
          {patient && (
            <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{[patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                MRN: {patient.mrn} · {patient.gender || ''} · DOB: {patient.dateOfBirth?.slice(0, 10) || '—'}
              </div>
              {patient.phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Phone: {patient.phone}</div>}
              {patient.tenant?.name && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hospital: {patient.tenant.name}</div>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'labs' && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Lab Results</h2>
          {loading && <div className="loading">Loading...</div>}
          {!loading && labs.length === 0 && <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No lab results found.</div>}
          {labs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {labs.map((order: any) => (
                <div key={order.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{order.orderNumber}</span>
                    <span className="badge" style={{ background: STATUS_COLORS[order.status] || 'var(--muted)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{order.status?.replace(/_/g, ' ')}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{formatDateTime(order.orderedAt)}</div>
                  {order.items?.length > 0 && (
                    <div style={{ fontSize: 12 }}>
                      {order.items.map((item: any, i: number) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                          <span>{item.testName}</span>
                          <span style={{ color: item.isCritical ? 'var(--danger)' : item.isAbnormal ? 'var(--warning)' : 'var(--text-muted)' }}>
                            {item.resultValue ?? item.result ?? 'Pending'}
                            {item.unit ? ` ${item.unit}` : ''}
                            {item.referenceRange ? ` (ref: ${item.referenceRange})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Invoices & Payments</h2>
          {loading && <div className="loading">Loading...</div>}
          {!loading && invoices.length === 0 && <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No invoices found.</div>}
          {invoices.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Invoice #</th><th>Date</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {invoices.map((inv: any) => {
                    const paid = (inv.payments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
                    const balance = Number(inv.total || 0) - paid;
                    return (
                      <tr key={inv.id}>
                        <td className="mono" style={{ fontSize: 12 }}>{inv.invoiceNumber}</td>
                        <td style={{ fontSize: 12 }}>{inv.createdAt?.slice(0, 10)}</td>
                        <td>{formatMoney(inv.total)}</td>
                        <td style={{ color: 'var(--success)' }}>{formatMoney(paid)}</td>
                        <td style={{ color: balance > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{formatMoney(balance)}</td>
                        <td><span className="badge" style={{ background: STATUS_COLORS[inv.status] || 'var(--muted)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{inv.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'appointments' && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>My Appointments</h2>
          {loading && <div className="loading">Loading...</div>}
          {!loading && appointments.length === 0 && <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No appointments found.</div>}
          {appointments.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>ID</th><th>Date</th><th>Doctor</th><th>Type</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {appointments.map((apt: any) => (
                    <tr key={apt.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{apt.id.slice(0, 8)}</td>
                      <td style={{ fontSize: 12 }}>{formatDateTime(apt.appointmentDate)}</td>
                      <td>{apt.doctor?.user ? [apt.doctor.user.firstName, apt.doctor.user.lastName].filter(Boolean).join(' ') : '—'}</td>
                      <td>{apt.type || '—'}</td>
                      <td><span className="badge" style={{ background: STATUS_COLORS[apt.status] || 'var(--muted)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{apt.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'book' && (
        <BookAppointmentForm tenantId={tenantId} patientId={patient?.id} onSuccess={() => patient && loadTab('appointments')} />
      )}
    </div>
  );
}

function BookAppointmentForm({ tenantId, patientId, onSuccess }: { tenantId: string; patientId?: string; onSuccess?: () => void }) {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [form, setForm] = useState({ doctorId: '', appointmentDate: '', type: 'OPD', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => {
    if (tenantId) {
      api('/doctors?limit=200').then((r) => setDoctors(r?.data?.data ?? r?.data ?? [])).catch(() => {});
    }
  }, [tenantId]);

  const submit = async () => {
    if (!patientId || !form.doctorId || !form.appointmentDate) return;
    setSubmitting(true);
    setResult('');
    try {
      await api('/portal/appointments', {
        method: 'POST',
        body: JSON.stringify({ patientId, doctorId: form.doctorId, appointmentDate: form.appointmentDate, type: form.type, reason: form.reason }),
      });
      setResult('Appointment booked successfully!');
      setForm({ doctorId: '', appointmentDate: '', type: 'OPD', reason: '' });
      onSuccess?.();
    } catch { setResult('Failed to book appointment'); }
    setSubmitting(false);
  };

  if (!patientId) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
        Please lookup your MRN first to book an appointment.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 24, maxWidth: 500, margin: '0 auto' }}>
      <div style={{ fontWeight: 600, marginBottom: 16 }}>Book Appointment</div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Doctor *</label>
        <select className="input" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })} style={{ width: '100%' }}>
          <option value="">Select doctor...</option>
          {doctors.map((d: any) => <option key={d.id} value={d.id}>{d.user ? [d.user.firstName, d.user.lastName].filter(Boolean).join(' ') : d.id} — {d.specialization || 'General'}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Date & Time *</label>
        <input className="input" type="datetime-local" value={form.appointmentDate} onChange={(e) => setForm({ ...form, appointmentDate: e.target.value })} style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
        <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ width: '100%' }}>
          <option value="OPD">OPD</option>
          <option value="FOLLOWUP">Follow-up</option>
          <option value="EMERGENCY">Emergency</option>
          <option value="SPECIAL">Specialist</option>
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Reason</label>
        <textarea className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} style={{ width: '100%', minHeight: 60 }} placeholder="Reason for visit..." />
      </div>
      <button className="btn" style={{ width: '100%', background: 'var(--primary)', color: '#fff' }} onClick={submit} disabled={submitting}>
        {submitting ? 'Booking...' : 'Book Appointment'}
      </button>
      {result && <div style={{ marginTop: 8, fontSize: 13, textAlign: 'center', color: result.includes('success') ? 'var(--success)' : 'var(--danger)' }}>{result}</div>}
    </div>
  );
}
