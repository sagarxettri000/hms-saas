'use client';

import { useState, useEffect } from 'react';
import { api, unwrap, listOf } from '@/lib/api';
import { formatDateTime } from '@/lib/hooks';

type Tab = 'activity' | 'compliance' | 'anomalies';

interface Anomaly {
  key: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  desc: string;
  rec: string;
}

const TAB_LABELS: Record<Tab, string> = {
  activity: 'Activity Log',
  compliance: 'Compliance',
  anomalies: 'Anomalies',
};

function personOf(l: any): string {
  if (l.user) {
    const name = [l.user.firstName, l.user.lastName].filter(Boolean).join(' ');
    return name || l.user.email || 'Unknown user';
  }
  return l.performedBy || 'Unknown user';
}

function actionTone(action: string): string {
  if (/FAIL|ERROR|REJECT|DELETE/i.test(action)) return 'badge-red';
  if (/CREATE|LOGIN$|REGISTER|APPROVE/i.test(action)) return 'badge-green';
  if (/UPDATE|PATCH|EXPORT|PRINT/i.test(action)) return 'badge-yellow';
  if (/VIEW|READ|LIST/i.test(action)) return 'badge-blue';
  return 'badge-gray';
}

function isFailedLogin(action: string): boolean {
  return /LOGIN_FAIL|FAILED_LOGIN|LOGIN_FAILURE|AUTH_FAIL|INVALID_CREDENTIAL/i.test(action);
}

function isAuthAction(action: string): boolean {
  return /LOGIN|LOGOUT|SESSION/i.test(action);
}

function isAccessAction(action: string): boolean {
  return /(VIEW|READ|ACCESS|FETCH)_?(PATIENT|RECORD|DATA)?/i.test(action) && !isAuthAction(action);
}

function isFinancialAction(action: string): boolean {
  return /PAYMENT|REFUND|INVOICE|BILL|SETTLE|WRITE_?OFF/i.test(action);
}

function isExportAction(action: string): boolean {
  return /EXPORT|BULK_?(DOWNLOAD|EXPORT)/i.test(action);
}

function isAfterHours(dateStr: any): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const h = d.getHours();
  return h >= 22 || h < 6;
}

function dayKey(dateStr: any): string {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10);
}

function detectAnomalies(logs: any[]): Anomaly[] {
  const out: Anomaly[] = [];
  const failedByUser = new Map<string, number>();
  const afterByUser = new Map<string, number>();
  const exportsByUserDay = new Map<string, number>();

  for (const l of logs) {
    const action = String(l.action || '');
    const who = personOf(l);
    if (isFailedLogin(action)) failedByUser.set(who, (failedByUser.get(who) || 0) + 1);
    if (!isAuthAction(action) && isAfterHours(l.createdAt))
      afterByUser.set(who, (afterByUser.get(who) || 0) + 1);
    if (isExportAction(action)) {
      const k = `${who}|${dayKey(l.createdAt)}`;
      exportsByUserDay.set(k, (exportsByUserDay.get(k) || 0) + 1);
    }
  }

  for (const [who, count] of failedByUser) {
    if (count < 3) continue;
    out.push({
      key: `failed-${who}`,
      severity: count >= 5 ? 'HIGH' : 'MEDIUM',
      title: 'Repeated failed logins',
      desc: `${count} failed login attempts recorded for ${who}.`,
      rec: 'Force a password reset for this account and verify the owner attempted access.',
    });
  }

  for (const [who, count] of afterByUser) {
    if (count < 3) continue;
    out.push({
      key: `afterhours-${who}`,
      severity: count >= 8 ? 'HIGH' : 'MEDIUM',
      title: 'After-hours system access',
      desc: `${who} performed ${count} actions between 10 PM and 6 AM.`,
      rec: 'Confirm the user was on an approved night shift and review the records they accessed.',
    });
  }

  for (const [key, count] of exportsByUserDay) {
    if (count < 5) continue;
    const [who, day] = key.split('|');
    out.push({
      key: `export-${key}`,
      severity: 'HIGH',
      title: 'Bulk data export',
      desc: `${who} exported ${count} datasets on ${day}.`,
      rec: 'Verify the export was authorized and notify the compliance officer.',
    });
  }

  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>;
  out.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  return out;
}

const SEVERITY_TONES: Record<string, string> = {
  HIGH: 'badge-red',
  MEDIUM: 'badge-yellow',
  LOW: 'badge-gray',
};

