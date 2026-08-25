'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { badgeTone, formatMoney, pick } from '@/lib/hooks';
import type { ApiResponse, Column, FormField, ListPayload, Row, Action } from '@/lib/types';
import PatientPrescriptions from '@/components/PatientPrescriptions';
import AsyncSearchSelect from '@/components/AsyncSearchSelect';

interface TabConfig {
  key: string;
  label: string;
  endpoint?: string;
  columns?: Column[];
  fields?: FormField[];
  createLabel?: string;
  createRoles?: string[];
  actions?: Action[];
  render?: () => React.ReactNode;
}

interface EntityPageProps {
  title: string;
  subtitle?: string;
  endpoint?: string;
  columns?: Column[];
  fields?: FormField[];
  createLabel?: string;
  createRoles?: string[];
  actions?: Action[];
  searchable?: boolean;
  tabs?: TabConfig[];
  extra?: (reload: () => void) => React.ReactNode;
  headerActions?: (reload: () => void) => React.ReactNode;
  detailHref?: (row: Row) => string | undefined;
  editable?: boolean;
  initialTab?: string;
  initialCreateValues?: Record<string, any>;
  autoOpenCreate?: boolean;
}

interface LoadedTab {
  rows: Row[];
  total: number;
  loading: boolean;
}

