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

const SERVICE_GROUPS = [
  { label: 'Room Charges', match: ['room', 'bed', 'ward', 'accomodation', 'accommodation'] },
  { label: 'Doctor / Consultant', match: ['doctor', 'consult', 'physician', 'specialist', 'surgeon fee', 'visiting'] },
  { label: 'Nursing Charges', match: ['nurs', 'iv', 'dressing', 'injection', 'catheter', 'monitoring'] },
  { label: 'Laboratory', match: ['lab', 'test', 'patholog', 'biochem', 'hematolog', 'serolog', 'blood count', 'culture'] },
  { label: 'Radiology / Imaging', match: ['radiolog', 'imaging', 'x-ray', 'xray', 'ct scan', 'mri', 'ultrasound', 'usg', 'echocardio', 'ecg', 'echo'] },
  { label: 'OT / Surgery Procedure', match: ['surg', 'procedure', 'operation', 'anaesth', 'anesth', 'theatre'] },
  { label: 'Pharmacy', match: ['pharm', 'medicine', 'medication', 'drug', 'tablet', 'syrup', 'injection'] },
  { label: 'Medical Consumables', match: ['consum', 'suppl', 'glove', 'syringe', 'needle', 'suture'] },
  { label: 'Blood Bank', match: ['blood', 'plasma', 'transfusion'] },
  { label: 'Diet', match: ['diet', 'nutrition', 'meal', 'food', 'beverage'] },
  { label: 'Oxygen / Respiratory', match: ['oxygen', 'respir', 'ventilat', 'nebuliz', 'cpap', 'bipap'] },
  { label: 'Equipment Charges', match: ['equipment', 'device', 'rental', 'monitor', 'machine'] },
  { label: 'Ambulance', match: ['ambulance', 'transport'] },
  { label: 'Administrative Charges', match: ['administrat', 'admin', 'regist', 'admission', 'discharge fee', 'documentation'] },
  { label: 'Medical Documents', match: ['document', 'report', 'certificate', 'record', 'discharge summary', 'medical record'] },
  { label: 'Miscellaneous', match: null },
];

