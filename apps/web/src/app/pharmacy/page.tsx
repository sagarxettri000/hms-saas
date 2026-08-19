'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import ModulePage from '@/components/ModulePage';
import { api } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/hooks';
import { STORE_REF, STORE_TYPES } from '@/lib/options';
import ReceiptModal from '@/components/ReceiptModal';
import PatientPrescriptions from '@/components/PatientPrescriptions';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: '#6b7280',
    APPROVED: '#2563eb',
    DISPENSED: '#16a34a',
    CANCELLED: '#dc2626',
    PENDING: '#f59e0b',
    ACTIVE: '#16a34a',
  };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: colors[status] || '#6b7280', color: '#fff' }}>
      {status}
    </span>
  );
}

function StockAlertBadge({ type, count }: { type: string; count: number }) {
  const colors: Record<string, string> = {
    lowStock: '#f59e0b',
    nearExpiry: '#ef4444',
    outOfStock: '#dc2626',
  };
  const labels: Record<string, string> = {
    lowStock: 'Low Stock',
    nearExpiry: 'Near Expiry',
    outOfStock: 'Out of Stock',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: `${colors[type]}15`, border: `1px solid ${colors[type]}40`, borderRadius: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[type] }} />
      <span style={{ fontWeight: 600, fontSize: 14 }}>{labels[type]}</span>
      <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 18, color: colors[type] }}>{count}</span>
    </div>
  );
}

const VALID_TABS = ['medicines', 'dispensing', 'sales', 'stores', 'alerts', 'history'];

function getTab(params: URLSearchParams): string {
  const tab = params.get('tab');
  if (tab && VALID_TABS.includes(tab)) return tab;
  return 'medicines';
}