function LineItemsEditor({
  value,
  onChange,
}: {
  value: any[];
  onChange: (v: any[]) => void;
}) {
  const [rows, setRows] = useState<any[]>(() =>
    value.length ? value : [{ serviceName: '', quantity: 1, rate: 0 }],
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Row[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);

  function normalize(next: any[]) {
    return next
      .filter((r) => r.serviceName && String(r.serviceName).trim())
      .map((r) => ({
        serviceName: r.serviceName.trim(),
        serviceCode: r.serviceCode,
        serviceId: r.serviceId,
        quantity: Number(r.quantity) > 0 ? Number(r.quantity) : 1,
        rate: Number(r.rate) || 0,
      }));
  }

  const runSearch = useCallback(async (term: string) => {
    setSearching(true);
    try {
      const qs = new URLSearchParams({ limit: '8', isActive: 'true' });
      if (term.trim()) qs.set('search', term.trim());
      const res: ApiResponse<any> = await api(`/billing/services?${qs.toString()}`);
      const payload = res.data as any;
      const list = Array.isArray(payload) ? payload : payload.data ?? [];
      setResults(list);
      setShowResults(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const cancelled = { current: false };
    const id = setTimeout(() => {
      if (!query.trim() || cancelled.current) {
        setShowResults(false);
        return;
      }
      runSearch(query);
    }, 300);
    return () => {
      cancelled.current = true;
      clearTimeout(id);
    };
  }, [query, runSearch]);

  function update(index: number, patch: any) {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setRows(next);
    onChange(normalize(next));
  }

  function addRow() {
    setRows([...rows, { serviceName: '', quantity: 1, rate: 0 }]);
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index);
    const kept = next.length ? next : [{ serviceName: '', quantity: 1, rate: 0 }];
    setRows(kept);
    onChange(normalize(next));
  }

  function pickService(svc: Row) {
    const next = [
      ...rows.filter((r) => r.serviceName && String(r.serviceName).trim()),
      {
        serviceName: svc.name,
        serviceCode: svc.code,
        serviceId: svc.id,
        quantity: 1,
        rate: Number(svc.price) || 0,
      },
    ];
    setRows(next);
    onChange(normalize(next));
    setQuery('');
    setShowResults(false);
  }

  const subtotal = rows.reduce(
    (sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.rate) || 0),
    0,
  );

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            value={query}
            placeholder="Search services by name or code…"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => runSearch(query)}
            onBlur={() => setTimeout(() => setShowResults(false), 150)}
          />
          <span className="note" style={{ alignSelf: 'center' }}>
            {searching ? '…' : ''}
          </span>
        </div>
        {showResults && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 240, overflowY: 'auto', boxShadow: '0 6px 16px rgba(0,0,0,0.12)' }}>
            {results.length === 0 ? (
              <div className="note" style={{ padding: 10 }}>No services found.</div>
            ) : (
              results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickService(s)}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', gap: 10,
                    padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--border)',
                    background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: 14,
                  }}
                >
                  <span className="mono" style={{ color: 'var(--text-muted)' }}>{s.code}</span>
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span className="mono">{formatMoney(s.price)}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th style={{ width: 90 }}>Qty</th>
              <th style={{ width: 110 }}>Rate (NPR)</th>
              <th style={{ width: 110 }}>Amount</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="input"
                    value={r.serviceName}
                    placeholder="e.g. Consultation"
                    onChange={(e) => update(i, { serviceName: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={r.quantity}
                    onChange={(e) => update(i, { quantity: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={r.rate}
                    onChange={(e) => update(i, { rate: e.target.value })}
                  />
                </td>
                <td className="mono">
                  {formatMoney((Number(r.quantity) || 0) * (Number(r.rate) || 0))}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => removeRow(i)}
                    aria-label="Remove line"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addRow}>
          + Add line
        </button>
        <span className="note">Subtotal: {formatMoney(subtotal)}</span>
      </div>
    </div>
  );
}

function renderCell(column: Column, row: Row) {
  if (column.render) return column.render(row);
  const value = pick(row, column.key);
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    const s = JSON.stringify(value);
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
  }
  if (column.badge) {
    const tone =
      typeof column.badge === 'function' ? column.badge(value, row) : null;
    return <span className={`badge badge-${tone || badgeTone(value)}`}>{String(value)}</span>;
  }
  return String(value);
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: any;
  onChange: (v: any) => void;
}) {
  const common = { className: field.type === 'textarea' ? 'textarea' : 'input' };
  if (field.type === 'items') {
    return <LineItemsEditor value={Array.isArray(value) ? value : []} onChange={onChange} />;
  }
  if (field.type === 'select') {
    return (
      <select
        {...common}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      >
        <option value="">— Select —</option>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'searchSelect' && field.optionsFrom) {
    return (
      <AsyncSearchSelect
        endpoint={field.optionsFrom.endpoint}
        valueKey={field.optionsFrom.valueKey}
        labelKeys={field.optionsFrom.labelKeys}
        value={value ?? ''}
        onChange={onChange}
        placeholder={field.placeholder || 'Type to search...'}
        required={field.required}
      />
    );
  }
  if (field.type === 'textarea') {
    return (
      <textarea
        {...common}
        value={value ?? ''}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    );
  }
  if (field.type === 'date') {
    return (
      <input
        {...common}
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    );
  }
  if (field.type === 'number') {
    return (
      <input
        {...common}
        type="number"
        step="0.01"
        value={value ?? ''}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    );
  }
  if (field.type === 'json') {
    return (
      <textarea
        {...common}
        className="textarea textarea-mono"
        value={typeof value === 'string' ? value : value !== undefined ? JSON.stringify(value, null, 2) : ''}
        placeholder={field.placeholder || 'Enter data'}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    );
  }
  if (field.type === 'checkbox') {
    return (
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    );
  }
  return (
    <input
      {...common}
      type={
        field.type === 'password'
          ? 'password'
          : field.type === 'email'
          ? 'email'
          : field.type === 'url'
          ? 'url'
          : 'text'
      }
      value={value ?? ''}
      placeholder={field.placeholder}
      onChange={(e) => onChange(e.target.value)}
      required={field.required}
    />
  );
}

function CreateModal({
  fields,
  endpoint,
  initialValues,
  onClose,
  onCreated,
}: {
  fields: FormField[];
  endpoint: string;
  initialValues?: Record<string, any>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const f of fields) if (f.defaultValue !== undefined) init[f.name] = f.defaultValue;
    return { ...init, ...(initialValues || {}) };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraOptions, setExtraOptions] = useState<Record<string, FormField['options']>>({});

  useEffect(() => {
    let active = true;
    const dynamic = fields.filter((f) => f.optionsFrom);
    Promise.all(
      dynamic.map(async (f) => {
        const src = f.optionsFrom!;
        try {
          const res: ApiResponse<any> = await api(`${src.endpoint}?limit=500`);
          const payload = res.data as any;
          const list = Array.isArray(payload) ? payload : payload.data ?? [];
          const valueKey = src.valueKey || 'id';
          const labelKeys = src.labelKeys || ['name'];
          const options = list.map((row: Row) => ({
            value: row[valueKey],
            label: labelKeys
              .map((k) => k.split('.').reduce((o: any, p) => o?.[p], row))
              .filter((v) => v)
              .join(' ') || row.id,
          }));
          return { name: f.name, options };
        } catch {
          return { name: f.name, options: [] as FormField['options'] };
        }
      }),
    ).then((results) => {
      if (!active) return;
      const map: Record<string, FormField['options']> = {};
      for (const r of results) map[r.name] = r.options;
      setExtraOptions(map);
    });
    return () => {
      active = false;
    };
  }, [fields]);

  const resolvedFields = useMemo(
    () =>
      fields.map((f) =>
        f.optionsFrom ? { ...f, options: extraOptions[f.name] || [] } : f,
      ),
    [fields, extraOptions],
  );

  function set(name: string, value: any) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  function buildPayload() {
    const payload: Record<string, any> = {};
    for (const f of fields) {
      let value = values[f.name];
      if (value === '' || value === undefined || value === null) {
        if (f.required) {
          throw new Error(`${f.label} is required`);
        }
        continue;
      }
      if (f.type === 'number') value = Number(value);
      if (f.type === 'date') value = new Date(value).toISOString();
      if (f.type === 'items') {
        if (!Array.isArray(value) || value.length === 0) {
          if (f.required) throw new Error(`${f.label} is required`);
          continue;
        }
        payload[f.name] = value;
        continue;
      }
      if (f.type === 'json') {
        try {
          value = value.trim() ? JSON.parse(value) : undefined;
        } catch {
          value = value.trim() || undefined;
        }
        if (value === undefined) continue;
      }
      payload[f.name] = value;
    }
    return payload;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">New record</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {resolvedFields.map((field) => (
              <div key={field.name} className={`field ${field.full ? 'field-full' : ''}`}>
                <label className="label">
                  {field.label}
                  {field.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                </label>
                <FieldInput field={field} value={values[field.name]} onChange={(v) => set(field.name, v)} />
                {field.hint && <span className="note">{field.hint}</span>}
              </div>
            ))}
          </div>
          {values.patientId && <PatientPrescriptions patientId={values.patientId} />}
          {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditModal({
  fields,
  endpoint,
  row,
  onClose,
  onUpdated,
}: {
  fields: FormField[];
  endpoint: string;
  row: Row;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraOptions, setExtraOptions] = useState<Record<string, FormField['options']>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const res: ApiResponse<any> = await api(`${endpoint}/${row.id}`);
        const data = res.data;
        const init: Record<string, any> = {};
        for (const f of fields) {
          const val = pick(data, f.name);
          if (val !== undefined && val !== null) {
            if (f.type === 'date' && typeof val === 'string') {
              init[f.name] = val.slice(0, 10);
            } else {
              init[f.name] = val;
            }
          }
        }
        if (active) {
          setValues(init);
          setLoaded(true);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load record');
          setLoaded(true);
        }
      }
    }
    loadData();
    return () => { active = false; };
  }, [endpoint, row, fields]);

  useEffect(() => {
    let active = true;
    const dynamic = fields.filter((f) => f.optionsFrom);
    Promise.all(
      dynamic.map(async (f) => {
        const src = f.optionsFrom!;
        try {
          const res: ApiResponse<any> = await api(`${src.endpoint}?limit=500`);
          const payload = res.data as any;
          const list = Array.isArray(payload) ? payload : payload.data ?? [];
          const valueKey = src.valueKey || 'id';
          const labelKeys = src.labelKeys || ['name'];
          const options = list.map((r: Row) => ({
            value: r[valueKey],
            label: labelKeys.map((k) => k.split('.').reduce((o: any, p) => o?.[p], r)).filter((v) => v).join(' ') || r.id,
          }));
          return { name: f.name, options };
        } catch {
          return { name: f.name, options: [] as FormField['options'] };
        }
      }),
    ).then((results) => {
      if (!active) return;
      const map: Record<string, FormField['options']> = {};
      for (const r of results) map[r.name] = r.options;
      setExtraOptions(map);
    });
    return () => { active = false; };
  }, [fields]);

  const resolvedFields = useMemo(
    () =>
      fields.map((f) =>
        f.optionsFrom ? { ...f, options: extraOptions[f.name] || [] } : f,
      ),
    [fields, extraOptions],
  );

  function set(name: string, value: any) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  function buildPayload() {
    const payload: Record<string, any> = {};
    for (const f of fields) {
      let value = values[f.name];
      if (value === '' || value === undefined || value === null) {
        if (f.required) {
          throw new Error(`${f.label} is required`);
        }
        continue;
      }
      if (f.type === 'number') value = Number(value);
      if (f.type === 'date') value = new Date(value).toISOString();
      if (f.type === 'items') {
        if (!Array.isArray(value) || value.length === 0) {
          if (f.required) throw new Error(`${f.label} is required`);
          continue;
        }
        payload[f.name] = value;
        continue;
      }
      if (f.type === 'json') {
        try {
          value = value.trim() ? JSON.parse(value) : undefined;
        } catch {
          value = value.trim() || undefined;
        }
        if (value === undefined) continue;
      }
      payload[f.name] = value;
    }
    return payload;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      await api(`${endpoint}/${row.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="loading" style={{ padding: 24 }}>Loading record…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit record</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            {resolvedFields.map((field) => (
              <div key={field.name} className={`field ${field.full ? 'field-full' : ''}`}>
                <label className="label">
                  {field.label}
                  {field.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                </label>
                <FieldInput field={field} value={values[field.name]} onChange={(v) => set(field.name, v)} />
                {field.hint && <span className="note">{field.hint}</span>}
              </div>
            ))}
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Saving...' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DataTable({
  columns,
  rows,
  actions,
  loading,
  onRowClick,
}: {
  columns: Column[];
  rows: Row[];
  actions?: Action[];
  loading: boolean;
  onRowClick?: (row: Row) => void;
}) {
  if (loading) return <div className="loading">Loading…</div>;
  if (!rows.length) return <div className="empty">No records found.</div>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
            {actions?.length ? <th style={{ width: 1 }}>Actions</th> : null}
            {onRowClick ? <th style={{ width: 1 }}></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              className={onRowClick ? 'row-clickable' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key}>{renderCell(c, row)}</td>
              ))}
              {actions?.length ? (
                <td onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {actions
                      .filter((a) => !a.condition || a.condition(row))
                      .map((a) => (
                        <button
                          key={a.label}
                          className={`btn btn-sm btn-${a.tone || 'ghost'}`}
                          onClick={() => a.onClick(row)}
                        >
                          {a.label}
                        </button>
                      ))}
                  </div>
                </td>
              ) : null}
              {onRowClick ? (
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => onRowClick(row)}
                  >
                    View
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EntityPage(props: EntityPageProps) {
  const {
    title,
    subtitle,
    endpoint,
    columns,
    fields,
    createLabel,
    createRoles,
    actions,
    searchable,
    tabs,
    extra,
    headerActions,
    detailHref,
    initialTab,
    initialCreateValues,
    autoOpenCreate,
  } = props;

  const [activeTab, setActiveTab] = useState((initialTab || tabs?.[0]?.key) ?? '');
  useEffect(() => {
    if (autoOpenCreate && !showCreate && effectiveFields?.length) {
      const t = setTimeout(() => setShowCreate(true), 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [role, setRole] = useState('');
  useEffect(() => {
    setRole(localStorage.getItem('role') || '');
    const t = setTimeout(() => setRole(localStorage.getItem('role') || ''), 300);
    return () => clearTimeout(t);
  }, []);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [flash, setFlash] = useState<string | null>(null);
  const router = useRouter();

  const tabConfig: TabConfig | null =
    tabs && activeTab ? tabs.find((t) => t.key === activeTab) || tabs[0] : null;

  const effectiveEndpoint = tabConfig ? tabConfig.endpoint : endpoint ?? '';
  const effectiveColumns = tabConfig ? tabConfig.columns : columns ?? [];
  const effectiveFields = tabConfig ? tabConfig.fields : fields;
  const effectiveCreateLabel = tabConfig ? tabConfig.createLabel : createLabel;
  const effectiveCreateRoles = tabConfig ? tabConfig.createRoles : createRoles;
  const effectiveActions = tabConfig ? tabConfig.actions ?? actions : actions;
  const customRender = tabConfig?.render;

  const [table, setTable] = useState<LoadedTab>({ rows: [], total: 0, loading: true });

  const load = useCallback(async () => {
    if (customRender) {
      setTable({ rows: [], total: 0, loading: false });
      return;
    }
    setTable((t) => ({ ...t, loading: true }));
    try {
      const query = new URLSearchParams();
      query.set('page', String(page));
      query.set('limit', '15');
      if (search.trim()) query.set('search', search.trim());
      const res: ApiResponse<ListPayload> = await api(
        `${effectiveEndpoint}?${query.toString()}`,
      );
      const payload = res.data as any;
      setTable({
        rows: Array.isArray(payload) ? payload : payload.data ?? [],
        total: Array.isArray(payload) ? payload.length : payload.total ?? 0,
        loading: false,
      });
    } catch (err) {
      setTable({
        rows: [],
        total: 0,
        loading: false,
      });
      setFlash(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [effectiveEndpoint, page, search, customRender]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(table.total / 15)), [table.total]);

  function handleCreated() {
    setShowCreate(false);
    setFlash('Created successfully');
    load();
  }

  function handleEdit(row: Row) {
    setEditingRow(row);
    setShowEdit(true);
  }

  function handleUpdated() {
    setShowEdit(false);
    setEditingRow(null);
    setFlash('Updated successfully');
    load();
  }

  const canCreate = Boolean(effectiveFields?.length) && (!effectiveCreateRoles || effectiveCreateRoles.includes(role));
  const canEdit = Boolean(props.editable && effectiveFields?.length);
  const effectiveActionsWithEdit = useMemo(() => {
    if (!canEdit) return effectiveActions;
    const editAction: Action = {
      label: 'Edit',
      tone: 'ghost',
      onClick: handleEdit,
    };
    return effectiveActions ? [editAction, ...effectiveActions] : [editAction];
  }, [canEdit, effectiveActions, handleEdit]);

  const refreshableActions = useMemo(
    () =>
      effectiveActionsWithEdit?.map((a) => ({
        ...a,
        onClick: async (row: Row) => {
          try {
            await a.onClick(row);
          } finally {
            load();
          }
        },
      })),
    [effectiveActionsWithEdit, load],
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {canCreate && (
          <button className="btn" onClick={() => setShowCreate(true)}>
            + {effectiveCreateLabel || 'Create'}
          </button>
        )}
        {headerActions?.(load)}
      </div>

      {tabs?.length ? (
        <div className="tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`tab ${t.key === activeTab ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(t.key);
                setPage(1);
                setSearch('');
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {flash && <div className="alert alert-success">{flash}</div>}

      {customRender ? (
        customRender()
      ) : (
        <>
          <div className="toolbar">
            {searchable !== false && (
              <input
                className="input search-input"
                placeholder="Search…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            )}
          </div>

          <DataTable
            columns={effectiveColumns ?? []}
            rows={table.rows}
            actions={refreshableActions}
            loading={table.loading}
            onRowClick={
              detailHref
                ? (row) => {
                    const href = detailHref(row);
                    if (href) router.push(href);
                  }
                : undefined
            }
          />

          <div className="table-wrap" style={{ borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
            <div className="pagination">
              <span>
                {table.total} record{table.total === 1 ? '' : 's'}
              </span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span>
                  Page {page} / {totalPages}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {extra?.(load)}

      {showCreate && effectiveFields?.length ? (
        <CreateModal
          fields={effectiveFields}
          endpoint={effectiveEndpoint || ''}
          initialValues={initialCreateValues}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      ) : null}

      {showEdit && editingRow && effectiveFields?.length ? (
        <EditModal
          fields={effectiveFields}
          endpoint={effectiveEndpoint || ''}
          row={editingRow}
          onClose={() => { setShowEdit(false); setEditingRow(null); }}
          onUpdated={handleUpdated}
        />
      ) : null}
    </div>
  );
}
