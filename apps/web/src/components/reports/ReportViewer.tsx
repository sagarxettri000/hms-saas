'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/hooks';
import ReportChart from './ReportChart';

interface Column {
  key: string;
  label: string;
  type: 'money' | 'number' | 'date' | 'string';
  align?: string;
  total?: boolean;
}

interface Card {
  label: string;
  value: string | number;
  tone?: string;
}

interface ChartSeries {
  key: string;
  label: string;
}

interface ChartDef {
  type: string;
  labelsKey: string;
  series: ChartSeries[];
}

interface ReportDef {
  id: string;
  number: string;
  name: string;
  category: string;
  description: string;
  filters: string[];
  columns: Column[];
  cards?: Card[];
  chart?: ChartDef | null;
  audience: string;
}

interface GeneratedReport {
  report: { id: string; number: string; name: string; category: string; description: string };
  meta: {
    generatedAt: string;
    filters: Record<string, string>;
    hospital: { name: string; address: string; city: string };
    user: string;
  };
  columns: Column[];
  rows: Record<string, any>[];
  totals: Record<string, number>;
  cards: Card[];
  chart: (ChartDef & { labels: string[]; seriesData: Record<string, number[]> }) | null;
  count: number;
}

interface FilterOption {
  value: string;
  label: string;
}

const OPTION_FILTERS = [
  'department',
  'doctor',
  'ward',
  'patient',
  'userId',
  'cashier',
  'branch',
  'service',
  'test',
  'account',
  'bed',
];

