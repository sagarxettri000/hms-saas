'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { formatMoney, formatDate, formatDateTime } from '@/lib/hooks';
import ReceiptModal from '@/components/ReceiptModal';
import PaymentModal from '@/components/PaymentModal';
import PatientPrescriptions from '@/components/PatientPrescriptions';

const REMOVED_KEY = 'pharmacy_expiry_removed';

const VALID_TABS = ['medicines', 'billing', 'bills', 'stores', 'alerts', 'expiry'];

const TAB_LABELS: Record<string, string> = {
  medicines: 'Medicines',
  billing: 'Billing',
  bills: 'Bills',
  stores: 'Stores',
  alerts: 'Alerts',
  expiry: 'Expiry',
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

const DRUG_INTERACTIONS = [
  { drugs: 'Warfarin + Aspirin', severity: 'MAJOR', effect: 'Increased bleeding risk', action: 'Avoid combination; monitor INR closely' },
  { drugs: 'Opioids + Benzodiazepines', severity: 'MAJOR', effect: 'Respiratory depression, sedation', action: 'Avoid co-prescription; reduce doses if unavoidable' },
  { drugs: 'Digoxin + Amiodarone', severity: 'MAJOR', effect: 'Digoxin toxicity', action: 'Reduce digoxin dose by half; monitor levels' },
  { drugs: 'Metformin + Iodinated Contrast', severity: 'MAJOR', effect: 'Lactic acidosis risk', action: 'Withhold metformin 48 hours around contrast imaging' },
  { drugs: 'ACE Inhibitors + Potassium Supplements', severity: 'MAJOR', effect: 'Hyperkalemia', action: 'Monitor serum potassium regularly' },
  { drugs: 'SSRIs + Tramadol', severity: 'MODERATE', effect: 'Serotonin syndrome risk', action: 'Watch for agitation, tremor, hyperthermia' },
  { drugs: 'NSAIDs + ACE/ARB Antihypertensives', severity: 'MODERATE', effect: 'Reduced BP control, renal impairment', action: 'Use lowest NSAID dose for shortest duration' },
  { drugs: 'Fluoroquinolones + Corticosteroids', severity: 'MODERATE', effect: 'Increased tendon rupture risk', action: 'Avoid in elderly; counsel patient' },
  { drugs: 'Levothyroxine + Calcium/Iron', severity: 'MINOR', effect: 'Reduced thyroxine absorption', action: 'Separate doses by at least 4 hours' },
  { drugs: 'Ciprofloxacin + Antacids/Iron', severity: 'MINOR', effect: 'Reduced antibiotic absorption', action: 'Separate administration by 2 hours' },
];

const CONTROLLED_SUBSTANCES = [
  { name: 'Morphine', form: 'Injection / Tablet', schedule: 'Schedule X' },
  { name: 'Fentanyl', form: 'Injection / Patch', schedule: 'Schedule X' },
  { name: 'Pethidine (Meperidine)', form: 'Injection', schedule: 'Schedule X' },
  { name: 'Oxycodone', form: 'Tablet', schedule: 'Schedule X' },
  { name: 'Tramadol', form: 'Injection / Capsule', schedule: 'Schedule H1' },
  { name: 'Ketamine', form: 'Injection', schedule: 'Schedule H1' },
  { name: 'Diazepam', form: 'Injection / Tablet', schedule: 'Schedule H1' },
  { name: 'Alprazolam', form: 'Tablet', schedule: 'Schedule H1' },
  { name: 'Lorazepam', form: 'Injection / Tablet', schedule: 'Schedule H1' },
  { name: 'Phenobarbital', form: 'Injection / Tablet', schedule: 'Schedule H1' },
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

function daysUntil(value: any): number | null {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

function expiryStatus(days: number | null): string {
  if (days === null) return 'UNKNOWN';
  if (days < 0) return 'EXPIRED';
  if (days <= 30) return 'EXPIRING_30_DAYS';
  if (days <= 60) return 'EXPIRING_60_DAYS';
  return 'SAFE';
}

function ExpiryBadge({ status }: { status: string }) {
  if (status === 'EXPIRED') return <span className="badge badge-red">EXPIRED</span>;
  if (status === 'EXPIRING_30_DAYS')
    return <span className="badge" style={{ background: '#ea580c', color: '#fff' }}>EXPIRING IN 30 DAYS</span>;
  if (status === 'EXPIRING_60_DAYS') return <span className="badge badge-yellow">EXPIRING IN 60 DAYS</span>;
  if (status === 'SAFE') return <span className="badge badge-green">SAFE</span>;
  return <span className="badge badge-gray">NO EXPIRY DATA</span>;
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

function readRemoved(): string[] {
  try {
    const raw = localStorage.getItem(REMOVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
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

function MedicinesTab() {
  const [medicines, setMedicines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('name-asc');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

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
        case 'stock-asc': return (Number(a.stock ?? a.currentStock ?? 0)) - (Number(b.stock ?? b.currentStock ?? 0));
        case 'stock-desc': return (Number(b.stock ?? b.currentStock ?? 0)) - (Number(a.stock ?? a.currentStock ?? 0));
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
          <option value="stock-asc">Stock (Low first)</option>
          <option value="stock-desc">Stock (High first)</option>
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
                <th>Stock</th>
                <th>Sales Price</th>
                <th>Reorder Level</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const stock = Number(m.stock ?? m.currentStock ?? 0);
                const reorder = Number(m.reorderLevel) || 0;
                const low = stock <= reorder;
                return (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>
                      {m.name}
                      {m.requiresPrescription && <span className="badge badge-purple" style={{ marginLeft: 6 }}>Rx</span>}
                    </td>
                    <td>{m.genericName || '—'}</td>
                    <td>{m.category ? <span className="badge badge-blue">{m.category}</span> : '—'}</td>
                    <td>{[m.form, m.strength].filter(Boolean).join(' ') || '—'}</td>
                    <td style={{ color: low ? '#dc2626' : undefined, fontWeight: low ? 700 : 400 }}>{stock}</td>
                    <td>{formatMoney(m.salesRate)}</td>
                    <td>{reorder}</td>
                    <td>
                      <span className={`badge ${m.isActive ? 'badge-green' : 'badge-gray'}`}>
                        {m.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                      {low && <span className="badge badge-yellow" style={{ marginLeft: 4 }}>LOW</span>}
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
    </>
  );
}

interface ExpiryRow {
  key: string;
  medicineId?: string;
  name: string;
  batch: string;
  expiryDate: string;
  stock: number;
}

function buildExpiryRows(medicines: any[], inventory: any[]): ExpiryRow[] {
  const invRows: ExpiryRow[] = inventory
    .filter((i) => i.expiryDate)
    .map((i) => ({
      key: i.id,
      medicineId: i.medicineId,
      name: i.medicine?.name || i.name || 'Unknown item',
      batch: i.batchNumber || '—',
      expiryDate: i.expiryDate,
      stock: Number(i.currentStock) || 0,
    }));

  if (invRows.length > 0) return invRows;

  return medicines
    .filter((m) => m.expiryDate)
    .map((m) => ({
      key: m.id,
      medicineId: m.id,
      name: m.name,
      batch: m.batchNumber || '—',
      expiryDate: m.expiryDate,
      stock: Number(m.stock ?? m.currentStock ?? 0),
    }));
}

function ExpiryTab() {
  const [rows, setRows] = useState<ExpiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [removed, setRemoved] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api('/pharmacy/medicines?limit=200'),
      api('/pharmacy/inventory?limit=200'),
    ])
      .then(([medRes, invRes]: any[]) => {
        setRows(buildExpiryRows(toList(medRes), toList(invRes)));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    setRemoved(readRemoved());
  }, [load]);

  function markRemoved(key: string) {
    const next = removed.includes(key) ? removed.filter((k) => k !== key) : [...removed, key];
    setRemoved(next);
    try {
      localStorage.setItem(REMOVED_KEY, JSON.stringify(next));
    } catch {}
  }

  const withStatus = rows.map((r) => {
    const days = daysUntil(r.expiryDate);
    return { ...r, days, status: expiryStatus(days), isRemoved: removed.includes(r.key) };
  });

  const counts = {
    total: withStatus.length,
    expired: withStatus.filter((r) => r.status === 'EXPIRED').length,
    exp30: withStatus.filter((r) => r.status === 'EXPIRING_30_DAYS').length,
    exp60: withStatus.filter((r) => r.status === 'EXPIRING_60_DAYS').length,
  };

  const filtered = filter ? withStatus.filter((r) => r.status === filter) : withStatus;

  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Total Medicines</div>
          <div className="stat-value stat-blue">{counts.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Expired</div>
          <div className="stat-value stat-red">{counts.expired}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Expiring within 30 days</div>
          <div className="stat-value" style={{ color: '#ea580c' }}>{counts.exp30}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Expiring within 60 days</div>
          <div className="stat-value stat-amber">{counts.exp60}</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <select className="input" style={{ width: 240 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="SAFE">Safe</option>
          <option value="EXPIRING_60_DAYS">Expiring in 60 Days</option>
          <option value="EXPIRING_30_DAYS">Expiring in 30 Days</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <div className="loading">Loading expiry data...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">No batch records found.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Medicine Name</th>
                <th>Batch</th>
                <th>Expiry Date</th>
                <th>Stock</th>
                <th>Days Until Expiry</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.key} style={r.isRemoved ? { opacity: 0.5 } : r.status === 'EXPIRED' ? { background: '#fef2f2' } : undefined}>
                  <td style={{ fontWeight: 600, textDecoration: r.isRemoved ? 'line-through' : undefined }}>{r.name}</td>
                  <td className="mono">{r.batch}</td>
                  <td>{formatDate(r.expiryDate)}</td>
                  <td>{r.stock}</td>
                  <td>{r.days === null ? '—' : r.days < 0 ? `${Math.abs(r.days)}d ago` : `${r.days}d`}</td>
                  <td>
                    <ExpiryBadge status={r.status} />
                    {r.isRemoved && <span className="badge badge-gray" style={{ marginLeft: 4 }}>REMOVED</span>}
                  </td>
                  <td>
                    {r.status === 'EXPIRED' && !r.isRemoved && (
                      <button className="btn btn-sm btn-danger" onClick={() => markRemoved(r.key)}>
                        Mark as Removed
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [stores, setStores] = useState<any[]>([]);
  const [patientList, setPatientList] = useState<any[]>([]);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [isCredit, setIsCredit] = useState(false);

  useEffect(() => {
    Promise.all([api('/pharmacy/stores'), api('/patients?limit=500')])
      .then(([storeRes, patientRes]: any[]) => {
        const allStores = toList(storeRes);
        const filtered = allStores.filter((s: any) => s.location?.toLowerCase().includes('ground floor'));
        setStores(filtered.length > 0 ? filtered : allStores);
        if ((filtered.length > 0 ? filtered : allStores).length === 1) {
          setStoreId((filtered.length > 0 ? filtered : allStores)[0].id);
        }
        setPatientList(toList(patientRes));
      })
      .catch(() => {});
  }, []);

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
    setItems((prev) => prev.map((item) =>
      item.medicineId === medicineId
        ? { ...item, [field]: field === 'quantity' || field === 'unitPrice' ? Number(value) || 0 : value }
        : item
    ));
  }

  function removeItem(medicineId: string) {
    setItems((prev) => prev.filter((item) => item.medicineId !== medicineId));
  }

  const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const taxAmount = (subtotal * tax) / 100;
  const grandTotal = Math.max(0, subtotal + taxAmount - discount);

  async function submit() {
    if (items.length === 0 || (!patientId && !customerName.trim()) || !storeId) return;
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
          notes: 'Pharmacy walk-in sale',
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
                    onClick={() => { setIsWalkIn(false); setCustomerName(''); setCustomerPhone(''); }}
                  >
                    Hospital Patient
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${isWalkIn ? 'btn-primary' : ''}`}
                    onClick={() => { setIsWalkIn(true); setPatientId(''); }}
                  >
                    + New Walk-in Customer
                  </button>
                </div>
                {!isWalkIn ? (
                  <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                    <option value="">Select patient</option>
                    {patientList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}{p.mrn ? ` (${p.mrn})` : ''}{p.mobile ? ` - ${p.mobile}` : ''}
                      </option>
                    ))}
                  </select>
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
              <div className="field">
                <label className="label">Store *</label>
                <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                  <option value="">Select store</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.location})</option>)}
                </select>
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
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{med.name}</div>
                            {med.genericName && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{med.genericName}</div>}
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatMoney(med.salesRate)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Sale Items</div>
            {items.length === 0 && <div className="empty">No items added yet.</div>}
            {items.map((it) => (
              <div key={it.medicineId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{it.medicineName}</div>
                <input className="input" type="number" min={1} value={it.quantity} onChange={(e) => updateItem(it.medicineId, 'quantity', e.target.value)} style={{ width: 56, padding: '4px 6px' }} />
                <input className="input" type="number" min={0} value={it.unitPrice} onChange={(e) => updateItem(it.medicineId, 'unitPrice', e.target.value)} style={{ width: 80, padding: '4px 6px' }} />
                <span style={{ fontWeight: 600, fontSize: 13, minWidth: 70, textAlign: 'right' }}>{formatMoney(it.quantity * it.unitPrice)}</span>
                <button className="btn btn-sm btn-danger" onClick={() => removeItem(it.medicineId)}>x</button>
              </div>
            ))}
            {items.length > 0 && (
              <>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
                  <span>Subtotal</span><span>{formatMoney(subtotal)}</span>
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
                  disabled={submitting || items.length === 0 || (!patientId && !customerName.trim()) || !storeId}
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

function AlertsTab() {
  const [alerts, setAlerts] = useState<any>(null);
  const [expiryAlerts, setExpiryAlerts] = useState<any[]>([]);
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drug, setDrug] = useState(CONTROLLED_SUBSTANCES[0].name);
  const [qty, setQty] = useState(1);
  const [patient, setPatient] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api('/pharmacy/alerts')
      .then((alertRes: any) => {
        const data = alertRes?.data ?? alertRes;
        setAlerts(data);
        const expiring = toList(data?.nearExpiry)
          .filter((i: any) => {
            const days = daysUntil(i.expiryDate);
            return i.expiryDate && days !== null;
          })
          .sort((a: any, b: any) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
        setExpiryAlerts(expiring);
      })
      .catch(() => setAlerts(null))
      .finally(() => setLoading(false));
  }, []);

  const loadLog = useCallback(() => {
    api('/pharmacy/controlled-substances?limit=200')
      .then((res: any) => {
        setLog(toList(res).map((row: any) => ({
          id: row.id,
          drug: row.drug,
          quantity: Number(row.quantity),
          patient: row.patient,
          notes: row.notes,
          at: row.loggedAt,
          by: row.loggedBy,
        })));
      })
      .catch(() => setLog([]));
  }, []);

  useEffect(() => {
    load();
    loadLog();
  }, [load, loadLog]);

  async function addUsage() {
    if (qty <= 0) return;
    await api('/pharmacy/controlled-substances', {
      method: 'POST',
      body: JSON.stringify({ drug, quantity: qty, patient: patient.trim(), notes: notes.trim() }),
    });
    await loadLog();
    setQty(1);
    setPatient('');
    setNotes('');
  }

  async function deleteEntry(id: string) {
    await api(`/pharmacy/controlled-substances/${id}`, { method: 'DELETE' });
    await loadLog();
  }

  const lowStockCount = toList(alerts?.lowStock).length;
  const nearExpiryCount = expiryAlerts.length;
  const outOfStockCount = toList(alerts?.outOfStock).length;

  return (
    <>
      {loading ? (
        <div className="loading">Loading alerts...</div>
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-label">Low Stock</div>
              <div className="stat-value stat-red">{lowStockCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Near Expiry</div>
              <div className="stat-value stat-red">{nearExpiryCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Out of Stock</div>
              <div className="stat-value stat-red">{outOfStockCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Interaction Rules Loaded</div>
              <div className="stat-value stat-blue">{DRUG_INTERACTIONS.length}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <span className="card-title">Low Stock Alerts</span>
              <button className="btn btn-sm btn-secondary" onClick={load}>Refresh</button>
            </div>
            {!alerts?.lowStock || alerts.lowStock.length === 0 ? (
              <div className="empty">No low stock items.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Medicine</th><th>Store</th><th>Current Stock</th><th>Reorder Level</th></tr>
                  </thead>
                  <tbody>
                    {alerts.lowStock.map((item: any) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>{item.medicine?.name || item.name}</td>
                        <td>{item.store?.name || '—'}</td>
                        <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{item.currentStock}</td>
                        <td>{item.reorderLevel || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Expiry Alerts (within 60 days)</div>
            {expiryAlerts.length === 0 ? (
              <div className="empty">No items expiring within 60 days.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Medicine</th><th>Batch</th><th>Expiry Date</th><th>Days Left</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {expiryAlerts.map((item: any) => {
                      const days = daysUntil(item.expiryDate);
                      return (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 600 }}>{item.medicine?.name || item.name}</td>
                          <td className="mono">{item.batchNumber || '—'}</td>
                          <td>{formatDate(item.expiryDate)}</td>
                          <td style={{ color: days !== null && days <= 30 ? '#dc2626' : undefined, fontWeight: 700 }}>
                            {days === null ? '—' : `${days}d`}
                          </td>
                          <td><ExpiryBadge status={expiryStatus(days)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Drug Interaction Warnings</div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Drug Combination</th><th>Severity</th><th>Potential Effect</th><th>Recommended Action</th></tr>
                </thead>
                <tbody>
                  {DRUG_INTERACTIONS.map((i) => (
                    <tr key={i.drugs}>
                      <td style={{ fontWeight: 600 }}>{i.drugs}</td>
                      <td>
                        <span className={`badge ${i.severity === 'MAJOR' ? 'badge-red' : i.severity === 'MODERATE' ? 'badge-yellow' : 'badge-gray'}`}>
                          {i.severity}
                        </span>
                      </td>
                      <td>{i.effect}</td>
                      <td>{i.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">Controlled Substance Register</div>
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table className="table">
                <thead>
                  <tr><th>Substance</th><th>Common Form</th><th>Schedule</th></tr>
                </thead>
                <tbody>
                  {CONTROLLED_SUBSTANCES.map((c) => (
                    <tr key={c.name}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>{c.form}</td>
                      <td><span className="badge badge-red">{c.schedule}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card-title">Log Usage</div>
            <div className="form-grid" style={{ marginBottom: 16 }}>
              <div className="field">
                <label className="label">Substance</label>
                <select className="input" value={drug} onChange={(e) => setDrug(e.target.value)}>
                  {CONTROLLED_SUBSTANCES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Quantity Used</label>
                <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
              </div>
              <div className="field">
                <label className="label">Patient</label>
                <input className="input" value={patient} onChange={(e) => setPatient(e.target.value)} placeholder="Patient name or MRN" />
              </div>
              <div className="field">
                <label className="label">Notes</label>
                <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Prescription reference, administered by..." />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={addUsage}>Record Usage Entry</button>

            <div className="card-title">Usage Log</div>
            {log.length === 0 ? (
              <div className="empty">No controlled substance usage recorded yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Date</th><th>Substance</th><th>Quantity</th><th>Patient</th><th>Notes</th><th>Logged By</th><th></th></tr>
                  </thead>
                  <tbody>
                    {log.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDateTime(entry.at)}</td>
                        <td style={{ fontWeight: 600 }}>{entry.drug}</td>
                        <td>{entry.quantity}</td>
                        <td>{entry.patient || '—'}</td>
                        <td>{entry.notes || '—'}</td>
                        <td>{entry.by || '—'}</td>
                        <td>
                          <button className="btn btn-sm btn-danger" onClick={() => deleteEntry(entry.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {alerts?.outOfStock?.length > 0 && (
            <div className="card">
              <div className="card-title">Out of Stock Items</div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Medicine</th><th>Store</th><th>Batch</th></tr>
                  </thead>
                  <tbody>
                    {alerts.outOfStock.map((item: any) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>{item.medicine?.name || item.name}</td>
                        <td>{item.store?.name || '—'}</td>
                        <td className="mono">{item.batchNumber || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
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
          <p className="page-subtitle">Medicines, billing, stores, alerts and expiry management</p>
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
      {activeTab === 'alerts' && <AlertsTab />}
      {activeTab === 'expiry' && <ExpiryTab />}
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
