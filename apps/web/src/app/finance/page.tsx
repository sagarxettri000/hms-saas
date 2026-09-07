'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, unwrap, listOf, objOf, num, safe } from '@/lib/api';
import { formatMoney, formatDate, formatDateTime } from '@/lib/hooks';

type Tab = 'overview' | 'receivables' | 'revenue' | 'collections';

const UNPAID_STATUSES = ['PENDING', 'PARTIAL', 'OVERDUE'];
const DAY_MS = 86400000;

function personName(p: any): string {
  if (!p) return '—';
  if (typeof p === 'string') return p;
  const joined = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return joined || p.name || p.id || '—';
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

function ageInDays(v: any): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / DAY_MS));
}

function shortMoney(v: number): string {
  if (v >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toFixed(0);
}

const DEPARTMENT_LABELS: Record<string, string> = {
  OPD: 'Outpatient',
  SPECIAL_OPD: 'Special OPD',
  IPD: 'Inpatient',
  DISCHARGE: 'Admission / Discharge',
  EMERGENCY: 'Emergency',
  LAB: 'Laboratory',
  RADIOLOGY: 'Radiology',
  PHARMACY: 'Pharmacy',
  OT: 'Operation Theatre',
  PROCEDURE: 'Procedures',
  SERVICE: 'Services',
  AMBULANCE: 'Ambulance',
};

function departmentLabel(t: string): string {
  return DEPARTMENT_LABELS[t] || t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');
}

const REVENUE_GROUPS: { label: string; types: string[] }[] = [
  { label: 'Consultation', types: ['OPD', 'SPECIAL_OPD'] },
  { label: 'Lab', types: ['LAB'] },
  { label: 'Radiology', types: ['RADIOLOGY'] },
  { label: 'Pharmacy', types: ['PHARMACY'] },
  { label: 'Admission', types: ['IPD', 'DISCHARGE'] },
  { label: 'Surgery', types: ['OT', 'PROCEDURE'] },
];

const METHOD_GROUPS: { label: string; methods: string[] }[] = [
  { label: 'Cash', methods: ['CASH'] },
  { label: 'Card', methods: ['CARD'] },
  { label: 'Insurance', methods: ['INSURANCE'] },
  { label: 'Online', methods: ['ONLINE', 'BANK', 'WALLET'] },
];

interface Bucket {
  label: string;
  count: number;
  total: number;
  color: string;
}

function buildAgingBuckets(rows: any[]): Bucket[] {
  const buckets: Bucket[] = [
    { label: 'Current', count: 0, total: 0, color: '#16a34a' },
    { label: '1-30 days', count: 0, total: 0, color: '#2563eb' },
    { label: '31-60 days', count: 0, total: 0, color: '#d97706' },
    { label: '61-90 days', count: 0, total: 0, color: '#ea580c' },
    { label: '90+ days', count: 0, total: 0, color: '#dc2626' },
  ];
  for (const inv of rows) {
    const due = inv.dueDate || inv.issuedDate;
    const age = ageInDays(due);
    let idx = 0;
    if (age > 90) idx = 4;
    else if (age > 60) idx = 3;
    else if (age > 30) idx = 2;
    else if (age > 0) idx = 1;
    buckets[idx].count += 1;
    buckets[idx].total += num(inv.dueAmount || inv.totalAmount);
  }
  return buckets;
}

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<any>({});
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [writtenOff, setWrittenOff] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [analyticsR, invoicesR, paymentsR, refundsR, doctorsR, usersR] = await Promise.all([
      safe(api('/billing/analytics')),
      safe(api('/billing/invoices?limit=200')),
      safe(api('/billing/payments?limit=200')),
      safe(api('/billing/refunds?limit=100')),
      safe(api('/doctors?limit=500')),
      safe(api('/users?limit=500')),
    ]);
    setAnalytics(objOf(analyticsR));
    setInvoices(listOf(invoicesR));
    setPayments(listOf(paymentsR));
    setRefunds(listOf(refundsR));
    setDoctors(listOf(doctorsR));
    setUsers(listOf(usersR));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function sendReminder(inv: any) {
    window.alert(`Reminder sent to ${personName(inv.patient)} for ${inv.invoiceNumber || 'invoice'}`);
  }

  function writeOff(inv: any) {
    if (window.confirm(`Mark ${inv.invoiceNumber || 'this invoice'} (${formatMoney(inv.dueAmount || inv.totalAmount)}) as written off?`)) {
      setWrittenOff((w) => [...w, inv.id]);
      window.alert('Invoice marked as written off');
    }
  }

  const unpaidInvoices = invoices.filter(
    (i) => UNPAID_STATUSES.includes(i.status) && !writtenOff.includes(i.id),
  );
  const pendingTotal = unpaidInvoices.reduce((s, i) => s + num(i.dueAmount || i.totalAmount), 0);
  const monthRefunds = refunds.filter((r) => new Date(r.refundedAt || r.createdAt).getTime() >= startOfMonth().getTime());
  const monthRefundTotal = monthRefunds.reduce((s, r) => s + num(r.amount), 0);
  const todayStart = startOfToday().getTime();

  const deptRows = Object.entries(
    invoices.reduce((acc: Record<string, number>, inv) => {
      acc[inv.type] = (acc[inv.type] || 0) + num(inv.totalAmount);
      return acc;
    }, {}),
  )
    .map(([k, v]) => ({ label: departmentLabel(k), value: v }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const deptMax = Math.max(1, ...deptRows.map((r) => r.value));

  const months = (() => {
    const now = new Date();
    const out: { key: string; label: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      out.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleString(undefined, { month: 'short' }),
        revenue: invoices
          .filter((inv) => {
            const t = new Date(inv.issuedDate).getTime();
            return t >= d.getTime() && t < end.getTime();
          })
          .reduce((s, inv) => s + num(inv.totalAmount), 0),
      });
    }
    return out;
  })();
  const monthMax = Math.max(1, ...months.map((m) => m.revenue));

  const topUnpaid = [...unpaidInvoices]
    .sort((a, b) => num(b.dueAmount || b.totalAmount) - num(a.dueAmount || a.totalAmount))
    .slice(0, 5);

  const filteredReceivables = unpaidInvoices.filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      personName(i.patient).toLowerCase().includes(q) ||
      String(i.invoiceNumber || '').toLowerCase().includes(q)
    );
  });
  const agingBuckets = buildAgingBuckets(unpaidInvoices);

  const typeTotals = (() => {
    const byType: Record<string, number> = {};
    for (const inv of invoices) byType[inv.type] = (byType[inv.type] || 0) + num(inv.totalAmount);
    if (Object.keys(byType).length === 0 && analytics.today?.revenueByType) {
      return { ...analytics.today.revenueByType };
    }
    return byType;
  })();
  const revenueGroups = REVENUE_GROUPS.map((g) => ({
    label: g.label,
    value: g.types.reduce((s, t) => s + num(typeTotals[t]), 0),
  }));
  const groupMax = Math.max(1, ...revenueGroups.map((r) => r.value));
  const typeGrandTotal = revenueGroups.reduce((s, r) => s + r.value, 0);

  const methodTotals = METHOD_GROUPS.map((g) => ({
    label: g.label,
    value: payments
      .filter((p) => g.methods.includes(p.method))
      .reduce((s, p) => s + num(p.amount), 0),
  }));
  const methodMax = Math.max(1, ...methodTotals.map((r) => r.value));
  const methodGrandTotal = methodTotals.reduce((s, r) => s + r.value, 0);

  const doctorRows = (() => {
    const stats: Record<string, { revenue: number; patients: Set<string> }> = {};
    for (const inv of invoices) {
      for (const item of inv.items || []) {
        const did = item.doctorId;
        if (!did) continue;
        stats[did] = stats[did] || { revenue: 0, patients: new Set<string>() };
        stats[did].revenue += num(item.lineTotal);
        if (inv.patientId) stats[did].patients.add(inv.patientId);
      }
    }
    const incomeMap = analytics.doctorIncome || {};
    const ids = new Set([...Object.keys(stats), ...Object.keys(incomeMap)]);
    return Array.from(ids)
      .map((id) => {
        const doc = doctors.find((d) => d.id === id);
        const name = doc ? (doc.user ? personName(doc.user) : doc.name) || `Dr. ${id.slice(0, 6)}` : `Dr. ${id.slice(0, 6)}`;
        const specialty = doc?.specialization || doc?.department?.name || '';
        const patients = stats[id]?.patients.size || 0;
        const revenue = stats[id]?.revenue || num(incomeMap[id]);
        return {
          id,
          name,
          specialty,
          patients,
          revenue,
          avg: patients > 0 ? revenue / patients : revenue,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  })();

  const userMap: Record<string, string> = {};
  for (const u of users) userMap[u.id] = personName(u.user ?? u);

  const todayPayments = payments.filter((p) => new Date(p.paidAt).getTime() >= todayStart);
  const todayTotal = todayPayments.reduce((s, p) => s + num(p.amount), 0);

  const cashierRows = Object.entries(
    payments.reduce((acc: Record<string, { count: number; total: number }>, p) => {
      const who = p.receivedBy || 'system';
      acc[who] = acc[who] || { count: 0, total: 0 };
      acc[who].count += 1;
      acc[who].total += num(p.amount);
      return acc;
    }, {}),
  )
    .map(([id, v]) => ({ id, name: userMap[id] || `User ${id.slice(0, 8)}`, ...v }))
    .sort((a, b) => b.total - a.total);
  const cashierMax = Math.max(1, ...cashierRows.map((r) => r.total));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Finance</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>Revenue, receivables and collections</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="tabs">
        {(
          [
            ['overview', 'Overview'],
            ['receivables', 'Receivables'],
            ['revenue', 'Revenue'],
            ['collections', 'Collections'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading financial data…</div>
      ) : (
        <>
          {tab === 'overview' && (
            <>
              <div className="stat-grid">
                <div className="card stat-card">
                  <p className="stat-label">Total Revenue (Month)</p>
                  <p className="stat-value stat-green">{formatMoney(analytics.month?.revenue)}</p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Pending Payments</p>
                  <p className={`stat-value ${pendingTotal > 0 ? 'stat-red' : 'stat-green'}`}>{formatMoney(pendingTotal)}</p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Outstanding Invoices</p>
                  <p className={`stat-value ${unpaidInvoices.length > 0 ? 'stat-amber' : 'stat-green'}`}>{unpaidInvoices.length}</p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Refunds (Month)</p>
                  <p className="stat-value stat-purple">{formatMoney(monthRefundTotal)}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, marginTop: 20 }}>
                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Revenue by department</h4>
                  {deptRows.length === 0 ? (
                    <div className="empty">No revenue recorded yet</div>
                  ) : (
                    deptRows.slice(0, 8).map((r) => (
                      <div key={r.label} className="bar-row">
                        <div className="bar-label">
                          <span>{r.label}</span>
                          <span className="bar-count">{formatMoney(r.value)}</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill bar-blue" style={{ width: `${(r.value / deptMax) * 100}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Monthly revenue trend</h4>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 14, height: 200, paddingTop: 8 }}>
                    {months.map((m) => (
                      <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>{shortMoney(m.revenue)}</div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                          <div
                            title={`${m.label}: ${formatMoney(m.revenue)}`}
                            style={{
                              width: '100%',
                              height: `${Math.max(2, (m.revenue / monthMax) * 100)}%`,
                              background: 'var(--primary)',
                              borderRadius: '4px 4px 0 0',
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', marginTop: 6 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 0, marginTop: 20 }}>
                <div className="row-between" style={{ padding: '14px 16px 0' }}>
                  <h4 style={{ margin: 0 }}>Top 5 unpaid invoices</h4>
                </div>
                {topUnpaid.length === 0 ? (
                  <div className="empty">No outstanding invoices</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Patient</th>
                          <th>Invoice #</th>
                          <th>Amount Due</th>
                          <th>Issued</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topUnpaid.map((inv) => (
                          <tr key={inv.id}>
                            <td>{personName(inv.patient)}</td>
                            <td><span className="mono">{inv.invoiceNumber}</span></td>
                            <td>{formatMoney(inv.dueAmount || inv.totalAmount)}</td>
                            <td>{formatDate(inv.issuedDate)}</td>
                            <td>
                              <span className={`badge badge-${inv.status === 'OVERDUE' ? 'red' : inv.status === 'PARTIAL' ? 'yellow' : 'blue'}`}>
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'receivables' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                {agingBuckets.map((b) => (
                  <div key={b.label} className="card" style={{ padding: 14, borderTop: `3px solid ${b.color}` }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{b.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: b.color }}>{b.count}</div>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{formatMoney(b.total)}</div>
                  </div>
                ))}
              </div>

              <div className="toolbar" style={{ marginTop: 20 }}>
                <input
                  className="input search-input"
                  placeholder="Search by patient name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="note">{filteredReceivables.length} outstanding invoices · {formatMoney(filteredReceivables.reduce((s, i) => s + num(i.dueAmount || i.totalAmount), 0))}</span>
              </div>

              {filteredReceivables.length === 0 ? (
                <div className="empty">No outstanding invoices match your search</div>
              ) : (
                <div className="table-wrap card" style={{ padding: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Invoice #</th>
                        <th>Amount Due</th>
                        <th>Due Date</th>
                        <th>Age (days)</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReceivables.map((inv) => {
                        const due = inv.dueDate || inv.issuedDate;
                        const age = ageInDays(due);
                        return (
                          <tr key={inv.id}>
                            <td>{personName(inv.patient)}</td>
                            <td><span className="mono">{inv.invoiceNumber}</span></td>
                            <td>{formatMoney(inv.dueAmount || inv.totalAmount)}</td>
                            <td>{formatDate(due)}</td>
                            <td>{due ? age : '—'}</td>
                            <td>
                              <span className={`badge badge-${inv.status === 'OVERDUE' ? 'red' : inv.status === 'PARTIAL' ? 'yellow' : 'blue'}`}>
                                {inv.status}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-sm btn-secondary" onClick={() => sendReminder(inv)}>Send Reminder</button>
                                <button className="btn btn-sm btn-danger" onClick={() => writeOff(inv)}>Mark as Written Off</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'revenue' && (
            <>
              <div className="stat-grid">
                <div className="card stat-card">
                  <p className="stat-label">Revenue Today</p>
                  <p className="stat-value stat-blue">{formatMoney(analytics.today?.revenue)}</p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Revenue This Month</p>
                  <p className="stat-value stat-green">{formatMoney(analytics.month?.revenue)}</p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Collected Today</p>
                  <p className="stat-value stat-green">{formatMoney(analytics.today?.collection)}</p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Outstanding Today</p>
                  <p className="stat-value stat-red">{formatMoney(analytics.today?.outstanding)}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, marginTop: 20 }}>
                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Revenue breakdown by type</h4>
                  {revenueGroups.every((r) => r.value === 0) ? (
                    <div className="empty">No revenue recorded yet</div>
                  ) : (
                    revenueGroups.map((r) => (
                      <div key={r.label} className="bar-row">
                        <div className="bar-label">
                          <span>{r.label}</span>
                          <span className="bar-count">
                            {formatMoney(r.value)}
                            {typeGrandTotal > 0 && r.value > 0 ? ` · ${Math.round((r.value / typeGrandTotal) * 100)}%` : ''}
                          </span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill bar-blue" style={{ width: `${(r.value / groupMax) * 100}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Revenue by payment method</h4>
                  {methodGrandTotal === 0 ? (
                    <div className="empty">No collections recorded yet</div>
                  ) : (
                    methodTotals.map((r) => (
                      <div key={r.label} className="bar-row">
                        <div className="bar-label">
                          <span>{r.label}</span>
                          <span className="bar-count">
                            {formatMoney(r.value)}
                            {r.value > 0 ? ` · ${Math.round((r.value / methodGrandTotal) * 100)}%` : ''}
                          </span>
                        </div>
                        <div className="bar-track">
                          <div
                            className={`bar-fill ${r.label === 'Cash' ? 'bar-green' : r.label === 'Card' ? 'bar-blue' : r.label === 'Insurance' ? 'bar-purple' : 'bar-cyan'}`}
                            style={{ width: `${(r.value / methodMax) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card" style={{ padding: 0, marginTop: 20 }}>
                <div className="row-between" style={{ padding: '14px 16px 0' }}>
                  <h4 style={{ margin: 0 }}>Doctor-wise revenue</h4>
                  <span className="note">{doctorRows.length} doctors</span>
                </div>
                {doctorRows.length === 0 ? (
                  <div className="empty">No doctor revenue recorded</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Doctor Name</th>
                          <th>Patients</th>
                          <th>Revenue</th>
                          <th>Average per Patient</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doctorRows.slice(0, 15).map((d) => (
                          <tr key={d.id}>
                            <td>
                              {d.name}
                              {d.specialty ? <span className="note"> · {d.specialty}</span> : null}
                            </td>
                            <td>{d.patients}</td>
                            <td>{formatMoney(d.revenue)}</td>
                            <td>{formatMoney(d.avg)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'collections' && (
            <>
              <div className="stat-grid">
                <div className="card stat-card">
                  <p className="stat-label">Collected Today</p>
                  <p className="stat-value stat-green">{formatMoney(todayTotal)}</p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Payments Today</p>
                  <p className="stat-value stat-blue">{todayPayments.length}</p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Collections (All Shown)</p>
                  <p className="stat-value stat-purple">{formatMoney(payments.reduce((s, p) => s + num(p.amount), 0))}</p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Deposits Today</p>
                  <p className="stat-value stat-blue">{formatMoney(analytics.today?.deposits)}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, marginTop: 20 }}>
                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Collection by staff</h4>
                  {cashierRows.length === 0 ? (
                    <div className="empty">No collections recorded yet</div>
                  ) : (
                    cashierRows.slice(0, 8).map((c) => (
                      <div key={c.id} className="bar-row">
                        <div className="bar-label">
                          <span>{c.name}</span>
                          <span className="bar-count">{formatMoney(c.total)} · {c.count} payments</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill bar-green" style={{ width: `${(c.total / cashierMax) * 100}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Payment method breakdown</h4>
                  {methodGrandTotal === 0 ? (
                    <div className="empty">No collections recorded yet</div>
                  ) : (
                    methodTotals.map((r) => (
                      <div key={r.label} className="bar-row">
                        <div className="bar-label">
                          <span>{r.label}</span>
                          <span className="bar-count">
                            {formatMoney(r.value)}
                            {r.value > 0 ? ` · ${Math.round((r.value / methodGrandTotal) * 100)}%` : ''}
                          </span>
                        </div>
                        <div className="bar-track">
                          <div
                            className={`bar-fill ${r.label === 'Cash' ? 'bar-green' : r.label === 'Card' ? 'bar-blue' : r.label === 'Insurance' ? 'bar-purple' : 'bar-cyan'}`}
                            style={{ width: `${(r.value / methodMax) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card" style={{ padding: 0, marginTop: 20 }}>
                <div className="row-between" style={{ padding: '14px 16px 0' }}>
                  <h4 style={{ margin: 0 }}>Recent payments</h4>
                  <span className="note">{payments.length} records</span>
                </div>
                {payments.length === 0 ? (
                  <div className="empty">No payments recorded</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Patient</th>
                          <th>Amount</th>
                          <th>Method</th>
                          <th>Invoice #</th>
                          <th>Received By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.slice(0, 25).map((p) => (
                          <tr key={p.id}>
                            <td>{formatDateTime(p.paidAt)}</td>
                            <td>{personName(p.patient)}</td>
                            <td>{formatMoney(p.amount)}</td>
                            <td><span className="badge badge-blue">{p.method}</span></td>
                            <td><span className="mono">{p.invoice?.invoiceNumber || p.paymentNumber || '—'}</span></td>
                            <td>{p.receivedBy ? userMap[p.receivedBy] || `User ${p.receivedBy.slice(0, 8)}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}