'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/hooks';
import type { ApiResponse, Row } from '@/lib/types';

const STATUS_BADGE: Record<string, string> = { DRAFT: 'blue', FINALIZED: 'green', CANCELLED: 'red', VOID: 'gray' };
const PAYMENT_BADGE: Record<string, string> = { UNPAID: 'red', PARTIAL: 'yellow', PAID: 'green', REFUND_DUE: 'orange' };
const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'NET_BANKING', 'INSURANCE', 'CREDIT', 'CORPORATE'];

export default function DischargeBillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);

  const [showAddCharge, setShowAddCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({ serviceName: '', quantity: 1, unitRate: '', unit: '', notes: '' });

  const [showDiscount, setShowDiscount] = useState(false);
  const [discountForm, setDiscountForm] = useState({ amount: '', reason: '' });

  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'CASH', referenceNumber: '', notes: '' });

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { const t = setTimeout(() => setFlash(null), 4000); return () => clearTimeout(t); }, [flash]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: ApiResponse<any> = await api(`/billing/discharge/bills/${id}`);
      setBill((res.data as any) ?? res);
    } catch { setBill(null); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const isDraft = bill?.status === 'DRAFT';
  const isFinalized = bill?.status === 'FINALIZED';
  const dueAmount = Number(bill?.dueAmount ?? 0);

  function patientName(b: Row) {
    return [b.patient?.firstName, b.patient?.lastName].filter(Boolean).join(' ') || b.patientId || '—';
  }

  async function handleAddCharge() {
    try {
      setActionLoading(true);
      await api(`/billing/discharge/bills/${id}/charges`, {
        method: 'POST',
        body: JSON.stringify({ serviceName: chargeForm.serviceName, quantity: Number(chargeForm.quantity), unitRate: Number(chargeForm.unitRate), unit: chargeForm.unit || undefined, notes: chargeForm.notes || undefined }),
      });
      setShowAddCharge(false); setChargeForm({ serviceName: '', quantity: 1, unitRate: '', unit: '', notes: '' });
      load(); setFlash('Charge added');
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed'); } finally { setActionLoading(false); }
  }

  async function handleRemoveCharge(detailId: string) {
    if (!confirm('Remove this charge?')) return;
    try {
      await api(`/billing/discharge/bills/${id}/charges/${detailId}`, { method: 'DELETE' });
      load(); setFlash('Charge removed');
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed'); }
  }

  async function handleApplyDiscount() {
    try {
      setActionLoading(true);
      await api(`/billing/discharge/bills/${id}/discount`, {
        method: 'PATCH',
        body: JSON.stringify({ amount: Number(discountForm.amount), reason: discountForm.reason }),
      });
      setShowDiscount(false); setDiscountForm({ amount: '', reason: '' });
      load(); setFlash('Discount applied');
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed'); } finally { setActionLoading(false); }
  }

  async function handleRecordPayment() {
    try {
      setActionLoading(true);
      await api(`/billing/discharge/bills/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(payForm.amount), method: payForm.method, referenceNumber: payForm.referenceNumber || undefined, notes: payForm.notes || undefined }),
      });
      setShowPayment(false); setPayForm({ amount: '', method: 'CASH', referenceNumber: '', notes: '' });
      load(); setFlash('Payment recorded');
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed'); } finally { setActionLoading(false); }
  }

  async function handleFinalize() {
    if (!confirm('Finalize this bill? This action cannot be undone.')) return;
    try {
      setActionLoading(true);
      await api(`/billing/discharge/bills/${id}/finalize`, { method: 'POST' });
      load(); setFlash('Bill finalized');
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed'); } finally { setActionLoading(false); }
  }

  async function handleCancel() {
    try {
      setActionLoading(true);
      await api(`/billing/discharge/bills/${id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: cancelReason }),
      });
      setShowCancel(false); setCancelReason('');
      load(); setFlash('Bill cancelled');
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed'); } finally { setActionLoading(false); }
  }

  if (loading) return <AppShell><div className="loading">Loading bill...</div></AppShell>;
  if (!bill) return <AppShell><div className="empty"><div className="empty-state">Bill not found.</div></div></AppShell>;

  const details = bill.details ?? bill.dischargeBillDetails ?? [];
  const payments = bill.payments ?? [];

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{bill.billNumber || 'Draft Bill'}</h1>
          <p className="page-subtitle">{patientName(bill)} · Admission: {bill.admission?.admissionNumber || bill.admissionId}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => router.push('/billing/discharge-billing')}>← Back</button>
          {isDraft && <button className="btn btn-secondary" onClick={() => setShowCancel(true)}>Cancel Bill</button>}
          {isDraft && <button className="btn" onClick={handleFinalize} disabled={actionLoading}>Finalize</button>}
        </div>
      </div>

      {flash && <div className="alert alert-success">{flash}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 12, flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Status</div>
          <span className={`badge badge-${STATUS_BADGE[bill.status] || 'gray'}`} style={{ marginTop: 4 }}>{bill.status}</span>
        </div>
        <div className="card" style={{ padding: 12, flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Payment Status</div>
          <span className={`badge badge-${PAYMENT_BADGE[bill.paymentStatus] || 'gray'}`} style={{ marginTop: 4 }}>{bill.paymentStatus}</span>
        </div>
        <div className="card" style={{ padding: 12, flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bill Date</div>
          <div style={{ marginTop: 4 }}>{bill.billDate ? new Date(bill.billDate).toLocaleDateString() : '—'}</div>
        </div>
        <div className="card" style={{ padding: 12, flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Admission</div>
          <div style={{ marginTop: 4 }}>{bill.admissionDate ? new Date(bill.admissionDate).toLocaleDateString() : '—'} → {bill.dischargeDate ? new Date(bill.dischargeDate).toLocaleDateString() : '—'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 65%', minWidth: 0 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Charges ({details.length})</h3>
              {isDraft && <button className="btn btn-sm" onClick={() => setShowAddCharge(true)}>+ Add Charge</button>}
            </div>
            {details.length === 0 ? (
              <div className="empty"><div className="empty-state">No charges yet.</div></div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Source</th>
                      <th>Date</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>Gross</th>
                      <th>Tax</th>
                      <th>Net</th>
                      {isDraft && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d: any) => (
                      <tr key={d.id}>
                        <td>{d.serviceName || d.name || '—'}</td>
                        <td><span className="badge badge-gray">{d.sourceModule || '—'}</span></td>
                        <td>{d.serviceDate ? new Date(d.serviceDate).toLocaleDateString() : '—'}</td>
                        <td>{d.quantity}</td>
                        <td className="mono">{formatMoney(d.unitRate)}</td>
                        <td className="mono">{formatMoney(d.grossAmount)}</td>
                        <td className="mono">{formatMoney(d.tax)}</td>
                        <td className="mono">{formatMoney(d.netAmount)}</td>
                        {isDraft && (
                          <td>
                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleRemoveCharge(d.id)}>✕</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {payments.length > 0 && (
            <div className="card" style={{ padding: 16, marginTop: 16 }}>
              <h3 style={{ margin: '0 0 12px' }}>Payment History</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Date</th><th>Method</th><th>Amount</th><th>Reference</th><th>Notes</th></tr></thead>
                  <tbody>
                    {payments.map((p: any) => (
                      <tr key={p.id}>
                        <td>{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '—'}</td>
                        <td><span className="badge badge-blue">{p.method}</span></td>
                        <td className="mono">{formatMoney(p.amount)}</td>
                        <td>{p.referenceNumber || '—'}</td>
                        <td>{p.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: '0 0 320px' }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ margin: '0 0 12px' }}>Bill Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span className="mono">{formatMoney(bill.subtotal)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><span className="mono" style={{ color: 'var(--danger)' }}>-{formatMoney(bill.discountAmount ?? bill.discount)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax</span><span className="mono">{formatMoney(bill.tax)}</span></div>
              <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}><span>Net Amount</span><span className="mono">{formatMoney(bill.netAmount)}</span></div>
              {Number(bill.insuranceAmount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Insurance</span><span className="mono">{formatMoney(bill.insuranceAmount)}</span></div>}
              {Number(bill.advanceAdjustment) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Advance Adjustment</span><span className="mono">{formatMoney(bill.advanceAdjustment)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Paid</span><span className="mono" style={{ color: 'var(--success)' }}>{formatMoney(bill.paidAmount)}</span></div>
              <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}><span>Due</span><span className="mono" style={{ color: dueAmount > 0 ? 'var(--danger)' : 'var(--success)' }}>{formatMoney(bill.dueAmount)}</span></div>
            </div>

            {isDraft && (
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDiscount(true)}>Discount</button>
              </div>
            )}
            {isFinalized && dueAmount > 0 && (
              <div style={{ marginTop: 16 }}>
                <button className="btn" style={{ width: '100%' }} onClick={() => setShowPayment(true)}>Record Payment</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddCharge && (
        <div className="modal-backdrop" onClick={() => setShowAddCharge(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Manual Charge</h3>
              <button className="modal-close" onClick={() => setShowAddCharge(false)}>×</button>
            </div>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Service Name *</label><input className="input" value={chargeForm.serviceName} onChange={(e) => setChargeForm({ ...chargeForm, serviceName: e.target.value })} /></div>
              <div className="field"><label className="label">Quantity *</label><input className="input" type="number" min="1" step="1" value={chargeForm.quantity} onChange={(e) => setChargeForm({ ...chargeForm, quantity: Number(e.target.value) })} /></div>
              <div className="field"><label className="label">Unit Rate (₹) *</label><input className="input" type="number" step="0.01" value={chargeForm.unitRate} onChange={(e) => setChargeForm({ ...chargeForm, unitRate: e.target.value })} /></div>
              <div className="field"><label className="label">Unit</label><input className="input" value={chargeForm.unit} onChange={(e) => setChargeForm({ ...chargeForm, unit: e.target.value })} placeholder="e.g. per day" /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Notes</label><textarea className="input" rows={2} value={chargeForm.notes} onChange={(e) => setChargeForm({ ...chargeForm, notes: e.target.value })} /></div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddCharge(false)}>Cancel</button>
              <button className="btn" onClick={handleAddCharge} disabled={!chargeForm.serviceName || !chargeForm.unitRate || actionLoading}>{actionLoading ? 'Adding...' : 'Add Charge'}</button>
            </div>
          </div>
        </div>
      )}

      {showDiscount && (
        <div className="modal-backdrop" onClick={() => setShowDiscount(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Apply Discount</h3>
              <button className="modal-close" onClick={() => setShowDiscount(false)}>×</button>
            </div>
            <div className="form-grid">
              <div className="field"><label className="label">Discount Amount (₹) *</label><input className="input" type="number" step="0.01" min="0" value={discountForm.amount} onChange={(e) => setDiscountForm({ ...discountForm, amount: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Reason *</label><textarea className="input" rows={2} value={discountForm.reason} onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })} /></div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowDiscount(false)}>Cancel</button>
              <button className="btn" onClick={handleApplyDiscount} disabled={!discountForm.amount || !discountForm.reason || actionLoading}>{actionLoading ? 'Applying...' : 'Apply'}</button>
            </div>
          </div>
        </div>
      )}

      {showPayment && (
        <div className="modal-backdrop" onClick={() => setShowPayment(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Record Payment</h3>
              <button className="modal-close" onClick={() => setShowPayment(false)}>×</button>
            </div>
            <div className="form-grid">
              <div className="field"><label className="label">Amount (₹) *</label><input className="input" type="number" step="0.01" min="0" max={dueAmount} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
              <div className="field"><label className="label">Method *</label>
                <select className="input" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="field"><label className="label">Reference Number</label><input className="input" value={payForm.referenceNumber} onChange={(e) => setPayForm({ ...payForm, referenceNumber: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Notes</label><textarea className="input" rows={2} value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowPayment(false)}>Cancel</button>
              <button className="btn" onClick={handleRecordPayment} disabled={!payForm.amount || actionLoading}>{actionLoading ? 'Recording...' : 'Record Payment'}</button>
            </div>
          </div>
        </div>
      )}

      {showCancel && (
        <div className="modal-backdrop" onClick={() => setShowCancel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Cancel Bill</h3>
              <button className="modal-close" onClick={() => setShowCancel(false)}>×</button>
            </div>
            <div className="field" style={{ padding: '0 16px' }}><label className="label">Reason *</label><textarea className="input" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowCancel(false)}>Back</button>
              <button className="btn" style={{ background: 'var(--danger)' }} onClick={handleCancel} disabled={!cancelReason || actionLoading}>{actionLoading ? 'Cancelling...' : 'Cancel Bill'}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
