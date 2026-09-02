'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/hooks';

const DISCHARGE_TYPES = [
  { value: 'RECOVERED', label: 'Recovered' },
  { value: 'REFERRED', label: 'Referred' },
  { value: 'DAMA', label: 'DAMA (left against advice)' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'OTHER', label: 'Other' },
];

const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'NET_BANKING', 'INSURANCE', 'CREDIT', 'CORPORATE'];

const MODULE_LABEL: Record<string, string> = {
  IPD: 'Room / Consultation',
  LAB: 'Laboratory',
  RADIOLOGY: 'Radiology',
  OT: 'Operation Theatre',
  PHARMACY: 'Pharmacy',
  NURSING: 'Nursing',
  OPD: 'OPD',
  EMERGENCY: 'Emergency',
  BLOOD_BANK: 'Blood Bank',
  DIET: 'Diet',
  ADMIN: 'Administrative',
  MANUAL: 'Manual',
};

export default function DischargeModal({
  admission,
  patientId,
  patientName,
  onClose,
  onDone,
}: {
  admission: { id: string; admissionNumber?: string; patientName?: string };
  patientId?: string;
  patientName?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'discharge' | 'billing' | 'receipt'>('discharge');
  const [values, setValues] = useState<Record<string, any>>({
    dischargeType: 'RECOVERED',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discharge bill state
  const [bill, setBill] = useState<any>(null);
  const [details, setDetails] = useState<any[]>([]);
  const [billLoading, setBillLoading] = useState(false);
  const [creatingBill, setCreatingBill] = useState(false);

  // Manual charge form
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({ serviceName: '', quantity: 1, unitRate: '', unit: '', notes: '' });

  // Discount form
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountForm, setDiscountForm] = useState({ amount: '', reason: '' });

  // Payment form
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'CASH', referenceNumber: '', notes: '' });

  // Finalize confirm
  const [showFinalize, setShowFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [receiptData, setReceiptData] = useState<any>(null);

  const isDraft = bill?.status === 'DRAFT';
  const isFinalized = bill?.status === 'FINALIZED';
  const dueAmount = Number(bill?.dueAmount ?? 0);

  const detailsTotal = useMemo(
    () => details.reduce((sum, d) => sum + Number(d.netAmount || d.grossAmount || 0), 0),
    [details],
  );

  // ---- Step 1: submit discharge, then go to billing ----
  async function handleDischarge(e: React.FormEvent) {
    e.preventDefault();
    if (!values.dischargeType) {
      setError('Discharge type is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, any> = { dischargeType: values.dischargeType };
      if (values.dischargeSummary) body.dischargeSummary = values.dischargeSummary;
      if (values.finalDiagnosis) body.finalDiagnosis = values.finalDiagnosis;
      await api(`/admissions/${admission.id}/discharge`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setStep('billing');
      loadBill();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discharge patient');
    } finally {
      setSaving(false);
    }
  }

  // ---- Load or create the draft discharge bill (auto-collects charges) ----
  async function loadBill() {
    setBillLoading(true);
    setError(null);
    try {
      const draftRes = await api(`/billing/discharge/bills/draft/${admission.id}`).catch(() => null);
      const draft = draftRes?.data?.data ?? draftRes?.data ?? null;
      if (draft && draft.id) {
        applyBill(draft);
        return;
      }
      // No draft exists; create one with auto-collected charges
      const created = await createBill();
      applyBill(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load discharge billing');
    } finally {
      setBillLoading(false);
    }
  }

  async function createBill() {
    setCreatingBill(true);
    try {
      const res = await api('/billing/discharge/bills', {
        method: 'POST',
        body: JSON.stringify({ admissionId: admission.id, patientId }),
      });
      const b = res?.data ?? res;
      return b;
    } finally {
      setCreatingBill(false);
    }
  }

  function applyBill(b: any) {
    setBill(b);
    const dets = b.details ?? b.dischargeBillDetails ?? [];
    setDetails(Array.isArray(dets) ? dets : []);
  }

  async function reloadBill() {
    if (!bill) return;
    setBillLoading(true);
    try {
      const res = await api(`/billing/discharge/bills/${bill.id}`);
      applyBill(res?.data ?? res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload bill');
    } finally {
      setBillLoading(false);
    }
  }

  // ---- Add manual charge ----
  async function handleAddCharge() {
    if (!bill) return;
    setSaving(true);
    setError(null);
    try {
      const detail = await api(`/billing/discharge/bills/${bill.id}/charges`, {
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
      const d = detail?.data ?? detail;
      setDetails((prev) => [...prev, d]);
      await reloadBill();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add charge');
    } finally {
      setSaving(false);
    }
  }

  // ---- Remove a per-line manual charge (only manual rows can be removed) ----
  async function handleRemoveCharge(detailId: string) {
    if (!bill) return;
    if (!confirm('Remove this charge?')) return;
    setError(null);
    try {
      await api(`/billing/discharge/bills/${bill.id}/charges/${detailId}`, { method: 'DELETE' });
      await reloadBill();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove charge');
    }
  }

  // ---- Apply discount ----
  async function handleApplyDiscount() {
    if (!bill) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api(`/billing/discharge/bills/${bill.id}/discount`, {
        method: 'PATCH',
        body: JSON.stringify({ amount: Number(discountForm.amount), reason: discountForm.reason }),
      });
      setShowDiscount(false);
      setDiscountForm({ amount: '', reason: '' });
      applyBill(res?.data ?? res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply discount');
    } finally {
      setSaving(false);
    }
  }

  // ---- Finalize bill (server-side calc, creates linked invoice) ----
  async function handleFinalize() {
    if (!bill) return;
    setFinalizing(true);
    setError(null);
    try {
      const res = await api(`/billing/discharge/bills/${bill.id}/finalize`, { method: 'POST' });
      const finalized = res?.data ?? res;
      applyBill(finalized);
      setShowFinalize(false);
      // Load the linked invoice for the receipt
      if (finalized?.invoiceId) {
        const invRes = await api(`/billing/invoices/${finalized.invoiceId}`);
        setReceiptData(invRes?.data ?? invRes);
      }
      setStep('receipt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize bill');
    } finally {
      setFinalizing(false);
    }
  }

  // ---- Record payment ----
  async function handleRecordPayment() {
    if (!bill) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api(`/billing/discharge/bills/${bill.id}/payments`, {
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
      const updated = res?.data?.bill ?? res?.data ?? res;
      applyBill(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  }

  // ---- Move to receipt (after finalized) ----
  async function handleShowReceipt() {
    if (bill?.invoiceId && !receiptData) {
      try {
        const invRes = await api(`/billing/invoices/${bill.invoiceId}`);
        setReceiptData(invRes?.data ?? invRes);
      } catch {}
    }
    setStep('receipt');
  }

  function handleFinish() {
    onDone();
  }

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const d of details) {
      const key = d.sourceModule || 'MANUAL';
      map[key] = map[key] || [];
      map[key].push(d);
    }
    return map;
  }, [details]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: step === 'receipt' ? 700 : 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {step === 'discharge' && 'Discharge patient'}
            {step === 'billing' && 'Discharge billing'}
            {step === 'receipt' && 'Receipt'}
          </h3>
          {step === 'billing' && (
            <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
          )}
          {step !== 'billing' && (
            <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
          )}
        </div>

        {(admission.patientName || patientName) && (
          <p className="note" style={{ marginTop: 4 }}>
            {admission.patientName || patientName}
            {admission.admissionNumber ? ` · ${admission.admissionNumber}` : ''}
          </p>
        )}

        {/* Step 1: Discharge */}
        {step === 'discharge' && (
          <form onSubmit={handleDischarge}>
            <div className="form-grid">
              <div className="field">
                <label className="label">
                  Discharge type <span style={{ color: 'var(--danger)' }}> *</span>
                </label>
                <select
                  className="input"
                  value={values.dischargeType}
                  onChange={(e) => setValues((v) => ({ ...v, dischargeType: e.target.value }))}
                >
                  {DISCHARGE_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Final diagnosis</label>
                <input
                  className="input"
                  value={values.finalDiagnosis || ''}
                  placeholder="Final diagnosis"
                  onChange={(e) => setValues((v) => ({ ...v, finalDiagnosis: e.target.value }))}
                />
              </div>
              <div className="field field-full">
                <label className="label">Discharge summary</label>
                <textarea
                  className="input"
                  style={{ minHeight: 100 }}
                  value={values.dischargeSummary || ''}
                  placeholder="Summary, instructions, follow-up plan…"
                  onChange={(e) => setValues((v) => ({ ...v, dischargeSummary: e.target.value }))}
                />
              </div>
            </div>
            {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? 'Discharging...' : 'Continue'}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Discharge billing */}
        {step === 'billing' && (
          <div>
            {billLoading && <div className="loading">Loading discharge billing…</div>}

            {!billLoading && !bill && (
              <div className="empty" style={{ padding: 20 }}>
                No discharge bill yet. Click below to auto-collect charges from this admission (bed/room, doctor visits, lab, radiology, OT, pharmacy, nursing).
              </div>
            )}

            {!billLoading && bill && (
              <>
                {/* Groups */}
                {details.length === 0 ? (
                  <div className="empty" style={{ padding: 20 }}>No charges collected yet.</div>
                ) : (
                  <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                    {Object.keys(grouped).map((mod) => (
                      <div key={mod} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span className="badge badge-blue">{MODULE_LABEL[mod] || mod}</span>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{formatMoney(grouped[mod].reduce((s, c) => s + Number(c.netAmount || c.grossAmount || 0), 0))}</span>
                        </div>
                        {grouped[mod].map((c: any) => (
                          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0 3px 8px', fontSize: 13, color: 'var(--text-muted)' }}>
                            <span>
                              {c.serviceName || c.name}
                              <span style={{ marginLeft: 6, fontSize: 11 }}>×{Number(c.quantity)}</span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="mono">{formatMoney(c.netAmount ?? c.grossAmount)}</span>
                              {isDraft && c.chargeTransactionId === null && (
                                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)', padding: '0 4px' }} onClick={() => handleRemoveCharge(c.id)} aria-label="Remove">✕</button>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Bill summary */}
                <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>Subtotal</span><span className="mono">{formatMoney(bill.subtotal ?? detailsTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--danger)' }}>
                    <span>Discount</span><span className="mono">-{formatMoney(bill.discountAmount ?? bill.discount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>Tax</span><span className="mono">{formatMoney(bill.tax)}</span>
                  </div>
                  <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
                    <span>Net</span><span className="mono">{formatMoney(bill.netAmount ?? (bill.subtotal ?? detailsTotal) - Number(bill.discount ?? 0) + Number(bill.tax ?? 0))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--success)' }}>
                    <span>Paid</span><span className="mono">{formatMoney(bill.paidAmount)}</span>
                  </div>
                  <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
                    <span>Due</span>
                    <span className="mono" style={{ color: dueAmount > 0 ? 'var(--danger)' : 'var(--success)' }}>{formatMoney(bill.dueAmount ?? dueAmount)}</span>
                  </div>
                </div>

                {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}

                <div className="form-actions">
                  {isDraft && (
                    <>
                      <button className="btn btn-secondary" onClick={() => setShowAddCharge(true)} disabled={saving}>+ Charge</button>
                      <button className="btn btn-secondary" onClick={() => setShowDiscount(true)} disabled={saving}>Discount</button>
                      <button className="btn" onClick={() => setShowFinalize(true)} disabled={saving || details.length === 0}>
                        {finalizing ? 'Finalizing...' : 'Finalize & Receipt'}
                      </button>
                    </>
                  )}
                  {isFinalized && (
                    <>
                      {dueAmount > 0 && (
                        <button className="btn" onClick={() => setShowPayment(true)} disabled={saving}>Record Payment</button>
                      )}
                      <button className="btn" onClick={handleShowReceipt}>View Receipt</button>
                    </>
                  )}
                  <button className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>
              </>
            )}

            {!billLoading && !bill && (
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button className="btn" onClick={async () => { setCreatingBill(true); try { applyBill(await createBill()); } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create bill'); } finally { setCreatingBill(false); } }} disabled={creatingBill}>
                  {creatingBill ? 'Collecting charges...' : 'Collect Charges & Create Bill'}
                </button>
                <button className="btn btn-secondary" onClick={onClose}>Close</button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Receipt */}
        {step === 'receipt' && receiptData && (
          <div>
            <div className="receipt-print" style={{ padding: '0 0 16px' }}>
              <div className="receipt-header">
                <div>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{receiptData.invoiceNumber || bill?.billNumber}</h2>
                  <div className="muted" style={{ fontSize: 12 }}>Discharge invoice</div>
                </div>
                <span className={`badge badge-${receiptData.status === 'PAID' ? 'green' : receiptData.status === 'PARTIAL' ? 'yellow' : 'gray'}`}>
                  {receiptData.status || bill?.status}
                </span>
              </div>

              <div className="receipt-meta">
                <div className="receipt-patient">
                  <div className="label">Patient</div>
                  <div style={{ fontWeight: 600 }}>{patientName || receiptData.patient?.firstName}</div>
                  <div className="muted">{receiptData.patient?.mrn || ''}</div>
                </div>
              </div>

              <table className="table receipt-items">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Service</th>
                    <th style={{ width: 70 }}>Qty</th>
                    <th style={{ width: 110 }}>Rate</th>
                    <th style={{ width: 110 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(receiptData.items || details).map((it: any, i: number) => (
                    <tr key={it.id ?? i}>
                      <td>{i + 1}</td>
                      <td>
                        {it.serviceName || it.name}
                        {it.serviceCode ? <span className="mono muted"> ({it.serviceCode})</span> : null}
                      </td>
                      <td>{it.quantity}</td>
                      <td className="mono">{formatMoney(it.rate ?? it.unitRate)}</td>
                      <td className="mono">{formatMoney(it.lineTotal ?? it.netAmount ?? it.grossAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-totals">
                <div className="receipt-total-row receipt-grand">
                  <span>Total</span>
                  <span className="mono">{formatMoney(receiptData.totalAmount ?? bill?.netAmount)}</span>
                </div>
                {Number(receiptData.paidAmount ?? bill?.paidAmount ?? 0) > 0 && (
                  <div className="receipt-total-row">
                    <span>Paid</span>
                    <span className="mono">{formatMoney(receiptData.paidAmount ?? bill?.paidAmount)}</span>
                  </div>
                )}
                {Number(receiptData.dueAmount ?? bill?.dueAmount ?? 0) > 0 && (
                  <div className="receipt-total-row receipt-grand">
                    <span>Balance due</span>
                    <span className="mono">{formatMoney(receiptData.dueAmount ?? bill?.dueAmount)}</span>
                  </div>
                )}
              </div>

              <div className="receipt-footer" style={{ marginTop: 16 }}>
                {admission.admissionNumber ? `Admission: ${admission.admissionNumber} · ` : ''}
                Discharged: {new Date().toLocaleDateString()}
              </div>
            </div>

            <div className="form-actions no-print">
              <button className="btn btn-secondary" onClick={handleFinish}>Done</button>
              <button className="btn" onClick={() => window.print()}>Print receipt</button>
            </div>
          </div>
        )}
      </div>

      {/* Add manual charge modal */}
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
              <div className="field"><label className="label">Unit Rate (Rs.) *</label><input className="input" type="number" step="0.01" value={chargeForm.unitRate} onChange={(e) => setChargeForm({ ...chargeForm, unitRate: e.target.value })} /></div>
              <div className="field"><label className="label">Unit</label><input className="input" value={chargeForm.unit} onChange={(e) => setChargeForm({ ...chargeForm, unit: e.target.value })} placeholder="e.g. per day" /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Notes</label><textarea className="input" rows={2} value={chargeForm.notes} onChange={(e) => setChargeForm({ ...chargeForm, notes: e.target.value })} /></div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddCharge(false)}>Cancel</button>
              <button className="btn" onClick={handleAddCharge} disabled={!chargeForm.serviceName || !chargeForm.unitRate || saving}>{saving ? 'Adding…' : 'Add Charge'}</button>
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
              <button className="modal-close" onClick={() => setShowDiscount(false)}>×</button>
            </div>
            <div className="form-grid">
              <div className="field"><label className="label">Discount Amount (Rs.) *</label><input className="input" type="number" step="0.01" min="0" value={discountForm.amount} onChange={(e) => setDiscountForm({ ...discountForm, amount: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Reason *</label><textarea className="input" rows={2} value={discountForm.reason} onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })} /></div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowDiscount(false)}>Cancel</button>
              <button className="btn" onClick={handleApplyDiscount} disabled={!discountForm.amount || !discountForm.reason || saving}>{saving ? 'Applying…' : 'Apply'}</button>
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
              <button className="modal-close" onClick={() => setShowPayment(false)}>×</button>
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
              <button className="btn" onClick={handleRecordPayment} disabled={!payForm.amount || saving}>{saving ? 'Recording…' : 'Record Payment'}</button>
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
              <button className="modal-close" onClick={() => setShowFinalize(false)}>×</button>
            </div>
            <p style={{ padding: '0 16px', margin: '0 0 16px' }}>
              Finalize discharge bill? The system will recalculate totals, lock the bill, create a linked invoice for revenue reports, and mark services as billed.
            </p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowFinalize(false)}>Cancel</button>
              <button className="btn" onClick={handleFinalize} disabled={finalizing}>{finalizing ? 'Finalizing…' : 'Confirm Finalize'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}