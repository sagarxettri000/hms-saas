'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/hooks';

interface Incident {
  id: string;
  title?: string;
  description?: string;
  type?: string;
  severity?: string;
  status?: string;
  affectedCount?: number;
  patient?: any;
  assignedTo?: string;
  occurredAt?: string;
  createdAt?: string;
}

const STATUS_TONES: Record<string, string> = {
  OPEN: 'badge-red',
  INVESTIGATING: 'badge-yellow',
  CAPA_IN_PROGRESS: 'badge-blue',
  RESOLVED: 'badge-green',
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: '#16a34a',
  MEDIUM: '#d97706',
  HIGH: '#ea580c',
  CRITICAL: '#dc2626',
};

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const NEXT_STATUS: Record<string, { label: string; status: string }> = {
  OPEN: { label: 'Start Investigation', status: 'INVESTIGATING' },
  INVESTIGATING: { label: 'Begin CAPA', status: 'CAPA_IN_PROGRESS' },
  CAPA_IN_PROGRESS: { label: 'Resolve', status: 'RESOLVED' },
};

const CHECKLIST_CATEGORIES: { name: string; items: string[] }[] = [
  {
    name: 'Patient Safety',
    items: [
      'Patient identification policy followed for all encounters (two identifiers)',
      'Fall risk assessment completed on admission and each shift',
      'Critical values reported and documented within defined timeframe',
      'Surgical safety checklist (sign in / time out / sign out) used for all procedures',
      'Code blue response drill conducted and documented this quarter',
    ],
  },
  {
    name: 'Infection Control',
    items: [
      'Hand hygiene compliance audit completed monthly with results displayed',
      'Sharps disposal bins available at all point-of-care locations',
      'High-touch surface disinfection schedule followed in all wards',
      'Healthcare-associated infection surveillance data reviewed weekly',
      'Isolation precautions signage and PPE stock verified',
    ],
  },
  {
    name: 'Medication Safety',
    items: [
      'High-alert medications stored separately with double-check documentation',
      'Medication reconciliation completed at admission, transfer and discharge',
      'Look-alike sound-alike drugs segregated and labelled',
      'Cold chain monitoring log maintained for refrigerated medicines',
      'Prescription audit for legibility and completeness performed monthly',
    ],
  },
  {
    name: 'Facility Management',
    items: [
      'Fire extinguishers and alarms inspected within last month',
      'Emergency exits unobstructed and illuminated on all floors',
      'Biomedical equipment preventive maintenance up to date',
      'Generator tested under load and fuel levels logged',
      'Water potability testing done as per scheduled frequency',
    ],
  },
];

function unwrap(r: any): any {
  return r?.data?.data ?? r?.data ?? r;
}

function personName(p: any): string {
  if (!p) return '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || p.mrn || '—';
}

