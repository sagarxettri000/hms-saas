'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, unwrap, listOf, safe, num } from '@/lib/api';
import EntityPage from '@/components/EntityPage';
import { formatMoney, formatDate, formatDateTime } from '@/lib/hooks';
import { PATIENT_REF } from '@/lib/options';

type Tab = 'claims' | 'preauths' | 'analytics' | 'policies' | 'providers';

interface PreAuth {
  id: string;
  patientName: string;
  providerName: string;
  treatment: string;
  estimatedCost: number;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';
  requestedDate: string;
  approvedAmount: number | null;
}

const TRACKER_STEPS = ['DRAFT', 'SUBMITTED', 'PROCESSING', 'DECISION', 'SETTLED'];
const STEP_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PROCESSING: 'Processing',
  DECISION: 'Approved / Rejected',
  SETTLED: 'Settled',
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'badge-gray',
  SUBMITTED: 'badge-blue',
  PROCESSING: 'badge-cyan',
  APPROVED: 'badge-green',
  REJECTED: 'badge-red',
  SETTLED: 'badge-green',
};

const PREAUTH_BADGE: Record<string, string> = {
  PENDING: 'badge-yellow',
  APPROVED: 'badge-green',
  DENIED: 'badge-red',
  EXPIRED: 'badge-gray',
};

const NEXT_ACTIONS: Record<string, { label: string; next: string; tone: string }[]> = {
  DRAFT: [{ label: 'Submit', next: 'SUBMITTED', tone: 'btn-primary' }],
  SUBMITTED: [
    { label: 'Process', next: 'PROCESSING', tone: 'btn-secondary' },
    { label: 'Approve', next: 'APPROVED', tone: 'btn-primary' },
    { label: 'Reject', next: 'REJECTED', tone: 'btn-danger' },
  ],
  PROCESSING: [
    { label: 'Approve', next: 'APPROVED', tone: 'btn-primary' },
    { label: 'Reject', next: 'REJECTED', tone: 'btn-danger' },
  ],
  APPROVED: [{ label: 'Settle', next: 'SETTLED', tone: 'btn-primary' }],
};

function personName(p: any): string {
  if (!p) return '—';
  if (typeof p === 'string') return p;
  const joined = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return joined || p.name || p.id || '—';
}

function uid(prefix: string): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapPreAuth(r: any): PreAuth {
  const row: PreAuth = {
    id: r.id,
    patientName: r.patientName || r.patientId || '—',
    providerName: r.providerName || '—',
    treatment: r.treatment,
    estimatedCost: num(r.estimatedCost),
    status: r.status || 'PENDING',
    requestedDate: r.requestedDate || new Date().toISOString(),
    approvedAmount: r.approvedAmount != null ? num(r.approvedAmount) : null,
  };
  const cutoff = Date.now() - 14 * 86400000;
  if (row.status === 'PENDING' && new Date(row.requestedDate).getTime() < cutoff) {
    row.status = 'EXPIRED';
  }
  return row;
}

function trackerTone(step: string, status: string): { bg: string; border: string; fg: string } {
  const idx = TRACKER_STEPS.indexOf(step);
  const decisionIdx = TRACKER_STEPS.indexOf('DECISION');
  const currentIdx =
    status === 'REJECTED'
      ? decisionIdx
      : status === 'SETTLED'
        ? TRACKER_STEPS.indexOf('SETTLED')
        : TRACKER_STEPS.indexOf(status);
  if (status === 'REJECTED') {
    if (idx < decisionIdx) return { bg: '#16a34a', border: '#16a34a', fg: '#fff' };
    if (idx === decisionIdx) return { bg: '#dc2626', border: '#dc2626', fg: '#fff' };
    return { bg: 'var(--surface)', border: '#cbd5e1', fg: '#94a3b8' };
  }
  if (idx < currentIdx) return { bg: '#16a34a', border: '#16a34a', fg: '#fff' };
  if (idx === currentIdx) return { bg: '#2563eb', border: '#2563eb', fg: '#fff' };
  return { bg: 'var(--surface)', border: '#cbd5e1', fg: '#94a3b8' };
}

