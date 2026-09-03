'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Appointment {
  id: string;
  patient?: any;
  patientId?: string;
  doctor?: any;
  doctorId?: string;
  appointmentDate?: string;
  scheduledAt?: string;
  startTime?: string;
  type?: string;
  appointmentType?: string;
  isWalkIn?: boolean;
  source?: string;
  status?: string;
  checkedInAt?: string;
}

interface Payment {
  id: string;
  amount?: number;
  method?: string;
  paymentMethod?: string;
  createdAt?: string;
  paidAt?: string;
  receivedBy?: any;
  cashier?: any;
  cashierName?: string;
  patient?: any;
  invoice?: any;
  invoiceNumber?: string;
}

interface DiscountRequest {
  id: string;
  invoiceId?: string;
  patient: string;
  invoiceNo: string;
  amount: number;
  reason: string;
  requestedBy: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

const STATUS_TONES: Record<string, string> = {
  SCHEDULED: 'badge-blue',
  CONFIRMED: 'badge-purple',
  CHECKED_IN: 'badge-yellow',
  WAITING: 'badge-yellow',
  IN_PROGRESS: 'badge-yellow',
  COMPLETED: 'badge-green',
  CANCELLED: 'badge-red',
  NO_SHOW: 'badge-gray',
  PENDING: 'badge-yellow',
  APPROVED: 'badge-green',
  REJECTED: 'badge-red',
};

const APPOINTMENT_STATUSES = ['ALL', 'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
const VISIT_TYPES = ['OPD', 'FOLLOW_UP', 'EMERGENCY', 'TELECONSULT'];

function unwrap(r: any): any {
  return r?.data?.data ?? r?.data ?? r;
}

function personName(p: any): string {
  if (!p) return '';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || p.mrn || '';
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function apptTime(a: Appointment): Date | null {
  const raw = a.scheduledAt || a.appointmentDate;
  if (!raw) return null;
  let d = new Date(raw);
  if (!isNaN(d.getTime()) && a.startTime && !/T\d{2}:\d{2}/.test(raw)) {
    const merged = new Date(`${toDateKey(d)}T${a.startTime}`);
    if (!isNaN(merged.getTime())) d = merged;
  }
  if (isNaN(d.getTime())) return null;
  return d;
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  patientName: string;
  total: number;
  discountStatus?: string;
  discountAmount?: number;
  discountReason?: string;
  discountRequestedBy?: string;
}

function invoiceToDiscount(inv: {
  id: string;
  patientName: string;
  invoiceNumber: string;
  discountStatus?: string;
  discountAmount?: number;
  discountReason?: string;
  discountRequestedBy?: string;
  createdAt?: string;
}): DiscountRequest {
  const status =
    inv.discountStatus === 'APPROVED'
      ? 'APPROVED'
      : inv.discountStatus === 'REJECTED'
        ? 'REJECTED'
        : 'PENDING';
  return {
    id: inv.id,
    invoiceId: inv.id,
    patient: inv.patientName || '—',
    invoiceNo: inv.invoiceNumber || inv.id?.slice(0, 8) || '—',
    amount: Number(inv.discountAmount) || 0,
    reason: inv.discountReason || '',
    requestedBy: inv.discountRequestedBy || '',
    status,
    createdAt: inv.createdAt || '',
  };
}

export default function ReceptionPage() {
  const [tab, setTab] = useState<'frontdesk' | 'analytics' | 'discounts' | 'collections'>('frontdesk');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showWalkIn, setShowWalkIn] = useState(false);
  const [savingWalkIn, setSavingWalkIn] = useState(false);
  const [walkIn, setWalkIn] = useState({ patientName: '', phone: '', doctorId: '', type: 'OPD', time: '' });

  const [billingAnalytics, setBillingAnalytics] = useState<any>(null);

  const [discounts, setDiscounts] = useState<DiscountRequest[]>([]);
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountForm, setDiscountForm] = useState({ invoiceId: '', amount: '', reason: '', requestedBy: '' });
  const [discountSaved, setDiscountSaved] = useState(false);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  useEffect(() => {
    if (tab !== 'frontdesk') return;
    setLoadingAppts(true);
    setError(null);
    api('/appointments?limit=100')
      .then((r) => {
        const data = unwrap(r);
        setAppointments(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load appointments'))
      .finally(() => setLoadingAppts(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'analytics') return;
    api('/appointments?limit=200')
      .then((r) => {
        const data = unwrap(r);
        setAppointments(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      })
      .catch(() => {});
    api('/billing/analytics')
      .then((r) => setBillingAnalytics(unwrap(r)))
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    if (tab !== 'collections') return;
    setLoadingPayments(true);
    api('/billing/payments?limit=200')
      .then((r) => {
        const data = unwrap(r);
        setPayments(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      })
      .catch(() => {})
      .finally(() => setLoadingPayments(false));
  }, [tab]);

  const loadDiscountQueue = async () => {
    setLoadingDiscounts(true);
    setDiscountError(null);
    try {
      const r = await api('/billing/invoices?limit=200');
      const data = unwrap(r);
      const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      const options: InvoiceOption[] = rows.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber || inv.id?.slice(0, 8) || '',
        patientName: [inv.patient?.firstName, inv.patient?.lastName].filter(Boolean).join(' ') || inv.patient?.mrn || '—',
        total: Number(inv.total || inv.totalAmount || 0),
        discountStatus: inv.discountStatus,
        discountAmount: Number(inv.discountAmount || 0),
        discountReason: inv.discountReason,
        discountRequestedBy: inv.discountRequestedBy,
      }));
      setInvoiceOptions(options);
      const queued = options
        .filter((o) => o.discountStatus)
        .map((o) =>
          invoiceToDiscount({
            id: o.id,
            patientName: o.patientName,
            invoiceNumber: o.invoiceNumber,
            discountStatus: o.discountStatus,
            discountAmount: o.discountAmount,
            discountReason: o.discountReason,
            discountRequestedBy: o.discountRequestedBy,
          }),
        );
      setDiscounts(queued);
    } catch {
      setDiscountError('Failed to load discount queue from billing.');
    } finally {
      setLoadingDiscounts(false);
    }
  };

  useEffect(() => {
    loadDiscountQueue();
  }, [tab]);

  const todayKey = toDateKey(new Date());
  const todaysAppointments = appointments.filter((a) => {
    const t = apptTime(a);
    return t && toDateKey(t) === todayKey;
  });

  const checkIn = async (a: Appointment) => {
    if (busyId) return;
    setBusyId(a.id);
    try {
      await api(`/appointments/${a.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CHECKED_IN', checkedInAt: new Date().toISOString() }),
      });
      setAppointments((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, status: 'CHECKED_IN', checkedInAt: new Date().toISOString() } : x))
      );
    } catch {}
    setBusyId(null);
  };

  const registerWalkIn = async () => {
    if (!walkIn.patientName.trim()) return;
    setSavingWalkIn(true);
    try {
      const now = new Date();
      const timeValue = walkIn.time || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const nameParts = walkIn.patientName.trim().split(/\s+/);
      await api('/appointments', {
        method: 'POST',
        body: JSON.stringify({
          isWalkIn: true,
          patientFirstName: nameParts[0],
          patientLastName: nameParts.slice(1).join(' ') || nameParts[0],
          patientMobile: walkIn.phone || undefined,
          doctorId: walkIn.doctorId || undefined,
          appointmentDate: todayKey,
          startTime: timeValue,
          type: walkIn.type,
          appointmentType: walkIn.type,
          status: 'CHECKED_IN',
          source: 'WALK_IN',
        }),
      });
      setShowWalkIn(false);
      setWalkIn({ patientName: '', phone: '', doctorId: '', type: 'OPD', time: '' });
      const r = await api('/appointments?limit=100');
      const data = unwrap(r);
      setAppointments(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
    } catch {}
    setSavingWalkIn(false);
  };

  const frontDeskList =
    statusFilter === 'ALL'
      ? todaysAppointments.length
        ? todaysAppointments
        : appointments
      : (todaysAppointments.length ? todaysAppointments : appointments).filter(
          (a) => String(a.status).toUpperCase() === statusFilter
        );

  const analytics = (() => {
    const todays = appointments.filter((a) => {
      const t = apptTime(a);
      return t && toDateKey(t) === todayKey;
    });
    const walkIns = appointments.filter(
      (a) => a.isWalkIn === true || String(a.source).toUpperCase() === 'WALK_IN'
    ).length;
    const waits = todays
      .filter((a) => a.checkedInAt && apptTime(a))
      .map((a) => (new Date(a.checkedInAt as string).getTime() - (apptTime(a) as Date).getTime()) / 60000)
      .filter((m) => m >= 0 && m < 600);
    const avgWait = waits.length ? Math.round(waits.reduce((s, m) => s + m, 0) / waits.length) : 0;
    const served = appointments.filter((a) =>
      ['COMPLETED', 'CHECKED_IN', 'IN_PROGRESS'].includes(String(a.status).toUpperCase())
    ).length;
    const byHour: { hour: number; count: number }[] = Array.from({ length: 12 }, (_, i) => ({ hour: i + 8, count: 0 }));
    todays.forEach((a) => {
      const t = apptTime(a);
      if (!t) return;
      const h = t.getHours();
      const slot = byHour.find((b) => b.hour === h);
      if (slot) slot.count++;
    });
    const maxHour = Math.max(1, ...byHour.map((b) => b.count));
    const byDoctor: Record<string, number> = {};
    appointments.forEach((a) => {
      const name = personName(a.doctor) || a.doctorId || 'Unassigned';
      byDoctor[name] = (byDoctor[name] || 0) + 1;
    });
    const doctorCounts = Object.entries(byDoctor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
    return { todaysCount: todays.length, walkIns, avgWait, served, byHour, maxHour, doctorCounts };
  })();

  const submitDiscount = async () => {
    if (!discountForm.invoiceId || !discountForm.amount) return;
    setDiscountError(null);
    try {
      await api(`/billing/invoices/${discountForm.invoiceId}/discount`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount: Number(discountForm.amount),
          reason: discountForm.reason || undefined,
        }),
      });
      setDiscountForm({ invoiceId: '', amount: '', reason: '', requestedBy: '' });
      setDiscountSaved(true);
      setTimeout(() => setDiscountSaved(false), 2500);
      await loadDiscountQueue();
    } catch {
      setDiscountError('Failed to submit discount request.');
    }
  };

  const setDiscountStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setDiscountError(null);
    try {
      await api(`/billing/invoices/${id}/discount/approval`, {
        method: 'PATCH',
        body: JSON.stringify({ approve: status === 'APPROVED' }),
      });
      await loadDiscountQueue();
    } catch {
      setDiscountError('Failed to update discount status.');
    }
  };

  const collections = (() => {
    const todaysPayments = payments.filter((p) => {
      const d = p.createdAt || p.paidAt;
      return d && toDateKey(new Date(d)) === todayKey;
    });
    const totalToday = todaysPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const totalAll = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const methods: Record<string, { count: number; sum: number }> = {};
    payments.forEach((p) => {
      const m = String(p.method || p.paymentMethod || 'OTHER').toUpperCase();
      methods[m] = methods[m] || { count: 0, sum: 0 };
      methods[m].count++;
      methods[m].sum += Number(p.amount || 0);
    });
    const methodRows = Object.entries(methods)
      .sort((a, b) => b[1].sum - a[1].sum)
      .map(([name, v]) => ({ name, ...v }));
    const maxMethod = Math.max(1, ...methodRows.map((m) => m.sum));
    const cashiers: Record<string, { count: number; sum: number }> = {};
    payments.forEach((p) => {
      const c = personName(p.receivedBy) || personName(p.cashier) || p.cashierName || 'Unknown';
      cashiers[c] = cashiers[c] || { count: 0, sum: 0 };
      cashiers[c].count++;
      cashiers[c].sum += Number(p.amount || 0);
    });
    const cashierRows = Object.entries(cashiers)
      .sort((a, b) => b[1].sum - a[1].sum)
      .map(([name, v]) => ({ name, ...v }));
    return { todaysCount: todaysPayments.length, totalToday, totalAll, methodRows, maxMethod, cashierRows };
  })();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Reception</h1>
          <p className="page-subtitle">Front desk operations, discounts and collections</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button className={`tab ${tab === 'frontdesk' ? 'active' : ''}`} onClick={() => setTab('frontdesk')}>Front Desk</button>
        <button className={`tab ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>Analytics</button>
        <button className={`tab ${tab === 'discounts' ? 'active' : ''}`} onClick={() => setTab('discounts')}>Discount Queue</button>
        <button className={`tab ${tab === 'collections' ? 'active' : ''}`} onClick={() => setTab('collections')}>Collections</button>
      </div>

      {error && <div className="banner-danger">{error}</div>}

      {tab === 'frontdesk' && (
        <>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <select className="input search-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 220 }}>
              {APPOINTMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => setShowWalkIn(true)}>+ Walk-in Registration</button>
          </div>

          {loadingAppts ? (
            <div className="loading">Loading appointments…</div>
          ) : !frontDeskList.length ? (
            <div className="empty">No appointments found.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Doctor</th>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th style={{ width: 1 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {frontDeskList.map((a) => {
                    const t = apptTime(a);
                    const status = String(a.status || '').toUpperCase();
                    return (
                      <tr key={a.id}>
                        <td><strong>{personName(a.patient) || (a as any).patientName || a.patientId || '—'}</strong></td>
                        <td>{personName(a.doctor) || a.doctorId || '—'}</td>
                        <td>{t ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : a.startTime || '—'}</td>
                        <td>
                          <span className="badge badge-gray">
                            {(a.appointmentType || a.type || 'GENERAL').replace(/_/g, ' ')}
                          </span>
                          {a.isWalkIn && <span className="badge badge-purple" style={{ marginLeft: 4 }}>WALK-IN</span>}
                        </td>
                        <td>
                          <span className={`badge ${STATUS_TONES[status] || 'badge-gray'}`}>{status.replace(/_/g, ' ') || 'UNKNOWN'}</span>
                        </td>
                        <td>
                          {['SCHEDULED', 'CONFIRMED'].includes(status) && (
                            <button className="btn btn-sm" disabled={busyId === a.id} onClick={() => checkIn(a)}>
                              Check In
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {showWalkIn && (
            <div className="modal-backdrop" onClick={() => setShowWalkIn(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">Walk-in Registration</h3>
                  <button className="modal-close" onClick={() => setShowWalkIn(false)}>x</button>
                </div>
                <div className="form-grid">
                  <div className="field field-full">
                    <label className="label">Patient Name</label>
                    <input
                      className="input"
                      value={walkIn.patientName}
                      onChange={(e) => setWalkIn({ ...walkIn, patientName: e.target.value })}
                      placeholder="Full name"
                    />
                  </div>
                  <div className="field">
                    <label className="label">Phone</label>
                    <input
                      className="input"
                      value={walkIn.phone}
                      onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })}
                      placeholder="+91…"
                    />
                  </div>
                  <div className="field">
                    <label className="label">Doctor ID</label>
                    <input
                      className="input"
                      value={walkIn.doctorId}
                      onChange={(e) => setWalkIn({ ...walkIn, doctorId: e.target.value })}
                      placeholder="Optional doctor UUID"
                    />
                  </div>
                  <div className="field">
                    <label className="label">Visit Type</label>
                    <select className="input" value={walkIn.type} onChange={(e) => setWalkIn({ ...walkIn, type: e.target.value })}>
                      {VISIT_TYPES.map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label">Time</label>
                    <input
                      className="input"
                      value={walkIn.time}
                      onChange={(e) => setWalkIn({ ...walkIn, time: e.target.value })}
                      placeholder="HH:MM"
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setShowWalkIn(false)} disabled={savingWalkIn}>Cancel</button>
                  <button className="btn" onClick={registerWalkIn} disabled={savingWalkIn}>
                    {savingWalkIn ? 'Registering…' : 'Register Walk-in'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'analytics' && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Today's Appointments</div>
              <div className="stat-value">{analytics.todaysCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Walk-ins</div>
              <div className="stat-value" style={{ color: 'var(--info)' }}>{analytics.walkIns}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Wait Time</div>
              <div className="stat-value">{analytics.avgWait} min</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Patients Served</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{analytics.served}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Today's Appointments by Hour</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 180, padding: '0 8px' }}>
              {analytics.byHour.map((b) => (
                <div key={b.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{b.count || ''}</div>
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.round((b.count / analytics.maxHour) * 100)}%`,
                      minHeight: b.count > 0 ? 6 : 2,
                      background: 'var(--primary)',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.hour}:00</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Doctor-wise Patient Count</h3>
              {!analytics.doctorCounts.length ? (
                <div className="empty">No appointments recorded.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Doctor</th>
                        <th style={{ textAlign: 'right' }}>Patients</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.doctorCounts.map((d) => (
                        <tr key={d.name}>
                          <td>{d.name}</td>
                          <td style={{ textAlign: 'right' }}><strong>{d.count}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Billing Overview</h3>
              {billingAnalytics == null ? (
                <div className="empty">Billing analytics unavailable.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {Object.entries(billingAnalytics)
                        .filter(([, v]) => typeof v !== 'object')
                        .slice(0, 8)
                        .map(([k, v]) => (
                          <tr key={k}>
                            <td style={{ textTransform: 'capitalize' }}>{String(k).replace(/([A-Z])/g, ' $1').trim()}</td>
                            <td style={{ textAlign: 'right' }}><strong>{typeof v === 'number' ? fmtMoney(v) : String(v)}</strong></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'discounts' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Request Discount</h3>
            <div className="form-grid">
              <div className="field field-full">
                <label className="label">Invoice</label>
                <select
                  className="input"
                  value={discountForm.invoiceId}
                  onChange={(e) => setDiscountForm({ ...discountForm, invoiceId: e.target.value })}
                >
                  <option value="">Select an invoice…</option>
                  {invoiceOptions.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — {inv.patientName} ({fmtMoney(inv.total)})
                      {inv.discountStatus ? ` [${inv.discountStatus}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Amount</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={discountForm.amount}
                  onChange={(e) => setDiscountForm({ ...discountForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="field">
                <label className="label">Requested By</label>
                <input
                  className="input"
                  value={discountForm.requestedBy}
                  onChange={(e) => setDiscountForm({ ...discountForm, requestedBy: e.target.value })}
                  placeholder="Your name / role"
                />
              </div>
              <div className="field field-full">
                <label className="label">Reason</label>
                <textarea
                  className="textarea"
                  value={discountForm.reason}
                  onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })}
                  placeholder="Justification for the discount"
                />
              </div>
            </div>
            <div className="form-actions">
              {discountError && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{discountError}</span>}
              {discountSaved && <span style={{ fontSize: 13, color: 'var(--success)' }}>Request submitted.</span>}
              <button className="btn" disabled={!discountForm.invoiceId || !discountForm.amount} onClick={submitDiscount}>Submit Request</button>
            </div>
          </div>

          {loadingDiscounts ? (
            <div className="loading">Loading discount queue…</div>
          ) : !discounts.length ? (
            <div className="empty">No pending discount requests. Select an invoice above and submit one.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Invoice #</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Requested By</th>
                    <th>Status</th>
                    <th style={{ width: 1 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {discounts.map((d) => (
                    <tr key={d.id}>
                      <td><strong>{d.patient}</strong></td>
                      <td className="mono">{d.invoiceNo}</td>
                      <td>{fmtMoney(Number(d.amount) || 0)}</td>
                      <td style={{ maxWidth: 260 }}>{d.reason || '—'}</td>
                      <td>{d.requestedBy || '—'}</td>
                      <td>
                        <span className={`badge ${STATUS_TONES[d.status] || 'badge-gray'}`}>{d.status}</span>
                      </td>
                      <td>
                        {d.status === 'PENDING' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-sm" onClick={() => setDiscountStatus(d.id, 'APPROVED')}>Approve</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => setDiscountStatus(d.id, 'REJECTED')}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'collections' && (
        loadingPayments ? (
          <div className="loading">Loading payments…</div>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">Today's Collection</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>{fmtMoney(collections.totalToday)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Today's Payments</div>
                <div className="stat-value">{collections.todaysCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Collected (All)</div>
                <div className="stat-value">{fmtMoney(collections.totalAll)}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
              <div className="card">
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Payment Method Breakdown</h3>
                {!collections.methodRows.length ? (
                  <div className="empty">No payments recorded.</div>
                ) : (
                  collections.methodRows.map((m) => (
                    <div key={m.name} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span>{m.name} ({m.count})</span>
                        <span style={{ color: 'var(--text-muted)' }}>{fmtMoney(m.sum)}</span>
                      </div>
                      <div style={{ height: 10, background: 'var(--border)', borderRadius: 5 }}>
                        <div
                          style={{
                            width: `${Math.round((m.sum / collections.maxMethod) * 100)}%`,
                            height: '100%',
                            background: 'var(--primary)',
                            borderRadius: 5,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="card">
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Cashier-wise Collection</h3>
                {!collections.cashierRows.length ? (
                  <div className="empty">No collections recorded.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Cashier</th>
                          <th style={{ textAlign: 'right' }}>Payments</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collections.cashierRows.map((c) => (
                          <tr key={c.name}>
                            <td>{c.name}</td>
                            <td style={{ textAlign: 'right' }}>{c.count}</td>
                            <td style={{ textAlign: 'right' }}><strong>{fmtMoney(c.sum)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Recent Payments</h3>
              {!payments.length ? (
                <div className="empty">No payments recorded.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Patient</th>
                        <th>Invoice</th>
                        <th>Method</th>
                        <th>Cashier</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.slice(0, 25).map((p) => {
                        const d = p.createdAt || p.paidAt;
                        return (
                          <tr key={p.id}>
                            <td>{d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                            <td>{personName(p.patient) || '—'}</td>
                            <td className="mono">{p.invoiceNumber || p.invoice?.invoiceNumber || p.invoice?.id?.slice(0, 8) || '—'}</td>
                            <td>
                              <span className="badge badge-blue">{String(p.method || p.paymentMethod || 'OTHER').toUpperCase()}</span>
                            </td>
                            <td>{personName(p.receivedBy) || personName(p.cashier) || p.cashierName || '—'}</td>
                            <td style={{ textAlign: 'right' }}><strong>{fmtMoney(Number(p.amount || 0))}</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )
      )}
    </>
  );
}