'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatDateTime, formatDate } from '@/lib/hooks';
import { DOCTOR_REF, PATIENT_REF } from '@/lib/options';
import ModulePage from '@/components/ModulePage';

type Tab = 'orders' | 'tests' | 'summary';

export default function LaboratoryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const switchTab = (t: Tab) => {
    setActiveTab(t);
    setDetailId(null);
    setDetail(null);
  };

  const loadDetail = useCallback(async (id: string) => {
    setDetailId(id);
    setLoadingDetail(true);
    try {
      const r = await api(`/lab/orders/${id}`);
      setDetail(r?.data ?? r);
    } catch { setDetail(null); }
    setLoadingDetail(false);
  }, []);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const r = await api('/lab/summary');
      setSummary(r?.data ?? r);
    } catch { setSummary(null); }
    setLoadingSummary(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'summary') loadSummary();
  }, [activeTab, loadSummary]);

  const transitionStatus = async (orderId: string, status: string) => {
    try {
      await api(`/lab/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      loadDetail(orderId);
    } catch {}
  };

  const enterResult = async (orderId: string, itemId: string, data: any) => {
    try {
      await api(`/lab/orders/${orderId}/items/${itemId}/result`, { method: 'PATCH', body: JSON.stringify(data) });
      loadDetail(orderId);
    } catch {}
  };

  const rejectSample = async (orderId: string, sampleId: string) => {
    const reason = prompt('Rejection reason (HEMOLYSIS, CLOTTED, INSUFFICIENT, WRONG_LABEL, WRONG_CONTAINER, BROKEN, OTHER):');
    if (!reason) return;
    try {
      await api(`/lab/orders/${orderId}/samples/${sampleId}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) });
      loadDetail(orderId);
    } catch {}
  };

  if (activeTab === 'summary') {
    return (
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Lab Dashboard</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>Overview and statistics</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('tests')}>Tests</button>
            <button className="btn btn-sm btn-ghost" onClick={() => switchTab('orders')}>Orders</button>
            <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }}>Summary</button>
          </div>
        </div>

        {loadingSummary && <div className="loading">Loading summary...</div>}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Tests', value: summary.totalTests },
              { label: 'Total Orders', value: summary.totalOrders },
              { label: 'Pending Orders', value: summary.pendingOrders },
              { label: 'Completed Today', value: summary.completedToday },
              { label: 'Samples Collected', value: summary.sampleCollected },
            ].map((s) => (
              <div key={s.label} className="card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{s.value ?? 0}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (detailId) {
    if (loadingDetail) return <div className="loading">Loading order details...</div>;
    if (!detail) return <div className="error-msg">Order not found</div>;

    const statusTones: Record<string, string> = {
      ORDERED: 'var(--info)', SAMPLE_COLLECTED: 'var(--warning)', RECEIVED: 'var(--info)',
      PROCESSING: 'var(--warning)', RESULT_READY: 'var(--primary)', VERIFIED: 'var(--success)',
      APPROVED: 'var(--success)', REPORTED: 'var(--muted)', REJECTED: 'var(--danger)',
    };

    return (
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => { setDetailId(null); setDetail(null); }}>← Back</button>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Order {detail.orderNumber}</h1>
            </div>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13, marginLeft: 36 }}>
              {[detail.patient?.firstName, detail.patient?.lastName].filter(Boolean).join(' ')}
              {detail.patient?.mrn && ` (${detail.patient.mrn})`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => window.open(`/api/v1/lab/orders/${detail.id}/pdf`, '_blank')}>Download PDF</button>
            <span className="badge" style={{ background: statusTones[detail.status] || 'var(--muted)', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>
              {detail.status?.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Patient Info</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              <div>Doctor: {detail.doctor?.user ? [detail.doctor.user.firstName, detail.doctor.user.lastName].filter(Boolean).join(' ') : '—'}</div>
              <div>Ordered: {formatDateTime(detail.orderedAt)}</div>
              {detail.isStat && <div style={{ color: 'var(--danger)', fontWeight: 600 }}>STAT ORDER</div>}
              {detail.isEmergency && <div style={{ color: 'var(--danger)', fontWeight: 600 }}>EMERGENCY</div>}
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Timeline</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
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
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Clinical Note</div>
            <div style={{ fontSize: 13 }}>{detail.clinicalNote}</div>
          </div>
        )}

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>Test Results</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {detail.status === 'RESULT_READY' && (
                <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }} onClick={() => transitionStatus(detail.id, 'VERIFIED')}>Verify</button>
              )}
              {detail.status === 'VERIFIED' && (
                <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} onClick={() => transitionStatus(detail.id, 'APPROVED')}>Approve</button>
              )}
              {detail.status === 'APPROVED' && (
                <button className="btn btn-sm" style={{ background: 'var(--info)', color: '#fff' }} onClick={() => transitionStatus(detail.id, 'REPORTED')}>Report</button>
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
                  const flag = item.isCritical ? 'CRITICAL' : item.isAbnormal ? 'ABNORMAL' : 'Normal';
                  const flagColor = item.isCritical ? 'var(--danger)' : item.isAbnormal ? 'var(--warning)' : 'var(--success)';
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.testName}</td>
                      <td className="mono">{item.resultValue != null ? item.resultValue : item.result || '—'}</td>
                      <td>{item.unit || '—'}</td>
                      <td style={{ fontSize: 12 }}>{item.referenceRange || '—'}</td>
                      <td><span className="badge" style={{ background: flagColor, color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{flag}</span></td>
                      <td style={{ fontSize: 12, maxWidth: 150 }}>{item.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {detail.samples && detail.samples.length > 0 && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Specimens</div>
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
                      <td className="mono" style={{ fontSize: 12 }}>{s.barcode || '—'}</td>
                      <td style={{ fontSize: 12 }}>{formatDateTime(s.collectedAt)}</td>
                      <td><span className="badge" style={{ background: s.status === 'COLLECTED' ? 'var(--warning)' : s.status === 'REJECTED' ? 'var(--danger)' : 'var(--muted)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{s.status}</span></td>
                      <td>
                        {s.status !== 'REJECTED' && (
                          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => rejectSample(detail.id, s.id)}>Reject</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  const tabBtn = (key: Tab, label: string) => (
    <button className="btn btn-sm" style={{ background: activeTab === key ? 'var(--primary)' : 'var(--bg-secondary)', color: activeTab === key ? '#fff' : undefined }} onClick={() => switchTab(key)}>{label}</button>
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabBtn('orders', 'Orders')}
        {tabBtn('tests', 'Tests')}
        {tabBtn('summary', 'Summary')}
      </div>

      {activeTab === 'orders' && (
        <ModulePage
          title="Laboratory Orders"
          subtitle="Manage lab orders and results"
          endpoint="/lab/orders"
          createLabel="New lab order"
          columns={[
            { key: 'orderNumber', label: 'Order no.', render: (r) => <span className="mono">{r.orderNumber}</span> },
            { key: 'patient', label: 'Patient', render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId },
            { key: 'status', label: 'Status', badge: true },
            { key: 'isStat', label: 'STAT', render: (r) => (r.isStat ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Yes</span> : '') },
            { key: 'orderedAt', label: 'Ordered', render: (r) => formatDateTime(r.orderedAt) },
          ]}
          fields={[
            { name: 'patientId', label: 'Patient', required: true, type: 'select', optionsFrom: PATIENT_REF },
            { name: 'doctorId', label: 'Doctor', type: 'select', optionsFrom: DOCTOR_REF },
            { name: 'isStat', label: 'STAT', type: 'checkbox' },
            { name: 'isEmergency', label: 'Emergency', type: 'checkbox' },
            { name: 'clinicalNote', label: 'Clinical notes', type: 'textarea', full: true },
            { name: 'items', label: 'Lab Tests', type: 'json', required: true, full: true, hint: '[{labTestId, testName, price}]' },
          ]}
          actions={[
            { label: 'View', onClick: (r) => loadDetail(r.id) },
          ]}
        />
      )}

      {activeTab === 'tests' && (
        <ModulePage
          title="Lab Test Catalog"
          subtitle="Manage available lab tests"
          endpoint="/lab/tests"
          createLabel="Add test"
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
      )}
    </>
  );
}
