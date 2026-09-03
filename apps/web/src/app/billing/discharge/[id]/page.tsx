'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/hooks';
import type { ApiResponse, Row } from '@/lib/types';

const STATUS_BADGE: Record<string, string> = { DRAFT: 'blue', FINALIZED: 'green', CANCELLED: 'red', VOID: 'gray' };
const PAYMENT_BADGE: Record<string, string> = { UNPAID: 'red', PARTIAL: 'yellow', PAID: 'green', REFUND_DUE: 'orange' };
const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'NET_BANKING', 'INSURANCE', 'CREDIT', 'CORPORATE'];

export default function DischargeWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const admissionId = id || '';
  const router = useRouter();

  const [admission, setAdmission] = useState<Row | null>(null);
  const [patient, setPatient] = useState<Row | null>(null);
  const [bill, setBill] = useState<Row | null>(null);
  const [detailCharges, setDetailCharges] = useState<Row[]>([]);
  const [deposits, setDeposits] = useState<Row[]>([]);
  const [paymentsHistory, setPaymentsHistory] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [showCreateDraft, setShowCreateDraft] = useState(false);
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({ serviceName: '', quantity: 1, unitRate: '', unit: '', notes: '' });
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountForm, setDiscountForm] = useState({ amount: '', reason: '' });
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'CASH', referenceNumber: '', notes: '' });
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showFinalize, setShowFinalize] = useState(false);
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const admRes = (await api(`/ipd/admissions/${admissionId}`)) as ApiResponse<Row>;
      const adm = (admRes.data ?? admRes) as Row;
      const patientId = adm.patientId;

      const [billRes, depRes, payRes] = await Promise.all([
        api(`/billing/discharge/bills/draft/${admissionId}`) as Promise<ApiResponse<any>>,
        api(`/billing/deposits?patientId=${encodeURIComponent(patientId)}&limit=50`) as Promise<ApiResponse<any>>,
        api(`/billing/payments?patientId=${encodeURIComponent(patientId)}&limit=50`) as Promise<ApiResponse<any>>,
      ]);

      setAdmission(adm);
      setPatient((adm.patient as Row) || null);

      const billData = (billRes.data?.data ?? billRes.data ?? null) as any;
      if (billData && billData.id) {
        setBill(billData);
        const details = billData.details ?? billData.dischargeBillDetails ?? [];
        setDetailCharges(Array.isArray(details) ? details : []);
      } else {
        setBill(null);
        setDetailCharges([]);
      }

      const depPayload = depRes.data ?? depRes;
      setDeposits(Array.isArray(depPayload.data) ? depPayload.data : Array.isArray(depPayload) ? depPayload : []);

      const payPayload = payRes.data ?? payRes;
      setPaymentsHistory(Array.isArray(payPayload.data) ? payPayload.data : Array.isArray(payPayload) ? payPayload : []);
    } catch {
      setAdmission(null);
      setBill(null);
    } finally {
      setLoading(false);
    }
  }, [admissionId]);

  useEffect(() => {
    if (admissionId) load();
  }, [admissionId, load]);

  const isDraft = bill?.status === 'DRAFT';
  const isFinalized = bill?.status === 'FINALIZED';
  const dueAmount = Number(bill?.dueAmount ?? 0);

  // ---- Actions ----

  async function handleCreateDraft() {
    setActionLoading(true);
    try {
      await api('/billing/discharge/bills', {
        method: 'POST',
        body: JSON.stringify({ admissionId, patientId: admission?.patientId }),
      });
      setShowCreateDraft(false);
      setFlash('Draft bill created with auto-collected charges.');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create draft bill.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddCharge() {
    setActionLoading(true);
    try {
      await api(`/billing/discharge/bills/${bill?.id}/charges`, {
        method: 'POST',
        body: JSON.stringify({
          serviceName: chargeForm.serviceName,
          quantity: Number(chargeForm.quantity),
          unitRate: Number(chargeForm.unitRate),
          unit: chargeForm.unit || undefined,
          notes: chargeForm.notes || undefined,
        }),
      });
      setShowAddCharge(false);
      setChargeForm({ serviceName: '', quantity: 1, unitRate: '', unit: '', notes: '' });
      setFlash('Charge added');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveCharge(detailId: string) {
    if (!confirm('Remove this charge?')) return;
    try {
      await api(`/billing/discharge/bills/${bill?.id}/charges/${detailId}`, { method: 'DELETE' });
      setFlash('Charge removed');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleApplyDiscount() {
    setActionLoading(true);
    try {
      await api(`/billing/discharge/bills/${bill?.id}/discount`, {
        method: 'PATCH',
        body: JSON.stringify({ amount: Number(discountForm.amount), reason: discountForm.reason }),
      });
      setShowDiscount(false);
      setDiscountForm({ amount: '', reason: '' });
      setFlash('Discount applied');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRecordPayment() {
    setActionLoading(true);
    try {
      await api(`/billing/discharge/bills/${bill?.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payForm.amount),
          method: payForm.method,
          referenceNumber: payForm.referenceNumber || undefined,
          notes: payForm.notes || undefined,
        }),
      });
      setShowPayment(false);
      setPayForm({ amount: '', method: 'CASH', referenceNumber: '', notes: '' });
      setFlash(`Payment recorded via ${payForm.method}`);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleFinalize() {
    setActionLoading(true);
    try {
      await api(`/billing/discharge/bills/${bill?.id}/finalize`, { method: 'POST' });
      setShowFinalize(false);
      setFlash('Bill finalized. Invoice created for revenue reports.');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelBill() {
    setActionLoading(true);
    try {
      await api(`/billing/discharge/bills/${bill?.id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: cancelReason }),
      });
      setShowCancel(false);
      setCancelReason('');
      setFlash('Bill cancelled');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCompleteDischarge() {
    setActionLoading(true);
    try {
      await api(`/ipd/admissions/${admissionId}/discharge`, {
        method: 'PATCH',
        body: JSON.stringify({ dischargeType: 'BILLING_CLEARED' }),
      });
      setShowDischargeConfirm(false);
      setFlash('Patient discharged successfully.');
      setTimeout(() => router.push('/billing/discharge'), 1500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete discharge.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <><div className="loading">Loading discharge workspace…</div></>;
  if (!admission) return <><div className="empty"><div className="empty-state">Admission not found.</div></div></>;

  const details = detailCharges;
  const payments = paymentsHistory;
  const totalDeposits = deposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const bed = admission.bed as Row | undefined;
  const ward = bed?.ward as Row | undefined;
  const doctor = admission.admittingDoctor as Row | undefined;
  const patientNameStr = patient ? [patient.firstName, patient.lastName].filter(Boolean).join(' ') : '—';

  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn btn-secondary btn-sm" style={{ marginBottom: 8 }} onClick={() => router.push('/billing/discharge')}>← Back to Discharge List</button>
          <h1 className="page-title">{bill?.billNumber || 'Discharge Workspace'}</h1>
          <p className="page-subtitle">{patientNameStr} {patient?.mrn ? `· ${patient.mrn}` : ''} · Admission: {admission.admissionNumber}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!bill && (
            <button className="btn" onClick={() => setShowCreateDraft(true)} disabled={actionLoading}>
              Start Discharge Billing
            </button>
          )}
        </div>
      </div>

      {flash && <div className="alert alert-success">{flash}</div>}

      {/* Status cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: 12, flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bill Status</div>
          <span className={`badge badge-${STATUS_BADGE[bill?.status as string] || 'gray'}`} style={{ marginTop: 4 }}>{bill?.status || '—'}</span>
        </div>
        <div className="card" style={{ padding: 12, flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Payment Status</div>
          <span className={`badge badge-${PAYMENT_BADGE[bill?.paymentStatus as string] || 'gray'}`} style={{ marginTop: 4 }}>{bill?.paymentStatus || '—'}</span>
        </div>
        <div className="card" style={{ padding: 12, flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Admission</div>
          <div style={{ marginTop: 4 }}>{admission.admissionDate ? new Date(admission.admissionDate).toLocaleDateString() : '—'} → {admission.dischargeDate ? new Date(admission.dischargeDate).toLocaleDateString() : '—'}</div>
        </div>
        <div className="card" style={{ padding: 12, flex: '1 1 160px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bed</div>
          <div style={{ marginTop: 4 }}>{bed?.name || '—'} {ward?.name ? `(${ward.name})` : ''}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Main column: Clinical + Charges */}
        <div style={{ flex: '1 1 65%', minWidth: 320 }}>
          <div className="card" style={{ padding: 16 }}>
            <h4 style={{ margin: '0 0 12px' }}>Clinical Information</h4>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr><td style={{ fontWeight: 600 }}>Admission Type</td><td>{admission.admissionType}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Department</td><td>{admission.department?.name || admission.departmentId || '—'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Admitting Doctor</td><td>{doctor?.firstName ? `${doctor.firstName} ${doctor.lastName}` : '—'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Diagnosis</td><td>{admission.finalDiagnosis || admission.primaryDiagnosis || admission.provisionalDiagnosis || '—'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Discharge Summary</td><td>{admission.dischargeSummary || '—'}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0 }}>Charges ({details.length})</h4>
              {isDraft && <button className="btn btn-sm" onClick={() => setShowAddCharge(true)}>+ Add Charge</button>}
            </div>
            {details.length === 0 ? (
              !bill ? (
                <div className="empty">
                  <div className="empty-state">No bill yet. Start discharge billing to auto-collect charges from IPD, Lab, Radiology, OT, Pharmacy, and Nursing.</div>
                </div>
              ) : (
                <div className="empty"><div className="empty-state">No charges on this bill.</div></div>
              )
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
                        <td>{Number(d.quantity)}</td>
                        <td className="mono">{formatMoney(d.unitRate)}</td>
                        <td className="mono">{formatMoney(d.grossAmount)}</td>
                        <td className="mono">{formatMoney(d.tax)}</td>
                        <td className="mono">{formatMoney(d.netAmount)}</td>
                        {isDraft && (
                          <td>
                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleRemoveCharge(d.id)} aria-label="Remove charge">✕</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Deposits & Advances */}
          {deposits.length > 0 && (
            <div className="card" style={{ padding: 16, marginTop: 16 }}>
              <h4 style={{ margin: '0 0 12px' }}>Deposits / Advances</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Method</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>
                    {deposits.map((d: any) => (
                      <tr key={d.id}>
                        <td>{d.method}</td>
                        <td className="mono">{formatMoney(d.amount)}</td>
                        <td><span className={`badge badge-${d.status === 'USED' || d.status === 'PARTIAL' ? 'green' : 'blue'}`}>{d.status}</span></td>
                        <td>{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payments history */}
          {payments.length > 0 && (
            <div className="card" style={{ padding: 16, marginTop: 16 }}>
              <h4 style={{ margin: '0 0 12px' }}>Payment History</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Amount</th><th>Method</th><th>Reference</th><th>Date</th></tr></thead>
                  <tbody>
                    {payments.map((p: any) => (
                      <tr key={p.id}>
                        <td className="mono">{formatMoney(p.amount)}</td>
                        <td><span className="badge badge-blue">{p.method}</span></td>
                        <td>{p.referenceNumber || p.paymentNumber || '—'}</td>
                        <td>{p.paidAt || p.paymentDate ? new Date(p.paidAt || p.paymentDate).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Bill Summary + Actions */}
        <div style={{ flex: '0 0 320px' }}>
          <div className="card" style={{ padding: 16 }}>
            <h4 style={{ margin: '0 0 12px' }}>Bill Summary</h4>
            {!bill ? (
              <div className="empty"><div className="empty-state">No bill created yet.</div></div>
            ) : (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
                  <span>Due</span>
                  <span className="mono" style={{ color: dueAmount > 0 ? 'var(--danger)' : 'var(--success)' }}>{formatMoney(bill.dueAmount ?? dueAmount)}</span>
                </div>
                {totalDeposits > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total Deposits</span><span className="mono">{formatMoney(totalDeposits)}</span></div>
                )}
              </div>
            )}

            {isDraft && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setShowDiscount(true)}>Apply Discount</button>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowFinalize(true)}>Finalize Bill</button>
                <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => setShowCancel(true)}>Cancel Bill</button>
              </div>
            )}
            {isFinalized && dueAmount > 0 && (
              <div style={{ marginTop: 16 }}>
                <button className="btn" style={{ width: '100%' }} onClick={() => setShowPayment(true)}>Record Payment</button>
              </div>
            )}
            {isFinalized && dueAmount <= 0 && (
              <div style={{ marginTop: 16 }}>
                <span className="badge badge-green">Fully Paid</span>
              </div>
            )}
            {isFinalized && (
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-success" style={{ width: '100%' }} onClick={() => setShowDischargeConfirm(true)}>Complete Discharge</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Start / Create draft modal */}
      {showCreateDraft && (
        <div className="modal-backdrop" onClick={() => setShowCreateDraft(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">Start Discharge Billing</h3>
              <button className="modal-close" onClick={() => setShowCreateDraft(false)}>✕</button>
            </div>
            <p style={{ padding: '0 16px', margin: '0 0 16px' }}>This will auto-collect charges from this admission (bed, consultation, lab, radiology, OT, pharmacy, nursing) and create a draft discharge bill.</p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreateDraft(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreateDraft} disabled={actionLoading}>{actionLoading ? 'Creating…' : 'Create Draft Bill'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add manual charge modal */}
      {showAddCharge && (
        <div className="modal-backdrop" onClick={() => setShowAddCharge(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Manual Charge</h3>
              <button className="modal-close" onClick={() => setShowAddCharge(false)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Service Name *</label><input className="input" value={chargeForm.serviceName} onChange={(e) => setChargeForm({ ...chargeForm, serviceName: e.target.value })} /></div>
              <div className="field"><label className="label">Quantity *</label><input className="input" type="number" min="1" step="1" value={chargeForm.quantity} onChange={(e) => setChargeForm({ ...chargeForm, quantity: Number(e.target.value) })} /></div>
              <div className="field"><label className="label">Unit Rate (Rs.) *</label><input className="input" type="number" step="0.01" value={chargeForm.unitRate} onChange={(e) => setChargeForm({ ...chargeForm, unitRate: e.target.value })} /></div>
              <div className="field"><label className="label">Unit</label><input className="input" value={chargeForm.unit} onChange={(e) => setChargeForm({ ...chargeForm, unit: e.target.value })} placeholder="e.g. per day" /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Notes</label><textarea className="input" rows={2} value={chargeForm.notes} onChange={(e) => setChargeForm({ ...chargeForm, notes: e.target.value })} /></div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddCharge(false)}>Cancel</button>
              <button className="btn" onClick={handleAddCharge} disabled={!chargeForm.serviceName || !chargeForm.unitRate || actionLoading}>{actionLoading ? 'Adding…' : 'Add Charge'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Discount modal */}
      {showDiscount && (
        <div className="modal-backdrop" onClick={() => setShowDiscount(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Apply Discount</h3>
              <button className="modal-close" onClick={() => setShowDiscount(false)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="field"><label className="label">Discount Amount (Rs.) *</label><input className="input" type="number" step="0.01" min="0" value={discountForm.amount} onChange={(e) => setDiscountForm({ ...discountForm, amount: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Reason *</label><textarea className="input" rows={2} value={discountForm.reason} onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })} /></div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowDiscount(false)}>Cancel</button>
              <button className="btn" onClick={handleApplyDiscount} disabled={!discountForm.amount || !discountForm.reason || actionLoading}>{actionLoading ? 'Applying…' : 'Apply'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPayment && (
        <div className="modal-backdrop" onClick={() => setShowPayment(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Record Payment</h3>
              <button className="modal-close" onClick={() => setShowPayment(false)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="field"><label className="label">Amount (Rs.) *</label><input className="input" type="number" step="0.01" min="0" max={dueAmount} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
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
              <button className="btn" onClick={handleRecordPayment} disabled={!payForm.amount || actionLoading}>{actionLoading ? 'Recording…' : 'Record Payment'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {showCancel && (
        <div className="modal-backdrop" onClick={() => setShowCancel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">Cancel Bill</h3>
              <button className="modal-close" onClick={() => setShowCancel(false)}>✕</button>
            </div>
            <div className="field" style={{ padding: '0 16px' }}><label className="label">Reason *</label><textarea className="input" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowCancel(false)}>Back</button>
              <button className="btn" style={{ background: 'var(--danger)' }} onClick={handleCancelBill} disabled={!cancelReason || actionLoading}>{actionLoading ? 'Cancelling…' : 'Cancel Bill'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Finalize confirm modal */}
      {showFinalize && (
        <div className="modal-backdrop" onClick={() => setShowFinalize(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">Finalize Bill</h3>
              <button className="modal-close" onClick={() => setShowFinalize(false)}>✕</button>
            </div>
            <p style={{ padding: '0 16px', margin: '0 0 16px' }}>
              Finalize bill <strong>{bill?.billNumber}</strong>? This will server-side recalculate totals against raw charge data, lock the bill, create an invoice linked to revenue reports, and mark charges as billed.
            </p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowFinalize(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleFinalize} disabled={actionLoading}>{actionLoading ? 'Finalizing…' : 'Confirm Finalize'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Final discharge confirm modal */}
      {showDischargeConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDischargeConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">Complete Final Discharge</h3>
              <button className="modal-close" onClick={() => setShowDischargeConfirm(false)}>✕</button>
            </div>
            <p style={{ padding: '0 16px', margin: '0 0 16px' }}>Confirm final discharge for {patientNameStr}? The admission will be marked as discharged.</p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowDischargeConfirm(false)}>Back</button>
              <button className="btn btn-success" onClick={handleCompleteDischarge} disabled={actionLoading}>{actionLoading ? 'Discharging…' : 'Confirm Discharge'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}