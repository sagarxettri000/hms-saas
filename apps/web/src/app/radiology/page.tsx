'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, API_URL, unwrap, listOf } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/hooks';
import { DOCTOR_REF, PATIENT_REF } from '@/lib/options';
import AsyncSearchSelect from '@/components/AsyncSearchSelect';

type Tab = 'orders' | 'worklist' | 'reports' | 'studies' | 'summary';

const MODALITIES = [
  { value: 'XRAY', label: 'X-Ray' },
  { value: 'CT', label: 'CT' },
  { value: 'MRI', label: 'MRI' },
  { value: 'ULTRASOUND', label: 'Ultrasound' },
  { value: 'ECG', label: 'ECG' },
  { value: 'ECHO', label: 'Echo' },
  { value: 'OTHERS', label: 'Others' },
];

const MODALITY_LABEL: Record<string, string> = {
  XRAY: 'X-Ray', CT: 'CT', MRI: 'MRI', ULTRASOUND: 'Ultrasound',
  ECG: 'ECG', ECHO: 'Echo', OTHERS: 'Others',
};

const STATUS_TONES: Record<string, string> = {
  ORDERED: 'blue',
  SCHEDULED: 'blue',
  IN_PROGRESS: 'yellow',
  IMAGES_UPLOADED: 'cyan',
  REPORTED: 'green',
  VERIFIED: 'green',
  APPROVED: 'green',
  DELIVERED: 'green',
  CANCELLED: 'red',
};

const STATUS_LABEL: Record<string, string> = {
  ORDERED: 'Ordered',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  IMAGES_UPLOADED: 'Images Uploaded',
  REPORTED: 'Reported',
  VERIFIED: 'Verified',
  APPROVED: 'Approved',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const ORDER_FLOW = [
  'ORDERED', 'SCHEDULED', 'IN_PROGRESS', 'IMAGES_UPLOADED',
  'REPORTED', 'VERIFIED', 'APPROVED', 'DELIVERED',
];

function totalOf(r: any): number {
  const d = r?.data;
  if (d && typeof d.total === 'number') return d.total;
  const arr = unwrap(r);
  if (Array.isArray(arr)) return arr.length;
  return (d?.total as number) ?? 0;
}

function patientName(p: any): string {
  if (!p) return '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || '—';
}

function statusBadge(status: string) {
  const tone = STATUS_TONES[status] || 'gray';
  return (
    <span className={`badge badge-${tone}`}>{STATUS_LABEL[status] || status?.replace(/_/g, ' ')}</span>
  );
}

function priorityBadge(isEmergency: boolean) {
  if (!isEmergency) {
    return <span className="badge badge-gray">Routine</span>;
  }
  return <span className="badge badge-red" style={{ color: 'var(--danger)' }}>STAT</span>;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'orders', label: 'Orders' },
  { key: 'worklist', label: 'Worklist' },
  { key: 'reports', label: 'Reports' },
  { key: 'studies', label: 'Studies' },
  { key: 'summary', label: 'Summary' },
];

interface CreateOrderState {
  patientId: string;
  doctorId: string;
  modality: string;
  bodyPart: string;
  scheduledDate: string;
  priority: string;
  isEmergency: boolean;
  clinicalHistory: string;
  notes: string;
}

const EMPTY_ORDER: CreateOrderState = {
  patientId: '',
  doctorId: '',
  modality: 'XRAY',
  bodyPart: '',
  scheduledDate: '',
  priority: 'routine',
  isEmergency: false,
  clinicalHistory: '',
  notes: '',
};

