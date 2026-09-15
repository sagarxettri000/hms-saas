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
const APPROVERS = [
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

const PANEL_OPTIONS = [
  { value: 'FCM-LYS', label: 'Lymphocyte Subset Panel (FCM-LYS) — NPR 5000' },
  { value: 'FCM-ISP', label: 'Immunophenotyping Panel (FCM-ISP) — NPR 8500' },
  { value: 'FCM-MRD', label: 'MRD Panel B-ALL (FCM-MRD) — NPR 13500' },
  { value: 'FCM-PNH', label: 'PNH Screening Panel (FCM-PNH) — NPR 6500' },
];

function patientName(p: any): string {
  if (!p) return '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.mrn || p.id || '—';
}

function studyOf(detail: any): any | null {
  const list = detail?.flowStudies || [];
  return list.length > 0 ? list[0] : null;
}

function markerRowValue(pop: any, markerId: string, key: string) {
  const mr = (pop?.markerResults || []).find((m: any) => m.markerId === markerId);
  return mr ? (mr[key] != null ? String(mr[key]) : '') : '';
}

export default function FlowCytometryPage() {
  const role = useAuth();
  const canPerform = Boolean(role && PERFORMERS.includes(role));
  const canApprove = Boolean(role && APPROVERS.includes(role));

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Population meta drafts (per population)
  const [popMeta, setPopMeta] = useState<Record<string, any>>({});
  // Marker matrix drafts: popId -> markerId -> {pct, abs, mfi, abn, crit}
  const [matrix, setMatrix] = useState<Record<string, Record<string, any>>>({});
  const [newPopName, setNewPopName] = useState('');
  const [newPopParent, setNewPopParent] = useState('');
  const [summaryDraft, setSummaryDraft] = useState('');

  useEffect(() => {
    if (!detailId) return;
    let active = true;
    setLoadingDetail(true);
    api(`/flow-cytometry/orders/${detailId}`)
      .then((r: any) => {
        if (!active) return;
        const d = unwrap(r);
        setDetail(d);
        const meta: Record<string, any> = {};
        const mx: Record<string, Record<string, any>> = {};
        for (const study of d?.flowStudies || []) {
          for (const pop of (study.populations?.rows || [])) {
            meta[pop.id] = { name: pop.name, qualitative: pop.qualitative || '', percentage: pop.percentage ?? '' };
            mx[pop.id] = {};
            for (const mr of pop.markerResults || []) {
              mx[pop.id][mr.markerId] = {
                pct: mr.percentage != null ? String(mr.percentage) : '',
                abs: mr.absoluteCount != null ? String(mr.absoluteCount) : '',
                mfi: mr.mfi != null ? String(mr.mfi) : '',
                abn: Boolean(mr.isAbnormal),
                crit: Boolean(mr.isCritical),
              };
            }
          }
        }
        setPopMeta(meta);
        setMatrix(mx);
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
  }, [detailId, refresh]);

  function closeDetail() {
    setDetailId(null);
    setDetail(null);
    setSavedAt(null);
    setError(null);
  }

  function banner(msg: string | null) {
    setError(msg);
    setSavedAt(msg ? null : new Date().toISOString());
  }

  function call(path: string, method: string, body?: any): Promise<any> {
    return api(path, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    })
      .then((r: any) => {
        banner(null);
        setRefresh((n) => n + 1);
        return r;
      })
      .catch((err: any) => {
        setError(err?.message || 'Request failed');
        throw err;
      });
  }

  function startStudy() {
    if (!detail) return;
    setSaving('study');
    call(`/flow-cytometry/orders/${detail.id}/study`, 'POST', {})
      .then(() => setSummaryDraft(detail.gatingStrategy || ''))
      .finally(() => setSaving(null));
  }

  function addPopulation() {
    if (!detail || !newPopName.trim()) return;
    const study = studyOf(detail);
    if (!study) return;
    setSaving('newpop');
    call(`/flow-cytometry/studies/${study.id}/populations`, 'POST', {
      name: newPopName.trim(),
      parentId: newPopParent || undefined,
    })
      .then(() => {
        setNewPopName('');
        setNewPopParent('');
      })
      .finally(() => setSaving(null));
  }

  function savePopulation(popId: string) {
    if (!detail) return;
    setSaving(popId);
    const meta = popMeta[popId] || {};
    const data: any = { name: meta.name };
    if (meta.qualitative !== '') data.qualitative = meta.qualitative;
    if (meta.percentage !== '' && Number.isFinite(Number(meta.percentage))) {
      data.percentage = Number(meta.percentage);
    } else {
      data.percentage = null;
    }
    call(`/flow-cytometry/populations/${popId}`, 'PATCH', data)
      .then(() => saveMatrix(popId))
      .catch(() => {})
      .finally(() => setSaving(null));
  }

  async function saveMatrix(popId: string) {
    if (!detail) return;
    const study = studyOf(detail);
    if (!study) return;
    const markers = study.panel?.flowPanelMarkers || study.panel?.markers || [];
    const rows = matrix[popId] || {};
    const ops = markers.map((def: any) => {
      const m = rows[def.markerId] || rows[def.marker?.id] || {};
      const body: any = { markerId: def.markerId || def.marker?.id };
      const pct = m.pct === '' ? null : Number(m.pct);
      const abs = m.abs === '' ? null : Number(m.abs);
      const mfi = m.mfi === '' ? null : Number(m.mfi);
      body.percentage = pct;
      body.absoluteCount = abs;
      body.mfi = mfi;
      body.isAbnormal = Boolean(m.abn);
      body.isCritical = Boolean(m.crit);
      if (m.pct === '' && m.abs === '' && m.mfi === '') return null;
      return api(
        `/flow-cytometry/populations/${popId}/marker-results`,
        { method: 'PATCH', body: JSON.stringify(body) },
      );
    }).filter(Boolean);
    await Promise.all(ops as Promise<any>[]);
    banner(null);
    setRefresh((n) => n + 1);
  }

  function updateMeta(popId: string, key: string, value: any) {
    setPopMeta((p) => ({
      ...p,
      [popId]: { ...(p[popId] || {}), [key]: value },
    }));
  }

  function updateCell(popId: string, markerId: string, key: string, value: any) {
    setMatrix((m) => ({
      ...m,
      [popId]: { ...(m[popId] || {}), [markerId]: { ...(m[popId]?.[markerId] || {}), [key]: value } },
    }));
  }

  function submitResults() {
    if (!detail) return;
    const study = studyOf(detail);
    if (!study) return;
    setSaving('submit');
    call(`/flow-cytometry/studies/${study.id}/submit`, 'POST', {
      resultSummary: summaryDraft || undefined,
    }).finally(() => setSaving(null));
  }

  function advance(status: string) {
    if (!detail) return;
    setSaving(status);
    call(`/flow-cytometry/orders/${detail.id}/${status}`, 'POST').finally(() => setSaving(null));
  }

  if (detailId) {
    if (loadingDetail)
      return (
        <>
          <button className="btn btn-secondary btn-sm" onClick={closeDetail} style={{ marginBottom: 12 }}>
            ← Back to Flow Cytometry
          </button>
          <div className="loading">Loading order details...</div>
        </>
      );
    if (!detail)
      return (
        <>
          <button className="btn btn-secondary btn-sm" onClick={closeDetail} style={{ marginBottom: 12 }}>
            ← Back to Flow Cytometry
          </button>
          <div className="banner-danger">Order not found</div>
        </>
      );

    const study = studyOf(detail);
    const panel = study?.panel || { name: detail.items?.[0]?.testName || '—' };
    const populations = study?.populations?.rows || [];
    const markers = panel?.flowPanelMarkers || panel?.markers || [];
    const reportable = populations.filter((p: any) => p.status === 'RESULT_ENTERED' || p.status === 'FINALIZED');

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
              {study && (
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => window.open(`/api/v1/flow-cytometry/orders/${detail.id}/pdf`, '_blank')}
                >
                  Download PDF
                </button>
              )}
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
        {savedAt && !error && (
          <div className="note" style={{ marginBottom: 12, color: 'var(--success)' }}>
            Saved {formatDateTime(savedAt)}.
          </div>
        )}

        <div className="detail-grid">
          <div className="card" style={{ padding: 16 }}>
            <div className="card-title">Patient Info</div>
            <div className="muted" style={{ fontSize: 13 }}>
              <div>MRN: {detail.patient?.mrn || '—'}</div>
              {detail.patient?.gender && <div>Gender: {detail.patient.gender}</div>}
              <div>Ordered: {formatDateTime(detail.orderedAt)}</div>
              {detail.isStat && <div style={{ color: 'var(--danger)', fontWeight: 600 }}>STAT ORDER</div>}
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

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <div className="card-title" style={{ margin: 0 }}>
              Panel: {panel.name}
            </div>
            {!study && canPerform && !IMMUTABLE.includes(detail.status) && !['REJECTED', 'CANCELLED'].includes(detail.status) && (
              <button className="btn btn-sm" disabled={saving === 'study'} onClick={startStudy}>
                {saving === 'study' ? 'Starting...' : 'Start Study'}
              </button>
            )}
          </div>
          {panel?.markers && panel.markers.length > 0 && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Markers: {(panel.markers || []).map((m: any) => `${m.name} ${m.fluorochrome || ''}`.trim()).join(' · ')}
            </div>
          )}
          {!study && (
            <div className="note" style={{ marginTop: 8 }}>
              Study not started yet. Start the study to begin acquisition and population analysis.
            </div>
          )}
        </div>

        {study && (
          <>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div className="card-title" style={{ margin: 0 }}>
                Populations & Marker Results
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {detail.status === 'RESULT_READY' && reportable.length > 0 && canPerform && (
                  <button className="btn btn-sm" onClick={() => advance('verify')} disabled={saving === 'verify'}>
                    Verify
                  </button>
                )}
                {detail.status === 'VERIFIED' && canApprove && (
                  <button className="btn btn-sm" onClick={() => advance('approve')} disabled={saving === 'approve'}>
                    Approve
                  </button>
                )}
                {detail.status === 'APPROVED' && canApprove && (
                  <button className="btn btn-sm" onClick={() => advance('report')} disabled={saving === 'report'}>
                    Report
                  </button>
                )}
              </div>
            </div>

            {canPerform && !IMMUTABLE.includes(detail.status) && !['REJECTED', 'CANCELLED'].includes(detail.status) && (
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 8 }}>Add Gated Population</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <label className="label">Name</label>
                    <input
                      className="input"
                      style={{ width: 220 }}
                      value={newPopName}
                      onChange={(e) => setNewPopName(e.target.value)}
                      placeholder="e.g. Lymphocytes / CD19+ blasts"
                    />
                  </div>
                  <div>
                    <label className="label">Parent population (optional)</label>
                    <select
                      className="input"
                      style={{ width: 200 }}
                      value={newPopParent}
                      onChange={(e) => setNewPopParent(e.target.value)}
                    >
                      <option value="">— none —</option>
                      {populations.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn btn-sm"
                    disabled={saving === 'newpop' || !newPopName.trim()}
                    onClick={addPopulation}
                  >
                    {saving === 'newpop' ? 'Adding...' : 'Add population'}
                  </button>
                </div>
              </div>
            )}

            {(study.runs || []).length > 0 && (
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 8 }}>Acquisition runs</div>
                {(study.runs || []).map((r: any, i: number) => {
                  const parts = [
                    r.instrumentName ? `Instrument: ${r.instrumentName}` : '',
                    `Acquisition: ${r.acquisitionStatus || 'PENDING'}`,
                    `QC: ${r.qcStatus || 'NOT_RUN'}`,
                    r.numberOfEvents ? `Events: ${r.numberOfEvents}` : '',
                  ].filter(Boolean);
                  return (
                    <div key={r.id || i} className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                      {parts.join(' · ')}
                    </div>
                  );
                })}
              </div>
            )}

            {populations.map((pop: any) => {
              const meta = popMeta[pop.id] || {};
              const editable =
                canPerform && !IMMUTABLE.includes(detail.status) && !['REJECTED', 'CANCELLED'].includes(detail.status);
              return (
                <div className="card" style={{ padding: 16, marginBottom: 16 }} key={pop.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div className="card-title" style={{ margin: 0 }}>
                      {pop.name}
                      <span className={`badge ${pop.status === 'FINALIZED' ? 'badge-green' : pop.status === 'RESULT_ENTERED' ? 'badge-blue' : 'badge-gray'}`} style={{ marginLeft: 8 }}>
                        {String(pop.status || 'PENDING').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {pop.percentage != null ? `${pop.percentage}%` : ''}
                      {pop.qualitative ? ` · ${pop.qualitative}` : ''}
                    </span>
                  </div>

                  {editable && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      <div>
                        <label className="label">Name</label>
                        <input
                          className="input"
                          style={{ width: 180 }}
                          value={meta.name ?? ''}
                          onChange={(e) => updateMeta(pop.id, 'name', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="label">Qualitative</label>
                        <input
                          className="input"
                          style={{ width: 140 }}
                          value={meta.qualitative ?? ''}
                          onChange={(e) => updateMeta(pop.id, 'qualitative', e.target.value)}
                          placeholder="e.g. Dim / Bright"
                        />
                      </div>
                      <div>
                        <label className="label">Overall %</label>
                        <input
                          className="input"
                          style={{ width: 90 }}
                          type="number"
                          step="any"
                          value={meta.percentage ?? ''}
                          onChange={(e) => updateMeta(pop.id, 'percentage', e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button className="btn btn-sm" disabled={saving === pop.id} onClick={() => savePopulation(pop.id)}>
                          {saving === pop.id ? 'Saving...' : 'Save population & markers'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Marker</th>
                          <th>Fluor.</th>
                          <th>%</th>
                          <th>Abs. count</th>
                          <th>MFI</th>
                          <th>Abnormal</th>
                          <th>Critical</th>
                        </tr>
                      </thead>
                      <tbody>
                        {markers.map((def: any, idx: number) => {
                          const mid = def.markerId || def.marker?.id;
                          const cell = matrix[pop.id]?.[mid] || {};
                          return (
                            <tr key={mid || idx}>
                              <td style={{ fontWeight: 600 }}>{def.marker?.name || def.name || mid}</td>
                              <td className="muted" style={{ fontSize: 12 }}>{def.fluorochrome || ''}</td>
                              {editable ? (
                                <td>
                                  <input
                                    className="input"
                                    style={{ width: 90, padding: '4px 8px' }}
                                    type="number"
                                    step="any"
                                    value={cell.pct ?? markerRowValue(pop, mid, 'percentage')}
                                    onChange={(e) => updateCell(pop.id, mid, 'pct', e.target.value)}
                                  />
                                </td>
                              ) : (
                                <td className="mono">{markerRowValue(pop, mid, 'percentage')}</td>
                              )}
                              {editable ? (
                                <td>
                                  <input
                                    className="input"
                                    style={{ width: 100, padding: '4px 8px' }}
                                    type="number"
                                    step="any"
                                    value={cell.abs ?? markerRowValue(pop, mid, 'absoluteCount')}
                                    onChange={(e) => updateCell(pop.id, mid, 'abs', e.target.value)}
                                  />
                                </td>
                              ) : (
                                <td className="mono">{markerRowValue(pop, mid, 'absoluteCount')}</td>
                              )}
                              {editable ? (
                                <td>
                                  <input
                                    className="input"
                                    style={{ width: 90, padding: '4px 8px' }}
                                    type="number"
                                    step="any"
                                    value={cell.mfi ?? markerRowValue(pop, mid, 'mfi')}
                                    onChange={(e) => updateCell(pop.id, mid, 'mfi', e.target.value)}
                                  />
                                </td>
                              ) : (
                                <td className="mono">{markerRowValue(pop, mid, 'mfi')}</td>
                              )}
                              <td>
                                {editable ? (
                                  <input
                                    type="checkbox"
                                    checked={Boolean(cell.abn ?? markerRowValue(pop, mid, 'isAbnormal') === 'true')}
                                    onChange={(e) => updateCell(pop.id, mid, 'abn', e.target.checked)}
                                  />
                                ) : (
                                  <span className="muted">{markerRowValue(pop, mid, 'isAbnormal') ? 'Yes' : 'No'}</span>
                                )}
                              </td>
                              <td>
                                {editable ? (
                                  <input
                                    type="checkbox"
                                    checked={Boolean(cell.crit ?? markerRowValue(pop, mid, 'isCritical') === 'true')}
                                    onChange={(e) => updateCell(pop.id, mid, 'crit', e.target.checked)}
                                  />
                                ) : (
                                  <span className="muted">{markerRowValue(pop, mid, 'isCritical') ? 'Yes' : 'No'}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>
                Interpretation
              </div>
              {study.gatingStrategy && (
                <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                  Gating strategy: {study.gatingStrategy}
                </div>
              )}
              {study.resultSummary && <div style={{ fontSize: 13, marginBottom: 8 }}>{study.resultSummary}</div>}
              {!study.resultSummary && canPerform && !IMMUTABLE.includes(detail.status) && !['REJECTED', 'CANCELLED'].includes(detail.status) && (
                <>
                  <textarea
                    className="input"
                    style={{ width: '100%', minHeight: 60 }}
                    value={summaryDraft}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                    placeholder="Authorized interpretation for the report (attending pathologist)..."
                  />
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-sm"
                      disabled={saving === 'submit' || reportable.length === 0}
                      onClick={submitResults}
                    >
                      {saving === 'submit' ? 'Submitting...' : 'Submit reportable results'}
                    </button>
                    {reportable.length === 0 && (
                      <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                        Enter marker results for at least one population first.
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {IMMUTABLE.includes(detail.status) && (
              <div className="note" style={{ marginBottom: 16 }}>
                Results are finalized for this order and cannot be edited.
              </div>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <ModulePage
      title="Flow Cytometry"
      subtitle="Flow cytometry orders, population analysis and reports"
      endpoint="/flow-cytometry/orders"
      createLabel="Order Flow Cytometry"
      columns={[
        {
          key: 'orderNumber',
          label: 'Order no.',
          render: (r) => <span className="mono">{r.orderNumber}</span>,
        },
        { key: 'patient', label: 'Patient', render: (r) => patientName(r.patient) },
        {
          key: 'panel',
          label: 'Panel',
          render: (r) => r.items?.[0]?.testName || r.items?.[0]?.flowStudy?.panel?.name || '—',
        },
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
        { name: 'panelCode', label: 'Panel', required: true, type: 'select', options: PANEL_OPTIONS },
        { name: 'doctorId', label: 'Doctor', type: 'select', optionsFrom: DOCTOR_REF },
        { name: 'isStat', label: 'STAT', type: 'checkbox' },
        { name: 'isEmergency', label: 'Emergency', type: 'checkbox' },
        { name: 'clinicalNote', label: 'Clinical notes', type: 'textarea', full: true },
      ]}
      actions={[{ label: 'View', onClick: (r) => setDetailId(r.id) }]}
    />
  );
}