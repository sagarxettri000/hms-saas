'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { formatMoney, formatDate, formatDateTime } from '@/lib/hooks';
import ReceiptModal from '@/components/ReceiptModal';
import PaymentModal from '@/components/PaymentModal';
import PatientPrescriptions from '@/components/PatientPrescriptions';

const VALID_TABS = ['medicines', 'billing', 'bills', 'stores'];

const TAB_LABELS: Record<string, string> = {
  medicines: 'Medicines',
  billing: 'Billing',
  bills: 'Bills',
  stores: 'Stores',
};

const CATEGORIES = [
  'Antibiotics',
  'Analgesics',
  'Cardiovascular',
  'Antidiabetics',
  'Gastrointestinal',
  'Respiratory',
  'Antiallergics',
  'Vitamins & Supplements',
  'Dermatological',
  'Neurological',
  'Psychiatric',
  'Hormones',
  'Oncology',
  'Fluids & Electrolytes',
  'Others',
];

function toList(res: any): any[] {
  const d = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(d)) return d;
  return d?.data ?? [];
}

function toObj(res: any): any {
  const d = res?.data?.data ?? res?.data ?? res;
  return d ?? null;
}

function RxStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'DISPENSED' || status === 'ACTIVE' ? 'badge-green' :
    status === 'APPROVED' ? 'badge-blue' :
    status === 'CANCELLED' ? 'badge-red' :
    status === 'PENDING' ? 'badge-yellow' :
    'badge-gray';
  return <span className={`badge ${tone}`}>{status}</span>;
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'PAID' ? 'badge-green' :
    status === 'PENDING' ? 'badge-yellow' :
    status === 'PARTIAL' ? 'badge-blue' :
    status === 'CANCELLED' || status === 'REFUNDED' ? 'badge-red' :
    status === 'OVERDUE' ? 'badge-red' :
    'badge-gray';
  return <span className={`badge ${tone}`}>{status}</span>;
}

function getTab(params: URLSearchParams): string {
  const tab = params.get('tab');
  if (tab && VALID_TABS.includes(tab)) return tab;
  return 'medicines';
}

function AddMedicineModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [values, setValues] = useState({
    name: '', genericName: '', brandName: '', category: 'Antibiotics', sku: '',
    form: '', strength: '', unit: '', purchaseRate: 0, salesRate: 0,
    reorderLevel: 0, requiresPrescription: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api('/pharmacy/medicines', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed to create medicine');
    } finally {
      setSaving(false);
    }
  }

  function set(field: string, value: any) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add Medicine</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label className="label">Name *</label>
              <input className="input" value={values.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
            <div className="field">
              <label className="label">Generic Name</label>
              <input className="input" value={values.genericName} onChange={(e) => set('genericName', e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Brand Name</label>
              <input className="input" value={values.brandName} onChange={(e) => set('brandName', e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Category</label>
              <select className="input" value={values.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">SKU</label>
              <input className="input" value={values.sku} onChange={(e) => set('sku', e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Dosage Form</label>
              <input className="input" value={values.form} onChange={(e) => set('form', e.target.value)} placeholder="Tablet, Injection..." />
            </div>
            <div className="field">
              <label className="label">Strength</label>
              <input className="input" value={values.strength} onChange={(e) => set('strength', e.target.value)} placeholder="500mg" />
            </div>
            <div className="field">
              <label className="label">Unit</label>
              <input className="input" value={values.unit} onChange={(e) => set('unit', e.target.value)} placeholder="Strip, Bottle..." />
            </div>
            <div className="field">
              <label className="label">Purchase Rate</label>
              <input className="input" type="number" min="0" step="0.01" value={values.purchaseRate} onChange={(e) => set('purchaseRate', Number(e.target.value))} />
            </div>
            <div className="field">
              <label className="label">Sales Rate</label>
              <input className="input" type="number" min="0" step="0.01" value={values.salesRate} onChange={(e) => set('salesRate', Number(e.target.value))} />
            </div>
            <div className="field">
              <label className="label">Reorder Level</label>
              <input className="input" type="number" min="0" value={values.reorderLevel} onChange={(e) => set('reorderLevel', Number(e.target.value))} />
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 22 }}>
                <input type="checkbox" checked={values.requiresPrescription} onChange={(e) => set('requiresPrescription', e.target.checked)} />
                Prescription required
              </label>
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create Medicine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MedicineCsvImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; error: string }[] } | null>(null);

  const COLUMN_MAP: Record<string, string> = {
    'name': 'name', 'medicine name': 'name', 'medicine': 'name', 'medicine_name': 'name',
    'generic name': 'genericName', 'genericname': 'genericName', 'generic_name': 'genericName',
    'brand name': 'brandName', 'brand': 'brandName', 'brandname': 'brandName', 'brand_name': 'brandName',
    'category': 'category', 'sku': 'sku', 'barcode': 'barcode', 'unit': 'unit',
    'dosage form': 'form', 'form': 'form', 'dosage': 'form',
    'strength': 'strength',
    'purchase rate': 'purchaseRate', 'purchaserate': 'purchaseRate', 'purchase_rate': 'purchaseRate',
    'cost price': 'purchaseRate', 'cp': 'purchaseRate',
    'sales rate': 'salesRate', 'salesrate': 'salesRate', 'sales_rate': 'salesRate',
    'selling price': 'salesRate', 'price': 'salesRate', 'sp': 'salesRate',
    'reorder level': 'reorderLevel', 'reorderlevel': 'reorderLevel', 'reorder_level': 'reorderLevel',
    'low stock': 'reorderLevel',
    'requires prescription': 'requiresPrescription', 'requiresprescription': 'requiresPrescription',
    'rx': 'requiresPrescription', 'prescription required': 'requiresPrescription',
  };

  function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const clean = text.replace(/^\uFEFF/, '');
    const lines: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (ch === '"') {
        if (inQuotes && clean[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && clean[i + 1] === '\n') i++;
        lines.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) lines.push(current);

    if (lines.length < 2) return { headers: [], rows: [] };

    const rawHeaders = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const mappedHeaders = rawHeaders.map((h) => COLUMN_MAP[h.toLowerCase()] || h);

    const data: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals: string[] = [];
      let val = '';
      let inQ = false;
      for (let j = 0; j < lines[i].length; j++) {
        const ch = lines[i][j];
        if (ch === '"') {
          if (inQ && lines[i][j + 1] === '"') { val += '"'; j++; }
          else { inQ = !inQ; }
        } else if (ch === ',' && !inQ) {
          vals.push(val);
          val = '';
        } else {
          val += ch;
        }
      }
      vals.push(val);

      const row: Record<string, string> = {};
      mappedHeaders.forEach((h, idx) => { row[h] = (vals[idx] || '').replace(/^"|"$/g, '').trim(); });
      const hasData = Object.values(row).some((v) => v.length > 0);
      if (hasData) data.push(row);
    }

    return { headers: mappedHeaders, rows: data };
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
    };
    reader.readAsText(f);
  }

  function toDto(r: Record<string, string>) {
    const num = (v: string | undefined) => (Number(v) > 0 ? Number(v) : undefined);
    const truthy = (v: string | undefined) => v && (String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes');
    return {
      name: r['name'] || '',
      genericName: r['genericName'] || undefined,
      brandName: r['brandName'] || undefined,
      category: r['category'] || undefined,
      sku: r['sku'] || undefined,
      form: r['form'] || undefined,
      strength: r['strength'] || undefined,
      unit: r['unit'] || undefined,
      purchaseRate: num(r['purchaseRate']),
      salesRate: num(r['salesRate']),
      reorderLevel: num(r['reorderLevel']),
      requiresPrescription: r['requiresPrescription']?.length ? truthy(r['requiresPrescription']) : true,
    };
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const payload = rows.map(toDto);
      const res: any = await api('/pharmacy/medicines/import', {
        method: 'POST',
        body: JSON.stringify({ rows: payload }),
      });
      const data = res?.data?.data ?? res?.data ?? res;
      setResult(data);
      if (data?.imported > 0) onDone();
    } catch (err: any) {
      setResult({ imported: 0, errors: [{ row: 0, error: err.message || 'Import failed' }] });
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const csv = 'name,genericName,category,form,strength,unit,purchaseRate,salesRate,reorderLevel,requiresPrescription\nParacetamol,Acetaminophen,Antibiotics,Tablet,500mg,Strip,50,80,20,true\nAmoxicillin,Amoxicillin,Antibiotics,Capsule,250mg,Strip,80,120,15,true';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'medicine-import-template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Import Medicines from CSV</h2>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 18 }}>×</button>
        </div>

        {!result ? (
          <>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              Use the template below as a guide. Required column: <b>name</b>. Numbers (purchaseRate, salesRate, reorderLevel) are parsed automatically.
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{ flex: 1 }} />
              <button className="btn btn-secondary" onClick={downloadTemplate} style={{ whiteSpace: 'nowrap' }}>
                Download Template
              </button>
            </div>

            {file && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                {file.name} — {rows.length} rows detected
              </p>
            )}

            {headers.length > 0 && rows.length > 0 && (
              <>
                <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Preview (first 5 of {rows.length} rows):
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, i) => (
                        <tr key={i}>{headers.map((h) => <td key={h}>{row[h] || '—'}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                  <button className="btn" onClick={handleImport} disabled={importing}>
                    {importing ? 'Importing...' : `Import ${rows.length} Medicines`}
                  </button>
                </div>
              </>
            )}

            {rows.length === 0 && file && (
              <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: 'var(--amber-bg, #fffbeb)', border: '1px solid var(--amber, #f59e0b)', fontSize: 13, color: '#92400e' }}>
                No valid rows found. Make sure your CSV has a header row and comma-separated values.
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div style={{
              padding: 16, borderRadius: 8,
              background: result.imported > 0 ? 'var(--green-bg, #f0fdf4)' : 'var(--red-bg, #fef2f2)',
              border: `1px solid ${result.imported > 0 ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)'}`,
            }}>
              <p style={{ fontWeight: 600, margin: '0 0 4px' }}>
                {result.imported} medicine{result.imported !== 1 ? 's' : ''} imported successfully
              </p>
              {result.errors.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                    {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} failed:
                  </p>
                  {result.errors.slice(0, 10).map((err, i) => (
                    <p key={i} style={{ fontSize: 12, margin: 0, color: 'var(--red, #ef4444)' }}>
                      Row {err.row}: {err.error}
                    </p>
                  ))}
                  {result.errors.length > 10 && (
                    <p style={{ fontSize: 12, margin: '4px 0 0', color: 'var(--text-muted)' }}>
                      ...and {result.errors.length - 10} more errors
                    </p>
                  )}
                </div>
              )}
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { setResult(null); setFile(null); setRows([]); setHeaders([]); onClose(); }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditMedicineModal({
  med, onClose, onDone,
}: {
  med: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState(() => ({
    name: med?.name || '',
    form: med?.form || '',
    strength: med?.strength || '',
    salesRate: Number(med?.salesRate ?? med?.salesPrice ?? 0),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field: string, value: any) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api(`/pharmacy/medicines/${med.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: values.name, form: values.form, strength: values.strength, salesRate: Number(values.salesRate) || 0 }),
      });
      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed to update medicine');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit Medicine</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label className="label">Name *</label>
              <input className="input" value={values.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
            <div className="field">
              <label className="label">Form</label>
              <input className="input" value={values.form} onChange={(e) => set('form', e.target.value)} placeholder="Tablet, Injection..." />
            </div>
            <div className="field">
              <label className="label">Strength</label>
              <input className="input" value={values.strength} onChange={(e) => set('strength', e.target.value)} placeholder="500mg" />
            </div>
            <div className="field">
              <label className="label">Sales Price</label>
              <input className="input" type="number" min="0" step="0.01" value={values.salesRate || ''} onChange={(e) => set('salesRate', Number(e.target.value))} />
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MedicinesTab() {
  const [medicines, setMedicines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('name-asc');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    api('/pharmacy/medicines?limit=200')
      .then((res: any) => setMedicines(toList(res)))
      .catch(() => setMedicines([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const categoriesPresent = Array.from(
    new Set(medicines.map((m) => m.category).filter(Boolean))
  ).sort();

  const filtered = medicines
    .filter((m) => {
      if (category && m.category !== category) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          m.name?.toLowerCase().includes(q) ||
          m.genericName?.toLowerCase().includes(q) ||
          m.brandName?.toLowerCase().includes(q) ||
          m.sku?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      switch (sort) {
        case 'name-desc': return (b.name || '').localeCompare(a.name || '');
        case 'price-asc': return (Number(a.salesRate) || 0) - (Number(b.salesRate) || 0);
        case 'price-desc': return (Number(b.salesRate) || 0) - (Number(a.salesRate) || 0);
        default: return (a.name || '').localeCompare(b.name || '');
      }
    });

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input
          className="input search-input"
          placeholder="Search by name, generic, brand or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input" style={{ width: 200 }} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {Array.from(new Set([...categoriesPresent, ...CATEGORIES])).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select className="input" style={{ width: 190 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name-asc">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
          <option value="price-asc">Price (Low first)</option>
          <option value="price-desc">Price (High first)</option>
        </select>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Medicine</button>
        <button className="btn btn-secondary" onClick={() => setShowImport(true)}>Import CSV</button>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className="loading">Loading medicines...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">No medicines match the current filters.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Generic</th>
                <th>Category</th>
                <th>Form / Strength</th>
                <th>Sales Price</th>
                <th>Reorder Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const reorder = Number(m.reorderLevel) || 0;
                return (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>
                      {m.name}
                      {m.requiresPrescription && <span className="badge badge-purple" style={{ marginLeft: 6 }}>Rx</span>}
                    </td>
                    <td>{m.genericName || '—'}</td>
                    <td>{m.category ? <span className="badge badge-blue">{m.category}</span> : '—'}</td>
                    <td>{[m.form, m.strength].filter(Boolean).join(' ') || '—'}</td>
                    <td>{formatMoney(m.salesRate)}</td>
                    <td>{reorder}</td>
                    <td>
                      <span className={`badge ${m.isActive ? 'badge-green' : 'badge-gray'}`}>
                        {m.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditTarget(m)}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddMedicineModal onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); load(); }} />}
      {showImport && <MedicineCsvImportModal onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} />}
      {editTarget && (
        <EditMedicineModal
          med={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => { setEditTarget(null); load(); }}
        />
      )}
    </>
  );
}

function DispensingTab() {
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispenseTarget, setDispenseTarget] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [walkIn, setWalkIn] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api('/pharmacy/prescriptions?limit=100')
      .then((res: any) => {
        const list = toList(res);
        setPrescriptions(list.filter((p: any) => p.status !== 'DISPENSED' && p.status !== 'CANCELLED'));
      })
      .catch(() => setPrescriptions([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <span className="note">{prescriptions.length} pending prescription(s)</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={() => setWalkIn(true)}>+ Walk-in Sale</button>
          <button className="btn btn-secondary" onClick={load}>Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading prescriptions...</div>
      ) : prescriptions.length === 0 ? (
        <div className="empty">No pending prescriptions found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {prescriptions.map((rx) => (
            <div key={rx.id} className="card">
              <div className="row-between">
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {rx.patient?.firstName} {rx.patient?.lastName}
                    <span className="mono" style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>{rx.patient?.mrn}</span>
                  </div>
                  <div className="note" style={{ marginTop: 2 }}>
                    Dr. {rx.doctor?.user?.firstName} {rx.doctor?.user?.lastName} · {formatDateTime(rx.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RxStatusBadge status={rx.status} />
                  <button className="btn btn-sm btn-primary" onClick={() => setDispenseTarget(rx)}>Dispense</button>
                </div>
              </div>
              {rx.items?.length > 0 && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  {rx.items.map((it: any) => (
                    <div key={it.id} style={{ display: 'flex', gap: 12, fontSize: 13, padding: '4px 0' }}>
                      <span style={{ fontWeight: 500 }}>{it.medicineName}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{it.dosage} · {it.frequency} · {it.duration}</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 600 }}>Qty: {it.quantity || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {dispenseTarget && (
        <DispenseModal
          prescription={dispenseTarget}
          onClose={() => setDispenseTarget(null)}
          onDone={() => { setDispenseTarget(null); load(); }}
          onReceipt={setReceipt}
        />
      )}
      {walkIn && (
        <WalkInSaleModal
          onClose={() => setWalkIn(false)}
          onReceipt={setReceipt}
        />
      )}
      {receipt && <ReceiptModal invoice={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}

function WalkInSaleModal({ onClose, onReceipt }: { onClose: () => void; onReceipt: (invoice: any) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [patientId, setPatientId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [patientList, setPatientList] = useState<any[]>([]);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientSearching, setPatientSearching] = useState(false);
  const [patientSearchErr, setPatientSearchErr] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [isCredit, setIsCredit] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    api('/pharmacy/stores')
      .then((res: any) => {
        const allStores = toList(res);
        const filtered = allStores.filter((s: any) => s.location?.toLowerCase().includes('ground floor'));
        const available = filtered.length > 0 ? filtered : allStores;
        if (available.length > 0) setStoreId(available[0].id);
      })
      .catch(() => {});
  }, []);

  // Debounced server-side patient lookup (name / MRN / phone / email).
  // Never loads the full patient table; the backend is tenant-scoped.
  useEffect(() => {
    if (isWalkIn) return; // not needed for anonymous walk-in customers
    const q = patientQuery.trim();
    if (q.length < 2) {
      setPatientList([]);
      setPatientSearching(false);
      setPatientSearchErr('');
      return;
    }
    setPatientSearching(true);
    setPatientSearchErr('');
    const t = setTimeout(() => {
      api(`/patients/search?search=${encodeURIComponent(q)}&limit=8`)
        .then((res: any) => {
          const list = Array.isArray(res) ? res : (res?.data?.data ?? res?.data ?? []);
          setPatientList(Array.isArray(list) ? list : []);
        })
        .catch((e: any) => {
          setPatientList([]);
          setPatientSearchErr(e?.message || 'Patient search failed');
        })
        .finally(() => setPatientSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [patientQuery, isWalkIn]);

  function selectPatient(p: any) {
    setSelectedPatient(p);
    setPatientId(p.id);
    setPatientQuery('');
    setPatientList([]);
    setPatientSearchErr('');
  }

  function clearPatient() {
    setSelectedPatient(null);
    setPatientId('');
  }

  async function searchMedicines(q: string) {
    setSearch(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await api(`/pharmacy/medicines?query=${encodeURIComponent(q)}&limit=10`);
      setSearchResults(toList(res));
    } catch {
      setSearchResults([]);
    }
  }

  function addToSale(med: any) {
    if (items.find((s) => s.medicineId === med.id)) return;
    setError('');
    setItems((prev) => [...prev, {
      medicineId: med.id,
      medicineName: med.name,
      quantity: 1,
      unitPrice: Number(med.salesRate) || 0,
    }]);
    setSearch('');
    setSearchResults([]);
  }

  function updateItem(medicineId: string, field: string, value: string) {
    setItems((prev) => prev.map((item) => {
      if (item.medicineId !== medicineId) return item;
      let v: any = value;
      if (field === 'quantity' || field === 'unitPrice') {
        v = Number(value) || 0;
        if (field === 'quantity') {
          v = Math.max(1, v);
        }
      }
      return { ...item, [field]: v };
    }));
  }

  function bumpItem(medicineId: string, delta: number) {
    setItems((prev) => prev.map((item) => {
      if (item.medicineId !== medicineId) return item;
      const next = Math.max(1, Number(item.quantity) + delta);
      return { ...item, quantity: next };
    }));
  }

  function removeItem(medicineId: string) {
    setItems((prev) => prev.filter((item) => item.medicineId !== medicineId));
  }

  const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const taxAmount = (subtotal * tax) / 100;
  const grandTotal = Math.max(0, subtotal + taxAmount - discount);

  async function submit() {
    if (items.length === 0 || (!patientId && !customerName.trim())) return;
    setSubmitting(true);
    setError('');
    try {
      const saleRes = await api('/pharmacy/sale', {
        method: 'POST',
        body: JSON.stringify({
          ...(patientId ? { patientId } : {}),
          customerName: patientId ? undefined : (customerName.trim() || undefined),
          customerPhone: patientId ? undefined : (customerPhone.trim() || undefined),
          storeId,
          items: items.map((it) => ({
            medicineId: it.medicineId,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })),
          discountAmount: discount || 0,
          taxPercent: tax || 0,
          isCredit,
          paymentMethod: isCredit ? undefined : payMethod,
          referenceNumber: payRef || undefined,
          notes: notes.trim() || 'Pharmacy walk-in sale',
        }),
      });
      const result = toObj(saleRes);
      const invoice = result?.invoice ?? result;
      let receiptInvoice = invoice;
      if (invoice?.id) {
        try {
          const receiptRes = await api(`/billing/invoices/${invoice.id}`);
          receiptInvoice = toObj(receiptRes) ?? invoice;
        } catch { /* keep invoice */ }
      }
      onReceipt(receiptInvoice);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Sale failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 900, width: '92%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Walk-in Sale</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start' }}>
          <div className="card">
            <div className="card-title">Billing Details</div>
            <div className="form-grid">
              <div className="field">
                <label className="label">Customer *</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${!isWalkIn ? 'btn-primary' : ''}`}
                    onClick={() => { setIsWalkIn(false); setCustomerName(''); setCustomerPhone(''); clearPatient(); }}
                  >
                    Hospital Patient
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${isWalkIn ? 'btn-primary' : ''}`}
                    onClick={() => { setIsWalkIn(true); setPatientId(''); clearPatient(); }}
                  >
                    + New Walk-in Customer
                  </button>
                </div>
                {!isWalkIn ? (
                  selectedPatient ? (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                      padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8,
                      background: 'var(--surface-muted, transparent)',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {[selectedPatient.firstName, selectedPatient.lastName].filter(Boolean).join(' ')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {selectedPatient.mrn ? `MRN: ${selectedPatient.mrn}` : ''}
                          {selectedPatient.mobile ? ` · ${selectedPatient.mobile}` : ''}
                        </div>
                      </div>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={clearPatient}>
                        Change
                      </button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <input
                        className="input search-input"
                        value={patientQuery}
                        onChange={(e) => setPatientQuery(e.target.value)}
                        placeholder="Search patient by name, MRN or phone..."
                        autoComplete="off"
                      />
                      {patientSearching && (
                        <div style={{ position: 'absolute', right: 10, top: 9, fontSize: 11, color: 'var(--text-muted)' }}>
                          Searching…
                        </div>
                      )}
                      {patientSearchErr && (
                        <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{patientSearchErr}</div>
                      )}
                      {patientList.length > 0 && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
                          border: '1px solid var(--border)', borderRadius: 8, maxHeight: 240, overflowY: 'auto',
                          background: 'var(--surface)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        }}>
                          {patientList.map((p) => (
                            <div
                              key={p.id}
                              onMouseDown={() => selectPatient(p)}
                              style={{
                                padding: '9px 14px', cursor: 'pointer', fontSize: 13,
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                                borderBottom: '1px solid var(--border)',
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600 }}>
                                  {[p.firstName, p.lastName].filter(Boolean).join(' ')}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {p.mrn ? `MRN: ${p.mrn}` : 'No MRN'}
                                </div>
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                                {p.mobile || p.phone || '—'}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {patientQuery.trim().length >= 2 && !patientSearching && patientList.length === 0 && !patientSearchErr && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
                          border: '1px solid var(--border)', borderRadius: 8,
                          background: 'var(--surface)', padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)',
                        }}>
                          No patients match "{patientQuery.trim()}"
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      style={{ flex: 1 }}
                    />
                    <input
                      className="input"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      style={{ width: 140 }}
                    />
                  </div>
                )}
              </div>
              <div className="field field-full">
                {!isWalkIn && patientId && <PatientPrescriptions patientId={patientId} />}
              </div>
              <div className="field field-full">
                <label className="label">Medicine</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input search-input"
                    value={search}
                    onChange={(e) => searchMedicines(e.target.value)}
                    placeholder="Search medicine by name or generic name..."
                  />
                  {searchResults.length > 0 && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
                      border: '1px solid var(--border)', borderRadius: 8, maxHeight: 240, overflowY: 'auto',
                      background: 'var(--surface)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    }}>
                      {searchResults.map((med) => (
                        <div
                          key={med.id}
                          onMouseDown={() => addToSale(med)}
                          style={{
                            padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{med.name}</div>
                            {med.genericName && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{med.genericName}</div>}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatMoney(med.salesRate)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="field field-full">
                <label className="label">Notes</label>
                <textarea
                  className="input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note for this sale"
                  rows={2}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Sale Items ({items.length})</div>
            {items.length === 0 && <div className="empty">Search medicines to add sale items.</div>}
            {items.map((it) => (
              <div key={it.medicineId} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 500, minWidth: 0 }}>
                    {it.medicineName}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {formatMoney(it.unitPrice)} / unit
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => bumpItem(it.medicineId, -1)} style={{ padding: '2px 8px' }}>−</button>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => updateItem(it.medicineId, 'quantity', e.target.value)}
                      style={{ width: 52, padding: '3px 6px', textAlign: 'center' }}
                    />
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => bumpItem(it.medicineId, 1)} style={{ padding: '2px 8px' }}>+</button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{formatMoney(it.quantity * it.unitPrice)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={it.unitPrice}
                      onChange={(e) => updateItem(it.medicineId, 'unitPrice', e.target.value)}
                      style={{ width: 90, padding: '3px 6px' }}
                      title="Unit price"
                    />
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeItem(it.medicineId)}>Remove</button>
                  </div>
                </div>
                </div>
            ))}
            {items.length > 0 && (
              <>
                <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>Items count</span><span>{items.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>Subtotal</span><span>{formatMoney(subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>Discount</span><span>- {formatMoney(discount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span>Tax ({tax}%)</span><span>+ {formatMoney(taxAmount)}</span>
                  </div>
                </div>
                <div className="form-grid" style={{ marginTop: 8 }}>
                  <div className="field">
                    <label className="label">Discount</label>
                    <input className="input" type="number" min={0} step="0.01" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value) || 0)} placeholder="0" />
                  </div>
                  <div className="field">
                    <label className="label">Tax %</label>
                    <input className="input" type="number" min={0} max={100} step="0.01" value={tax || ''} onChange={(e) => setTax(Number(e.target.value) || 0)} placeholder="0" />
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{items.reduce((s, it) => s + it.quantity, 0)} units</span>
                  <span style={{ fontWeight: 700, fontSize: 18 }}>{formatMoney(grandTotal)}</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', margin: '12px 0 8px' }}>
                  <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} />
                  Credit invoice (pay later)
                </label>
                {!isCredit && (
                  <>
                    <div className="field">
                      <label className="label">Payment Method</label>
                      <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                        <option value="CASH">Cash</option>
                        <option value="CARD">Card</option>
                        <option value="BANK">Bank Transfer</option>
                        <option value="ONLINE">QR / eSewa / Khalti</option>
                        <option value="INSURANCE">Insurance</option>
                      </select>
                    </div>
                    {(payMethod === 'CARD' || payMethod === 'BANK' || payMethod === 'ONLINE') && (
                      <div className="field">
                        <label className="label">Reference Number</label>
                        <input className="input" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Transaction ref" />
                      </div>
                    )}
                  </>
                )}
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: 8 }}
                  disabled={submitting || items.length === 0 || (!patientId && !customerName.trim())}
                  onClick={submit}
                >
                  {submitting ? 'Processing...' : 'Create Invoice & Receipt'}
                </button>
              </>
            )}
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  );
}

function DispenseModal({ prescription, onClose, onDone, onReceipt }: { prescription: any; onClose: () => void; onDone: () => void; onReceipt: (invoice: any) => void }) {
  const [storeId, setStoreId] = useState('');
  const [stores, setStores] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [ready, setReady] = useState(false);
  const [tax, setTax] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [isCredit, setIsCredit] = useState(false);

  useEffect(() => {
    api('/pharmacy/stores')
      .then((res: any) => {
        const all = toList(res);
        const filtered = all.filter((s: any) => s.location?.toLowerCase().includes('ground floor'));
        setStores(filtered.length > 0 ? filtered : all);
        if (filtered.length === 1) setStoreId(filtered[0].id);
      })
      .catch(() => {});

    Promise.all(
      (prescription.items || []).map(async (it: any) => {
        let unitPrice = 0;
        if (it.medicineId) {
          try {
            const medRes = await api(`/pharmacy/medicines/${it.medicineId}`);
            unitPrice = Number(toObj(medRes)?.salesRate) || 0;
          } catch {}
        }
        return {
          prescriptionItemId: it.id,
          medicineName: it.medicineName,
          medicineId: it.medicineId,
          quantity: it.quantity || 1,
          unitPrice,
        };
      }),
    )
      .then((resolved) => { setItems(resolved); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [prescription]);

  const unitSubtotal = items.reduce((sum, it) => sum + Number(it.quantity) * Number(it.unitPrice), 0);
  const taxAmount = (unitSubtotal * tax) / 100;
  const grandTotal = Math.max(0, unitSubtotal + taxAmount - discount);

  async function handleDispense() {
    if (!storeId) { setError('Select a store'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api('/pharmacy/dispense', {
        method: 'POST',
        body: JSON.stringify({
          patientId: prescription.patientId,
          prescriptionId: prescription.id,
          storeId,
          items,
          taxPercent: tax || 0,
          discountAmount: discount || 0,
          isCredit,
          paymentMethod: isCredit ? undefined : payMethod,
          referenceNumber: isCredit ? undefined : payRef || undefined,
          notes: 'Pharmacy dispensing',
        }),
      });
      const result = toObj(res);
      const invoice = result?.invoice ?? result;
      if (invoice?.id) {
        try {
          const receiptRes = await api(`/billing/invoices/${invoice.id}`);
          onReceipt(toObj(receiptRes) ?? invoice);
        } catch {
          onReceipt(invoice);
        }
      } else {
        onReceipt(invoice);
      }
      onDone();
    } catch (err: any) {
      setError(err.message || 'Dispensing failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Dispense Medicines</h3>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <p className="note">
          {prescription.patient?.firstName} {prescription.patient?.lastName}
          {prescription.patient?.mrn ? ` · ${prescription.patient.mrn}` : ''}
        </p>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">Dispense From Store</label>
          <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Select store</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="label">Items To Dispense</label>
          {(prescription.items || []).map((it: any) => (
            <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{it.medicineName}</span>
              <span style={{ fontWeight: 600 }}>Qty: {it.quantity || '—'}</span>
            </div>
          ))}
        </div>

        {ready && items.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
              <span>Subtotal</span><span>{formatMoney(unitSubtotal)}</span>
            </div>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <div className="field">
                <label className="label">Discount</label>
                <input className="input" type="number" min={0} step="0.01" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value) || 0)} placeholder="0" />
              </div>
              <div className="field">
                <label className="label">Tax %</label>
                <input className="input" type="number" min={0} max={100} step="0.01" value={tax || ''} onChange={(e) => setTax(Number(e.target.value) || 0)} placeholder="0" />
              </div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
              <span>Total</span><span>{formatMoney(grandTotal)}</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', margin: '12px 0 8px' }}>
              <input type="checkbox" checked={isCredit} onChange={(e) => setIsCredit(e.target.checked)} />
              Bill to account (credit)
            </label>
            {!isCredit && (
              <>
                <div className="field">
                  <label className="label">Payment Method</label>
                  <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="BANK">Bank Transfer</option>
                    <option value="ONLINE">QR / eSewa / Khalti</option>
                    <option value="INSURANCE">Insurance</option>
                  </select>
                </div>
                {(payMethod === 'CARD' || payMethod === 'BANK' || payMethod === 'ONLINE') && (
                  <div className="field">
                    <label className="label">Reference Number</label>
                    <input className="input" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Transaction ref" />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleDispense} disabled={saving || !storeId || !ready}>
            {saving ? 'Dispensing...' : 'Dispense & Create Bill'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BillsTab() {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentTarget, setPaymentTarget] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    api('/pharmacy/sales?limit=100')
      .then((res: any) => setBills(toList(res)))
      .catch(() => setBills([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalOutstanding = bills.reduce(
    (sum, b) => sum + Math.max(0, Number(b.totalAmount || 0) - Number(b.paidAmount || 0)),
    0,
  );

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <span className="note">{bills.length} pharmacy bill(s) · Outstanding {formatMoney(totalOutstanding)}</span>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className="loading">Loading bills...</div>
      ) : bills.length === 0 ? (
        <div className="empty">
          No pharmacy bills yet. Dispense a prescription or create a sale to generate a bill.
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Patient</th>
                <th>Date</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const due = Math.max(0, Number(b.totalAmount || 0) - Number(b.paidAmount || 0));
                return (
                  <tr key={b.id}>
                    <td className="mono">{b.invoiceNumber}</td>
                    <td>
                    {b.patient ? (
                      <>
                        {b.patient.firstName} {b.patient.lastName}
                        {b.patient.mrn ? <span className="mono" style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)' }}>{b.patient.mrn}</span> : null}
                      </>
                    ) : (
                      <span>{b.customerName || 'Walk-in Customer'}{b.customerPhone ? ` · ${b.customerPhone}` : ''}</span>
                    )}
                  </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(b.issuedDate)}</td>
                    <td style={{ textAlign: 'center' }}>{b.items?.length ?? 0}</td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(b.totalAmount)}</td>
                    <td>{formatMoney(b.paidAmount)}</td>
                    <td>{formatMoney(due)}</td>
                    <td><InvoiceStatusBadge status={b.status} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {due > 0 && b.status !== 'CANCELLED' && (
                        <button className="btn btn-sm btn-primary" onClick={() => setPaymentTarget(b)}>Record Payment</button>
                      )}
                      <button className="btn btn-sm" onClick={() => setReceipt(b)}>Receipt</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {paymentTarget && (
        <PaymentModal
          invoice={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onDone={() => { setPaymentTarget(null); load(); }}
        />
      )}
      {receipt && <ReceiptModal invoice={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}

function StoresTab() {
  const [stores, setStores] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api('/pharmacy/stores'), api('/pharmacy/inventory?limit=200')])
      .then(([storeRes, invRes]: any[]) => {
        setStores(toList(storeRes));
        setInventory(toList(invRes));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className="loading">Loading stores...</div>
      ) : stores.length === 0 ? (
        <div className="empty">No pharmacy stores found.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Type</th>
                <th>Location</th>
                <th>Stock Items</th>
                <th>Total Units</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => {
                const items = inventory.filter((i) => i.storeId === s.id || i.store?.id === s.id);
                const units = items.reduce((sum, i) => sum + (Number(i.currentStock) || 0), 0);
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td className="mono">{s.code || '—'}</td>
                    <td><span className="badge badge-blue">{s.type}</span></td>
                    <td>{s.location || '—'}</td>
                    <td>{items.length}</td>
                    <td>{units.toLocaleString()}</td>
                    <td>
                      <span className={`badge ${s.isActive ? 'badge-green' : 'badge-gray'}`}>
                        {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PharmacyPageInner() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => getTab(searchParams));

  useEffect(() => {
    setActiveTab(getTab(searchParams));
  }, [searchParams]);

  function switchTab(tab: string) {
    setActiveTab(tab);
    window.history.replaceState(null, '', `/pharmacy?tab=${tab}`);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pharmacy</h1>
          <p className="page-subtitle">Medicines, billing and stores management</p>
        </div>
      </div>

      <div className="tabs">
        {VALID_TABS.map((t) => (
          <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => switchTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {activeTab === 'medicines' && <MedicinesTab />}
      {activeTab === 'billing' && <DispensingTab />}
      {activeTab === 'bills' && <BillsTab />}
      {activeTab === 'stores' && <StoresTab />}
    </>
  );
}

export default function PharmacyPage() {
  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <PharmacyPageInner />
    </Suspense>
  );
}