function matchService(s: any, keywords: string[] | null): boolean {
  if (!keywords) return true;
  const cat = (s.category?.name || '').toLowerCase();
  const name = (s.name || '').toLowerCase();
  return keywords.some((k) => cat.includes(k) || name.includes(k));
}


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
  const [values, setValues] = useState<Record<string, any>>({ dischargeType: 'RECOVERED' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discharge bill + charges
  const [bill, setBill] = useState<any>(null);
  const [details, setDetails] = useState<any[]>([]);
  const [billLoading, setBillLoading] = useState(false);
  const [creatingBill, setCreatingBill] = useState(false);

  // Service library picker
  const [services, setServices] = useState<any[]>([]);
  const [svcSearch, setSvcSearch] = useState('');
  const [svcLoading, setSvcLoading] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SERVICE_GROUPS.map((g) => [g.label, true])),
  );

  function toggleGroup(label: string) {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  }
  function openAllGroups() {
    setOpenGroups(Object.fromEntries(SERVICE_GROUPS.map((g) => [g.label, true])));
  }
  function collapseAllGroups() {
    setOpenGroups(Object.fromEntries(SERVICE_GROUPS.map((g) => [g.label, false])));
  }

  // Add charge dialog
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [chargeForm, setChargeForm] = useState({
    serviceId: '', serviceName: '', quantity: 1, unitRate: '', notes: '',
  });

  // Discount
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountForm, setDiscountForm] = useState({ amount: '', reason: '' });

  // Payment
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'CASH', referenceNumber: '', notes: '' });

  // Finalize
  const [showFinalize, setShowFinalize] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [receiptData, setReceiptData] = useState<any>(null);

  const isDraft = bill?.status === 'DRAFT';
  const isFinalized = bill?.status === 'FINALIZED';
  const dueAmount = Number(bill?.dueAmount ?? 0);

  const subtotal = useMemo(
    () => details.reduce((sum, d) => sum + Number(d.grossAmount || 0), 0),
    [details],
  );
  const taxTotal = useMemo(
    () => details.reduce((sum, d) => sum + Number(d.tax || 0), 0),
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
      await api(`/admissions/${admission.id}/discharge`, { method: 'POST', body: JSON.stringify(body) });
      setStep('billing');
      initialiseBill();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discharge patient');
    } finally {
      setSaving(false);
    }
  }

  // ---- Create an empty draft bill (no auto-collect) ----
  async function initialiseBill() {
    setCreatingBill(true);
    setError(null);
    try {
      const res = await api('/billing/discharge/bills', {
        method: 'POST',
        body: JSON.stringify({ admissionId: admission.id, patientId }),
      });
      applyBill(res?.data ?? res);
    } catch (err) {
      // A draft may already exist for this admission; load it
      setError(err instanceof Error ? err.message : null);
      await loadExistingDraft();
    } finally {
      setCreatingBill(false);
    }
  }

  async function loadExistingDraft() {
    try {
      const res = await api(`/billing/discharge/bills/draft/${admission.id}`);
      if (res?.id) applyBill(res);
    } catch {
      /* no draft */
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

  // ---- Service library (used to pick services manually) ----
  useEffect(() => {
    if (!showAddCharge) return;
    setSvcLoading(true);
    setServices([]);
    let cancelled = false;
    api(`/billing/services?limit=500`)
      .then((res) => {
        if (cancelled) return;
        const p = res?.data ?? res;
        const list = Array.isArray(p) ? p : (p?.data ?? []);
        setServices(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSvcLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showAddCharge]);

  const groupedServices = useMemo(() => {
    const q = svcSearch.trim().toLowerCase();
    const list = services.filter((s: any) => s.isActive !== false && (!q || `${s.name} ${s.code || ''} ${s.category?.name || ''}`.toLowerCase().includes(q)));
    return SERVICE_GROUPS.map((g) => ({
      label: g.label,
      services: list.filter((s) => matchService(s, g.match)),
    }));
  }, [services, svcSearch]);

  function selectService(s: any) {
    setChargeForm((prev) => ({
      ...prev,
      serviceId: s.id,
      serviceName: s.name,
      unitRate: s.patientRate ?? s.price ?? '',
      quantity: s.requiresQuantity === false ? 1 : prev.quantity,
    }));
  }

  // ---- Add a manually chosen charge ----
  async function handleAddCharge() {
    if (!bill) return;
    setSaving(true);
    setError(null);
    try {
      const detail = await api(`/billing/discharge/bills/${bill.id}/charges`, {
        method: 'POST',
        body: JSON.stringify({
          serviceId: chargeForm.serviceId || undefined,
          serviceName: chargeForm.serviceName,
          quantity: Number(chargeForm.quantity),
          unitRate: Number(chargeForm.unitRate),
          notes: chargeForm.notes || undefined,
        }),
      });
      setShowAddCharge(false);
      setChargeForm({ serviceId: '', serviceName: '', quantity: 1, unitRate: '', notes: '' });
      setSvcSearch('');
      applyBill({ ...bill, details: [...details, detail?.data ?? detail] });
      await reloadBill();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add charge');
    } finally {
      setSaving(false);
    }
  }

  // ---- Remove a charge ----
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
      await api(`/billing/discharge/bills/${bill.id}/discount`, {
        method: 'PATCH',
        body: JSON.stringify({ amount: Number(discountForm.amount), reason: discountForm.reason }),
      });
      setShowDiscount(false);
      setDiscountForm({ amount: '', reason: '' });
      await reloadBill();
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
      await api(`/billing/discharge/bills/${bill.id}/finalize`, { method: 'POST' });
      setShowFinalize(false);
      const refreshed = await api(`/billing/discharge/bills/${bill.id}`);
      const finalized = refreshed?.data ?? refreshed;
      applyBill(finalized);
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
      await reloadBill();
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: step === 'receipt' ? 700 : 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {step === 'discharge' && 'Discharge patient'}
            {step === 'billing' && 'Discharge billing'}
            {step === 'receipt' && 'Receipt'}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
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
                <label className="label">Discharge type <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select className="input" value={values.dischargeType} onChange={(e) => setValues((v) => ({ ...v, dischargeType: e.target.value }))}>
                  {DISCHARGE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
              <button type="submit" className="btn" disabled={saving}>{saving ? 'Discharging...' : 'Continue'}</button>
            </div>
          </form>
        )}

        {/* Step 2: Discharge billing (manual service selection) */}
        {step === 'billing' && (
          <div>
            {creatingBill && <div className="loading">Preparing billing…</div>}

            {!creatingBill && !bill && error && (
              <div className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>
            )}
            {!creatingBill && !bill && (
              <button className="btn" onClick={initialiseBill}>Start billing</button>
            )}

            {!creatingBill && bill && (
              <>
                {/* Charges table */}
                {details.length === 0 ? (
                  <div className="empty" style={{ padding: 20 }}>No charges added yet. Choose the services to bill below.</div>
                ) : (
                  <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                    <table className="table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th style={{ width: 60 }}>Qty</th>
                          <th style={{ width: 100 }}>Rate</th>
                          <th style={{ width: 100 }}>Amount</th>
                          {isDraft && <th style={{ width: 40 }} />}
                        </tr>
                      </thead>
                      <tbody>
                        {details.map((c: any) => (
                          <tr key={c.id}>
                            <td>{c.serviceName || c.name}</td>
                            <td>{Number(c.quantity)}</td>
                            <td className="mono">{formatMoney(c.unitRate)}</td>
                            <td className="mono">{formatMoney(Number(c.grossAmount) + Number(c.tax || 0))}</td>
                            {isDraft && (
                              <td>
                                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)', padding: '0 4px' }} onClick={() => handleRemoveCharge(c.id)} aria-label="Remove">✕</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Bill summary */}
                <div style={{ padding: '12px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>Subtotal</span><span className="mono">{formatMoney(bill.subtotal ?? subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>Tax</span><span className="mono">{formatMoney(bill.tax ?? taxTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--danger)' }}>
                    <span>Discount</span><span className="mono">-{formatMoney(bill.discount ?? 0)}</span>
                  </div>
                  <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
                    <span>Net</span><span className="mono">{formatMoney(bill.netAmount ?? (subtotal - Number(bill.discount ?? 0) + Number(bill.tax ?? taxTotal)))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--success)' }}>
                    <span>Paid</span><span className="mono">{formatMoney(bill.paidAmount ?? 0)}</span>
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
                      <button className="btn btn-secondary" onClick={() => setShowAddCharge(true)} disabled={saving}>+ Add Service</button>
                      <button className="btn btn-secondary" onClick={() => setShowDiscount(true)} disabled={saving}>Discount</button>
                      <button className="btn" onClick={() => setShowFinalize(true)} disabled={saving || details.length === 0}>
                        {finalizing ? 'Finalizing...' : 'Finalize & Receipt'}
                      </button>
                    </>
                  )}
                  {isFinalized && (
                    <>
                      {dueAmount > 0 && <button className="btn" onClick={() => setShowPayment(true)} disabled={saving}>Record Payment</button>}
                      <button className="btn" onClick={handleShowReceipt}>View Receipt</button>
                    </>
                  )}
                  <button className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>
              </>
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
                <span className={`badge badge-${receiptData.status === 'PAID' ? 'green' : receiptData.status === 'PARTIAL' ? 'yellow' : receiptData.status === 'PENDING' ? 'yellow' : 'gray'}`}>
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
                      <td>{it.serviceName || it.name}{it.serviceCode ? <span className="mono muted"> ({it.serviceCode})</span> : null}</td>
                      <td>{it.quantity}</td>
                      <td className="mono">{formatMoney(it.rate ?? it.unitRate)}</td>
                      <td className="mono">{formatMoney(it.lineTotal ?? it.netAmount ?? it.grossAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-totals">
                <div className="receipt-total-row receipt-grand">
                  <span>Total</span><span className="mono">{formatMoney(receiptData.totalAmount ?? bill?.netAmount)}</span>
                </div>
                {Number(receiptData.paidAmount ?? bill?.paidAmount ?? 0) > 0 && (
                  <div className="receipt-total-row"><span>Paid</span><span className="mono">{formatMoney(receiptData.paidAmount ?? bill?.paidAmount)}</span></div>
                )}
                {Number(receiptData.dueAmount ?? bill?.dueAmount ?? 0) > 0 && (
                  <div className="receipt-total-row receipt-grand"><span>Balance due</span><span className="mono">{formatMoney(receiptData.dueAmount ?? bill?.dueAmount)}</span></div>
                )}
              </div>

              <div className="receipt-footer" style={{ marginTop: 16 }}>
                {admission.admissionNumber ? `Admission: ${admission.admissionNumber} · ` : ''}
                Discharged: {new Date().toLocaleDateString()}
              </div>
            </div>

            <div className="form-actions no-print">
              <button className="btn btn-secondary" onClick={onDone}>Done</button>
              <button className="btn" onClick={() => window.print()}>Print receipt</button>
            </div>
          </div>
        )}
      </div>

      {/* Add service dialog */}
      {showAddCharge && (
        <div className="modal-backdrop" onClick={() => setShowAddCharge(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Service / Charge</h3>
              <button className="modal-close" onClick={() => setShowAddCharge(false)}>×</button>
            </div>
            <div style={{ padding: '4px 0 10px' }}>
              <input
                className="input"
                placeholder="Search services…"
                value={svcSearch}
                onChange={(e) => setSvcSearch(e.target.value)}
              />
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12 }}>
              {svcLoading ? (
                <div className="loading" style={{ padding: 16 }}>Loading services…</div>
              ) : services.length === 0 ? (
                <div className="empty" style={{ padding: 16 }}>No services found. Use Manual below to add a custom service.</div>
              ) : (
                groupedServices.map((g) => (
                  <div key={g.label} style={{ borderBottom: '1px solid var(--border)' }}>
                    <div
                      className="service-group-head"
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', cursor: 'pointer', background: 'var(--bg-soft, #f6f7fb)' }}
                      onClick={() => toggleGroup(g.label)}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{g.label}</span>
                      <span className="mono muted" style={{ fontSize: 12 }}>{g.services.length} {openGroups[g.label] ? '▾' : '▸'}</span>
                    </div>
                    {openGroups[g.label] && (
                      <div>
                        {g.services.length === 0 ? (
                          <div className="empty" style={{ padding: '8px 12px', fontSize: 12 }}>No services in this category yet.</div>
                        ) : (
                          g.services.map((s: any) => (
                            <button
                              key={s.id}
                              className={`service-option ${chargeForm.serviceId === s.id ? 'selected' : ''}`}
                              onClick={() => selectService(s)}
                              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 12px', border: 'none', background: chargeForm.serviceId === s.id ? 'var(--accent-soft, #eef2ff)' : 'transparent', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border)' }}
                            >
                              <span>{s.name}{s.code ? <span className="mono muted" style={{ marginLeft: 6 }}>{s.code}</span> : null}</span>
                              <span className="mono" style={{ marginLeft: 12 }}>{formatMoney(s.patientRate ?? s.price)}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="form-actions" style={{ marginBottom: 8, justifyContent: 'flex-start', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => openAllGroups()}>Expand all</button>
              <button className="btn btn-secondary btn-sm" onClick={() => collapseAllGroups()}>Collapse all</button>
              <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>Or type a name below for a manual service</span>
            </div>

            <div className="form-grid">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="label">Service name {chargeForm.serviceId && '(selected)'}</label>
                <input className="input" value={chargeForm.serviceName} onChange={(e) => setChargeForm({ ...chargeForm, serviceName: e.target.value })} />
              </div>
              <div className="field"><label className="label">Quantity</label><input className="input" type="number" min="1" step="1" value={chargeForm.quantity} onChange={(e) => setChargeForm({ ...chargeForm, quantity: Number(e.target.value) })} /></div>
              <div className="field"><label className="label">Unit Rate (Rs.)</label><input className="input" type="number" step="0.01" value={chargeForm.unitRate} onChange={(e) => setChargeForm({ ...chargeForm, unitRate: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Notes</label><textarea className="input" rows={2} value={chargeForm.notes} onChange={(e) => setChargeForm({ ...chargeForm, notes: e.target.value })} /></div>
            </div>

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowAddCharge(false)}>Cancel</button>
              <button className="btn" onClick={handleAddCharge} disabled={!chargeForm.serviceName || !chargeForm.unitRate || saving}>{saving ? 'Adding…' : 'Add Charge'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Discount dialog */}
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

      {/* Payment dialog */}
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

      {/* Finalize dialog */}
      {showFinalize && (
        <div className="modal-backdrop" onClick={() => setShowFinalize(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">Finalize Bill</h3>
              <button className="modal-close" onClick={() => setShowFinalize(false)}>×</button>
            </div>
            <p style={{ padding: '0 16px', margin: '0 0 16px' }}>
              Finalize discharge bill? The system will recalculate totals, lock the bill and create a linked invoice for revenue reports.
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