const AGE_GROUPS = ['0-5', '6-12', '13-18', '19-30', '31-45', '46-60', '61+'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MIN_DATE = '1900-01-01';
const MAX_DATE = '2100-12-31';

function localDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function getJson(path: string): Promise<any> {
  const r = await api(path);
  return r?.data?.data ?? r?.data ?? r;
}

function formatCell(value: any, type: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money') return formatMoney(value);
  if (type === 'number') {
    const n = Number(value);
    return isNaN(n) ? String(value) : n.toLocaleString();
  }
  if (type === 'date') return formatDate(value);
  return String(value);
}

function FilterControl({
  kind,
  value,
  options,
  onChange,
  inputId,
  min,
  max,
}: {
  kind: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  inputId: string;
  min?: string;
  max?: string;
}) {
  if (kind === 'fromDate' || kind === 'toDate') {
    return <input id={inputId} type="date" className="input" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} />;
  }
  if (kind === 'month') {
    return (
      <select id={inputId} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All months</option>
        {MONTHS.map((m, i) => (
          <option key={i} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
    );
  }
  if (kind === 'year') {
    const year = new Date().getFullYear();
    return (
      <select id={inputId} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All years</option>
        {Array.from({ length: 8 }, (_, i) => year - i).map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    );
  }
  if (kind === 'financialYear') {
    const year = new Date().getFullYear();
    return (
      <select id={inputId} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All financial years</option>
        {Array.from({ length: 6 }, (_, i) => year - 1 - i).map((y) => (
          <option key={y} value={`${y}/${y + 1}`}>
            {y}/{y + 1}
          </option>
        ))}
      </select>
    );
  }
  if (kind === 'gender') {
    return (
      <select id={inputId} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        <option value="MALE">Male</option>
        <option value="FEMALE">Female</option>
        <option value="OTHER">Other</option>
      </select>
    );
  }
  if (kind === 'ageGroup') {
    return (
      <select id={inputId} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {AGE_GROUPS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    );
  }
  if (OPTION_FILTERS.includes(kind)) {
    return (
      <select id={inputId} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (kind === 'paymentMode') {
    return (
      <select id={inputId} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        <option value="CASH">Cash</option>
        <option value="CARD">Card</option>
        <option value="MOBILE">Mobile</option>
        <option value="BANK_TRANSFER">Bank Transfer</option>
        <option value="INSURANCE">Insurance</option>
        <option value="CHEQUE">Cheque</option>
        <option value="OTHER">Other</option>
      </select>
    );
  }
  if (kind === 'search') {
    return (
      <input
        id={inputId}
        className="input"
        type="text"
        maxLength={100}
        placeholder="Search patient, UHID…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      id={inputId}
      className="input"
      type="text"
      maxLength={100}
      placeholder="Any"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function FilterLabel(kind: string): string {
  const labels: Record<string, string> = {
    fromDate: 'From date',
    toDate: 'To date',
    month: 'Month',
    year: 'Year',
    financialYear: 'Financial year',
    department: 'Department',
    doctor: 'Doctor',
    ward: 'Ward',
    patient: 'Patient',
    userId: 'User',
    cashier: 'Cashier',
    branch: 'Branch',
    service: 'Service',
    test: 'Test',
    account: 'Account',
    paymentMode: 'Payment mode',
    gender: 'Gender',
    ageGroup: 'Age group',
    type: 'Type',
    status: 'Status',
    bed: 'Bed',
    admissionType: 'Admission type',
    search: 'Search',
  };
  return labels[kind] || kind;
}

export default function ReportViewer({ reportId }: { reportId: string | null }) {
  const [def, setDef] = useState<ReportDef | null>(null);
  const [generated, setGenerated] = useState<GeneratedReport | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<Record<string, FilterOption[]>>({});
  const [loadingDef, setLoadingDef] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const reportIdRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reset = useCallback(() => {
    setGenerated(null);
    setError(null);
    setOptions({});
    setLoadingGenerate(false);
    setExporting(null);
  }, []);

  useEffect(() => {
    reset();
    reportIdRef.current = reportId;
    if (!reportId) {
      setDef(null);
      setFilters({});
      return;
    }
    let active = true;
    setLoadingDef(true);
    setError(null);
    getJson(`/reports/analysis/${reportId}`)
      .then((d: ReportDef) => {
        if (!active || !mountedRef.current) return;
        setDef(d);
        const next: Record<string, string> = {};
        for (const f of d.filters) {
          if (f === 'fromDate') next[f] = localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
          else if (f === 'toDate') next[f] = localDate(new Date());
          else next[f] = '';
        }
        setFilters(next);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load report definition');
      })
      .finally(() => {
        if (active) setLoadingDef(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  useEffect(() => {
    if (!def || !reportId) return;
    let active = true;
    const names = def.filters.filter((f) => OPTION_FILTERS.includes(f));
    Promise.all(
      names.map((name) =>
        getJson(`/reports/analysis/options?name=${name}`).catch(() => [] as FilterOption[]),
      ),
    ).then((all) => {
      if (!active || !mountedRef.current) return;
      const next: Record<string, FilterOption[]> = {};
      names.forEach((name, i) => {
        next[name] = all[i] || [];
      });
      setOptions(next);
    });
    return () => {
      active = false;
    };
  }, [def, reportId]);

  const setFilter = useCallback((kind: string, v: string) => {
    setFilters((prev) => ({ ...prev, [kind]: v }));
  }, []);

  const generate = useCallback(async () => {
    if (!reportId) return;
    const from = filters.fromDate;
    const to = filters.toDate;
    if (from && to && from > to) {
      setError('To date must be on or after From date');
      return;
    }
    if (from && (from < MIN_DATE || from > MAX_DATE)) {
      setError(`From date is out of range (${MIN_DATE} - ${MAX_DATE})`);
      return;
    }
    if (to && (to < MIN_DATE || to > MAX_DATE)) {
      setError(`To date is out of range (${MIN_DATE} - ${MAX_DATE})`);
      return;
    }
    const target = reportIdRef.current;
    setLoadingGenerate(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null && v !== '') body[k] = v;
      }
      const r = await api(`/reports/analysis/${reportId}/generate`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const g = r?.data?.data ?? r?.data ?? r;
      if (mountedRef.current && reportIdRef.current === target) {
        setGenerated(g as GeneratedReport);
      }
    } catch (err) {
      if (mountedRef.current && reportIdRef.current === target) {
        setError(err instanceof Error ? err.message : 'Failed to generate report');
      }
    } finally {
      if (mountedRef.current) setLoadingGenerate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, filters]);

  const exportTo = useCallback(
    async (format: string) => {
      if (!reportId || !generated) return;
      const target = reportIdRef.current;
      setExporting(format);
      setError(null);
      try {
        const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(filters)) {
          if (v !== undefined && v !== null && v !== '') qs.set(k, v);
        }
        const headers: Record<string, string> = { 'X-HMS-CSRF': '1' };
        if (tenantId) headers['X-Tenant-ID'] = tenantId;
      const res = await fetch(`${API_URL}/reports/analysis/${reportId}/export/${format}?${qs.toString()}`, {
        headers,
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const filename = res.headers.get('X-Report-Filename') || `${reportId}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (mountedRef.current && reportIdRef.current === target) {
        setError(err instanceof Error ? err.message : 'Export failed');
      }
    } finally {
      if (mountedRef.current) setExporting(null);
    }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportId, generated, filters],
  );

  const columns = useMemo(() => (generated && generated.columns.length ? generated.columns : def?.columns || []), [generated, def]);
  const rows = generated?.rows || [];

  if (!reportId) {
    return (
      <div className="card report-empty">
        <p>Select a report from the tree to generate it.</p>
      </div>
    );
  }

  if (loadingDef) {
    return <div className="card report-empty">Loading report definition…</div>;
  }

  return (
    <div className="report-viewer" aria-busy={loadingGenerate || !!exporting}>
      {error && (
        <div className="banner-danger" role="alert">
          {error}
        </div>
      )}

      <div className="report-toolbar no-print">
        <button className="btn btn-primary" onClick={generate} disabled={loadingGenerate || !!exporting}>
          {loadingGenerate ? 'Generating…' : 'Generate'}
        </button>
        {generated && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => window.print()} disabled={loadingGenerate || !!exporting}>
              Print
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportTo('pdf')} disabled={loadingGenerate || !!exporting}>
              {exporting === 'pdf' ? 'PDF…' : 'PDF'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportTo('xls')} disabled={loadingGenerate || !!exporting}>
              {exporting === 'xls' ? 'Excel…' : 'Excel'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportTo('csv')} disabled={loadingGenerate || !!exporting}>
              {exporting === 'csv' ? 'CSV…' : 'CSV'}
            </button>
          </>
        )}
      </div>

      <div className="report-print">
        {def && (
          <div className="page-header report-header">
            <div>
              <h1>
                {def.number} — {def.name}
              </h1>
              {def.description && <p>{def.description}</p>}
            </div>
          </div>
        )}

        {def && def.filters.length > 0 && (
          <div className="report-filters no-print">
            <div className="form-grid">
              {def.filters.map((kind) => (
                <div key={kind} className="field">
                  <label className="label" htmlFor={`report-filter-${kind}`}>
                    {FilterLabel(kind)}
                  </label>
                  <FilterControl
                    kind={kind}
                    value={filters[kind] || ''}
                    options={options[kind] || []}
                    onChange={(v) => setFilter(kind, v)}
                    inputId={`report-filter-${kind}`}
                    min={kind === 'toDate' ? filters.fromDate || MIN_DATE : MIN_DATE}
                    max={kind === 'fromDate' ? filters.toDate || MAX_DATE : MAX_DATE}
                  />
                </div>
              ))}
            </div>
            <div className="report-filter-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const cleared: Record<string, string> = {};
                  for (const k of def.filters) cleared[k] = '';
                  setFilters(cleared);
                  setGenerated(null);
                  setError(null);
                }}
              >
                Reset
              </button>
              <button className="btn btn-ghost btn-sm" onClick={generate} disabled={loadingGenerate || !!exporting}>
                Refresh
              </button>
            </div>
          </div>
        )}

        {!generated && !loadingGenerate && (
          <div className="card report-empty">
            <p>Set filters and click Generate to run this report.</p>
          </div>
        )}

        {generated && generated.meta && (
          <div className="report-meta">
            <span>{generated.meta.hospital.name}{generated.meta.hospital.city ? `, ${generated.meta.hospital.city}` : ''}</span>
            <span>
              {Object.entries(generated.meta.filters)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')}
            </span>
            <span>
              Generated {formatDateTime(generated.meta.generatedAt)} by {generated.meta.user || 'System'}
            </span>
          </div>
        )}

        {generated && generated.cards.length > 0 && (
          <div className="stats-grid report-cards">
            {generated.cards.map((c, i) => (
              <div key={i} className="card stat-card">
                <p className="muted">{c.label}</p>
                <p className="stat-value">{typeof c.value === 'number' ? c.value.toLocaleString() : c.value}</p>
              </div>
            ))}
          </div>
        )}

        {generated && generated.chart && generated.chart.series.length > 0 && (
          <div className="card report-chart-card">
            <ReportChart type={generated.chart.type} labels={generated.chart.labels} seriesData={generated.chart.seriesData} series={generated.chart.series} />
          </div>
        )}

        {generated && rows.length === 0 && !loadingGenerate ? (
          <div className="card report-empty">
            <p>No records found for the selected filters and period.</p>
            <p className="muted">Try widening the date range or clearing filters.</p>
          </div>
        ) : null}

        {generated && rows.length > 0 && (
          <div className="table-wrap table-responsive">
            <table className="table report-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                        {formatCell(r[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {generated.totals && Object.keys(generated.totals).length > 0 && (
                <tfoot>
                  <tr className="report-totals">
                    {columns.map((c) => {
                      const t = generated.totals ? generated.totals[c.key] : undefined;
                      return (
                        <td key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                          {c.total && t !== undefined ? formatCell(t, c.type) : ''}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {generated && (
          <div className="report-count muted" role="status">
            {generated.count} record{generated.count === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}
