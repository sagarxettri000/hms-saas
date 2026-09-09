'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { api, API_URL, unwrap, listOf } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/hooks';
import { DOCTOR_REF, PATIENT_REF } from '@/lib/options';
import AsyncSearchSelect from '@/components/AsyncSearchSelect';
import { dicomApi } from '@/lib/dicom';
import type { DicomStudyListItem } from '@/lib/dicom';
import type { DicomUploadResult } from '@/lib/dicom';

const DicomViewer = dynamic(() => import('@/components/dicom/DicomViewer').then((m) => m.DicomViewer), {
  ssr: false,
  loading: () => <div className="loading">Loading viewer…</div>,
});

const DicomUploadModal = dynamic(() => import('@/components/dicom/DicomUploadModal').then((m) => m.DicomUploadModal), {
  ssr: false,
  loading: () => <div className="loading">Loading…</div>,
});

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
  const [role] = useState(() => (typeof window === 'undefined' ? '' : window.localStorage.getItem('role') || ''));
  const canReport = ['RADIOLOGIST', 'HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN'].includes(role);
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

  // DICOM studies tab state
  const [studyRows, setStudyRows] = useState<DicomStudyListItem[]>([]);
  const [studyTotal, setStudyTotal] = useState(0);
  const [loadingStudies, setLoadingStudies] = useState(false);
  const [studyPage, setStudyPage] = useState(1);
  const [studySearch, setStudySearch] = useState('');
  const [studyModality, setStudyModality] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [viewStudyId, setViewStudyId] = useState<string | null>(null);

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

  // Radiology feature state
  const [radiologists, setRadiologists] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [orderReviews, setOrderReviews] = useState<any[]>([]);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [addingRevision, setAddingRevision] = useState(false);
  const [addingReview, setAddingReview] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [linkTarget, setLinkTarget] = useState<DicomStudyListItem | null>(null);
  const [linkOrderId, setLinkOrderId] = useState('');
  const [linkOrders, setLinkOrders] = useState<any[]>([]);
  const [linking, setLinking] = useState(false);

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

  const loadStudies = useCallback(async () => {
    setLoadingStudies(true);
    try {
      const res: any = await dicomApi.listStudies({
        page: studyPage,
        limit: 15,
        query: studySearch.trim() || undefined,
        modality: studyModality || undefined,
      });
      setStudyRows(res?.items ?? []);
      setStudyTotal(res?.pagination?.total ?? 0);
    } catch (e) {
      setStudyRows([]);
      setStudyTotal(0);
      setFlash(e instanceof Error ? e.message : 'Failed to load studies');
    }
    setLoadingStudies(false);
  }, [studyPage, studySearch, studyModality]);

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
    if (activeTab === 'orders' || activeTab === 'reports') loadOrders();
    else if (activeTab === 'worklist') loadWorklist();
    else if (activeTab === 'summary') loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, queryKey]);

  useEffect(() => {
    if (activeTab === 'studies') loadStudies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, studyPage, studySearch, studyModality]);

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

  const fetchRadiologists = useCallback(async () => {
    try {
      const res: any = await api('/users?role=RADIOLOGIST&limit=200');
      const arr = listOf(res);
      setRadiologists(arr.map((u: any) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email, email: u.email })));
    } catch {
      setRadiologists([]);
    }
  }, []);

  useEffect(() => {
    if (canReport) fetchRadiologists();
  }, [canReport, fetchRadiologists]);

  const loadRevisions = useCallback(async (orderId: string) => {
    try {
      const res: any = await api(`/radiology/orders/${orderId}/revisions`);
      setRevisions(listOf(res));
    } catch {
      setRevisions([]);
    }
  }, []);

  const loadOrderReviews = useCallback(async (orderId: string) => {
    try {
      const res: any = await api(`/radiology/orders/${orderId}/peer-reviews`);
      setOrderReviews(listOf(res));
    } catch {
      setOrderReviews([]);
    }
  }, []);

  const loadReviewQueue = useCallback(async () => {
    try {
      const res: any = await api('/radiology/peer-reviews');
      setReviewQueue(listOf(res).filter((r: any) => r.status === 'REQUESTED'));
    } catch {
      setReviewQueue([]);
    }
  }, []);

  useEffect(() => {
    if (!detailId) return;
    loadRevisions(detailId);
    loadOrderReviews(detailId);
  }, [detailId, loadRevisions, loadOrderReviews]);

  useEffect(() => {
    if (activeTab === 'summary') loadReviewQueue();
  }, [activeTab, loadReviewQueue]);

  const submitRevision = async () => {
    if (!detailId) return;
    setAddingRevision(true);
    try {
      await api(`/radiology/orders/${detailId}/revisions`, { method: 'POST', body: JSON.stringify({ ...reportFields, reason: revisionReason || 'Addendum' }) });
      setFlash('Addendum saved');
      setRevisionReason('');
      setDetailId(detailId);
      loadRevisions(detailId);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Failed to save addendum');
    }
    setAddingRevision(false);
  };

  const toggleCritical = async (isCritical: boolean) => {
    if (!detailId) return;
    try {
      await api(`/radiology/orders/${detailId}/critical`, { method: 'POST', body: JSON.stringify({ isCritical }) });
      setFlash(isCritical ? 'Flagged as critical finding' : 'Critical flag cleared');
      setDetailId(detailId);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Flag update failed');
    }
  };

  const assignRadiologist = async (id?: string) => {
    if (!detailId) return;
    setAssigning(true);
    try {
      await api(`/radiology/orders/${detailId}/assign`, { method: 'POST', body: JSON.stringify(id ? { radiologistId: id } : {}) });
      setFlash('Assignment updated');
      setDetailId(detailId);
      loadRef.current();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Assignment failed');
    }
    setAssigning(false);
  };

  const submitPeerReview = async () => {
    if (!detailId || !reviewerId) {
      setFlash('Select a reviewer first');
      return;
    }
    setAddingReview(true);
    try {
      await api(`/radiology/orders/${detailId}/peer-review`, { method: 'POST', body: JSON.stringify({ reviewerId, note: reviewNote || undefined }) });
      setFlash('Peer review requested');
      setReviewerId('');
      setReviewNote('');
      loadOrderReviews(detailId);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Request failed');
    }
    setAddingReview(false);
  };

  const decideReview = async (reviewId: string, status: string, note?: string) => {
    try {
      await api(`/radiology/peer-reviews/${reviewId}/decide`, { method: 'POST', body: JSON.stringify({ status, note }) });
      setFlash(`Review ${status.toLowerCase()}`);
      if (detailId) loadOrderReviews(detailId);
      loadReviewQueue();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Decision failed');
    }
  };

  const openLinkModal = async (study: DicomStudyListItem) => {
    setLinkTarget(study);
    setLinkOrderId('');
    setLinking(false);
    try {
      const res: any = await api('/radiology/orders?limit=100');
      setLinkOrders((Array.isArray(res?.data) ? res.data : res?.data?.data ?? []).filter((o: any) => o.status !== 'CANCELLED'));
    } catch {
      setLinkOrders([]);
    }
  };

  const confirmLink = async () => {
    if (!linkTarget || !linkOrderId) return;
    setLinking(true);
    try {
      await dicomApi.associateStudy(linkTarget.id, linkOrderId);
      setLinkTarget(null);
      setFlash('Study linked to order');
      loadStudies();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Link failed');
    }
    setLinking(false);
  };

  const createOrderFromStudy = async (study: DicomStudyListItem) => {
    try {
      const created: any = await dicomApi.createOrderFromStudy(study.id);
      setLinkTarget(null);
      setFlash(`Order ${created.orderNumber} created from study`);
      loadStudies();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Failed to create order');
    }
  };

  const unlinkStudy = async (study: DicomStudyListItem) => {
    if (!window.confirm('Unlink this study from its radiology order?')) return;
    try {
      await dicomApi.unassociateStudy(study.id);
      setFlash('Study unlinked');
      loadStudies();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Unlink failed');
    }
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
    setViewStudyId(null);
    setStudyPage(1);
    setStudySearch('');
    setStudyModality('');
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
            {detail.isCritical && <span className="badge badge-red" style={{ background: 'var(--danger)', color: '#fff' }}>CRITICAL</span>}
            {detail.criticalSuggested && !detail.isCritical && <span className="badge badge-yellow" title="The report text contains language that may indicate a critical finding.">Suggested critical</span>}
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
            {canTransition(detail.status, 'REPORTED') && canReport && <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} disabled={transitioning === 'REPORTED'} onClick={() => transitionStatus('REPORTED')}>Finalize Report</button>}
            {detail.status === 'REPORTED' && canReport && <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} disabled={transitioning === 'VERIFIED'} onClick={() => transitionStatus('VERIFIED')}>Verify</button>}
            {detail.status === 'VERIFIED' && canReport && <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} disabled={transitioning === 'APPROVED'} onClick={() => transitionStatus('APPROVED')}>Approve</button>}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>Assignment & Critical Flag</div>
            {canReport && (
              <button
                className="btn btn-sm"
                style={{ background: detail.isCritical ? 'var(--muted)' : 'var(--danger)', color: '#fff' }}
                disabled={savingReport}
                onClick={() => toggleCritical(!detail.isCritical)}
              >
                {detail.isCritical ? 'Clear critical flag' : 'Flag as critical'}
              </button>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 2 }}>
            <div>
              Assigned radiologist:{' '}
              <span style={{ color: 'var(--text)' }}>
                {detail.assignedRadiologist
                  ? [detail.assignedRadiologist.firstName, detail.assignedRadiologist.lastName].filter(Boolean).join(' ')
                  : 'Unassigned'}
              </span>
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              {detail.isCritical
                ? `Flagged${detail.criticalFlaggedAt ? ` on ${formatDateTime(detail.criticalFlaggedAt)}` : ''}. The referring physician has been notified.`
                : detail.criticalSuggested
                  ? 'Keyword scan suggests this report may contain a critical finding — confirm or clear above.'
                  : 'No critical finding flagged. Keyword scan runs when the report is saved.'}
            </div>
          </div>
          {canReport && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13 }}>Reassign to:</span>
              <select className="input" style={{ minWidth: 220 }} value="" onChange={(e) => { if (e.target.value) assignRadiologist(e.target.value); }}>
                <option value="">{assigning ? 'Assigning…' : 'Select radiologist…'}</option>
                {radiologists.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm" disabled={assigning} onClick={() => assignRadiologist()}>Auto-assign</button>
            </div>
          )}
        </div>

        {detail.dicomStudies && detail.dicomStudies.length > 0 && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Linked Studies ({detail.dicomStudies.length})</div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Accession No.</th><th>Modality</th><th>Study Date</th><th>Study UID</th></tr></thead>
                <tbody>
                  {detail.dicomStudies.map((st: any) => (
                    <tr key={st.id}>
                      <td>{st.accessionNumber || '—'}</td>
                      <td>{st.modality || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{st.studyDate ? formatDate(st.studyDate) : '—'}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{st.studyInstanceUid ? st.studyInstanceUid.slice(0, 40) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}


        {revisions.length > 0 && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Revision History</div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Version</th><th>Reason</th><th>Findings</th><th>Impression</th><th>Report</th></tr></thead>
                <tbody>
                  {revisions.map((rev: any) => (
                    <tr key={rev.id}>
                      <td>v{rev.version}</td>
                      <td>{rev.reason || '—'}</td>
                      <td style={{ fontSize: 12 }}>{rev.findings || '—'}</td>
                      <td style={{ fontSize: 12 }}>{rev.impression || '—'}</td>
                      <td style={{ fontSize: 12 }}>{rev.report || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Peer Review & Second Opinion</div>
          {canReport && detail.reportedAt && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <select className="input" style={{ minWidth: 220 }} value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
                <option value="">Select reviewer…</option>
                {radiologists.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <input className="input" style={{ minWidth: 220, flex: 1 }} placeholder="Note to reviewer (optional)" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
              <button className="btn btn-sm" style={{ background: 'var(--primary)', color: '#fff' }} disabled={addingReview} onClick={submitPeerReview}>
                {addingReview ? 'Requesting…' : 'Request peer review'}
              </button>
            </div>
          )}
          {orderReviews.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No peer review requests for this order.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Status</th><th>Reviewer</th><th>Requested by</th><th>Requested</th><th>Notes</th><th style={{ width: 1 }}>Actions</th></tr></thead>
                <tbody>
                  {orderReviews.map((rev: any) => (
                    <tr key={rev.id}>
                      <td><span className={`badge badge-${rev.status === 'APPROVED' ? 'green' : rev.status === 'REJECTED' ? 'red' : rev.status === 'OVERRIDE' ? 'yellow' : 'blue'}`}>{rev.status}</span></td>
                      <td>{rev.reviewerName || '—'}</td>
                      <td>{rev.requestedByName || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDateTime(rev.requestedAt)}</td>
                      <td style={{ fontSize: 12 }}>{rev.notes || '—'}</td>
                      <td>
                        {rev.status === 'REQUESTED' && canReport && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-ghost" onClick={() => decideReview(rev.id, 'APPROVED')}>Approve</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => { const n = window.prompt('Rejection note (optional)') || ''; decideReview(rev.id, 'REJECTED', n); }}>Reject</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => { const n = window.prompt('Override note (optional)') || ''; decideReview(rev.id, 'OVERRIDE', n); }}>Override</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Report</div>
          {canReport ? (
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
                {detail.reportedAt && (
                  <button className="btn btn-secondary" style={{ marginLeft: 8 }} disabled={addingRevision} onClick={submitRevision}>
                    {addingRevision ? 'Saving…' : 'Save as Addendum (v' + ((detail.reportVersion ?? 1) + 1) + ')'}
                  </button>
                )}
                {detail.reportedAt && (
                  <input className="input" style={{ marginLeft: 8, maxWidth: 260 }} placeholder="Addendum reason (optional)" value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} />
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.9 }}>
              <div><span style={{ fontWeight: 600 }}>Findings:</span> {detail.findings || '—'}</div>
              <div><span style={{ fontWeight: 600 }}>Impression:</span> {detail.impression || '—'}</div>
              <div><span style={{ fontWeight: 600 }}>Report:</span> {detail.report || '—'}</div>
              <div style={{ marginTop: 10 }}>Only radiologists can write and verify reports.</div>
            </div>
          )}
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
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Peer review queue ({reviewQueue.length})</div>
              {reviewQueue.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No pending peer review requests.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Order</th><th>Patient</th><th>Requested by</th><th>Requested</th><th>Notes</th><th style={{ width: 1 }}>Actions</th></tr></thead>
                    <tbody>
                      {reviewQueue.map((rev: any) => (
                        <tr key={rev.id}>
                          <td className="mono" style={{ fontSize: 12 }}>{rev.radiologyOrder?.orderNumber || rev.radiologyOrderId}</td>
                          <td>{rev.radiologyOrder?.patient ? [rev.radiologyOrder.patient.firstName, rev.radiologyOrder.patient.lastName].filter(Boolean).join(' ') : '—'}</td>
                          <td>{rev.requestedByName || '—'}</td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDateTime(rev.requestedAt)}</td>
                          <td style={{ fontSize: 12 }}>{rev.notes || '—'}</td>
                          <td>
                            {canReport && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-sm btn-ghost" onClick={() => decideReview(rev.id, 'APPROVED')}>Approve</button>
                                <button className="btn btn-sm btn-ghost" onClick={() => { const n = window.prompt('Rejection note (optional)') || ''; decideReview(rev.id, 'REJECTED', n); }}>Reject</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>About this summary</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.9 }}>
                <div>Total Images Uploaded: {summary?.totalImages ?? 0}</div>
                <div>New Orders (Ordered / Scheduled): {summary?.newOrders ?? 0}</div>
                <div>In Progress (In Progress / Images Uploaded): {summary?.inProgress ?? 0}</div>
                <div>Reported (Reported / Verified / Approved): {summary?.reported ?? 0}</div>
                <div>Critical Findings: {summary?.criticalCount ?? 0}</div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------- DICOM study viewer ----------
  if (viewStudyId) {
    return (
      <div style={{ padding: '0 0 24px' }}>
        {flash && <div className="alert alert-success">{flash}</div>}
        <DicomViewer
          studyId={viewStudyId}
          onBack={() => setViewStudyId(null)}
          onDeleted={() => {
            setViewStudyId(null);
            loadStudies();
          }}
        />
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
          <h1 className="page-title">{isStudies ? 'DICOM Studies' : 'Radiology Orders'}</h1>
          <p className="page-subtitle">{isStudies ? 'Uploaded imaging studies and DICOM viewing' : 'Imaging orders and reports'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isStudies && <button className="btn" onClick={() => setShowUpload(true)}>+ Upload DICOM</button>}
          <button className="btn" onClick={openCreate}>+ New imaging order</button>
        </div>
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
        {isStudies ? (
          <>
            <input
              className="input search-input"
              placeholder="Search accession no., description, UID…"
              value={studySearch}
              onChange={(e) => { setStudySearch(e.target.value); setStudyPage(1); }}
            />
            {renderFilterSelect(studyModality, (v) => { setStudyModality(v); setStudyPage(1); }, MODALITIES, 'All modalities')}
            <button className="btn btn-secondary btn-sm" onClick={() => { setStudyPage(1); loadStudies(); }}>Refresh</button>
          </>
        ) : (
          <input
            className="input search-input"
            placeholder="Search patient, accession no., study…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        )}
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

      {isStudies ? (
        loadingStudies ? (
          <div className="loading">Loading studies…</div>
        ) : studyRows.length === 0 ? (
          <div className="empty">No DICOM studies found.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Study Description</th>
                  <th>Accession No.</th>
                  <th>Modality</th>
                  <th>Series</th>
                  <th>Images</th>
                  <th>Study Date</th>
                  <th style={{ width: 1 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {studyRows.map((st) => (
                  <tr key={st.id}>
                    <td>
                      {st.patient ? [st.patient.firstName, st.patient.lastName].filter(Boolean).join(' ') : '—'}
                      {st.patient?.mrn && <div className="note">{st.patient.mrn}</div>}
                    </td>
                    <td>{st.studyDescription || '—'}</td>
                    <td>{st.accessionNumber || '—'}</td>
                    <td><span className="badge badge-gray">{st.modality || '—'}</span></td>
                    <td>{st.numberOfSeries ?? st.series?.length ?? '—'}</td>
                    <td>{st.numberOfInstances ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(st.studyDate)}</td>
                    <td>
                      <button className="btn btn-sm btn-ghost" onClick={() => setViewStudyId(st.id)}>View</button>
                      {st.radiologyOrderId ? (
                        <button
                          className="btn btn-sm"
                          style={{ marginLeft: 4, color: 'var(--warning)' }}
                          onClick={() => unlinkStudy(st)}
                        >
                          Unlink
                        </button>
                      ) : st.patientId ? (
                        <>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ marginLeft: 4 }}
                            onClick={() => openLinkModal(st)}
                          >
                            Link to order
                          </button>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ marginLeft: 4 }}
                            onClick={() => createOrderFromStudy(st)}
                          >
                            Create order
                          </button>
                        </>
                      ) : null}
                      <button
                        className="btn btn-sm btn-danger"
                        style={{ marginLeft: 4 }}
                        onClick={async () => {
                          if (!window.confirm('Delete this DICOM study and all its images?')) return;
                          try {
                            await dicomApi.deleteStudy(st.id);
                            setFlash('Study deleted');
                            loadStudies();
                          } catch (e) {
                            setFlash(e instanceof Error ? e.message : 'Delete failed');
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : loading ? (
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
                <th>Assignee</th>
                <th>Critical</th>
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
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    {r.assignedRadiologist
                      ? [r.assignedRadiologist.firstName, r.assignedRadiologist.lastName].filter(Boolean).join(' ')
                      : <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}
                  </td>
                  <td>
                    {r.isCritical
                      ? <span className="badge badge-red" style={{ background: 'var(--danger)', color: '#fff' }}>Critical</span>
                      : r.criticalSuggested
                        ? <span className="badge badge-yellow">Suggested</span>
                        : '—'}
                  </td>
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

      {isStudies ? (
        !loadingStudies && studyRows.length > 0 && (
          <div className="table-wrap" style={{ borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
            <div className="pagination">
              <span>{studyTotal} study{studyTotal === 1 ? '' : 's'}</span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button className="btn btn-secondary btn-sm" disabled={studyPage <= 1} onClick={() => setStudyPage((p) => Math.max(1, p - 1))}>Prev</button>
                <span>Page {studyPage} / {Math.max(1, Math.ceil(studyTotal / 15))}</span>
                <button className="btn btn-secondary btn-sm" disabled={studyPage >= Math.max(1, Math.ceil(studyTotal / 15))} onClick={() => setStudyPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        )
      ) : (
        !loading && rows.length > 0 && (
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
        )
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

      {linkTarget && (
        <div className="modal-backdrop" onClick={() => setLinkTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Link study to radiology order</h3>
              <button className="modal-close" onClick={() => setLinkTarget(null)} aria-label="Close">×</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {linkTarget.studyDescription || 'Study'} · {linkTarget.accessionNumber || 'no accession'} — choose the matching order.
              </div>
              <select className="input" style={{ width: '100%', marginBottom: 12 }} value={linkOrderId} onChange={(e) => setLinkOrderId(e.target.value)}>
                <option value="">Select radiology order…</option>
                {linkOrders.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} · {[o.patient?.firstName, o.patient?.lastName].filter(Boolean).join(' ') || '—'} · {o.modality}
                  </option>
                ))}
              </select>
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => setLinkTarget(null)}>Cancel</button>
                <button className="btn" disabled={!linkOrderId || linking} onClick={confirmLink}>{linking ? 'Linking…' : 'Link study'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <DicomUploadModal
          onClose={() => setShowUpload(false)}
          onDone={(result) => {
            setShowUpload(false);
            const n = result?.ingested?.length ?? 0;
            setFlash(`Uploaded ${n} DICOM file${n === 1 ? '' : 's'}`);
            loadStudies();
          }}
        />
      )}
    </div>
  );
}
