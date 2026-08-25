'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/hooks';
import { DOCTOR_REF, PATIENT_REF } from '@/lib/options';
import ModulePage from '@/components/ModulePage';

type Tab = 'orders' | 'worklist' | 'summary';

const MODALITIES = ['XRAY', 'CT', 'MRI', 'ULTRASOUND', 'ECG', 'ECHO', 'OTHERS'];
const STATUS_COLORS: Record<string, string> = {
  ORDERED: 'var(--info)', SCHEDULED: 'var(--warning)', IN_PROGRESS: 'var(--primary)',
  IMAGES_UPLOADED: 'var(--info)', REPORTED: 'var(--success)', VERIFIED: 'var(--success)',
  APPROVED: 'var(--success)', DELIVERED: 'var(--muted)', REJECTED: 'var(--danger)',
};

export default function RadiologyPage() {
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [reportFields, setReportFields] = useState({ findings: '', impression: '', report: '' });

  const switchTab = (t: Tab) => { setActiveTab(t); setDetailId(null); setDetail(null); };

  const loadDetail = useCallback(async (id: string) => {
    setDetailId(id);
    setLoadingDetail(true);
    try {
      const r = await api(`/radiology/orders/${id}`);
      const d = r?.data ?? r;
      setDetail(d);
      setReportFields({ findings: d.findings || '', impression: d.impression || '', report: d.report || '' });
    } catch { setDetail(null); }
    setLoadingDetail(false);
  }, []);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try { const r = await api('/radiology/summary'); setSummary(r?.data ?? r); } catch { setSummary(null); }
    setLoadingSummary(false);
  }, []);

  useEffect(() => { if (activeTab === 'summary') loadSummary(); }, [activeTab, loadSummary]);

  const transitionStatus = async (orderId: string, status: string) => {
    try { await api(`/radiology/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); loadDetail(orderId); } catch {}
  };

  const submitReport = async (orderId: string) => {
    try { await api(`/radiology/orders/${orderId}/report`, { method: 'PATCH', body: JSON.stringify(reportFields) }); loadDetail(orderId); } catch {}
  };

  const tabBtn = (key: Tab, label: string) => (
    <button className="btn btn-sm" style={{ background: activeTab === key ? 'var(--primary)' : 'var(--bg-secondary)', color: activeTab === key ? '#fff' : undefined }} onClick={() => switchTab(key)}>{label}</button>
  );

  if (activeTab === 'summary') {
    return (
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Radiology Dashboard</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>Department overview</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tabBtn('orders', 'Orders')}
            {tabBtn('worklist', 'Worklist')}
            {tabBtn('summary', 'Summary')}
          </div>
        </div>
        {loadingSummary && <div className="loading">Loading...</div>}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Orders', value: summary.totalOrders },
              { label: 'New Orders', value: summary.newOrders },
              { label: 'In Progress', value: summary.inProgress },
              { label: 'Reported', value: summary.reported },
              { label: 'Completed Today', value: summary.completedToday },
              { label: 'Total Images', value: summary.totalImages },
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
    if (loadingDetail) return <div className="loading">Loading order...</div>;
    if (!detail) return <div className="error-msg">Order not found</div>;

    return (
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => { setDetailId(null); setDetail(null); }}>← Back</button>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Order {detail.orderNumber}</h1>
            </div>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13, marginLeft: 36 }}>
              {[detail.patient?.firstName, detail.patient?.lastName].filter(Boolean).join(' ')} — {detail.modality}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-sm btn-ghost" onClick={() => window.open(`/api/v1/radiology/orders/${detail.id}/pdf`, '_blank')}>Download PDF</button>
            <span className="badge" style={{ background: STATUS_COLORS[detail.status] || 'var(--muted)', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>{detail.status?.replace(/_/g, ' ')}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Order Info</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              <div>Patient: {[detail.patient?.firstName, detail.patient?.lastName].filter(Boolean).join(' ')} ({detail.patient?.mrn})</div>
              <div>Modality: {detail.modality}</div>
              {detail.bodyPart && <div>Body Part: {detail.bodyPart}</div>}
              {detail.isEmergency && <div style={{ color: 'var(--danger)', fontWeight: 600 }}>EMERGENCY</div>}
              <div>Ordered: {formatDateTime(detail.orderedAt)}</div>
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Timeline</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {detail.scheduledAt && <div>Scheduled: {formatDateTime(detail.scheduledAt)}</div>}
              {detail.performedAt && <div>Performed: {formatDateTime(detail.performedAt)}</div>}
              {detail.reportedAt && <div>Reported: {formatDateTime(detail.reportedAt)}</div>}
              {detail.verifiedAt && <div>Verified: {formatDateTime(detail.verifiedAt)}</div>}
              {detail.approvedAt && <div>Approved: {formatDateTime(detail.approvedAt)}</div>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {detail.status === 'ORDERED' && <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff' }} onClick={() => transitionStatus(detail.id, 'SCHEDULED')}>Schedule</button>}
          {(detail.status === 'ORDERED' || detail.status === 'SCHEDULED') && <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }} onClick={() => transitionStatus(detail.id, 'IN_PROGRESS')}>Start</button>}
          {detail.status === 'IN_PROGRESS' && <button className="btn btn-sm" style={{ background: 'var(--info)', color: '#fff' }} onClick={() => transitionStatus(detail.id, 'IMAGES_UPLOADED')}>Images Uploaded</button>}
          {detail.status === 'IMAGES_UPLOADED' && <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} onClick={() => transitionStatus(detail.id, 'REPORTED')}>Submit Report</button>}
          {detail.status === 'REPORTED' && <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} onClick={() => transitionStatus(detail.id, 'VERIFIED')}>Verify</button>}
          {detail.status === 'VERIFIED' && <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} onClick={() => transitionStatus(detail.id, 'APPROVED')}>Approve</button>}
          {detail.status === 'APPROVED' && <button className="btn btn-sm" style={{ background: 'var(--muted)', color: '#fff' }} onClick={() => transitionStatus(detail.id, 'DELIVERED')}>Deliver</button>}
        </div>

        {detail.clinicalHistory && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Clinical History</div>
            <div style={{ fontSize: 13 }}>{detail.clinicalHistory}</div>
          </div>
        )}

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Report</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Findings</label>
              <textarea className="input" style={{ width: '100%', minHeight: 80 }} value={reportFields.findings} onChange={(e) => setReportFields({ ...reportFields, findings: e.target.value })} placeholder="Enter findings..." />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Impression</label>
              <textarea className="input" style={{ width: '100%', minHeight: 60 }} value={reportFields.impression} onChange={(e) => setReportFields({ ...reportFields, impression: e.target.value })} placeholder="Enter impression..." />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Full Report</label>
              <textarea className="input" style={{ width: '100%', minHeight: 100 }} value={reportFields.report} onChange={(e) => setReportFields({ ...reportFields, report: e.target.value })} placeholder="Enter detailed report..." />
            </div>
            <div>
              <button className="btn" style={{ background: 'var(--primary)', color: '#fff' }} onClick={() => submitReport(detail.id)}>Save Report</button>
            </div>
          </div>
        </div>

        {detail.images && detail.images.length > 0 && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Attached Images ({detail.images.length})</div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>File</th><th>Modality</th><th>Size</th><th>Uploaded</th></tr></thead>
                <tbody>
                  {detail.images.map((img: any) => (
                    <tr key={img.id}>
                      <td style={{ fontSize: 12 }}>{img.fileName}</td>
                      <td>{img.modality || '—'}</td>
                      <td style={{ fontSize: 12 }}>{img.fileSize ? `${(img.fileSize / 1024).toFixed(0)} KB` : '—'}</td>
                      <td style={{ fontSize: 12 }}>{formatDateTime(img.uploadedAt)}</td>
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

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabBtn('orders', 'Orders')}
        {tabBtn('worklist', 'Worklist')}
        {tabBtn('summary', 'Summary')}
      </div>

      {activeTab === 'orders' && (
        <ModulePage
          title="Radiology Orders"
          subtitle="Imaging orders and reports"
          endpoint="/radiology/orders"
          createLabel="New imaging order"
          columns={[
            { key: 'orderNumber', label: 'Order no.', render: (r) => <span className="mono">{r.orderNumber}</span> },
            { key: 'patient', label: 'Patient', render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') },
            { key: 'modality', label: 'Modality', badge: true },
            { key: 'bodyPart', label: 'Body Part', render: (r) => r.bodyPart || '—' },
            { key: 'status', label: 'Status', badge: true },
            { key: 'isEmergency', label: 'Emergency', render: (r) => r.isEmergency ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Yes</span> : '' },
            { key: 'orderedAt', label: 'Ordered', render: (r) => formatDateTime(r.orderedAt) },
          ]}
          fields={[
            { name: 'patientId', label: 'Patient', required: true, type: 'searchSelect', optionsFrom: PATIENT_REF },
            { name: 'doctorId', label: 'Doctor', type: 'select', optionsFrom: DOCTOR_REF },
            { name: 'modality', label: 'Modality', type: 'select', options: MODALITIES.map((m) => ({ value: m, label: m })) },
            { name: 'bodyPart', label: 'Body Part' },
            { name: 'isEmergency', label: 'Emergency', type: 'checkbox' },
            { name: 'clinicalHistory', label: 'Clinical History', type: 'textarea', full: true },
          ]}
          actions={[{ label: 'View', onClick: (r) => loadDetail(r.id) }]}
        />
      )}

      {activeTab === 'worklist' && (
        <ModulePage
          title="Radiology Worklist"
          subtitle="Active orders awaiting action"
          endpoint="/radiology/orders/worklist"
          columns={[
            { key: 'orderNumber', label: 'Order no.', render: (r) => <span className="mono">{r.orderNumber}</span> },
            { key: 'patient', label: 'Patient', render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') },
            { key: 'modality', label: 'Modality', badge: true },
            { key: 'bodyPart', label: 'Body Part', render: (r) => r.bodyPart || '—' },
            { key: 'status', label: 'Status', badge: true },
            { key: 'isEmergency', label: 'Priority', render: (r) => r.isEmergency ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>URGENT</span> : '' },
            { key: 'images', label: 'Images', render: (r) => (r.images?.length || 0).toString() },
            { key: 'orderedAt', label: 'Ordered', render: (r) => formatDateTime(r.orderedAt) },
          ]}
          actions={[{ label: 'View', onClick: (r) => loadDetail(r.id) }]}
        />
      )}
    </>
  );
}
