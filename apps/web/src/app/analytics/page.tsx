'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, safe, objOf, num } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/hooks';
import AnalyticsTrendChart from '@/components/analytics/AnalyticsTrendChart';

const RANGES: { days: number; label: string }[] = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
];

const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

function personName(p: any): string {
  if (!p) return '—';
  if (typeof p === 'string') return p;
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ') || p.name || '—';
}

function shortMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return String(Math.round(v));
}

function Delta({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span className={`analytic-delta ${up ? 'analytic-delta-up' : 'analytic-delta-down'}`}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  tone?: string;
  delta?: number;
  sub?: string;
}

function KpiCard({ label, value, tone = 'stat-blue', delta, sub }: KpiCardProps) {
  return (
    <div className="card stat-card">
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${tone}`}>
        {value}
        {delta !== undefined && <Delta value={delta} />}
      </p>
      {sub && <p className="stat-label" style={{ marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function BarRow({
  label,
  value,
  raw,
  max,
  share,
  color,
}: {
  label: string;
  value: string;
  raw: number;
  max: number;
  share?: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(100, (Math.abs(raw) / max) * 100) : 0;
  return (
    <div className="bar-row">
      <div className="bar-label">
        <span>{label}</span>
        <span className="bar-count">
          {value}
          {share !== undefined ? ` · ${Math.round(share)}%` : ''}
        </span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await safe(api(`/reports/analytics?days=${days}`));
    if (!res) {
      setError('Could not load analytics. Please try again.');
      setData(null);
    } else {
      setData(objOf(res));
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = data?.kpis || {};
  const trend = Array.isArray(data?.trend) ? data.trend : [];
  const revenueByType = Array.isArray(data?.revenueByType) ? data.revenueByType : [];
  const collectionByMethod = Array.isArray(data?.collectionByMethod) ? data.collectionByMethod : [];
  const aging = Array.isArray(data?.outstandingAging) ? data.outstandingAging : [];
  const topPayers = Array.isArray(data?.topPayers) ? data.topPayers : [];
  const byDepartment = Array.isArray(data?.revenueByDepartment) ? data.revenueByDepartment : [];
  const monthly = Array.isArray(data?.monthly) ? data.monthly : [];
  const insurance = data?.insurance || null;

  const typeMax = useMemo(() => Math.max(1, ...revenueByType.map((r: any) => num(r.amount))), [revenueByType]);
  const methodMax = useMemo(
    () => Math.max(1, ...collectionByMethod.map((r: any) => num(r.amount))),
    [collectionByMethod],
  );
  const deptMax = useMemo(() => Math.max(1, ...byDepartment.map((r: any) => num(r.amount))), [byDepartment]);
  const agingMax = useMemo(() => Math.max(1, ...aging.map((r: any) => num(r.amount))), [aging]);
  const providerMax = useMemo(
    () => Math.max(1, ...((insurance?.topProviders || []) as any[]).map((p) => num(p.claimed))),
    [insurance],
  );
  const monthlyMax = useMemo(
    () =>
      Math.max(
        1,
        ...monthly.map((m: any) => Math.max(num(m.revenue), num(m.collection))),
      ),
    [monthly],
  );

  const rangeLabel =
    data?.range?.from && data?.range?.to ? `${data.range.from} → ${data.range.to}` : '';

  function exportTrendCsv() {
    if (trend.length === 0) return;
    const header = ['Date', 'Revenue', 'Collections'];
    const rows = trend.map((t: any) => [t.date, num(t.revenue).toFixed(2), num(t.collection).toFixed(2)]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-collections-${data?.range?.from || days}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Analytics</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
            Revenue, collections, receivables and payer mix{rangeLabel ? ` · ${rangeLabel}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={exportTrendCsv} disabled={trend.length === 0}>
            Export CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="tabs">
        {RANGES.map((r) => (
          <button
            key={r.days}
            className={`tab ${days === r.days ? 'active' : ''}`}
            onClick={() => setDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && <div className="banner-danger">{error}</div>}

      {loading && !data ? (
        <div className="card"><div className="loading">Loading analytics…</div></div>
      ) : !data ? (
        <div className="empty">No analytics available.</div>
      ) : (
        <>
          <div className="stat-grid">
            <KpiCard
              label="Revenue"
              value={formatMoney(kpis.revenue)}
              tone="stat-blue"
              delta={num(kpis.revenueDelta)}
            />
            <KpiCard
              label="Collections"
              value={formatMoney(kpis.collections)}
              tone="stat-green"
              delta={num(kpis.collectionDelta)}
            />
            <KpiCard
              label="Net collections (after refunds)"
              value={formatMoney(kpis.netCollections)}
              tone="stat-green"
              sub={`Refunds ${formatMoney(kpis.refunds)}`}
            />
            <KpiCard
              label="Outstanding (period)"
              value={formatMoney(kpis.outstanding)}
              tone={num(kpis.outstanding) > 0 ? 'stat-red' : 'stat-green'}
              sub={`${num(kpis.pendingInvoices) + num(kpis.partialInvoices) + num(kpis.overdueInvoices)} open invoices`}
            />
            <KpiCard
              label="Collection rate"
              value={`${num(kpis.collectionRate).toFixed(1)}%`}
              tone={num(kpis.collectionRate) >= 80 ? 'stat-green' : 'stat-amber'}
              sub={`${num(kpis.invoices)} invoices · avg ${formatMoney(kpis.avgInvoice)}`}
            />
            <KpiCard
              label="Avg collection / day"
              value={formatMoney(kpis.avgDailyCollection)}
              tone="stat-purple"
              sub={`Avg revenue / day ${formatMoney(kpis.avgDailyRevenue)}`}
            />
          </div>

          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>Revenue vs collections</h4>
              <span className="note">
                Previous period revenue {formatMoney(kpis.prevRevenue)} · collections {formatMoney(kpis.prevCollections)}
              </span>
            </div>
            <AnalyticsTrendChart data={trend} height={280} />
          </div>

          <div className="dash-widget-grid">
            <div className="card" style={{ padding: 16 }}>
              <h4 style={{ marginTop: 0 }}>Revenue by type</h4>
              {revenueByType.length === 0 ? (
                <div className="empty">No revenue in this period</div>
              ) : (
                revenueByType.map((r: any, i: number) => (
                  <BarRow
                    key={r.type}
                    label={r.label}
                    value={formatMoney(r.amount)}
                    raw={num(r.amount)}
                    max={typeMax}
                    color={PALETTE[i % PALETTE.length]}
                  />
                ))
              )}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <h4 style={{ marginTop: 0 }}>Collections by method</h4>
              {collectionByMethod.length === 0 ? (
                <div className="empty">No collections in this period</div>
              ) : (
                collectionByMethod.map((r: any, i: number) => (
                  <BarRow
                    key={r.method}
                    label={r.label}
                    value={formatMoney(r.amount)}
                    raw={num(r.amount)}
                    max={methodMax}
                    share={num(r.share)}
                    color={PALETTE[i % PALETTE.length]}
                  />
                ))
              )}
            </div>
          </div>

          <div className="dash-widget-grid">
            <div className="card" style={{ padding: 16 }}>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>Outstanding aging</h4>
                <span className="note">
                  Total {formatMoney(aging.reduce((s: number, b: any) => s + num(b.amount), 0))}
                </span>
              </div>
              {aging.every((b: any) => num(b.amount) === 0) ? (
                <div className="empty">No outstanding invoices</div>
              ) : (
                aging.map((b: any) => (
                  <div className="bar-row" key={b.key}>
                    <div className="bar-label">
                      <span>{b.label}</span>
                      <span className="bar-count">
                        {formatMoney(b.amount)} · {num(b.count)}
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${(num(b.amount) / agingMax) * 100}%`, background: b.color || '#2563eb' }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <h4 style={{ marginTop: 0 }}>Revenue by department</h4>
              {byDepartment.length === 0 ? (
                <div className="empty">No departmental revenue in this period</div>
              ) : (
                byDepartment.map((r: any, i: number) => (
                  <BarRow
                    key={r.departmentId || i}
                    label={r.name}
                    value={formatMoney(r.amount)}
                    raw={num(r.amount)}
                    max={deptMax}
                    color={PALETTE[i % PALETTE.length]}
                  />
                ))
              )}
            </div>
          </div>

          <div className="dash-widget-grid">
            <div className="card" style={{ padding: 15 }}>
              <div className="row-between" style={{ padding: '0 0 10px' }}>
                <h4 style={{ margin: 0 }}>Top patients by billed amount</h4>
                <span className="note">{topPayers.length} shown</span>
              </div>
              {topPayers.length === 0 ? (
                <div className="empty">No patient revenue in this period</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>MRN</th>
                        <th>Billed</th>
                        <th>Collected</th>
                        <th>Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPayers.map((p: any) => (
                        <tr key={p.patientId}>
                          <td>{p.name}</td>
                          <td><span className="mono">{p.mrn || '—'}</span></td>
                          <td>{formatMoney(p.billed)}</td>
                          <td>{formatMoney(p.collected)}</td>
                          <td>
                            <span className={`badge badge-${num(p.outstanding) > 0 ? 'red' : 'green'}`}>
                              {formatMoney(p.outstanding)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 16 }}>
              <h4 style={{ marginTop: 0 }}>Insurance payer mix</h4>
              {!insurance || num(insurance.claimCount) === 0 ? (
                <div className="empty">No insurance claims recorded</div>
              ) : (
                <>
                  <div className="stat-grid" style={{ marginBottom: 16 }}>
                    <div className="stat-card">
                      <p className="stat-label">Claimed</p>
                      <p className="stat-value stat-blue" style={{ fontSize: 20 }}>{formatMoney(insurance.claimed)}</p>
                    </div>
                    <div className="stat-card">
                      <p className="stat-label">Approved</p>
                      <p className="stat-value stat-purple" style={{ fontSize: 20 }}>{formatMoney(insurance.approved)}</p>
                    </div>
                    <div className="stat-card">
                      <p className="stat-label">Received</p>
                      <p className="stat-value stat-green" style={{ fontSize: 20 }}>{formatMoney(insurance.received)}</p>
                    </div>
                    <div className="stat-card">
                      <p className="stat-label">Settlement rate</p>
                      <p className="stat-value stat-amber" style={{ fontSize: 20 }}>{num(insurance.settlementRate).toFixed(1)}%</p>
                    </div>
                  </div>
                  {(insurance.topProviders || []).length === 0 ? (
                    <div className="empty">No provider breakdown</div>
                  ) : (
                    (insurance.topProviders as any[]).map((p, i) => (
                      <BarRow
                        key={p.providerId || i}
                        label={p.name}
                        value={formatMoney(p.claimed)}
                        raw={num(p.claimed)}
                        max={providerMax}
                        color={PALETTE[i % PALETTE.length]}
                      />
                    ))
                  )}
                </>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 16, marginTop: 20 }}>
            <div className="row-between" style={{ marginBottom: 4 }}>
              <h4 style={{ margin: 0 }}>Monthly revenue vs collections</h4>
              <span className="note">
                <span className="analytic-chart-dot" style={{ background: '#2563eb', marginRight: 5, display: 'inline-block' }} />
                Revenue
                <span className="analytic-chart-dot" style={{ background: '#16a34a', margin: '0 5px 0 14px', display: 'inline-block' }} />
                Collections
              </span>
            </div>
            {monthly.length === 0 ? (
              <div className="empty">No monthly data</div>
            ) : (
              <div className="analytic-month-grid">
                {monthly.map((m: any) => (
                  <div className="analytic-month-col" key={m.key}>
                    <div className="analytic-month-values">
                      <div
                        className="analytic-month-bar"
                        title={`${m.label} revenue: ${formatMoney(m.revenue)}`}
                        style={{ height: `${Math.max(2, (num(m.revenue) / monthlyMax) * 100)}%`, background: '#2563eb' }}
                      />
                      <div
                        className="analytic-month-bar"
                        title={`${m.label} collections: ${formatMoney(m.collection)}`}
                        style={{ height: `${Math.max(2, (num(m.collection) / monthlyMax) * 100)}%`, background: '#16a34a' }}
                      />
                    </div>
                    <div className="analytic-month-label">{m.label}</div>
                    <div className="note" style={{ textAlign: 'center' }}>
                      {shortMoney(num(m.revenue))} / {shortMoney(num(m.collection))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="note" style={{ marginTop: 16 }}>
            Invoice status: {num(kpis.paidInvoices)} paid · {num(kpis.partialInvoices)} partial ·{' '}
            {num(kpis.pendingInvoices)} pending · {num(kpis.overdueInvoices)} overdue ·{' '}
            {num(kpis.cancelledInvoices)} cancelled. Generated {data?.range ? formatDate(data.range.to) : ''}.
          </p>
        </>
      )}
    </>
  );
}
