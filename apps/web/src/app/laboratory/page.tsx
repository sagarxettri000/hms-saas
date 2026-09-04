'use client';

import { useState, useEffect } from 'react';
import { api, unwrap, listOf, objOf } from '@/lib/api';
import { formatDateTime } from '@/lib/hooks';
import { DOCTOR_REF, PATIENT_REF } from '@/lib/options';
import ModulePage from '@/components/ModulePage';

type Tab = 'orders' | 'tests' | 'summary' | 'samples' | 'tat';

interface LabSampleRow {
  key: string;
  sampleId: string;
  orderId: string;
  orderNumber?: string;
  patientName: string;
  testName: string;
  collectedAt: string | null;
  status: string;
  reason?: string;
}

const SAMPLES_KEY = 'lab_samples';
const TAB_LABELS: Record<Tab, string> = {
  orders: 'Orders',
  tests: 'Tests',
  summary: 'Summary',
  samples: 'Samples',
  tat: 'Turnaround',
};
const ORDER_TONES: Record<string, string> = {
  ORDERED: 'badge-blue',
  SAMPLE_COLLECTED: 'badge-yellow',
  RECEIVED: 'badge-cyan',
  PROCESSING: 'badge-yellow',
  RESULT_READY: 'badge-purple',
  VERIFIED: 'badge-green',
  APPROVED: 'badge-green',
  REPORTED: 'badge-gray',
  REJECTED: 'badge-red',
};
const SAMPLE_TONES: Record<string, string> = {
  COLLECTED: 'badge-yellow',
  IN_TRANSIT: 'badge-blue',
  RECEIVED: 'badge-green',
  REJECTED: 'badge-red',
};
const COMPLETED_STATUSES = ['RESULT_READY', 'VERIFIED', 'APPROVED', 'REPORTED'];

function patientName(p: any): string {
  if (!p) return '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.mrn || p.id || '—';
}

function doctorName(d: any): string {
  if (!d) return '—';
  if (d.user) return [d.user.firstName, d.user.lastName].filter(Boolean).join(' ') || '—';
  return d.name || '—';
}

