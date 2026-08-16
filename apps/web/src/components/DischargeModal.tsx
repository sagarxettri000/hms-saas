'use client';

import { useState, useEffect } from 'react';
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

interface BillingService {
  id: string;
  name: string;
  code?: string;
  rate: number;
  category?: string;
}

interface SelectedService extends BillingService {
  quantity: number;
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
  const [step, setStep] = useState<'discharge' | 'dispensing' | 'billing' | 'receipt'>('discharge');
  const [values, setValues] = useState<Record<string, any>>({
    dischargeType: 'RECOVERED',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false);
  const [dispensingAll, setDispensingAll] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState<any[]>([]);

  const [services, setServices] = useState<BillingService[]>([]);
  const [selected, setSelected] = useState<SelectedService[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [loadingServices, setLoadingServices] = useState(false);

  const [invoice, setInvoice] = useState<any>(null);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  useEffect(() => {
    if (step === 'dispensing') {
      setLoadingPrescriptions(true);
      Promise.all([
        api(`/pharmacy/prescriptions?patientId=${patientId}&limit=50`).catch(() => ({ data: { data: [] } })),
        api('/pharmacy/stores').catch(() => ({ data: { data: [] } })),
      ]).then(([rxRes, storeRes]) => {
        const rxList = Array.isArray(rxRes?.data) ? rxRes.data : rxRes?.data?.data ?? [];
        setPrescriptions(rxList.filter((p: any) => p.status !== 'DISPENSED' && p.status !== 'CANCELLED'));
        const allStores = Array.isArray(storeRes?.data) ? storeRes.data : storeRes?.data?.data ?? [];
        const filtered = allStores.filter((s: any) => s.location?.toLowerCase().includes('ground floor'));
        setStores(filtered);
        if (filtered.length === 1) setStoreId(filtered[0].id);
      }).finally(() => setLoadingPrescriptions(false));
    }
    if (step === 'billing') {
      setLoadingServices(true);
      api('/billing/services?limit=200')
        .then((res: any) => {
          const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
          setServices(list);
        })
        .catch(() => {})
        .finally(() => setLoadingServices(false));
    }
  }, [step, patientId]);

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
      setStep('dispensing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discharge patient');
    } finally {
      setSaving(false);
    }
  }

  async function handleDispenseAll() {
    if (!storeId) { setError('Select a store to dispense from'); return; }
    if (prescriptions.length === 0) { setStep('billing'); return; }
    setDispensingAll(true);
    setError(null);
    try {
      for (const rx of prescriptions) {
        const items = await Promise.all(
          (rx.items || []).map(async (it: any) => {
            let unitPrice = 0;
            if (it.medicineId) {
              try {
                const medRes = await api(`/pharmacy/medicines/${it.medicineId}`);
                const med = medRes?.data ?? medRes;
                unitPrice = Number(med?.salesRate) || 0;
              } catch { }
            }
            return {
              prescriptionItemId: it.id,
              medicineName: it.medicineName,
              medicineId: it.medicineId,
              quantity: it.quantity || 1,
              unitPrice,
            };
          })
        );
        await api('/pharmacy/dispense', {
          method: 'POST',
          body: JSON.stringify({
            patientId,
            prescriptionId: rx.id,
            storeId,
            items,
          }),
        });
      }
      setStep('billing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispensing failed');
    }
    setDispensingAll(false);
  }