function PharmacyPageInner() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => getTab(searchParams));
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false);
  const [dispenseTarget, setDispenseTarget] = useState<any>(null);
  const [dispensing, setDispensing] = useState(false);

  const [alerts, setAlerts] = useState<any>(null);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [salesItems, setSalesItems] = useState<any[]>([]);
  const [salesSearch, setSalesSearch] = useState('');
  const [salesPatientId, setSalesPatientId] = useState('');
  const [salesStoreId, setSalesStoreId] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [saleReceipt, setSaleReceipt] = useState<any>(null);
  const [salesStores, setSalesStores] = useState<any[]>([]);
  const [patientList, setPatientList] = useState<any[]>([]);
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newPatient, setNewPatient] = useState({ firstName: '', lastName: '', mobile: '', gender: 'MALE' });
  const [savingPatient, setSavingPatient] = useState(false);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [salesDiscount, setSalesDiscount] = useState(0);
  const [salesTax, setSalesTax] = useState(0);
  const [salesPaymentMethod, setSalesPaymentMethod] = useState('CASH');
  const [salesPaymentRef, setSalesPaymentRef] = useState('');
  const [salesIsCredit, setSalesIsCredit] = useState(false);

  useEffect(() => {
    setActiveTab(getTab(searchParams));
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'dispensing') loadPrescriptions();
    if (activeTab === 'alerts') loadAlerts();
    if (activeTab === 'sales') loadSalesStores();
    if (activeTab === 'history') loadHistory();
  }, [activeTab]);

  function switchTab(tab: string) {
    setActiveTab(tab);
    window.history.replaceState(null, '', `/pharmacy?tab=${tab}`);
  }

  async function loadSalesStores() {
    try {
      const [storeRes, patientRes] = await Promise.all([
        api('/pharmacy/stores'),
        api('/patients?limit=500'),
      ]);
      const allStores = Array.isArray(storeRes?.data) ? storeRes.data : storeRes?.data?.data ?? [];
      const filtered = allStores.filter((s: any) => s.location?.toLowerCase().includes('ground floor'));
      setSalesStores(filtered);
      if (filtered.length === 1 && !salesStoreId) setSalesStoreId(filtered[0].id);
      const pList = Array.isArray(patientRes?.data) ? patientRes.data : patientRes?.data?.data ?? [];
      setPatientList(pList);
    } catch { }
  }

  async function loadPrescriptions() {
    setLoadingPrescriptions(true);
    try {
      const res = await api('/pharmacy/prescriptions?limit=100');
      const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
      setPrescriptions(list.filter((p: any) => p.status !== 'DISPENSED' && p.status !== 'CANCELLED'));
    } catch { }
    setLoadingPrescriptions(false);
  }

  async function loadAlerts() {
    setLoadingAlerts(true);
    try {
      const res = await api('/pharmacy/alerts');
      setAlerts(res?.data ?? res);
    } catch { }
    setLoadingAlerts(false);
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await api('/pharmacy/dispensing-history?limit=50');
      const d = res?.data ?? res;
      setHistory(d?.items ?? d?.data?.items ?? []);
    } catch { }
    setLoadingHistory(false);
  }

  async function searchMedicines(q: string) {
    setSalesSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await api(`/pharmacy/medicines?query=${encodeURIComponent(q)}&limit=10`);
      setSearchResults(Array.isArray(res?.data) ? res.data : res?.data?.data ?? []);
    } catch { setSearchResults([]); }
  }

  function addToSale(med: any) {
    if (salesItems.find((s) => s.medicineId === med.id)) return;
    setSalesItems((prev) => [...prev, {
      medicineId: med.id,
      medicineName: med.name,
      quantity: 1,
      unitPrice: Number(med.salesRate) || 0,
    }]);
    setSalesSearch('');
    setSearchResults([]);
  }

  function updateSaleItem(medicineId: string, field: string, value: any) {
    setSalesItems((prev) => prev.map((item) =>
      item.medicineId === medicineId ? { ...item, [field]: field === 'quantity' || field === 'unitPrice' ? Number(value) || 0 : value } : item
    ));
  }

  function removeSaleItem(medicineId: string) {
    setSalesItems((prev) => prev.filter((item) => item.medicineId !== medicineId));
  }

  async function submitSale() {
    if (salesItems.length === 0 || !salesPatientId || !salesStoreId) return;
    setSubmittingSale(true);
    try {
      const invRes = await api('/billing/invoices', {
        method: 'POST',
        body: JSON.stringify({
          patientId: salesPatientId,
          type: 'PHARMACY',
          items: salesItems.map((it) => ({
            serviceId: it.medicineId,
            serviceName: it.medicineName,
            quantity: it.quantity,
            rate: it.unitPrice,
          })),
          discountAmount: salesDiscount || 0,
          taxPercent: salesTax || 0,
          isCredit: salesIsCredit,
          notes: 'Pharmacy walk-in sale',
        }),
      });
      const inv = invRes?.data ?? invRes;
      if (!salesIsCredit && inv.id) {
        await api('/billing/payments', {
          method: 'POST',
          body: JSON.stringify({
            patientId: salesPatientId,
            invoiceId: inv.id,
            amount: Number(inv.totalAmount || 0),
            method: salesPaymentMethod,
            referenceNumber: salesPaymentRef,
            notes: 'Pharmacy sale payment',
          }),
        });
      }
      const receiptRes = await api(`/billing/invoices/${inv.id}`);
      setSaleReceipt(receiptRes?.data ?? receiptRes);
    } catch { }
    setSubmittingSale(false);
  }

  function handlePrint() { window.print(); }

  async function handleAddPatient() {
    if (!newPatient.firstName.trim()) { setPatientError('First name is required'); return; }
    setSavingPatient(true);
    setPatientError(null);
    try {
      const res = await api('/patients', {
        method: 'POST',
        body: JSON.stringify({
          firstName: newPatient.firstName.trim(),
          lastName: newPatient.lastName.trim(),
          mobile: newPatient.mobile.trim(),
          gender: newPatient.gender,
        }),
      });
      const pat = res?.data ?? res;
      setPatientList((prev) => [...prev, pat]);
      setSalesPatientId(pat.id);
      setShowAddPatient(false);
      setNewPatient({ firstName: '', lastName: '', mobile: '', gender: 'MALE' });
    } catch (err) {
      setPatientError(err instanceof Error ? err.message : 'Failed to add patient');
    }
    setSavingPatient(false);
  }

  if (activeTab === 'dispensing') {
    return (
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Pharmacy Dispensing</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>View prescriptions and dispense medicines</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('medicines')}>Medicines</button>
            <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }}>Dispensing</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('sales')}>Sales</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('stores')}>Stores</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('alerts')}>Stock Alerts</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('history')}>History</button>
          </div>
        </div>

        {loadingPrescriptions && <div className="loading">Loading prescriptions...</div>}

        {!loadingPrescriptions && prescriptions.length === 0 && (
          <div className="empty" style={{ padding: 40 }}>No pending prescriptions found.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {prescriptions.map((rx) => (
            <div key={rx.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {rx.patient?.firstName} {rx.patient?.lastName}
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>{rx.patient?.mrn}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                    Dr. {rx.doctor?.user?.firstName} {rx.doctor?.user?.lastName} · {formatDate(rx.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusBadge status={rx.status} />
                  {rx.status !== 'DISPENSED' && (
                    <button className="btn btn-sm" onClick={() => setDispenseTarget(rx)} style={{ fontSize: 12 }}>
                      Dispense
                    </button>
                  )}
                </div>
              </div>
              {rx.items && rx.items.length > 0 && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  {rx.items.map((it: any) => (
                    <div key={it.id} style={{ display: 'flex', gap: 12, fontSize: 13, padding: '4px 0' }}>
                      <span style={{ fontWeight: 500 }}>{it.medicineName}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{it.dosage} · {it.frequency} · {it.duration}</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 600 }}>Qty: {it.quantity || '—'}</span>
                      {it.status === 'DISPENSED' && <StatusBadge status="DISPENSED" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {dispenseTarget && (
          <DispenseModal
            prescription={dispenseTarget}
            onClose={() => setDispenseTarget(null)}
            onDone={() => { setDispenseTarget(null); loadPrescriptions(); }}
          />
        )}
      </div>
    );
  }

  if (activeTab === 'sales') {
    const saleTotal = salesItems.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    return (
    <>
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Pharmacy Sales</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>Walk-in medicine sales with billing</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('medicines')}>Medicines</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('dispensing')}>Dispensing</button>
            <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }}>Sales</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('stores')}>Stores</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('alerts')}>Stock Alerts</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('history')}>History</button>
          </div>
        </div>

        {saleReceipt && (
          <ReceiptModal invoice={saleReceipt} onClose={() => { setSaleReceipt(null); setSalesItems([]); setSalesPatientId(''); }} />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 20 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label">Patient</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="input" style={{ flex: 1 }} value={salesPatientId} onChange={(e) => setSalesPatientId(e.target.value)}>
                    <option value="">Select patient</option>
                    {patientList.map((p, idx) => (
                      <option key={p.id || idx} value={p.id}>
                        {p.firstName} {p.lastName} {p.mrn ? `(${p.mrn})` : ''} {p.mobile ? `- ${p.mobile}` : ''}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-sm" onClick={() => setShowAddPatient(true)} title="Add new patient">+ Add</button>
                </div>
              </div>

              {salesPatientId && (
                <PatientPrescriptions patientId={salesPatientId} />
              )}

              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label">Store</label>
                <select className="input" value={salesStoreId} onChange={(e) => setSalesStoreId(e.target.value)}>
                  <option value="">Select store</option>
                  {salesStores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.location})</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="label">Medicine</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>💊</span>
                  <input
                    className="input"
                    style={{ paddingLeft: 36 }}
                    value={salesSearch}
                    onChange={(e) => searchMedicines(e.target.value)}
                    placeholder="Search medicine by name or generic name..."
                  />
                  {searchResults.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      maxHeight: 240,
                      overflowY: 'auto',
                      background: 'var(--card)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    }}>
                      {searchResults.map((med, i) => (
                        <div
                          key={med.id}
                          onMouseDown={() => addToSale(med)}
                          style={{
                            padding: '10px 14px',
                            cursor: 'pointer',
                            borderBottom: i < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                            fontSize: 13,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--primary-light)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{med.name}</div>
                            {med.genericName && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{med.genericName}</div>}
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 14 }}>{formatMoney(med.salesRate)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>Sale Items</h3>
              {salesItems.length === 0 && <div className="empty" style={{ padding: 20, fontSize: 13 }}>No items added yet.</div>}
              {salesItems.map((it) => (
                <div key={it.medicineId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{it.medicineName}</div>
                  <input type="number" min={1} value={it.quantity} onChange={(e) => updateSaleItem(it.medicineId, 'quantity', e.target.value)} style={{ width: 50, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                  <input type="number" min={0} value={it.unitPrice} onChange={(e) => updateSaleItem(it.medicineId, 'unitPrice', e.target.value)} style={{ width: 80, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }} />
                  <span style={{ fontWeight: 600, fontSize: 13, minWidth: 70, textAlign: 'right' }}>{formatMoney(it.quantity * it.unitPrice)}</span>
                  <button onClick={() => removeSaleItem(it.medicineId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>×</button>
                </div>
              ))}
              {salesItems.length > 0 && (
                <>
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
                    <span>Subtotal</span>
                    <span>{formatMoney(saleTotal)}</span>
                  </div>
                  <div className="field" style={{ marginTop: 8, marginBottom: 4 }}>
                    <label className="label" style={{ fontSize: 12 }}>Discount (NPR)</label>
                    <input className="input" type="number" min={0} step="0.01" value={salesDiscount || ''} onChange={(e) => setSalesDiscount(Number(e.target.value) || 0)} placeholder="0" style={{ fontSize: 13, padding: '6px 10px' }} />
                  </div>
                  <div className="field" style={{ marginBottom: 4 }}>
                    <label className="label" style={{ fontSize: 12 }}>Tax %</label>
                    <input className="input" type="number" min={0} max={100} step="0.01" value={salesTax || ''} onChange={(e) => setSalesTax(Number(e.target.value) || 0)} placeholder="0" style={{ fontSize: 13, padding: '6px 10px' }} />
                  </div>
                  {salesDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#dc2626' }}>
                      <span>Discount</span>
                      <span>-{formatMoney(salesDiscount)}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
                    <span>Total</span>
                    <span>{formatMoney(Math.max(0, saleTotal - salesDiscount))}</span>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
                      <input type="checkbox" checked={salesIsCredit} onChange={(e) => setSalesIsCredit(e.target.checked)} />
                      Credit invoice (pay later)
                    </label>
                    {!salesIsCredit && (
                      <>
                        <div className="field" style={{ marginBottom: 4 }}>
                          <label className="label" style={{ fontSize: 12 }}>Payment method</label>
                          <select className="input" value={salesPaymentMethod} onChange={(e) => setSalesPaymentMethod(e.target.value)} style={{ fontSize: 13, padding: '6px 10px' }}>
                            <option value="CASH">Cash</option>
                            <option value="CARD">Card</option>
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                            <option value="QR">QR / eSewa / Khalti</option>
                            <option value="INSURANCE">Insurance</option>
                          </select>
                        </div>
                        {(salesPaymentMethod === 'CARD' || salesPaymentMethod === 'BANK_TRANSFER' || salesPaymentMethod === 'QR') && (
                          <div className="field" style={{ marginBottom: 4 }}>
                            <label className="label" style={{ fontSize: 12 }}>Reference number</label>
                            <input className="input" value={salesPaymentRef} onChange={(e) => setSalesPaymentRef(e.target.value)} placeholder="Transaction ref" style={{ fontSize: 13, padding: '6px 10px' }} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
              <button className="btn" style={{ width: '100%', marginTop: 12 }} disabled={submittingSale || salesItems.length === 0 || !salesPatientId || !salesStoreId} onClick={submitSale}>
                {submittingSale ? 'Processing...' : 'Create invoice & receipt'}
              </button>
            </div>
          </div>
      </div>

      {showAddPatient && (
        <div className="modal-overlay" onClick={() => setShowAddPatient(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Add New Patient</h3>
              <button className="modal-close" onClick={() => setShowAddPatient(false)}>×</button>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label className="label">First name *</label>
              <input className="input" value={newPatient.firstName} onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })} placeholder="First name" />
            </div>
            <div className="field">
              <label className="label">Last name</label>
              <input className="input" value={newPatient.lastName} onChange={(e) => setNewPatient({ ...newPatient, lastName: e.target.value })} placeholder="Last name" />
            </div>
            <div className="field">
              <label className="label">Mobile</label>
              <input className="input" value={newPatient.mobile} onChange={(e) => setNewPatient({ ...newPatient, mobile: e.target.value })} placeholder="Mobile number" />
            </div>
            <div className="field">
              <label className="label">Gender</label>
              <select className="input" value={newPatient.gender} onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            {patientError && <div className="alert alert-error" style={{ marginTop: 8 }}>{patientError}</div>}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowAddPatient(false)}>Cancel</button>
              <button className="btn" onClick={handleAddPatient} disabled={savingPatient}>
                {savingPatient ? 'Saving...' : 'Add Patient'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    );
  }

  if (activeTab === 'alerts') {
    return (
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Stock Alerts</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>Low stock, near expiry, and out of stock warnings</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('medicines')}>Medicines</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('dispensing')}>Dispensing</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('sales')}>Sales</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('stores')}>Stores</button>
            <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }}>Stock Alerts</button>
          </div>
        </div>

        {loadingAlerts && <div className="loading">Loading alerts...</div>}

        {alerts && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
              <StockAlertBadge type="lowStock" count={alerts.summary?.lowStockCount || 0} />
              <StockAlertBadge type="nearExpiry" count={alerts.summary?.nearExpiryCount || 0} />
              <StockAlertBadge type="outOfStock" count={alerts.summary?.outOfStockCount || 0} />
            </div>

            {alerts.lowStock && alerts.lowStock.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#f59e0b' }}>Low Stock Items</h3>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--background)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>Medicine</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>Store</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>Current</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>Reorder Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.lowStock.map((item: any) => (
                        <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.medicine?.name || item.name}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.store?.name}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>{item.currentStock}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }}>{item.reorderLevel || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {alerts.nearExpiry && alerts.nearExpiry.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#ef4444' }}>Near Expiry Items</h3>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--background)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>Medicine</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>Store</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>Stock</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>Expiry Date</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.nearExpiry.map((item: any) => (
                        <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.medicine?.name || item.name}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.store?.name}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }}>{item.currentStock}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{item.expiryDate?.slice(0, 10) || '—'}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }}>{item.batchNumber || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {alerts.outOfStock && alerts.outOfStock.length > 0 && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#dc2626' }}>Out of Stock Items</h3>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--background)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>Medicine</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'var(--text-muted)' }}>Store</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.outOfStock.map((item: any) => (
                        <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.medicine?.name || item.name}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13 }}>{item.store?.name}</td>
                          <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }}>{item.batchNumber || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!alerts.lowStock?.length && !alerts.nearExpiry?.length && !alerts.outOfStock?.length && (
              <div className="empty" style={{ padding: 40 }}>No stock alerts. Everything looks good!</div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'history') {
    return (
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Dispensing History</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>Previously dispensed prescriptions</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('medicines')}>Medicines</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('dispensing')}>Dispensing</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('sales')}>Sales</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('stores')}>Stores</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('alerts')}>Stock Alerts</button>
            <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }}>History</button>
          </div>
        </div>

        {loadingHistory && <div className="loading">Loading history...</div>}

        {!loadingHistory && history.length === 0 && (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            No dispensing records found.
          </div>
        )}

        {history.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Prescription</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Medicines</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((rx: any) => (
                  <tr key={rx.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{rx.id.slice(0, 8)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{[rx.patient?.firstName, rx.patient?.lastName].filter(Boolean).join(' ')}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{rx.patient?.mrn}</div>
                    </td>
                    <td>{rx.doctor?.user ? [rx.doctor.user.firstName, rx.doctor.user.lastName].filter(Boolean).join(' ') : '—'}</td>
                    <td>
                      {(rx.items || []).map((it: any, i: number) => (
                        <div key={i} style={{ fontSize: 12 }}>{it.medicineName} {it.dosage} × {it.quantity}</div>
                      ))}
                    </td>
                    <td style={{ fontSize: 12 }}>{formatDate(rx.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Pharmacy</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>Medicines, dispensing, sales & stock alerts</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }}>Medicines</button>
          <button className="btn btn-sm btn-ghost" onClick={() => switchTab('dispensing')}>Dispensing</button>
          <button className="btn btn-sm btn-ghost" onClick={() => switchTab('sales')}>Sales</button>
          <button className="btn btn-sm btn-ghost" onClick={() => switchTab('stores')}>Stores</button>
          <button className="btn btn-sm btn-ghost" onClick={() => switchTab('alerts')}>Stock Alerts</button>
        </div>
      </div>

      <ModulePage
        title=""
        subtitle=""
        tabs={[
          {
            key: 'medicines',
            label: 'Medicines',
            endpoint: '/pharmacy/medicines',
            createLabel: 'Add medicine',
            columns: [
              { key: 'name', label: 'Name' },
              { key: 'genericName', label: 'Generic name', render: (r) => r.genericName || '—' },
              { key: 'category', label: 'Category', badge: true },
              { key: 'unit', label: 'Unit' },
              { key: 'salesRate', label: 'Sales price' },
              { key: 'reorderLevel', label: 'Reorder level' },
              { key: 'isActive', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
            ],
            fields: [
              { name: 'name', label: 'Name', required: true },
              { name: 'genericName', label: 'Generic name' },
              { name: 'brandName', label: 'Brand name' },
              { name: 'category', label: 'Category' },
              { name: 'sku', label: 'SKU' },
              { name: 'form', label: 'Dosage form' },
              { name: 'strength', label: 'Strength' },
              { name: 'unit', label: 'Unit' },
              { name: 'purchaseRate', label: 'Purchase rate', type: 'number' },
              { name: 'salesRate', label: 'Sales rate', type: 'number' },
              { name: 'margin', label: 'Margin %', type: 'number' },
              { name: 'reorderLevel', label: 'Reorder level', type: 'number' },
              { name: 'requiresPrescription', label: 'Prescription required', type: 'checkbox' },
            ],
          },
          {
            key: 'stores',
            label: 'Stores',
            endpoint: '/pharmacy/stores',
            createLabel: 'Add store',
            columns: [
              { key: 'name', label: 'Name' },
              { key: 'code', label: 'Code' },
              { key: 'type', label: 'Type', badge: true },
              { key: 'location', label: 'Location', render: (r) => r.location || '—' },
              { key: 'isActive', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
            ],
            fields: [
              { name: 'name', label: 'Name', required: true },
              { name: 'code', label: 'Code' },
              { name: 'type', label: 'Type', type: 'select', options: STORE_TYPES, defaultValue: 'MAIN' },
              { name: 'location', label: 'Location' },
            ],
          },
          {
            key: 'inventory',
            label: 'Inventory',
            endpoint: '/pharmacy/inventory',
            createLabel: 'Stock item',
            columns: [
              { key: 'medicine', label: 'Medicine', render: (r) => r.medicine?.name || r.medicineId || r.name },
              { key: 'store', label: 'Store', render: (r) => r.store?.name || r.storeId },
              { key: 'currentStock', label: 'Stock' },
              { key: 'batchNumber', label: 'Batch' },
              { key: 'expiryDate', label: 'Expiry', render: (r) => r.expiryDate?.slice(0, 10) || '—' },
            ],
            fields: [
              { name: 'storeId', label: 'Store', required: true, type: 'select', optionsFrom: STORE_REF },
              { name: 'medicineId', label: 'Medicine', type: 'select', optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/pharmacy/medicines' } },
              { name: 'name', label: 'Item name', required: true },
              { name: 'itemType', label: 'Item type', type: 'select', options: [
                { value: 'MEDICINE', label: 'Medicine' },
                { value: 'SUPPLIES', label: 'Supplies' },
                { value: 'EQUIPMENT', label: 'Equipment' },
                { value: 'CONSUMABLE', label: 'Consumable' },
                { value: 'OTHER', label: 'Other' },
              ], defaultValue: 'MEDICINE' },
              { name: 'sku', label: 'SKU' },
              { name: 'unit', label: 'Unit' },
              { name: 'currentStock', label: 'Initial stock', type: 'number' },
              { name: 'minStock', label: 'Min stock', type: 'number' },
              { name: 'maxStock', label: 'Max stock', type: 'number' },
              { name: 'reorderLevel', label: 'Reorder level', type: 'number' },
              { name: 'location', label: 'Location' },
              { name: 'batchNumber', label: 'Batch number' },
              { name: 'expiryDate', label: 'Expiry date', type: 'date' },
              { name: 'purchaseRate', label: 'Purchase rate', type: 'number' },
              { name: 'salesRate', label: 'Sales rate', type: 'number' },
            ],
          },
        ]}
      />
    </div>

    {showAddPatient && (
        <div className="modal-overlay" onClick={() => setShowAddPatient(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Add New Patient</h3>
              <button className="modal-close" onClick={() => setShowAddPatient(false)}>×</button>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label className="label">First name *</label>
              <input className="input" value={newPatient.firstName} onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })} placeholder="First name" />
            </div>
            <div className="field">
              <label className="label">Last name</label>
              <input className="input" value={newPatient.lastName} onChange={(e) => setNewPatient({ ...newPatient, lastName: e.target.value })} placeholder="Last name" />
            </div>
            <div className="field">
              <label className="label">Mobile</label>
              <input className="input" value={newPatient.mobile} onChange={(e) => setNewPatient({ ...newPatient, mobile: e.target.value })} placeholder="Mobile number" />
            </div>
            <div className="field">
              <label className="label">Gender</label>
              <select className="input" value={newPatient.gender} onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            {patientError && <div className="alert alert-error" style={{ marginTop: 8 }}>{patientError}</div>}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowAddPatient(false)}>Cancel</button>
              <button className="btn" onClick={handleAddPatient} disabled={savingPatient}>
                {savingPatient ? 'Saving...' : 'Add Patient'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
    );
  }

function DispenseModal({ prescription, onClose, onDone }: { prescription: any; onClose: () => void; onDone: () => void }) {
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api('/pharmacy/stores').then((res: any) => {
      const all = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
      const filtered = all.filter((s: any) => s.location?.toLowerCase().includes('ground floor'));
      setStores(filtered);
      if (filtered.length === 1) setStoreId(filtered[0].id);
    }).catch(() => {});
  }, []);

  async function handleDispense() {
    if (!storeId) { setError('Select a store'); return; }
    setSaving(true);
    setError(null);
    try {
      const items = await Promise.all(
        (prescription.items || []).map(async (it: any) => {
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
          patientId: prescription.patientId,
          prescriptionId: prescription.id,
          storeId,
          items,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispensing failed');
    }
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Dispense medicines</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <p className="note" style={{ marginTop: 4 }}>
          {prescription.patient?.firstName} {prescription.patient?.lastName}
          {prescription.patient?.mrn ? ` · ${prescription.patient.mrn}` : ''}
        </p>

        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">Dispense from store</label>
          <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Select store</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="label">Items to dispense</label>
          {(prescription.items || []).map((it: any) => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{it.medicineName}</span>
              <span style={{ fontWeight: 600 }}>Qty: {it.quantity || '—'}</span>
            </div>
          ))}
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

        <div className="form-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={handleDispense} disabled={saving || !storeId}>
            {saving ? 'Dispensing...' : 'Confirm dispense'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PharmacyPage() {
  return (
    <Suspense fallback={<p className="muted">Loading...</p>}>
      <PharmacyPageInner />
    </Suspense>
  );
}