function readSamples(): LabSampleRow[] {
  try {
    const raw = localStorage.getItem(SAMPLES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSamples(rows: LabSampleRow[]) {
  localStorage.setItem(SAMPLES_KEY, JSON.stringify(rows));
}

function hoursBetween(a: any, b: any): number | null {
  if (!a || !b) return null;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (isNaN(t1) || isNaN(t2)) return null;
  return Math.max(0, (t2 - t1) / 3600000);
}

function computeTatStats(rows: any[]) {
  const n = rows.length;
  const total = rows.reduce((s: number, o: any) => s + o.tatHours, 0);
  const overdue = rows.filter((o: any) => o.tatHours > 48);
  const avg = n ? total / n : 0;
  const onTimePct = n ? ((n - overdue.length) / n) * 100 : 100;
  return { n, avg, overdue, onTimePct };
}

function computeTatByTest(rows: any[]) {
  const agg = new Map<string, { sum: number; count: number }>();
  for (const o of rows) {
    const items = Array.isArray(o.items) && o.items.length ? o.items : [{ testName: 'General' }];
    for (const item of items) {
      const name = item.testName || 'General';
      const cur = agg.get(name) || { sum: 0, count: 0 };
      cur.sum += o.tatHours;
      cur.count += 1;
      agg.set(name, cur);
    }
  }
  const out = Array.from(agg.entries()).map(([name, v]) => ({
    name,
    avg: v.sum / v.count,
    count: v.count,
  }));
  out.sort((a, b) => b.avg - a.avg);
  return out.slice(0, 8);
}

function TabStrip({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="tabs" style={{ marginBottom: 0 }}>
      {(Object.keys(TAB_LABELS) as Tab[]).map((k) => (
        <button key={k} className={`tab ${active === k ? 'active' : ''}`} onClick={() => onChange(k)}>
          {TAB_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

function Barcode({ code }: { code: string }) {
  return (
    <div style={{ display: 'inline-block' }}>
      <div
        style={{
          height: 20,
          width: 96,
          borderRadius: 2,
          backgroundImage:
            'repeating-linear-gradient(90deg, var(--text) 0 2px, transparent 2px 4px, var(--text) 4px 7px, transparent 7px 8px, var(--text) 8px 9px, transparent 9px 12px)',
        }}
      />
      <div className="mono" style={{ fontSize: 10, letterSpacing: 2, marginTop: 2 }}>
        {code}
      </div>
    </div>
  );
}

export default function LaboratoryPage() {
  const [tab, setTab] = useState<Tab>('orders');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [samples, setSamples] = useState<LabSampleRow[]>([]);
  const [sampleQuery, setSampleQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [tatRows, setTatRows] = useState<any[]>([]);
  const [loadingTat, setLoadingTat] = useState(false);

  useEffect(() => {
    if (tab !== 'summary') return;
    setLoadingSummary(true);
    api('/lab/summary')
      .then((r: any) => setSummary(objOf(r)))
      .catch(() => setSummary({}))
      .finally(() => setLoadingSummary(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'tat') return;
    setLoadingTat(true);
    api('/lab/orders?limit=200')
      .then((r: any) => {
        const rows = listOf(r)
          .map((o: any) => {
            const resultAt =
              o.reportedAt || o.approvedAt || o.verifiedAt || o.processedAt || o.updatedAt;
            const tatHours = hoursBetween(o.orderedAt, resultAt);
            if (tatHours == null) return null;
            return { ...o, tatHours, resultAt };
          })
          .filter((o: any) => o && COMPLETED_STATUSES.includes(o.status));
        setTatRows(rows);
      })
      .catch(() => setTatRows([]))
      .finally(() => setLoadingTat(false));
  }, [tab]);

  useEffect(() => {
    if (tab !== 'samples') return;
    const stored = readSamples();
    setSamples(stored);
    if (stored.length === 0) syncSamples();
  }, [tab]);

  function syncSamples() {
    setSyncing(true);
    api('/lab/orders?limit=200')
      .then((r: any) => {
        const existing = new Map<string, LabSampleRow>();
        for (const s of readSamples()) existing.set(s.key, s);
        for (const o of listOf(r)) {
          const pName = patientName(o.patient);
          const tests = (o.items || [])
            .map((i: any) => i.testName)
            .filter(Boolean)
            .slice(0, 3)
            .join(', ');
          for (const s of o.samples || []) {
            const key = s.barcode || s.id;
            if (!key) continue;
            const prev = existing.get(key);
            existing.set(key, {
              key,
              sampleId: s.id,
              orderId: o.id,
              orderNumber: o.orderNumber,
              patientName: pName,
              testName: tests || 'Lab test',
              collectedAt: s.collectedAt || o.collectedAt || null,
              status: prev?.status || s.status || 'COLLECTED',
              reason: prev?.reason || s.rejectionReason,
            });
          }
        }
        const merged = Array.from(existing.values());
        saveSamples(merged);
        setSamples(merged);
      })
      .catch(() => {})
      .finally(() => setSyncing(false));
  }

  function advanceSample(key: string) {
    const next = samples.map((s) =>
      s.key === key ? { ...s, status: s.status === 'COLLECTED' ? 'IN_TRANSIT' : 'RECEIVED' } : s,
    );
    setSamples(next);
    saveSamples(next);
  }

  function rejectSampleByKey(key: string) {
    const reason = prompt(
      'Rejection reason (HEMOLYSIS, CLOTTED, INSUFFICIENT, WRONG_LABEL, WRONG_CONTAINER, BROKEN, OTHER):',
    );
    if (!reason) return;
    const target = samples.find((s) => s.key === key);
    if (target?.orderId && target.sampleId) {
      api(`/lab/orders/${target.orderId}/samples/${target.sampleId}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      }).catch(() => {});
    }
    const next = samples.map((s) => (s.key === key ? { ...s, status: 'REJECTED', reason } : s));
    setSamples(next);
    saveSamples(next);
  }

  useEffect(() => {
    if (!detailId) return;
    let active = true;
    setLoadingDetail(true);
    api(`/lab/orders/${detailId}`)
      .then((r: any) => { if (active) setDetail(unwrap(r)); })
      .catch(() => { if (active) setDetail(null); })
      .finally(() => { if (active) setLoadingDetail(false); });
    return () => { active = false; };
  }, [detailId]);

  function closeDetail() {
    setDetailId(null);
    setDetail(null);
  }

  function transitionStatus(orderId: string, status: string) {
    api(`/lab/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      .then(() => setDetailId(orderId))
      .catch(() => {});
  }

  function enterResult(orderId: string, itemId: string, data: any) {
    api(`/lab/orders/${orderId}/items/${itemId}/result`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
      .then(() => setDetailId(orderId))
      .catch(() => {});
  }

  function rejectSample(orderId: string, sampleId: string) {
    const reason = prompt(
      'Rejection reason (HEMOLYSIS, CLOTTED, INSUFFICIENT, WRONG_LABEL, WRONG_CONTAINER, BROKEN, OTHER):',
    );
    if (!reason) return;
    api(`/lab/orders/${orderId}/samples/${sampleId}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    })
      .then(() => setDetailId(orderId))
      .catch(() => {});
  }

  const visibleSamples = samples.filter((s) => {
    const q = sampleQuery.trim().toLowerCase();
    if (!q) return true;
    return [s.key, s.patientName, s.testName, s.orderNumber, s.status]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const sampleCounts = {
    COLLECTED: samples.filter((s) => s.status === 'COLLECTED').length,
    IN_TRANSIT: samples.filter((s) => s.status === 'IN_TRANSIT').length,
    RECEIVED: samples.filter((s) => s.status === 'RECEIVED').length,
    REJECTED: samples.filter((s) => s.status === 'REJECTED').length,
  };

  const tat = computeTatStats(tatRows);
  const tatByTest = computeTatByTest(tatRows);
  const tatMax = tatByTest.length ? Math.max(...tatByTest.map((t) => t.avg), 1) : 1;

  if (detailId) {
    if (loadingDetail)
      return (
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => setDetailId(null)} style={{ marginBottom: 12 }}>← Back to Laboratory Orders</button>
          <div className="loading">Loading order details...</div>
        </>
      );
    if (!detail)
      return (
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => setDetailId(null)} style={{ marginBottom: 12 }}>← Back to Laboratory Orders</button>
          <div className="banner-danger">Order not found</div>
        </>
      );

    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <div className="row-between">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-sm btn-ghost" onClick={closeDetail}>
                ← Back
              </button>
              <h1 className="page-title" style={{ margin: 0 }}>
                Order {detail.orderNumber}
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => window.open(`/api/v1/lab/orders/${detail.id}/pdf`, '_blank')}
              >
                Download PDF
              </button>
              <span className={`badge ${ORDER_TONES[detail.status] || 'badge-gray'}`}>
                {String(detail.status || '').replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          <p className="page-subtitle">
            {patientName(detail.patient)}
            {detail.patient?.mrn ? ` (${detail.patient.mrn})` : ''}
          </p>
        </div>

        <div className="detail-grid">
          <div className="card" style={{ padding: 16 }}>
            <div className="card-title">Patient Info</div>
            <div className="muted" style={{ fontSize: 13 }}>
              <div>Doctor: {doctorName(detail.doctor)}</div>
              <div>Ordered: {formatDateTime(detail.orderedAt)}</div>
              {detail.isStat && (
                <div style={{ color: 'var(--danger)', fontWeight: 600 }}>STAT ORDER</div>
              )}
              {detail.isEmergency && (
                <div style={{ color: 'var(--danger)', fontWeight: 600 }}>EMERGENCY</div>
              )}
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="card-title">Timeline</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {detail.collectedAt && <div>Collected: {formatDateTime(detail.collectedAt)}</div>}
              {detail.receivedAt && <div>Received: {formatDateTime(detail.receivedAt)}</div>}
              {detail.processedAt && <div>Processed: {formatDateTime(detail.processedAt)}</div>}
              {detail.verifiedAt && <div>Verified: {formatDateTime(detail.verifiedAt)}</div>}
              {detail.approvedAt && <div>Approved: {formatDateTime(detail.approvedAt)}</div>}
              {detail.reportedAt && <div>Reported: {formatDateTime(detail.reportedAt)}</div>}
            </div>
          </div>
        </div>

        {detail.clinicalNote && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div className="card-title">Clinical Note</div>
            <div style={{ fontSize: 13 }}>{detail.clinicalNote}</div>
          </div>
        )}

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>
              Test Results
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {detail.status === 'RESULT_READY' && (
                <button className="btn btn-sm" onClick={() => transitionStatus(detail.id, 'VERIFIED')}>
                  Verify
                </button>
              )}
              {detail.status === 'VERIFIED' && (
                <button className="btn btn-sm" onClick={() => transitionStatus(detail.id, 'APPROVED')}>
                  Approve
                </button>
              )}
              {detail.status === 'APPROVED' && (
                <button className="btn btn-sm" onClick={() => transitionStatus(detail.id, 'REPORTED')}>
                  Report
                </button>
              )}
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Result</th>
                  <th>Unit</th>
                  <th>Ref. Range</th>
                  <th>Flag</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((item: any) => {
                  const flag = item.isCritical
                    ? 'CRITICAL'
                    : item.isAbnormal
                      ? 'ABNORMAL'
                      : 'Normal';
                  const tone = item.isCritical
                    ? 'badge-red'
                    : item.isAbnormal
                      ? 'badge-yellow'
                      : 'badge-green';
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.testName}</td>
                      <td className="mono">{item.resultValue != null ? item.resultValue : item.result || '—'}</td>
                      <td>{item.unit || '—'}</td>
                      <td style={{ fontSize: 12 }}>{item.referenceRange || '—'}</td>
                      <td>
                        <span className={`badge ${tone}`}>{flag}</span>
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 150 }}>{item.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {detail.samples && detail.samples.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <div className="card-title">Specimens</div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Barcode</th>
                    <th>Collected</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.samples.map((s: any) => (
                    <tr key={s.id}>
                      <td>{s.specimenType}</td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {s.barcode || '—'}
                      </td>
                      <td style={{ fontSize: 12 }}>{formatDateTime(s.collectedAt)}</td>
                      <td>
                        <span className={`badge ${SAMPLE_TONES[s.status] || 'badge-gray'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td>
                        {s.status !== 'REJECTED' && (
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => rejectSample(detail.id, s.id)}
                          >
                            Reject
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  }

  if (tab === 'orders') {
    return (
      <ModulePage
        title="Laboratory Orders"
        subtitle="Manage lab orders and results"
        endpoint="/lab/orders"
        createLabel="New lab order"
        headerActions={() => <TabStrip active={tab} onChange={setTab} />}
        columns={[
          {
            key: 'orderNumber',
            label: 'Order no.',
            render: (r) => <span className="mono">{r.orderNumber}</span>,
          },
          { key: 'patient', label: 'Patient', render: (r) => patientName(r.patient) },
          { key: 'status', label: 'Status', badge: true },
          {
            key: 'isStat',
            label: 'STAT',
            render: (r) => (r.isStat ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Yes</span> : ''),
          },
          { key: 'orderedAt', label: 'Ordered', render: (r) => formatDateTime(r.orderedAt) },
        ]}
        fields={[
          { name: 'patientId', label: 'Patient', required: true, type: 'searchSelect', optionsFrom: PATIENT_REF },
          { name: 'doctorId', label: 'Doctor', type: 'select', optionsFrom: DOCTOR_REF },
          { name: 'isStat', label: 'STAT', type: 'checkbox' },
          { name: 'isEmergency', label: 'Emergency', type: 'checkbox' },
          { name: 'clinicalNote', label: 'Clinical notes', type: 'textarea', full: true },
          {
            name: 'items',
            label: 'Lab Tests',
            type: 'json',
            required: true,
            full: true,
            hint: '[{labTestId, testName, price}]',
          },
        ]}
        actions={[{ label: 'View', onClick: (r) => setDetailId(r.id) }]}
      />
    );
  }

  if (tab === 'tests') {
    return (
      <ModulePage
        title="Lab Test Catalog"
        subtitle="Manage available lab tests"
        endpoint="/lab/tests"
        createLabel="Add test"
        headerActions={() => <TabStrip active={tab} onChange={setTab} />}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'code', label: 'Code', render: (r) => <span className="mono">{r.code || '—'}</span> },
          { key: 'category', label: 'Category', badge: true },
          { key: 'specimenType', label: 'Specimen', render: (r) => r.specimenType || '—' },
          { key: 'unit', label: 'Unit', render: (r) => r.unit || '—' },
          { key: 'price', label: 'Price' },
          { key: 'status', label: 'Status', badge: true },
        ]}
        fields={[
          { name: 'name', label: 'Name', required: true },
          { name: 'code', label: 'Code' },
          { name: 'category', label: 'Category' },
          { name: 'specimenType', label: 'Specimen type' },
          { name: 'container', label: 'Container' },
          { name: 'unit', label: 'Unit' },
          { name: 'referenceRange', label: 'Reference range' },
          { name: 'price', label: 'Price', type: 'number' },
          { name: 'turnaroundTime', label: 'TAT (hours)', type: 'number' },
          { name: 'discipline', label: 'Discipline' },
        ]}
      />
    );
  }

  return (
    <>
      <TabStrip active={tab} onChange={setTab} />

      {tab === 'summary' && (
        <div>
          <h1 className="page-title">Lab Dashboard</h1>
          <p className="page-subtitle" style={{ marginBottom: 20 }}>
            Overview and statistics
          </p>
          {loadingSummary && <div className="loading">Loading summary...</div>}
          {!loadingSummary && (
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Total Tests</span>
                <span className="stat-value">{summary.totalTests ?? 0}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Total Orders</span>
                <span className="stat-value">{summary.totalOrders ?? 0}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Pending Orders</span>
                <span className="stat-value" style={{ color: 'var(--warning)' }}>
                  {summary.pendingOrders ?? 0}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Completed Today</span>
                <span className="stat-value" style={{ color: 'var(--success)' }}>
                  {summary.completedToday ?? 0}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Samples Collected</span>
                <span className="stat-value">{summary.sampleCollected ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'samples' && (
        <div>
          <div className="toolbar">
            <input
              className="input search-input"
              placeholder="Search samples..."
              value={sampleQuery}
              onChange={(e) => setSampleQuery(e.target.value)}
            />
            <button className="btn btn-sm" onClick={syncSamples} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Sync from orders'}
            </button>
          </div>

          <div className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Collected</span>
              <span className="stat-value" style={{ color: 'var(--warning)' }}>
                {sampleCounts.COLLECTED}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">In Transit</span>
              <span className="stat-value" style={{ color: 'var(--primary)' }}>
                {sampleCounts.IN_TRANSIT}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Received</span>
              <span className="stat-value" style={{ color: 'var(--success)' }}>
                {sampleCounts.RECEIVED}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Rejected</span>
              <span className="stat-value" style={{ color: 'var(--danger)' }}>
                {sampleCounts.REJECTED}
              </span>
            </div>
          </div>

          {visibleSamples.length === 0 ? (
            <div className="empty">
              No samples tracked yet. Use “Sync from orders” to import specimens from lab orders.
            </div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Sample ID</th>
                      <th>Patient</th>
                      <th>Test</th>
                      <th>Order</th>
                      <th>Collected At</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSamples.map((s) => (
                      <tr key={s.key}>
                        <td>
                          <Barcode code={s.key} />
                        </td>
                        <td>{s.patientName}</td>
                        <td style={{ fontSize: 13 }}>{s.testName}</td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {s.orderNumber || s.orderId?.slice(0, 8) || '—'}
                        </td>
                        <td style={{ fontSize: 12 }}>{s.collectedAt ? formatDateTime(s.collectedAt) : '—'}</td>
                        <td>
                          <span className={`badge ${SAMPLE_TONES[s.status] || 'badge-gray'}`}>
                            {s.status}
                          </span>
                          {s.reason && (
                            <div className="note" style={{ marginTop: 2 }}>
                              {s.reason}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {s.status === 'COLLECTED' && (
                              <button className="btn btn-sm btn-ghost" onClick={() => advanceSample(s.key)}>
                                Mark in transit
                              </button>
                            )}
                            {s.status === 'IN_TRANSIT' && (
                              <button className="btn btn-sm btn-ghost" onClick={() => advanceSample(s.key)}>
                                Mark received
                              </button>
                            )}
                            {s.status !== 'REJECTED' && (
                              <button
                                className="btn btn-sm btn-ghost"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => rejectSampleByKey(s.key)}
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'tat' && (
        <div>
          <h1 className="page-title">Turnaround Time</h1>
          <p className="page-subtitle" style={{ marginBottom: 20 }}>
            Time from order to result for completed lab orders
          </p>
          {loadingTat && <div className="loading">Calculating turnaround times...</div>}
          {!loadingTat && (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <span className="stat-label">Average TAT</span>
                  <span className="stat-value">{tat.n ? `${tat.avg.toFixed(1)}h` : '—'}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Completed Orders</span>
                  <span className="stat-value">{tat.n}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Overdue (&gt;48h)</span>
                  <span className="stat-value" style={{ color: tat.overdue.length ? 'var(--danger)' : 'var(--success)' }}>
                    {tat.overdue.length}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">On-time Rate</span>
                  <span className="stat-value">{tat.onTimePct.toFixed(0)}%</span>
                </div>
              </div>

              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="card-title">Average TAT by Test</div>
                {tatByTest.length === 0 && <div className="muted" style={{ fontSize: 13 }}>No completed orders.</div>}
                {tatByTest.map((t) => (
                  <div className="bar-row" key={t.name}>
                    <div className="bar-label">
                      <span>{t.name}</span>
                      <span className="bar-count">
                        {t.avg.toFixed(1)}h · {t.count} order{t.count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${t.avg > 48 ? 'bar-red' : 'bar-blue'}`}
                        style={{ width: `${Math.min(100, (t.avg / tatMax) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Patient</th>
                        <th>Tests</th>
                        <th>Ordered</th>
                        <th>Result Ready</th>
                        <th>TAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...tatRows]
                        .sort((a, b) => b.tatHours - a.tatHours)
                        .map((o) => (
                          <tr
                            key={o.id}
                            style={{
                              background: o.tatHours > 48 ? 'var(--danger-light)' : undefined,
                              color: o.tatHours > 48 ? 'var(--danger)' : undefined,
                            }}
                          >
                            <td className="mono" style={{ fontSize: 12 }}>
                              {o.orderNumber}
                            </td>
                            <td>{patientName(o.patient)}</td>
                            <td style={{ fontSize: 12 }}>
                              {(o.items || []).map((i: any) => i.testName).filter(Boolean).slice(0, 3).join(', ') || '—'}
                            </td>
                            <td style={{ fontSize: 12 }}>{formatDateTime(o.orderedAt)}</td>
                            <td style={{ fontSize: 12 }}>
                              {formatDateTime(o.reportedAt || o.approvedAt || o.verifiedAt || o.processedAt)}
                            </td>
                            <td style={{ fontWeight: 700 }}>{o.tatHours.toFixed(1)}h{o.tatHours > 48 ? ' ⚠' : ''}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}