function StatusTracker({ status }: { status: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
      {TRACKER_STEPS.map((step, i) => {
        const tone = trackerTone(step, status);
        const reached = tone.fg !== '#94a3b8';
        return (
          <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  right: '50%',
                  width: '100%',
                  height: 3,
                  background: trackerTone(TRACKER_STEPS[i - 1], status).fg === '#94a3b8' ? '#e2e8f0' : trackerTone(TRACKER_STEPS[i - 1], status).bg,
                  zIndex: 0,
                }}
              />
            )}
            <div
              style={{
                position: 'relative',
                zIndex: 1,
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: tone.bg,
                border: `2px solid ${tone.border}`,
                color: tone.fg,
                fontSize: 13,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {reached && tone.bg !== '#2563eb' ? '✓' : i + 1}
            </div>
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                fontWeight: reached || tone.bg === '#2563eb' ? 600 : 400,
                color: reached ? tone.bg : '#94a3b8',
                textAlign: 'center',
              }}
            >
              {STEP_LABELS[step]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function InsurancePage() {
  const [tab, setTab] = useState<Tab>('claims');
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [detailClaim, setDetailClaim] = useState<any | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [claimForm, setClaimForm] = useState({ patientId: '', providerId: '', policyId: '', claimAmount: '', notes: '' });
  const [preAuths, setPreAuths] = useState<PreAuth[]>([]);
  const [preAuthOpen, setPreAuthOpen] = useState(false);
  const [preAuthForm, setPreAuthForm] = useState({ patientName: '', providerName: '', treatment: '', estimatedCost: '' });

  const loadCore = useCallback(async () => {
    setLoading(true);
    const [claimsR, patientsR, providersR, policiesR, preauthsR] = await Promise.all([
      safe(api('/insurance/claims')),
      safe(api('/patients?limit=500')),
      safe(api('/insurance/providers?limit=500')),
      safe(api('/insurance/policies')),
      safe(api('/insurance/preauthorizations?limit=200')),
    ]);
    setClaims(listOf(claimsR));
    setPatients(listOf(patientsR));
    setProviders(listOf(providersR));
    setPolicies(listOf(policiesR));
    setPreAuths(listOf(preauthsR).map((r: any) => mapPreAuth(r)));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  async function transition(claim: any, next: string) {
    let body: Record<string, unknown> = { status: next };
    if (next === 'APPROVED') {
      const amt = window.prompt('Approved amount:', String(num(claim.claimAmount)));
      if (!amt) return;
      body = { ...body, approvedAmount: num(amt) };
    }
    if (next === 'REJECTED') {
      const reason = window.prompt('Rejection reason:');
      if (!reason) return;
      body = { ...body, rejectionReason: reason };
    }
    try {
      await api(`/insurance/claims/${claim.id}/status`, { method: 'PATCH', body: JSON.stringify(body) });
      await loadCore();
      setDetailClaim(null);
    } catch {
      window.alert('Could not update claim status');
    }
  }

  function openCreate() {
    setClaimForm({ patientId: '', providerId: '', policyId: '', claimAmount: '', notes: '' });
    setCreateOpen(true);
  }

  async function submitClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!claimForm.patientId || !claimForm.policyId || !num(claimForm.claimAmount)) {
      window.alert('Patient, policy and claim amount are required');
      return;
    }
    try {
      await api('/insurance/claims', {
        method: 'POST',
        body: JSON.stringify({
          patientId: claimForm.patientId,
          policyId: claimForm.policyId,
          providerId: claimForm.providerId || undefined,
          claimAmount: num(claimForm.claimAmount),
          notes: claimForm.notes || undefined,
        }),
      });
      setCreateOpen(false);
      await loadCore();
    } catch {
      window.alert('Could not create claim');
    }
  }

  async function submitPreAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!preAuthForm.patientName.trim() || !preAuthForm.providerName.trim() || !preAuthForm.treatment.trim() || !num(preAuthForm.estimatedCost)) {
      window.alert('Patient, provider, treatment and estimated cost are required');
      return;
    }
    try {
      await api('/insurance/preauthorizations', {
        method: 'POST',
        body: JSON.stringify({
          patientName: preAuthForm.patientName.trim(),
          providerName: preAuthForm.providerName.trim(),
          treatment: preAuthForm.treatment.trim(),
          estimatedCost: num(preAuthForm.estimatedCost),
        }),
      });
      setPreAuthOpen(false);
      setPreAuthForm({ patientName: '', providerName: '', treatment: '', estimatedCost: '' });
      await loadCore();
    } catch {
      window.alert('Could not create pre-authorization request');
    }
  }

  async function approvePreAuth(row: PreAuth) {
    const amt = window.prompt('Approved amount:', String(row.estimatedCost));
    if (!amt) return;
    try {
      await api(`/insurance/preauthorizations/${row.id}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({ decision: 'APPROVED', approvedAmount: num(amt) }),
      });
      await loadCore();
    } catch {
      window.alert('Could not approve pre-authorization');
    }
  }

  async function denyPreAuth(row: PreAuth) {
    if (!window.confirm(`Deny pre-authorization for ${row.patientName}?`)) return;
    try {
      await api(`/insurance/preauthorizations/${row.id}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({ decision: 'DENIED' }),
      });
      await loadCore();
    } catch {
      window.alert('Could not deny pre-authorization');
    }
  }

  const filteredClaims = claims.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(c.claimNumber || '').toLowerCase().includes(q) ||
      personName(c.patient).toLowerCase().includes(q) ||
      String(c.provider?.name || '').toLowerCase().includes(q)
    );
  });

  const analytics = (() => {
    const totalValue = claims.reduce((s, c) => s + num(c.claimAmount), 0);
    const pending = claims.filter((c) => ['DRAFT', 'SUBMITTED', 'PROCESSING'].includes(c.status));
    const pendingValue = pending.reduce((s, c) => s + num(c.claimAmount), 0);
    const approvedClaims = claims.filter((c) => ['APPROVED', 'SETTLED'].includes(c.status));
    const approvedValue = approvedClaims.reduce((s, c) => s + num(c.approvedAmount), 0);
    const rejectedClaims = claims.filter((c) => c.status === 'REJECTED');
    const rejectedValue = rejectedClaims.reduce((s, c) => s + num(c.claimAmount), 0);
    const decided = approvedClaims.length + rejectedClaims.length;
    const approvalRate = decided > 0 ? Math.round((approvedClaims.length / decided) * 100) : 0;
    const durations = claims
      .filter((c) => c.submittedAt)
      .map((c) => {
        const start = new Date(c.submittedAt).getTime();
        const end = c.settledAt || c.approvedAt || c.rejectedAt ? new Date(c.settledAt || c.approvedAt || c.rejectedAt).getTime() : Date.now();
        return Math.max(0, (end - start) / 86400000);
      });
    const avgProcessing = durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;
    const byProvider: Record<string, { count: number; value: number }> = {};
    for (const c of claims) {
      const name = c.provider?.name || 'Unknown provider';
      byProvider[name] = byProvider[name] || { count: 0, value: 0 };
      byProvider[name].count += 1;
      byProvider[name].value += num(c.claimAmount);
    }
    const providerRows = Object.entries(byProvider)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value - a.value);
    const providerMax = Math.max(1, ...providerRows.map((r) => r.value));
    return {
      totalValue,
      pendingCount: pending.length,
      pendingValue,
      approvedValue,
      approvedCount: approvedClaims.length,
      rejectedValue,
      rejectedCount: rejectedClaims.length,
      approvalRate,
      avgProcessing,
      providerRows,
      providerMax,
    };
  })();

  const patientPolicyOptions = policies.filter((p) => p.patientId === claimForm.patientId);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Insurance</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>Claims, pre-authorizations, policies and providers</p>
        </div>
        {tab === 'claims' && (
          <button className="btn btn-primary btn-sm" onClick={openCreate}>New Claim</button>
        )}
        {tab === 'preauths' && (
          <button className="btn btn-primary btn-sm" onClick={() => { setPreAuthForm({ patientName: '', providerName: '', treatment: '', estimatedCost: '' }); setPreAuthOpen(true); }}>Request Pre-Auth</button>
        )}
      </div>

      <div className="tabs">
        {(
          [
            ['claims', 'Claims'],
            ['preauths', 'Pre-Authorizations'],
            ['analytics', 'Analytics'],
            ['policies', 'Policies'],
            ['providers', 'Providers'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading insurance data…</div>
      ) : (
        <>
          {tab === 'claims' && (
            <>
              <div className="toolbar">
                <input
                  className="input search-input"
                  placeholder="Search by claim #, patient or provider…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="note">{filteredClaims.length} claims</span>
              </div>

              {filteredClaims.length === 0 ? (
                <div className="empty">No claims found</div>
              ) : (
                <div className="table-wrap card" style={{ padding: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Claim #</th>
                        <th>Patient</th>
                        <th>Provider</th>
                        <th>Claimed</th>
                        <th>Approved</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClaims.map((claim) => (
                        <tr key={claim.id} className="row-clickable" onClick={() => setDetailClaim(claim)}>
                          <td><span className="mono">{claim.claimNumber}</span></td>
                          <td>{personName(claim.patient)}</td>
                          <td>{claim.provider?.name || '—'}</td>
                          <td>{formatMoney(claim.claimAmount)}</td>
                          <td>{claim.approvedAmount != null ? formatMoney(claim.approvedAmount) : '—'}</td>
                          <td>
                            <span className={`badge ${STATUS_BADGE[claim.status] || 'badge-gray'}`}>{claim.status}</span>
                          </td>
                          <td>{formatDate(claim.submittedAt)}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {(NEXT_ACTIONS[claim.status] || []).map((a) => (
                                <button
                                  key={a.label + a.next}
                                  className={`btn btn-sm ${a.tone}`}
                                  onClick={() => transition(claim, a.next)}
                                >
                                  {a.label}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detailClaim && (
                <div className="modal-backdrop" onClick={() => setDetailClaim(null)}>
                  <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                    <div className="row-between" style={{ marginBottom: 16 }}>
                      <h3 style={{ margin: 0 }}>Claim {detailClaim.claimNumber}</h3>
                      <button className="btn btn-sm" onClick={() => setDetailClaim(null)}>Close</button>
                    </div>
                    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                      <StatusTracker status={detailClaim.status} />
                    </div>
                    <dl className="kv" style={{ marginBottom: 16 }}>
                      <dt>Status</dt>
                      <dd><span className={`badge ${STATUS_BADGE[detailClaim.status] || 'badge-gray'}`}>{detailClaim.status}</span></dd>
                      <dt>Patient</dt>
                      <dd>{personName(detailClaim.patient)}{detailClaim.patient?.mrn ? ` (${detailClaim.patient.mrn})` : ''}</dd>
                      <dt>Provider</dt>
                      <dd>{detailClaim.provider?.name || '—'}</dd>
                      <dt>Policy</dt>
                      <dd><span className="mono">{detailClaim.policy?.policyNumber || '—'}</span></dd>
                      <dt>Claim Amount</dt>
                      <dd>{formatMoney(detailClaim.claimAmount)}</dd>
                      <dt>Approved Amount</dt>
                      <dd>{detailClaim.approvedAmount != null ? formatMoney(detailClaim.approvedAmount) : '—'}</dd>
                      <dt>Submitted</dt>
                      <dd>{formatDateTime(detailClaim.submittedAt)}</dd>
                      <dt>Approved</dt>
                      <dd>{formatDateTime(detailClaim.approvedAt)}</dd>
                      <dt>Rejected</dt>
                      <dd>{formatDateTime(detailClaim.rejectedAt)}</dd>
                      <dt>Rejection Reason</dt>
                      <dd>{detailClaim.rejectionReason || '—'}</dd>
                      <dt>Settled</dt>
                      <dd>{formatDateTime(detailClaim.settledAt)}</dd>
                      <dt>Notes</dt>
                      <dd>{detailClaim.notes || '—'}</dd>
                      <dt>Documents</dt>
                      <dd>
                        {detailClaim.documents ? (
                          <pre className="textarea-mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(detailClaim.documents, null, 2)}</pre>
                        ) : (
                          '—'
                        )}
                      </dd>
                      <dt>Created</dt>
                      <dd>{formatDateTime(detailClaim.createdAt)}</dd>
                    </dl>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(NEXT_ACTIONS[detailClaim.status] || []).map((a) => (
                        <button
                          key={a.label + a.next}
                          className={`btn btn-sm ${a.tone}`}
                          onClick={() => transition(detailClaim, a.next)}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'preauths' && (
            <>
              {preAuths.length === 0 ? (
                <div className="empty">No pre-authorization requests yet</div>
              ) : (
                <div className="table-wrap card" style={{ padding: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Provider</th>
                        <th>Treatment</th>
                        <th>Estimated Cost</th>
                        <th>Status</th>
                        <th>Requested Date</th>
                        <th>Approved Amount</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preAuths.map((row) => (
                        <tr key={row.id}>
                          <td>{row.patientName}</td>
                          <td>{row.providerName}</td>
                          <td>{row.treatment}</td>
                          <td>{formatMoney(row.estimatedCost)}</td>
                          <td>
                            <span className={`badge ${PREAUTH_BADGE[row.status]}`}>{row.status}</span>
                          </td>
                          <td>{formatDate(row.requestedDate)}</td>
                          <td>{row.approvedAmount != null ? formatMoney(row.approvedAmount) : '—'}</td>
                          <td>
                            {row.status === 'PENDING' ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-sm btn-primary" onClick={() => approvePreAuth(row)}>Approve</button>
                                <button className="btn btn-sm btn-danger" onClick={() => denyPreAuth(row)}>Deny</button>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'analytics' && (
            <>
              <div className="stat-grid">
                <div className="card stat-card">
                  <p className="stat-label">Total Claims Value</p>
                  <p className="stat-value stat-blue">{formatMoney(analytics.totalValue)}</p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Pending Claims Value</p>
                  <p className="stat-value stat-amber">{formatMoney(analytics.pendingValue)}<span className="note"> · {analytics.pendingCount}</span></p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Approved Value</p>
                  <p className="stat-value stat-green">{formatMoney(analytics.approvedValue)}<span className="note"> · {analytics.approvedCount}</span></p>
                </div>
                <div className="card stat-card">
                  <p className="stat-label">Rejected Value</p>
                  <p className="stat-value stat-red">{formatMoney(analytics.rejectedValue)}<span className="note"> · {analytics.rejectedCount}</span></p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 20, marginTop: 20 }}>
                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Claims by provider</h4>
                  {analytics.providerRows.length === 0 ? (
                    <div className="empty">No claims recorded yet</div>
                  ) : (
                    analytics.providerRows.slice(0, 10).map((r) => (
                      <div key={r.name} className="bar-row">
                        <div className="bar-label">
                          <span>{r.name}</span>
                          <span className="bar-count">{formatMoney(r.value)} · {r.count} claims</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill bar-blue" style={{ width: `${(r.value / analytics.providerMax) * 100}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ marginTop: 0 }}>Approval metrics</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div>
                      <div className="bar-label">
                        <span>Approval rate</span>
                        <span className="bar-count">{analytics.approvalRate}%</span>
                      </div>
                      <div className="bar-track" style={{ height: 14 }}>
                        <div className="bar-fill bar-green" style={{ width: `${analytics.approvalRate}%` }} />
                      </div>
                    </div>
                    <div className="row-between">
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Average processing time</span>
                      <strong>{analytics.avgProcessing.toFixed(1)} days</strong>
                    </div>
                    <div className="row-between">
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total claims</span>
                      <strong>{claims.length}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 0, marginTop: 20 }}>
                <div className="row-between" style={{ padding: '14px 16px 0' }}>
                  <h4 style={{ margin: 0 }}>Top 5 providers by claim value</h4>
                </div>
                {analytics.providerRows.length === 0 ? (
                  <div className="empty">No provider data yet</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Provider</th>
                          <th>Claims</th>
                          <th>Total Claim Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.providerRows.slice(0, 5).map((r) => (
                          <tr key={r.name}>
                            <td>{r.name}</td>
                            <td>{r.count}</td>
                            <td>{formatMoney(r.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'policies' && (
            <EntityPage
              title="Insurance Policies"
              subtitle="Patient insurance policies"
              endpoint="/insurance/policies"
              createLabel="Add policy"
              columns={[
                { key: 'policyNumber', label: 'Policy #', render: (r) => <span className="mono">{r.policyNumber}</span> },
                { key: 'patient', label: 'Patient', render: (r) => personName(r.patient) },
                { key: 'provider', label: 'Provider', render: (r) => r.provider?.name || '—' },
                { key: 'memberId', label: 'Member ID', render: (r) => r.memberId || '—' },
                { key: 'coverageLimit', label: 'Limit', render: (r) => (r.coverageLimit ? formatMoney(r.coverageLimit) : '—') },
                { key: 'expiryDate', label: 'Expires', render: (r) => formatDate(r.expiryDate) },
                { key: 'status', label: 'Status', badge: true },
              ]}
              fields={[
                { name: 'patientId', label: 'Patient', required: true, type: 'searchSelect', optionsFrom: PATIENT_REF },
                { name: 'providerId', label: 'Provider', required: true, type: 'select', options: providers.map((p: any) => ({ value: p.id, label: p.name })) },
                { name: 'policyNumber', label: 'Policy Number', required: true },
                { name: 'groupNumber', label: 'Group Number' },
                { name: 'memberId', label: 'Member ID' },
                { name: 'coverageLimit', label: 'Coverage Limit', type: 'number' },
                { name: 'startDate', label: 'Start Date', type: 'date' },
                { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
              ]}
            />
          )}

          {tab === 'providers' && (
            <EntityPage
              title="Insurance Providers"
              subtitle="Manage insurance companies and TPAs"
              endpoint="/insurance/providers"
              createLabel="Add provider"
              columns={[
                { key: 'name', label: 'Name' },
                { key: 'code', label: 'Code', render: (r) => <span className="mono">{r.code || '—'}</span> },
                { key: 'type', label: 'Type', badge: true },
                { key: 'contactPerson', label: 'Contact', render: (r) => r.contactPerson || '—' },
                { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
                { key: 'email', label: 'Email', render: (r) => r.email || '—' },
                { key: 'isActive', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
              ]}
              fields={[
                { name: 'name', label: 'Name', required: true },
                { name: 'code', label: 'Code' },
                { name: 'type', label: 'Type', type: 'select', options: [{ value: 'NATIONAL', label: 'National' }, { value: 'PRIVATE', label: 'Private' }, { value: 'TPA', label: 'TPA' }, { value: 'EMPLOYER', label: 'Employer' }] },
                { name: 'contactPerson', label: 'Contact person' },
                { name: 'phone', label: 'Phone' },
                { name: 'email', label: 'Email', type: 'email' },
                { name: 'address', label: 'Address', type: 'textarea', full: true },
              ]}
            />
          )}
        </>
      )}

      {createOpen && (
        <div className="modal-backdrop" onClick={() => setCreateOpen(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <h3>New Claim</h3>
            <form onSubmit={submitClaim}>
              <div className="form-grid">
                <div className="field">
                  <label className="label">Patient *</label>
                  <select
                    className="input"
                    value={claimForm.patientId}
                    onChange={(e) => setClaimForm({ ...claimForm, patientId: e.target.value, policyId: '' })}
                  >
                    <option value="">Select patient…</option>
                    {patients.map((p: any) => (
                      <option key={p.id} value={p.id}>{personName(p)}{p.mrn ? ` · ${p.mrn}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Policy *</label>
                  <select
                    className="input"
                    value={claimForm.policyId}
                    onChange={(e) => setClaimForm({ ...claimForm, policyId: e.target.value })}
                    disabled={!claimForm.patientId}
                  >
                    <option value="">{claimForm.patientId ? 'Select policy…' : 'Pick a patient first…'}</option>
                    {patientPolicyOptions.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.policyNumber}{p.provider?.name ? ` · ${p.provider.name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Provider</label>
                  <select
                    className="input"
                    value={claimForm.providerId}
                    onChange={(e) => setClaimForm({ ...claimForm, providerId: e.target.value })}
                  >
                    <option value="">Auto (from policy)</option>
                    {providers.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Claim Amount *</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={claimForm.claimAmount}
                    onChange={(e) => setClaimForm({ ...claimForm, claimAmount: e.target.value })}
                  />
                </div>
                <div className="field field-full">
                  <label className="label">Notes</label>
                  <textarea
                    className="input textarea"
                    rows={3}
                    value={claimForm.notes}
                    onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Claim</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {preAuthOpen && (
        <div className="modal-backdrop" onClick={() => setPreAuthOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Request Pre-Authorization</h3>
            <form onSubmit={submitPreAuth}>
              <div className="form-grid">
                <div className="field">
                  <label className="label">Patient *</label>
                  <select
                    className="input"
                    value={preAuthForm.patientName}
                    onChange={(e) => setPreAuthForm({ ...preAuthForm, patientName: e.target.value })}
                  >
                    <option value="">Select patient…</option>
                    {patients.map((p: any) => (
                      <option key={p.id} value={personName(p)}>{personName(p)}{p.mrn ? ` · ${p.mrn}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Provider *</label>
                  <select
                    className="input"
                    value={preAuthForm.providerName}
                    onChange={(e) => setPreAuthForm({ ...preAuthForm, providerName: e.target.value })}
                  >
                    <option value="">Select provider…</option>
                    {providers.map((p: any) => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field field-full">
                  <label className="label">Treatment Description *</label>
                  <textarea
                    className="input textarea"
                    rows={3}
                    value={preAuthForm.treatment}
                    onChange={(e) => setPreAuthForm({ ...preAuthForm, treatment: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="label">Estimated Cost *</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={preAuthForm.estimatedCost}
                    onChange={(e) => setPreAuthForm({ ...preAuthForm, estimatedCost: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPreAuthOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}