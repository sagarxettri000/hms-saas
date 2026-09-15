'use client';

import { useState, useEffect } from 'react';
import { api, unwrap } from '@/lib/api';
import { formatDateTime } from '@/lib/hooks';
import { useAuth } from '@/lib/hooks';
import { DOCTOR_REF, PATIENT_REF } from '@/lib/options';
import ModulePage from '@/components/ModulePage';

const PERFORMERS = [
  'LAB_TECHNICIAN',
  'PATHOLOGIST',
  'RADIOLOGIST',
  'HOSPITAL_ADMIN',
  'HOSPITAL_OWNER',
  'PLATFORM_SUPER_ADMIN',
];
const IMMUTABLE = ['VERIFIED', 'APPROVED', 'REPORTED'];

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

function patientName(p: any): string {
  if (!p) return 'â€”';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.mrn || p.id || 'â€”';
}

function flagOf(item: any): { label: string; tone: string } {
  if (item.status !== 'RESULT_ENTERED') return { label: 'Pending', tone: 'badge-gray' };
  if (item.isCritical) return { label: 'CRITICAL', tone: 'badge-red' };
  if (item.isAbnormal) return { label: 'ABNORMAL', tone: 'badge-yellow' };
  return { label: 'Normal', tone: 'badge-green' };
}

export default function HematologyPage() {
  const role = useAuth();
  const canPerform = Boolean(role && PERFORMERS.includes(role));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detailId) return;
    let active = true;
    setLoadingDetail(true);
    api(`/hematology/orders/${detailId}`)
      .then((r: any) => {
        if (!active) return;
        setDetail(unwrap(r));
        const d: Record<string, string> = {};
        for (const it of unwrap(r)?.items || []) {
          d[it.id] = it.resultValue != null ? String(it.resultValue) : '';
        }
        setDrafts(d);
      })
      .catch(() => {
        if (active) setDetail(null);
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });
    return () => {
      active = false;
    };
  }, [detailId]);

  function closeDetail() {
    setDetailId(null);
    setDetail(null);
    setSavedAt(null);
    setError(null);
  }

  function enterResult(itemId: string) {
    const value = drafts[itemId];
    if (value === undefined || value === '') {
      setError('Enter a numeric result value first.');
      return;
    }
    setSaving(itemId);
    setError(null);
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setError('Result must be a number.');
      setSaving(null);
      return;
    }
    api(`/hematology/orders/${detail.id}/items/${itemId}/result`, {
      method: 'PATCH',
      body: JSON.stringify({ resultValue: n }),
    })
      .then(() => {
        setSavedAt(new Date().toISOString());
        setDetailId(detail.id);
      })
      .catch((err: any) => setError(err?.message || 'Failed to save result'))
      .finally(() => setSaving(null));
  }

  function advance(status: string) {
    api(`/hematology/orders/${detail.id}/${status.toLowerCase()}`, { method: 'POST' })
      .then(() => {
        setSavedAt(new Date().toISOString());
        setDetailId(detail.id);
      })
      .catch((err: any) => setError(err?.message || `Failed to ${status.toLowerCase()}`));
  }

  if (detailId) {
    if (loadingDetail)
      return (
        <>
          <button className="btn btn-secondary btn-sm" onClick={closeDetail} style={{ marginBottom: 12 }}>
            â† Back to Hematology Orders
          </button>
          <div className="loading">Loading order details...</div>
        </>
      );
    if (!detail)
      return (
        <>
          <button className="btn btn-secondary btn-sm" onClick={closeDetail} style={{ marginBottom: 12 }}>
            â† Back to Hematology Orders
          </button>
          <div className="banner-danger">Order not found</div>
        </>
      );

    const flagsReady = (detail.items || []).every((i: any) => i.status === 'RESULT_ENTERED');

    return (
      <>
        <div style={{ marginBottom: 16 }}>
          <div className="row-between">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-sm btn-ghost" onClick={closeDetail}>
                â† Back
              </button>
              <h1 className="page-title" style={{ margin: 0 }}>
                Order {detail.orderNumber}
              </h1>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => window.open(`/api/v1/hematology/orders/${detail.id}/pdf`, '_blank')}
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

        {error && (
          <div className="banner-danger" style={{ marginBottom: 12 }} role="alert">
            {error}
          </div>
        )}
        {savedAt && (
          <div className="note" style={{ marginBottom: 12, color: "var(--success)" }}>Saved {formatDateTime(savedAt)}.
          </div>
        )}

        <div className="detail-grid">
          <div className="card" style={{ padding: 16 }}>
            <div className="card-title">Patient Info</div>
            <div className="muted" style={{ fontSize: 13 }}>
              <div>MRN: {detail.patient?.mrn || 'â€”'}</div>
              {detail.patient?.gender && <div>Gender: {detail.patient.gender}</div>}
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
              CBC Results
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {detail.status === 'RESULT_READY' && flagsReady && canPerform && (
                <button className="btn btn-sm" onClick={() => advance('verify')}>
                  Verify
                </button>
              )}
              {detail.status === 'VERIFIED' && canPerform && (
                <button className="btn btn-sm" onClick={() => advance('approve')}>
                  Approve
                </button>
              )}
              {detail.status === 'APPROVED' && canPerform && (
                <button className="btn btn-sm" onClick={() => advance('report')}>
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
                  <th>Reference Range</th>
                  <th>Flag</th>
                  <th>Method</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((item: any) => {
                  const flag = flagOf(item);
                  const editable =
                    canPerform && item.status !== 'RESULT_ENTERED' && !IMMUTABLE.includes(detail.status);
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.testName}</td>
                      <td>
                        {editable ? (
                          <input
                            className="input"
                            style={{ width: 110, padding: '4px 8px' }}
                            type="number"
                            step="any"
                            value={drafts[item.id] ?? ''}
                            placeholder="pend"
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [item.id]: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="mono">
                            {item.resultValue != null ? item.resultValue : item.result || 'â€”'}
                          </span>
                        )}
                      </td>
                      <td>{item.unit || 'â€”'}</td>
                      <td style={{ fontSize: 12 }}>
                        {item.rangeLabel ? `${item.rangeLabel}: ` : ''}
                        {item.referenceRange || 'â€”'}
                      </td>
                      <td>
                        <span className={`badge ${flag.tone}`}>{flag.label}</span>
                      </td>
                      <td style={{ fontSize: 12 }}>{item.method || 'â€”'}</td>
                      <td>
                        {editable && (
                          <button
                            className="btn btn-sm"
                            disabled={saving === item.id}
                            onClick={() => enterResult(item.id)}
                          >
                            {saving === item.id ? 'Saving...' : 'Enter result'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {detail.items && detail.items.length > 0 && (
          <div className="note" style={{ marginBottom: 16 }}>
            {IMMUTABLE.includes(detail.status)
              ? 'Results are finalized for this order and cannot be edited.'
              : 'Reference ranges are adult population references for flagging only; they are not a diagnosis.'}
          </div>
        )}
      </>
    );
  }

  return (
    <ModulePage
      title="Hematology (CBC)"
      subtitle="Complete blood count orders, results and reports"
      endpoint="/hematology/orders"
      createLabel="Order CBC"
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
      ]}
      actions={[{ label: 'View', onClick: (r) => setDetailId(r.id) }]}
    />
  );
}