export default function RadiologyPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('orders');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Orders list state
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ modality: '', status: '', priority: '', from: '', to: '' });

  // Summary state
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateOrderState>(EMPTY_ORDER);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Report editing state
  const [reportFields, setReportFields] = useState({ findings: '', impression: '', report: '' });
  const [savingReport, setSavingReport] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const loadRef = useRef<() => void>(() => {});

  const queryKey = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', '15');
    if (search.trim()) p.set('search', search.trim());
    if (filters.modality) p.set('modality', filters.modality);
    if (filters.status) p.set('status', filters.status);
    if (filters.from) p.set('from', filters.from);
    if (filters.to) p.set('to', filters.to);
    return p.toString();
  }, [page, search, filters]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const current = activeTab;
      if (current === 'orders') {
        const res: any = await api(`/radiology/orders?${queryKey}`);
        const payload = res?.data;
        const dataArr = Array.isArray(payload) ? payload : payload?.data ?? [];
        setRows(
          dataArr.map((r: any) => ({
            ...r,
            modalityLabel: MODALITY_LABEL[r.modality] || r.modality,
          })),
        );
        setTotal(Array.isArray(payload) ? payload.length : (payload?.total ?? dataArr.length));
      } else if (current === 'reports' || current === 'studies') {
        const res: any = await api('/radiology/orders?limit=200');
        const payload = res?.data;
        const dataArr = Array.isArray(payload) ? payload : payload?.data ?? [];
        const mapped = dataArr.map((r: any) => ({
          ...r,
          modalityLabel: MODALITY_LABEL[r.modality] || r.modality,
        }));
        setRows(current === 'reports' ? mapped.filter((r: any) => r.report || ['REPORTED', 'VERIFIED', 'APPROVED', 'DELIVERED'].includes(r.status)) : mapped);
        setTotal(mapped.length);
      }
    } catch (e) {
      setRows([]);
      setTotal(0);
      setFlash(e instanceof Error ? e.message : 'Failed to load');
    }
    setLoading(false);
  }, [activeTab, queryKey]);

  loadRef.current = loadOrders;

  const loadWorklist = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await api('/radiology/orders/worklist');
      setRows(listOf(res).map((r: any) => ({ ...r, modalityLabel: MODALITY_LABEL[r.modality] || r.modality })));
      setTotal(listOf(res).length);
    } catch (e) {
      setRows([]);
      setTotal(0);
    }
    setLoading(false);
  }, []);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const res: any = await api('/radiology/summary');
      setSummary(res?.data ?? res);
    } catch {
      setSummary(null);
    }
    setLoadingSummary(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'orders' || activeTab === 'reports' || activeTab === 'studies') loadOrders();
    else if (activeTab === 'worklist') loadWorklist();
    else if (activeTab === 'summary') loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, queryKey]);

  useEffect(() => {
    if (!detailId) return;
    let active = true;
    setLoadingDetail(true);
    api(`/radiology/orders/${detailId}`)
      .then((res: any) => {
        if (!active) return;
        const d = res?.data ?? res;
        setDetail(d);
        setReportFields({ findings: d.findings || '', impression: d.impression || '', report: d.report || '' });
      })
      .catch(() => { if (active) setDetail(null); })
      .finally(() => { if (active) setLoadingDetail(false); });
    return () => { active = false; };
  }, [detailId]);

  const transitionStatus = async (toStatus: string) => {
    if (!detailId) return;
    setTransitioning(toStatus);
    try {
      await api(`/radiology/orders/${detailId}/status`, { method: 'PATCH', body: JSON.stringify({ status: toStatus }) });
      setFlash(`Order ${STATUS_LABEL[toStatus]}`);
      setDetailId(detailId);
      loadRef.current();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Transition failed');
    }
    setTransitioning(null);
  };

  const submitReport = async () => {
    if (!detailId) return;
    setSavingReport(true);
    try {
      await api(`/radiology/orders/${detailId}/report`, { method: 'PATCH', body: JSON.stringify(reportFields) });
      setFlash('Report saved');
      setDetailId(detailId);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Failed to save report');
    }
    setSavingReport(false);
  };

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const switchTab = (t: Tab) => {
    setActiveTab(t);
    setPage(1);
    setSearch('');
    setFilters({ modality: '', status: '', priority: '', from: '', to: '' });
    setDetailId(null);
    setDetail(null);
  };

  const applyFilters = () => {
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ modality: '', status: '', priority: '', from: '', to: '' });
    setPage(1);
  };

  const canTransition = (from: string, to: string) => {
    if (to === 'CANCELLED') return from !== 'DELIVERED';
    const idx = ORDER_FLOW.indexOf(from);
    return ORDER_FLOW.indexOf(to) === idx + 1;
  };

  const openCreate = () => {
    setCreateForm(EMPTY_ORDER);
    setCreateError(null);
    setShowCreate(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.patientId) {
      setCreateError('Patient is required');
      return;
    }
    setSaving(true);
    setCreateError(null);
    try {
      const payload: any = {
        patientId: createForm.patientId,
        modality: createForm.modality,
        bodyPart: createForm.bodyPart || undefined,
        clinicalHistory: createForm.clinicalHistory || undefined,
        isEmergency: createForm.isEmergency,
      };
      if (createForm.doctorId) payload.doctorId = createForm.doctorId;
      const res: any = await api('/radiology/orders', { method: 'POST', body: JSON.stringify(payload) });
      const orderId = res?.data?.id;
      if (createForm.scheduledDate && orderId) {
        try {
          await api(`/radiology/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'SCHEDULED' }) });
        } catch { /* ignore scheduling failure */ }
      }
      setShowCreate(false);
      setFlash('Imaging order created');
      setPage(1);
      loadRef.current();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create order');
    }
    setSaving(false);
  };

  // ---------- Detail view ----------
  if (detailId) {
    if (loadingDetail) return <div className="loading">Loading order…</div>;
    if (!detail) return (
      <div style={{ padding: '0 0 24px' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setDetailId(null)}>← Back to Radiology Orders</button>
        <div className="empty" style={{ marginTop: 16 }}>Order not found</div>
      </div>
    );

    const flowIndex = ORDER_FLOW.indexOf(detail.status) >= 0 ? ORDER_FLOW.indexOf(detail.status) : ORDER_FLOW.length - 1;

    return (
      <div style={{ padding: '0 0 24px' }}>
        {flash && <div className="alert alert-success">{flash}</div>}
        <div className="page-header">
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setDetailId(null)} style={{ marginBottom: 10 }}>← Back to Radiology Orders</button>
            <h1 className="page-title" style={{ margin: 0 }}>
              Radiology Order Details
              <span className="mono" style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 10 }}>{detail.orderNumber}</span>
            </h1>
            <p className="page-subtitle">
              {patientName(detail.patient)} · {detail.patient?.mrn || '—'} · {MODALITY_LABEL[detail.modality] || detail.modality}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {priorityBadge(detail.isEmergency)}
            {statusBadge(detail.status)}
            <button className="btn btn-secondary btn-sm" onClick={() => window.open(`${API_URL}/radiology/orders/${detail.id}/pdf`, '_blank')}>Download PDF</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Patient Information</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.9 }}>
              <div>Name: <span style={{ color: 'var(--text)' }}>{patientName(detail.patient)}</span></div>
              <div>MRN: <span className="mono" style={{ color: 'var(--text)' }}>{detail.patient?.mrn || '—'}</span></div>
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Order Information</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.9 }}>
              <div>Order ID: <span style={{ color: 'var(--text)' }}>{detail.orderNumber}</span></div>
              <div>Ordered: <span style={{ color: 'var(--text)' }}>{formatDateTime(detail.orderedAt)}</span></div>
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Study Information</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.9 }}>
              <div>Modality: <span style={{ color: 'var(--text)' }}>{MODALITY_LABEL[detail.modality] || detail.modality}</span></div>
              <div>Body Part: <span style={{ color: 'var(--text)' }}>{detail.bodyPart || '—'}</span></div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Workflow Timeline</div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            {ORDER_FLOW.map((s, i) => {
              const done = i <= flowIndex;
              const isCurrent = i === flowIndex;
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: done ? 'var(--success)' : 'var(--border)',
                      boxShadow: isCurrent ? '0 0 0 3px var(--success-light)' : undefined,
                    }} />
                    <span style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: done ? 'var(--text)' : 'var(--text-muted)' }}>
                      {STATUS_LABEL[s]}
                    </span>
                  </div>
                  {i < ORDER_FLOW.length - 1 && <span style={{ width: 18, height: 1, background: 'var(--border)', margin: '0 8px' }} />}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {canTransition(detail.status, 'SCHEDULED') && <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }} disabled={transitioning === 'SCHEDULED'} onClick={() => transitionStatus('SCHEDULED')}>Schedule</button>}
            {canTransition(detail.status, 'IN_PROGRESS') && <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }} disabled={transitioning === 'IN_PROGRESS'} onClick={() => transitionStatus('IN_PROGRESS')}>Start Study</button>}
            {canTransition(detail.status, 'IMAGES_UPLOADED') && <button className="btn btn-sm" style={{ background: 'var(--info)', color: '#fff' }} disabled={transitioning === 'IMAGES_UPLOADED'} onClick={() => transitionStatus('IMAGES_UPLOADED')}>Images Uploaded</button>}
            {canTransition(detail.status, 'REPORTED') && <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} disabled={transitioning === 'REPORTED'} onClick={() => transitionStatus('REPORTED')}>Finalize Report</button>}
            {detail.status === 'REPORTED' && <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} disabled={transitioning === 'VERIFIED'} onClick={() => transitionStatus('VERIFIED')}>Verify</button>}
            {detail.status === 'VERIFIED' && <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} disabled={transitioning === 'APPROVED'} onClick={() => transitionStatus('APPROVED')}>Approve</button>}
            {detail.status === 'APPROVED' && <button className="btn btn-sm" style={{ background: 'var(--muted)', color: '#fff' }} disabled={transitioning === 'DELIVERED'} onClick={() => transitionStatus('DELIVERED')}>Deliver</button>}
            {canTransition(detail.status, 'CANCELLED') && <button className="btn btn-sm btn-danger" disabled={transitioning === 'CANCELLED'} onClick={() => transitionStatus('CANCELLED')}>Cancel</button>}
          </div>
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
              <label className="label">Findings</label>
              <textarea className="textarea" style={{ width: '100%', minHeight: 80 }} value={reportFields.findings} onChange={(e) => setReportFields({ ...reportFields, findings: e.target.value })} placeholder="Enter findings…" />
            </div>
            <div>
              <label className="label">Impression</label>
              <textarea className="textarea" style={{ width: '100%', minHeight: 60 }} value={reportFields.impression} onChange={(e) => setReportFields({ ...reportFields, impression: e.target.value })} placeholder="Enter impression…" />
            </div>
            <div>
              <label className="label">Full Report</label>
              <textarea className="textarea" style={{ width: '100%', minHeight: 100 }} value={reportFields.report} onChange={(e) => setReportFields({ ...reportFields, report: e.target.value })} placeholder="Enter detailed report…" />
            </div>
            <div>
              <button className="btn" style={{ background: 'var(--primary)', color: '#fff' }} disabled={savingReport} onClick={submitReport}>{savingReport ? 'Saving…' : 'Save Report'}</button>
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

  // ---------- Summary view ----------
  if (activeTab === 'summary') {
    const cards = [
      { label: "Today's Orders", value: summary?.newOrders ?? 0, tone: 'var(--primary)' },
      { label: 'In Progress', value: summary?.inProgress ?? 0, tone: 'var(--warning)' },
      { label: 'Reports Pending', value: summary?.inProgress ?? 0, tone: 'var(--warning)' },
      { label: 'Reported', value: summary?.reported ?? 0, tone: 'var(--success)' },
      { label: 'Completed Today', value: summary?.completedToday ?? 0, tone: 'var(--success)' },
      { label: 'Total Orders', value: summary?.totalOrders ?? 0, tone: 'var(--text)' },
    ];
    return (
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ marginBottom: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => switchTab('orders')}>← Back to Radiology Orders</button>
        </div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Radiology Summary</h1>
            <p className="page-subtitle">Department overview</p>
          </div>
        </div>
        {loadingSummary ? <div className="loading">Loading…</div> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
              {cards.map((c) => (
                <div key={c.label} className="card" style={{ padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: c.tone }}>{c.value ?? 0}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{c.label}</div>
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>About this summary</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.9 }}>
                <div>Total Images Uploaded: {summary?.totalImages ?? 0}</div>
                <div>New Orders (Ordered / Scheduled): {summary?.newOrders ?? 0}</div>
                <div>In Progress (In Progress / Images Uploaded): {summary?.inProgress ?? 0}</div>
                <div>Reported (Reported / Verified / Approved): {summary?.reported ?? 0}</div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------- List views (Orders / Worklist / Reports / Studies) ----------
  const isOrders = activeTab === 'orders';
  const isStudies = activeTab === 'studies';

  const paginated = activeTab === 'orders';

  const renderFilterSelect = (value: string, onChange: (v: string) => void, options: { value: string; label: string }[], placeholder: string) => (
    <select className="input" style={{ minWidth: 140 }} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const statusOptions = Object.keys(STATUS_LABEL).map((s) => ({ value: s, label: STATUS_LABEL[s] }));

  return (
    <div style={{ padding: '0 0 24px' }}>
      {flash && <div className="alert alert-success">{flash}</div>}

      <div style={{ marginBottom: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => router.push('/dashboard')}>← Back to Dashboard</button>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">Radiology Orders</h1>
          <p className="page-subtitle">Imaging orders and reports</p>
        </div>
        <button className="btn" onClick={openCreate}>+ New imaging order</button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${t.key === activeTab ? 'active' : ''}`}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <input
          className="input search-input"
          placeholder="Search patient, accession no., study…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        {isOrders && (
          <>
            {renderFilterSelect(filters.modality, (v) => setFilters({ ...filters, modality: v }), MODALITIES, 'All modalities')}
            {renderFilterSelect(filters.status, (v) => setFilters({ ...filters, status: v }), statusOptions, 'All statuses')}
            {renderFilterSelect(filters.priority, (v) => setFilters({ ...filters, priority: v }), [{ value: 'stat', label: 'STAT' }, { value: 'routine', label: 'Routine' }], 'All priorities')}
            <input className="input" type="date" title="From" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
            <input className="input" type="date" title="To" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
            <button className="btn btn-secondary btn-sm" onClick={applyFilters}>Apply Filters</button>
            <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear</button>
          </>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty">No records found.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Patient</th>
                <th>Study</th>
                <th>Modality</th>
                <th>Priority</th>
                {isStudies && <th>Performed</th>}
                <th>Scheduled</th>
                <th>Status</th>
                <th style={{ width: 1 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}><span className="mono">{r.orderNumber}</span></td>
                  <td>
                    {patientName(r.patient)}
                    {r.patient?.mrn && <div className="note">{r.patient.mrn}</div>}
                  </td>
                  <td>{r.bodyPart || MODALITY_LABEL[r.modality] || '—'}</td>
                  <td><span className="badge badge-gray">{r.modalityLabel || r.modality}</span></td>
                  <td>{priorityBadge(r.isEmergency)}</td>
                  {isStudies && <td style={{ whiteSpace: 'nowrap' }}>{r.performedAt ? formatDateTime(r.performedAt) : '—'}</td>}
                  <td style={{ whiteSpace: 'nowrap' }}>{r.scheduledAt ? formatDateTime(r.scheduledAt) : '—'}</td>
                  <td>{statusBadge(r.status)}</td>
                  <td>
                    <button className="btn btn-sm btn-ghost" onClick={() => setDetailId(r.id)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="table-wrap" style={{ borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          <div className="pagination">
            <span>{total} record{total === 1 ? '' : 's'}</span>
            {paginated && (
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                <span>Page {page} / {Math.max(1, Math.ceil(total / 15))}</span>
                <button className="btn btn-secondary btn-sm" disabled={page >= Math.max(1, Math.ceil(total / 15))} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">New imaging order</h3>
              <button className="modal-close" onClick={() => setShowCreate(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-grid">
                <div className="field field-full">
                  <label className="label">Patient <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <AsyncSearchSelect
                    endpoint={PATIENT_REF.endpoint}
                    valueKey={PATIENT_REF.valueKey}
                    labelKeys={PATIENT_REF.labelKeys}
                    value={createForm.patientId}
                    onChange={(v) => setCreateForm({ ...createForm, patientId: v })}
                    placeholder="Search patient…"
                    required
                  />
                </div>

                <div className="field field-full"><h4 style={{ fontSize: 13, fontWeight: 600, margin: '4px 0 0' }}>Ordering Physician</h4></div>
                <div className="field field-full">
                  <label className="label">Ordering physician / Department</label>
                  <AsyncSearchSelect
                    endpoint={DOCTOR_REF.endpoint}
                    valueKey={DOCTOR_REF.valueKey}
                    labelKeys={DOCTOR_REF.labelKeys}
                    value={createForm.doctorId}
                    onChange={(v) => setCreateForm({ ...createForm, doctorId: v })}
                    placeholder="Search doctor…"
                  />
                </div>

                <div className="field"><label className="label">Modality</label>
                  <select className="input" value={createForm.modality} onChange={(e) => setCreateForm({ ...createForm, modality: e.target.value })}>
                    {MODALITIES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field"><label className="label">Body region</label>
                  <input className="input" value={createForm.bodyPart} onChange={(e) => setCreateForm({ ...createForm, bodyPart: e.target.value })} placeholder="e.g. Brain" />
                </div>
                <div className="field"><label className="label">Requested date</label>
                  <input className="input" type="date" value={createForm.scheduledDate} onChange={(e) => setCreateForm({ ...createForm, scheduledDate: e.target.value })} />
                </div>
                <div className="field"><label className="label">Priority</label>
                  <select className="input" value={createForm.priority} onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value, isEmergency: e.target.value === 'stat' })}>
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                  </select>
                </div>

                <div className="field field-full"><h4 style={{ fontSize: 13, fontWeight: 600, margin: '4px 0 0' }}>Additional Information</h4></div>
                <div className="field field-full">
                  <label className="label">Clinical indication</label>
                  <textarea className="textarea" style={{ width: '100%', minHeight: 60 }} value={createForm.clinicalHistory} onChange={(e) => setCreateForm({ ...createForm, clinicalHistory: e.target.value })} placeholder="Clinical indication / history…" />
                </div>
                <div className="field field-full">
                  <label className="label">Notes</label>
                  <textarea className="textarea" style={{ width: '100%', minHeight: 50 }} value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} placeholder="Additional notes…" />
                </div>
              </div>

              {createError && <div className="alert alert-error" style={{ marginTop: 14 }}>{createError}</div>}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={saving}>{saving ? 'Creating…' : 'Create Imaging Order'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