  function toggleService(svc: BillingService) {
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === svc.id);
      if (exists) return prev.filter((s) => s.id !== svc.id);
      return [...prev, { ...svc, quantity: 1 }];
    });
  }

  function updateQty(serviceId: string, qty: number) {
    setSelected((prev) =>
      prev.map((s) => (s.id === serviceId ? { ...s, quantity: Math.max(1, qty) } : s))
    );
  }

  async function handleCreateInvoice() {
    if (selected.length === 0) {
      setError('Select at least one service');
      return;
    }
    setCreatingInvoice(true);
    setError(null);
    try {
      const items = selected.map((s) => ({
        serviceId: s.id,
        serviceName: s.name,
        serviceCode: s.code,
        quantity: s.quantity,
        rate: s.rate,
      }));
      const res = await api('/billing/invoices', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          type: 'ADMISSION',
          items,
          notes: `Discharge billing for ${admission.admissionNumber || admission.id}`,
        }),
      });
      const inv = res.data ?? res;
      setInvoice(inv);
      const receiptRes = await api(`/billing/invoices/${inv.id}`);
      setReceiptData(receiptRes.data ?? receiptRes);
      setStep('receipt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice');
    } finally {
      setCreatingInvoice(false);
    }
  }

  function handleSkipBilling() {
    onDone();
  }

  function handleFinish() {
    onDone();
  }

  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
      (s.code && s.code.toLowerCase().includes(serviceSearch.toLowerCase()))
  );

  const totalAmount = selected.reduce((sum, s) => sum + s.rate * s.quantity, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: step === 'receipt' ? 700 : 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {step === 'discharge' && 'Discharge patient'}
            {step === 'dispensing' && 'Dispense medicines'}
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

        {/* Step 2: Dispensing */}
        {step === 'dispensing' && (
          <div>
            {loadingPrescriptions && <div className="loading">Loading prescriptions...</div>}

            {!loadingPrescriptions && prescriptions.length === 0 && (
              <div className="empty" style={{ padding: 20 }}>No pending prescriptions to dispense.</div>
            )}

            {!loadingPrescriptions && prescriptions.length > 0 && (
              <>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label className="label">Dispense from store</label>
                  <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    <option value="">Select store</option>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.location})</option>)}
                  </select>
                </div>

                <div style={{ maxHeight: 250, overflowY: 'auto', marginBottom: 12 }}>
                  {prescriptions.map((rx) => (
                    <div key={rx.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        Prescription · {rx.items?.length || 0} items
                      </div>
                      {rx.items?.map((it: any) => (
                        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: 'var(--text-muted)' }}>
                          <span>{it.medicineName}</span>
                          <span>Qty: {it.quantity || '—'}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}

            {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setStep('billing')}>Skip dispensing</button>
              <button className="btn" onClick={handleDispenseAll} disabled={dispensingAll || !storeId}>
                {dispensingAll ? 'Dispensing...' : 'Dispense all & continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Billing */}
        {step === 'billing' && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <input
                className="input"
                placeholder="Search services..."
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
              />
            </div>

            {loadingServices && <div className="loading">Loading services...</div>}

            {!loadingServices && (
              <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
                {filteredServices.length === 0 && (
                  <div className="empty" style={{ padding: 20 }}>No services found.</div>
                )}
                {filteredServices.map((svc) => {
                  const isSelected = selected.some((s) => s.id === svc.id);
                  const sel = selected.find((s) => s.id === svc.id);
                  return (
                    <div
                      key={svc.id}
                      onClick={() => toggleService(svc)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--primary-light)' : 'transparent',
                        borderRadius: 6,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{svc.name}</div>
                        {svc.code && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{svc.code}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{formatMoney(svc.rate)}</span>
                        {isSelected && (
                          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => updateQty(svc.id, (sel?.quantity || 1) - 1)}
                            >
                              −
                            </button>
                            <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>{sel?.quantity || 1}</span>
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => updateQty(svc.id, (sel?.quantity || 1) + 1)}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selected.length > 0 && (
              <div style={{ padding: '12px 0', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
                <span>Total ({selected.length} items)</span>
                <span>{formatMoney(totalAmount)}</span>
              </div>
            )}

            {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}

            <div className="form-actions">
              <button className="btn btn-secondary" onClick={handleSkipBilling}>Skip billing</button>
              <button className="btn" onClick={handleCreateInvoice} disabled={creatingInvoice || selected.length === 0}>
                {creatingInvoice ? 'Creating...' : 'Create invoice & receipt'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Receipt */}
        {step === 'receipt' && receiptData && (
          <div>
            <div className="receipt-print" style={{ padding: '0 0 16px' }}>
              <div className="receipt-header">
                <div>
                  <h2 style={{ margin: 0, fontSize: 18 }}>{receiptData.invoiceNumber}</h2>
                  <div className="muted" style={{ fontSize: 12 }}>Discharge invoice</div>
                </div>
                <span className={`badge badge-${receiptData.status === 'PAID' ? 'green' : receiptData.status === 'PARTIAL' ? 'yellow' : 'gray'}`}>
                  {receiptData.status}
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
                  {(receiptData.items || []).map((it: any, i: number) => (
                    <tr key={it.id ?? i}>
                      <td>{i + 1}</td>
                      <td>
                        {it.serviceName}
                        {it.serviceCode ? <span className="mono muted"> ({it.serviceCode})</span> : null}
                      </td>
                      <td>{it.quantity}</td>
                      <td className="mono">{formatMoney(it.rate)}</td>
                      <td className="mono">{formatMoney(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="receipt-totals">
                <div className="receipt-total-row receipt-grand">
                  <span>Total</span>
                  <span className="mono">{formatMoney(receiptData.totalAmount)}</span>
                </div>
                {Number(receiptData.paidAmount || 0) > 0 && (
                  <div className="receipt-total-row">
                    <span>Paid</span>
                    <span className="mono">{formatMoney(receiptData.paidAmount)}</span>
                  </div>
                )}
                {Number(receiptData.dueAmount || 0) > 0 && (
                  <div className="receipt-total-row receipt-grand">
                    <span>Balance due</span>
                    <span className="mono">{formatMoney(receiptData.dueAmount)}</span>
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
    </div>
  );
}