export default function QualityPage() {
  const [tab, setTab] = useState<'incidents' | 'kpi' | 'checklists'>('incidents');

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', severity: 'MEDIUM', patientId: '', affectedCount: '' });

  const [analysis, setAnalysis] = useState<any>(null);

  const [checkedMap, setCheckedMap] = useState<Record<string, string[]>>({});

  const loadIncidents = useCallback(async () => {
    setLoadingIncidents(true);
    setError(null);
    try {
      const data = unwrap(await api('/adverse-events?limit=100'));
      setIncidents(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incidents');
    }
    setLoadingIncidents(false);
  }, []);

  useEffect(() => {
    if (tab === 'incidents') loadIncidents();
  }, [tab, loadIncidents]);

  useEffect(() => {
    if (tab !== 'kpi') return;
    api('/adverse-events?limit=500')
      .then((r) => {
        const data = unwrap(r);
        setIncidents(Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []);
      })
      .catch(() => {});
    api('/reports/analysis')
      .then((r) => setAnalysis(unwrap(r)))
      .catch(() => {});
  }, [tab]);

  useEffect(() => {
    const map: Record<string, string[]> = {};
    CHECKLIST_CATEGORIES.forEach((c) => {
      map[c.name] = [];
    });
    api('/quality/checklists')
      .then((r) => {
        const data = unwrap(r);
        const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
        const next = { ...map };
        rows.forEach((row: any) => {
          if (!row || !row.checked || !row.category) return;
          next[row.category] = [...(next[row.category] || []), row.item];
        });
        setCheckedMap(next);
      })
      .catch(() => setCheckedMap(map));
  }, []);

  const toggleItem = (category: string, item: string) => {
    const current = checkedMap[category] || [];
    const nextChecked = current.includes(item);
    const next = nextChecked ? current.filter((i) => i !== item) : [...current, item];
    setCheckedMap((prev) => ({ ...prev, [category]: next }));
    api('/quality/checklists/toggle', {
      method: 'PATCH',
      body: JSON.stringify({ category, item, checked: !nextChecked }),
    }).catch(() => {});
  };

  const createIncident = async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api('/adverse-events', {
        method: 'POST',
        body: JSON.stringify({
          type: form.title.trim(),
          description: form.description.trim(),
          severity: form.severity,
          patientId: form.patientId || undefined,
          affectedCount: form.affectedCount ? Number(form.affectedCount) : undefined,
        }),
      });
      setShowCreate(false);
      setForm({ title: '', description: '', severity: 'MEDIUM', patientId: '', affectedCount: '' });
      await loadIncidents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create incident');
    }
    setSaving(false);
  };

  const advanceStatus = async (incident: Incident) => {
    const step = NEXT_STATUS[incident.status || ''];
    if (!step || busyId) return;
    setBusyId(incident.id);
    try {
      await api(`/adverse-events/${incident.id}`, { method: 'PATCH', body: JSON.stringify({ status: step.status }) });
      setIncidents((prev) => prev.map((i) => (i.id === incident.id ? { ...i, status: step.status } : i)));
    } catch {}
    setBusyId(null);
  };

  const kpi = useMemo(() => {
    const total = incidents.length;
    const open = incidents.filter((i) => i.status === 'OPEN').length;
    const capa = incidents.filter((i) => i.status === 'CAPA_IN_PROGRESS').length;
    const resolved = incidents.filter((i) => i.status === 'RESOLVED').length;
    const months: { label: string; count: number; key: string }[] = [];
    const now = new Date();
    for (let idx = 5; idx >= 0; idx--) {
      const d = new Date(now.getFullYear(), now.getMonth() - idx, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleString(undefined, { month: 'short' }),
        count: 0,
      });
    }
    incidents.forEach((i) => {
      const d = new Date(i.occurredAt || i.createdAt || '');
      if (isNaN(d.getTime())) return;
      const m = months.find((mm) => mm.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.count++;
    });
    const severityCounts = SEVERITIES.map((s) => ({
      severity: s,
      count: incidents.filter((i) => String(i.severity || '').toUpperCase() === s).length,
    }));
    const typeCounts: Record<string, number> = {};
    incidents.forEach((i) => {
      const t = i.type || i.title || 'Unclassified';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));
    const maxMonth = Math.max(1, ...months.map((m) => m.count));
    return { total, open, capa, resolved, months, maxMonth, severityCounts, topTypes };
  }, [incidents]);

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1>Quality Management</h1>
          <p className="page-subtitle">Incidents, KPIs and accreditation checklists</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button className={`tab ${tab === 'incidents' ? 'active' : ''}`} onClick={() => setTab('incidents')}>Incidents</button>
        <button className={`tab ${tab === 'kpi' ? 'active' : ''}`} onClick={() => setTab('kpi')}>KPI Dashboard</button>
        <button className={`tab ${tab === 'checklists' ? 'active' : ''}`} onClick={() => setTab('checklists')}>Checklists</button>
      </div>

      {tab === 'incidents' && (
        <>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{incidents.length} incidents</span>
            <button type="button" className="btn btn-sm" onClick={() => setShowCreate(true)}>+ Report Incident</button>
          </div>

          {error && <div className="banner-danger">{error}</div>}

          {loadingIncidents ? (
            <div className="loading">Loading incidents…</div>
          ) : !incidents.length ? (
            <div className="empty">No incidents reported.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Date</th>
                    <th>Patient</th>
                    <th>Type</th>
                    <th>People Involved</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Assigned To</th>
                    <th style={{ width: 1 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((i) => {
                    const step = NEXT_STATUS[i.status || ''];
                    return (
                      <tr key={i.id}>
                        <td className="mono">{i.id.slice(0, 8)}</td>
                        <td>{formatDate(i.occurredAt || i.createdAt)}</td>
                        <td>{personName(i.patient)}</td>
                        <td><strong>{i.type || i.title || '—'}</strong></td>
                        <td>{i.affectedCount != null ? i.affectedCount : '—'}</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: SEVERITY_COLORS[String(i.severity || '').toUpperCase()] || '#64748b',
                              color: '#fff',
                            }}
                          >
                            {(i.severity || 'UNKNOWN').toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${STATUS_TONES[i.status || ''] || 'badge-gray'}`}>
                            {(i.status || 'UNKNOWN').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>{i.assignedTo || '—'}</td>
                        <td>
                          {step && (
                            <button
                              className="btn btn-sm btn-secondary"
                              disabled={busyId === i.id}
                              onClick={() => advanceStatus(i)}
                            >
                              {step.label}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {showCreate && (
            <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">Report Incident</h3>
                  <button className="modal-close" onClick={() => setShowCreate(false)}>x</button>
                </div>
                <div className="form-grid">
                  <div className="field field-full">
                    <label className="label">Title</label>
                    <input
                      className="input"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Medication error"
                    />
                  </div>
                  <div className="field field-full">
                    <label className="label">Description</label>
                    <textarea
                      className="textarea"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="What happened?"
                    />
                  </div>
                  <div className="field">
                    <label className="label">People Involved</label>
                    <input
                      type="number"
                      min={1}
                      className="input"
                      value={form.affectedCount}
                      onChange={(e) => setForm({ ...form, affectedCount: e.target.value })}
                      placeholder="e.g. 2"
                    />
                  </div>
                  <div className="field">
                    <label className="label">Severity</label>
                    <select
                      className="select"
                      value={form.severity}
                      onChange={(e) => setForm({ ...form, severity: e.target.value })}
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label">Patient ID</label>
                    <input
                      className="input"
                      value={form.patientId}
                      onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                      placeholder="Optional patient UUID"
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</button>
                  <button className="btn" onClick={createIncident} disabled={saving}>
                    {saving ? 'Saving…' : 'Submit'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'kpi' && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Total Incidents</div>
              <div className="stat-value">{kpi.total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Open</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{kpi.open}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">In CAPA</div>
              <div className="stat-value" style={{ color: 'var(--info)' }}>{kpi.capa}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Resolved</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{kpi.resolved}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Incidents by Month (Last 6 Months)</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: 180, padding: '0 12px' }}>
              {kpi.months.map((m) => (
                <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{m.count}</div>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 64,
                      height: `${Math.round((m.count / kpi.maxMonth) * 100)}%`,
                      minHeight: m.count > 0 ? 6 : 2,
                      background: 'var(--primary)',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Incidents by Severity</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {kpi.severityCounts.map((s) => (
                  <div
                    key={s.severity}
                    className="stat-card"
                    style={{
                      background: SEVERITY_COLORS[s.severity],
                      color: '#fff',
                      border: 'none',
                    }}
                  >
                    <div className="stat-label" style={{ color: 'rgba(255,255,255,0.85)' }}>{s.severity}</div>
                    <div className="stat-value" style={{ color: '#fff' }}>{s.count}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Top Incident Types</h3>
              {!kpi.topTypes.length ? (
                <div className="empty">No incident types recorded.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {kpi.topTypes.map((t, idx) => (
                        <tr key={t.name}>
                          <td>{idx + 1}. <strong>{t.name}</strong></td>
                          <td style={{ textAlign: 'right' }}>{t.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {analysis != null && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  Analysis reports loaded: {Array.isArray(analysis) ? analysis.length : Object.keys(analysis).length}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'checklists' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {CHECKLIST_CATEGORIES.map((cat) => {
            const checked = checkedMap[cat.name] || [];
            const pct = cat.items.length ? Math.round((checked.length / cat.items.length) * 100) : 0;
            return (
              <div className="card" key={cat.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{cat.name}</h3>
                  <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? 'var(--success)' : 'var(--text-muted)' }}>{pct}%</span>
                </div>
                <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--success)' : 'var(--primary)', transition: 'width 0.2s' }} />
                </div>
                {cat.items.map((item) => (
                  <label key={item} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={checked.includes(item)}
                      onChange={() => toggleItem(cat.name, item)}
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