export default function AuditPage() {
  const [tab, setTab] = useState<Tab>('activity');
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    api('/audit?limit=500')
      .then((r: any) => setLogs(listOf(r)))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = logs.filter((l) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [l.action, l.entity, l.entityId, personOf(l), l.ipAddress]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const accessLogs = logs.filter((l) => isAccessAction(String(l.action || '')));
  const afterHoursAccess = accessLogs.filter((l) => isAfterHours(l.createdAt)).length;
  const accessScore = Math.max(35, 100 - afterHoursAccess * 5);

  const finLogs = logs.filter((l) => isFinancialAction(String(l.action || '')));
  const refundCount = finLogs.filter((l) => /REFUND/i.test(String(l.action))).length;
  const finScore =
    refundCount === 0
      ? 100
      : Math.max(50, 100 - Math.round((refundCount / Math.max(finLogs.length, 1)) * 250));

  const authLogs = logs.filter((l) => isAuthAction(String(l.action || '')));
  const failedLogins = logs.filter((l) => isFailedLogin(String(l.action || ''))).length;
  const sysScore =
    failedLogins === 0
      ? 100
      : Math.max(25, 100 - Math.round((failedLogins / Math.max(authLogs.length, 1)) * 300));

  const overallScore = Math.round((accessScore + finScore + sysScore) / 3);
  const anomalies = detectAnomalies(logs);

  function scoreColor(score: number): string {
    if (score >= 85) return 'var(--success)';
    if (score >= 60) return 'var(--warning)';
    return 'var(--danger)';
  }

  function scoreBarClass(score: number): string {
    if (score >= 85) return 'bar-green';
    if (score >= 60) return 'bar-yellow';
    return 'bar-red';
  }

  const categories = [
    {
      label: 'Data Access',
      desc: `${accessLogs.length} record views · ${afterHoursAccess} after hours`,
      score: accessScore,
    },
    {
      label: 'Financial',
      desc: `${finLogs.length} financial events · ${refundCount} refunds`,
      score: finScore,
    },
    {
      label: 'System',
      desc: `${authLogs.length} auth events · ${failedLogins} failed logins`,
      score: sysScore,
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit & Compliance</h1>
          <p className="page-subtitle">System activity trail, compliance scoring and anomaly detection</p>
        </div>
      </div>

      <div className="tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map((k) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading audit data...</div>
      ) : (
        <>
          {tab === 'activity' && (
            <div>
              <div className="toolbar">
                <input
                  className="input search-input"
                  placeholder="Search by action, entity or user..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="note">
                  {filtered.length} of {logs.length} events
                </span>
              </div>

              {filtered.length === 0 ? (
                <div className="empty">No audit entries match your search.</div>
              ) : (
                <div className="card">
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Entity</th>
                          <th>Entity ID</th>
                          <th>Performed by</th>
                          <th>When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((l) => (
                          <tr key={l.id}>
                            <td>
                              <span className={`badge ${actionTone(String(l.action || ''))}`}>
                                {String(l.action || '—').replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td>
                              <span className="mono">{l.entity || '—'}</span>
                            </td>
                            <td>
                              <span className="mono">{(l.entityId || '').slice(0, 8)}</span>
                            </td>
                            <td>{personOf(l)}</td>
                            <td style={{ fontSize: 12 }}>{formatDateTime(l.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'compliance' && (
            <div>
              <div className="stat-grid">
                <div className="stat-card">
                  <span className="stat-label">Overall Compliance</span>
                  <span className="stat-value" style={{ color: scoreColor(overallScore) }}>
                    {overallScore}%
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Events Analyzed</span>
                  <span className="stat-value">{logs.length}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">After-hours Access</span>
                  <span className="stat-value" style={{ color: afterHoursAccess ? 'var(--warning)' : 'var(--success)' }}>
                    {afterHoursAccess}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Failed Logins</span>
                  <span className="stat-value" style={{ color: failedLogins ? 'var(--danger)' : 'var(--success)' }}>
                    {failedLogins}
                  </span>
                </div>
              </div>

              <div className="form-grid">
                {categories.map((c) => (
                  <div className="card" style={{ padding: 16 }} key={c.label}>
                    <div className="row-between" style={{ marginBottom: 4 }}>
                      <strong>{c.label}</strong>
                      <span style={{ fontWeight: 700, color: scoreColor(c.score) }}>{c.score}%</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      {c.desc}
                    </div>
                    <div className="bar-track" style={{ height: 12 }}>
                      <div
                        className={`bar-fill ${scoreBarClass(c.score)}`}
                        style={{ width: `${c.score}%` }}
                      />
                    </div>
                    <div className="note" style={{ marginTop: 8 }}>
                      {c.score >= 85
                        ? 'Good standing. Keep monitoring.'
                        : c.score >= 60
                          ? 'Needs attention. Review flagged activity.'
                          : 'At risk. Immediate review recommended.'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'anomalies' && (
            <div>
              {anomalies.length === 0 ? (
                <div className="empty">No anomalies detected in the current audit window.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {anomalies.map((a) => (
                    <div
                      key={a.key}
                      className="card"
                      style={{
                        padding: 16,
                        borderLeft:
                          a.severity === 'HIGH'
                            ? '4px solid var(--danger)'
                            : a.severity === 'MEDIUM'
                              ? '4px solid var(--warning)'
                              : '4px solid #94a3b8',
                      }}
                    >
                      <div className="row-between" style={{ marginBottom: 6 }}>
                        <strong>{a.title}</strong>
                        <span className={`badge ${SEVERITY_TONES[a.severity]}`}>{a.severity}</span>
                      </div>
                      <div style={{ fontSize: 13.5, marginBottom: 6 }}>{a.desc}</div>
                      <div className="note">Recommendation: {a.rec}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}