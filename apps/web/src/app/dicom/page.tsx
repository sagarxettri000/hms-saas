'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  dicomNodeApi,
  dicomApi,
  type DicomNode,
  type EchoResult,
  type ListenerStatus,
  type MwlEntry,
  type NodeForm,
  type StoreResult,
} from '@/lib/dicom';
import { badgeTone, formatDateTime, nameOf } from '@/lib/hooks';

interface StudyOption {
  id: string;
  studyDescription: string | null;
  accessionNumber: string | null;
  patient?: { firstName: string | null; lastName: string | null; mrn: string | null } | null;
}

const EMPTY_FORM: NodeForm = { name: '', aeTitle: '', hostname: '', port: 104, isLocal: false, tls: false };

export default function DicomConsolePage() {
  const [nodes, setNodes] = useState<DicomNode[]>([]);
  const [storedStudies, setStoredStudies] = useState<StudyOption[]>([]);
  const [listener, setListener] = useState<ListenerStatus | null>(null);
  const [mwl, setMwl] = useState<MwlEntry[]>([]);
  const [mwlFilter, setMwlFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [listenerNodeId, setListenerNodeId] = useState('');

  const [showNodeModal, setShowNodeModal] = useState(false);
  const [editingNode, setEditingNode] = useState<DicomNode | null>(null);
  const [form, setForm] = useState<NodeForm>(EMPTY_FORM);

  const [echoResults, setEchoResults] = useState<Record<string, EchoResult>>({});

  const [sendNode, setSendNode] = useState<DicomNode | null>(null);
  const [sendStudyId, setSendStudyId] = useState('');
  const [sendResult, setSendResult] = useState<StoreResult[] | null>(null);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 6000);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [n, l, w] = await Promise.all([
        dicomNodeApi.listNodes(),
        dicomNodeApi.listenerStatus(),
        dicomNodeApi.listMwl(),
      ]);
      setNodes(n);
      setListener(l);
      setMwl(w);
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to load DICOM console');
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openCreate = () => {
    setEditingNode(null);
    setForm(EMPTY_FORM);
    setShowNodeModal(true);
  };

  const openEdit = (node: DicomNode) => {
    setEditingNode(node);
    setForm({
      name: node.name,
      aeTitle: node.aeTitle,
      hostname: node.hostname,
      port: node.port,
      isLocal: node.isLocal,
      tls: node.tls ?? false,
    });
    setShowNodeModal(true);
  };

  const saveNode = async () => {
    setBusy(editingNode ? 'saving' : 'creating');
    try {
      if (editingNode) {
        await dicomNodeApi.updateNode(editingNode.id, form);
        flash('ok', `Updated node "${form.name}"`);
      } else {
        await dicomNodeApi.createNode(form);
        flash('ok', `Registered DICOM node "${form.name}"`);
      }
      setShowNodeModal(false);
      loadAll();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to save node');
    } finally {
      setBusy('');
    }
  };

  const removeNode = async (node: DicomNode) => {
    if (!window.confirm(`Remove DICOM node "${node.name}"?`)) return;
    setBusy(`delete-${node.id}`);
    try {
      await dicomNodeApi.deleteNode(node.id);
      flash('ok', `Removed node "${node.name}"`);
      loadAll();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to delete node');
    } finally {
      setBusy('');
    }
  };

  const testEcho = async (node: DicomNode) => {
    setBusy(`echo-${node.id}`);
    try {
      const res = await dicomNodeApi.echoNode(node.id);
      setEchoResults((prev) => ({ ...prev, [node.id]: res }));
    } catch (err) {
      setEchoResults((prev) => ({
        ...prev,
        [node.id]: { connected: false, latencyMs: 0, error: err instanceof Error ? err.message : 'C-ECHO failed' },
      }));
    } finally {
      setBusy('');
    }
  };

  const startListener = async (nodeId: string) => {
    if (!nodeId) return;
    setBusy('listener-start');
    try {
      setListener(await dicomNodeApi.startListener(nodeId));
      flash('ok', `DICOM listener started on node ${nodeId}`);
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to start listener');
    } finally {
      setBusy('');
    }
  };

  const stopListener = async () => {
    setBusy('listener-stop');
    try {
      await dicomNodeApi.stopListener();
      setListener(await dicomNodeApi.listenerStatus());
      flash('ok', 'DICOM listener stopped');
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to stop listener');
    } finally {
      setBusy('');
    }
  };

  const openSend = async (node: DicomNode) => {
    setSendNode(node);
    setSendStudyId('');
    setSendResult(null);
    setShowNodeModal(false);
    try {
      const res: any = await dicomApi.listStudies({ limit: 100 });
      setStoredStudies((res.items ?? res ?? []) as StudyOption[]);
    } catch {
      setStoredStudies([]);
    }
  };

  const sendStudy = async () => {
    if (!sendNode || !sendStudyId) return;
    setBusy('send');
    try {
      const res = await dicomNodeApi.sendStudyToNode(sendNode.id, sendStudyId);
      setSendResult(Array.isArray(res) ? res : (res as any).results ?? []);
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to push study');
      setSendNode(null);
    } finally {
      setBusy('');
    }
  };

  const markPerformed = async (entry: MwlEntry) => {
    setBusy(`perf-${entry.orderId}`);
    try {
      await dicomNodeApi.mwlPerformed(entry.orderId);
      loadAll();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to mark performed');
    } finally {
      setBusy('');
    }
  };

  const markCompleted = async (entry: MwlEntry) => {
    setBusy(`comp-${entry.orderId}`);
    try {
      await dicomNodeApi.mwlCompleted(entry.orderId);
      loadAll();
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to mark completed');
    } finally {
      setBusy('');
    }
  };

  const localNodes = nodes.filter((n) => n.isLocal);

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">DICOM Console</h1>
        <p className="page-subtitle">Network nodes, imaging listener and modality worklist</p>
      </div>

      {notice && (
        <div className={`alert ${notice.kind === 'ok' ? 'alert-success' : 'alert-error'}`}>{notice.text}</div>
      )}

      <div className="toolbar">
        <button className="btn btn-secondary btn-sm" onClick={loadAll} disabled={!!busy}>
          Refresh
        </button>
        <button className="btn" onClick={openCreate} disabled={!!busy}>
          + Register Node
        </button>
      </div>

      {/* Listener status */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Imaging Listener (SCP)</div>
        {!listener ? (
          <div className="empty">Loading listener status…</div>
        ) : (
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="stat-card">
              <div className="stat-label">Status</div>
              <div className="stat-value">
                <span className={`badge ${listener.running ? 'badge-green' : 'badge-gray'}`}>
                  {listener.running ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
            </div>
            {listener.running ? (
              <>
                <div className="stat-card">
                  <div className="stat-label">Echo Requests</div>
                  <div className="stat-value">{listener.stats.echoRequests}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Instances Stored</div>
                  <div className="stat-value">{listener.stats.storedInstances}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Associations</div>
                  <div className="stat-value">{listener.stats.associations}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Failed</div>
                  <div className="stat-value">
                    <span className={listener.stats.failedInstances ? 'badge badge-red' : 'muted'}>
                      {listener.stats.failedInstances}
                    </span>
                  </div>
                </div>
              </>
            ) : null}
            <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
              <div className="kv">
                {listener.running ? (
                  <button className="btn btn-secondary btn-sm" onClick={stopListener} disabled={!!busy}>
                    {busy === 'listener-stop' ? 'Stopping…' : 'Stop Listener'}
                  </button>
                ) : (
                  <div className="row-between">
                    <span className="muted">
                      The listener accepts C-ECHO and C-STORE associations from modalities and PACS.
                    </span>
                    {localNodes.length > 0 && (
                      <select
                        className="select"
                        value={listenerNodeId || localNodes[0].id}
                        onChange={(e) => setListenerNodeId(e.target.value)}
                        id="listenerNode"
                      >
                        {localNodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.name} ({n.aeTitle} @ {n.hostname}:{n.port})
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      className="btn"
                      onClick={() => startListener(listenerNodeId || localNodes[0].id)}
                      disabled={!!busy || localNodes.length === 0}
                    >
                      {busy === 'listener-start' ? 'Starting…' : 'Start Listener'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nodes */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          DICOM Nodes <span className="muted">({nodes.length})</span>
        </div>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : nodes.length === 0 ? (
          <div className="empty">No DICOM nodes configured yet. Register a modality or PACS node above.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>AE Title</th>
                  <th>Address</th>
                  <th>Port</th>
                  <th>Type</th>
                  <th>Last Seen</th>
                  <th>Connectivity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => {
                  const echo = echoResults[n.id];
                  return (
                    <tr key={n.id}>
                      <td>
                        {n.name} {n.isLocal && <span className="muted">(localhost)</span>}
                      </td>
                      <td className="mono">{n.aeTitle}</td>
                      <td className="mono">{n.hostname}</td>
                      <td>{n.port}</td>
                      <td>
                        <span className={`badge ${n.isLocal ? 'badge-blue' : 'badge-gray'}`}>
                          {n.isLocal ? 'LOCAL AE' : 'REMOTE'}
                        </span>
                        {n.tls ? <span className="badge badge-green">TLS</span> : null}
                      </td>
                      <td>{n.lastSeenAt ? formatDateTime(n.lastSeenAt) : <span className="muted">never</span>}</td>
                      <td>
                        {echo ? (
                          echo.connected ? (
                            <span className="badge badge-green">
                              OK · {echo.latencyMs}ms
                              {echo.status ? ` · ${echo.status}` : ''}
                            </span>
                          ) : (
                            <span className="badge badge-red">FAILED{echo.error ? ` · ${echo.error}` : ''}</span>
                          )
                        ) : (
                          <span className="muted">not tested</span>
                        )}
                      </td>
                      <td>
                        <div className="row-between" style={{ gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => testEcho(n)} disabled={!!busy}>
                            {busy === `echo-${n.id}` ? '…' : 'Test'}
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => openSend(n)} disabled={!!busy}>
                            Send Study
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(n)} disabled={!!busy}>
                            Edit
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => removeNode(n)} disabled={!!busy}>
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modality worklist */}
      <div className="card">
        <div className="card-title">
          Modality Worklist <span className="muted">({mwl.length})</span>
        </div>
        <div className="toolbar">
          <input
            className="input"
            placeholder="Search accession / MRN / name…"
            value={mwlFilter}
            onChange={(e) => setMwlFilter(e.target.value)}
            style={{ maxWidth: 280 }}
          />
        </div>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : mwl.length === 0 ? (
          <div className="empty">No scheduled imaging orders in the worklist.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Accession</th>
                  <th>Patient</th>
                  <th>Modality</th>
                  <th>Scheduled</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mwl
                  .filter((m) => {
                    const q = mwlFilter.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      (m.accessionNumber || '').toLowerCase().includes(q) ||
                      (m.orderNumber || '').toLowerCase().includes(q) ||
                      (m.patient?.mrn || '').toLowerCase().includes(q) ||
                      nameOf(m.patient).toLowerCase().includes(q)
                    );
                  })
                  .map((m) => (
                    <tr key={m.orderId}>
                      <td className="mono">{m.orderNumber}</td>
                      <td className="mono">{m.accessionNumber ?? <span className="muted">—</span>}</td>
                      <td>
                        {nameOf(m.patient)}
                        {m.patient?.mrn && <span className="muted"> · {m.patient.mrn}</span>}
                      </td>
                      <td>{m.modality ?? '—'}</td>
                      <td>{m.scheduledDateTime ? formatDateTime(m.scheduledDateTime) : <span className="muted">—</span>}</td>
                      <td>
                        <span className={`badge badge-${badgeTone(m.status)}`}>{m.status}</span>
                      </td>
                      <td>
                        <div className="row-between" style={{ gap: 6 }}>
                          {m.status !== 'IN_PROGRESS' && m.status !== 'IMAGES_UPLOADED' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => markPerformed(m)} disabled={!!busy}>
                              Performed
                            </button>
                          )}
                          {m.status === 'IMAGES_UPLOADED' ? (
                            <button className="btn btn-ghost btn-sm" onClick={() => markCompleted(m)} disabled={!!busy}>
                              Completed
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Node modal */}
      {showNodeModal && !sendNode && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editingNode ? `Edit Node — ${editingNode.name}` : 'Register DICOM Node'}</div>
              <button className="modal-close" onClick={() => setShowNodeModal(false)}>
                ✕
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span className="label">Name</span>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Radiology DR-1" />
              </label>
              <label className="field">
                <span className="label">AE Title</span>
                <input className="input mono" value={form.aeTitle} onChange={(e) => setForm({ ...form, aeTitle: e.target.value.toUpperCase() })} placeholder="e.g. HMS-SCU" />
              </label>
              <label className="field">
                <span className="label">Hostname</span>
                <input className="input mono" value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value })} placeholder="e.g. 192.168.1.50" />
              </label>
              <label className="field">
                <span className="label">Port</span>
                <input className="input" type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
              </label>
              <label className="field checkbox-row">
                <input type="checkbox" checked={form.isLocal} onChange={(e) => setForm({ ...form, isLocal: e.target.checked })} />
                <span>This node runs the HMS imaging listener (local SCP)</span>
              </label>
              <label className="field checkbox-row">
                <input type="checkbox" checked={form.tls ?? false} onChange={(e) => setForm({ ...form, tls: e.target.checked })} />
                <span>Connect using DICOM TLS (requires DICOM_TLS_CERT / DICOM_TLS_KEY on the server)</span>
              </label>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowNodeModal(false)} disabled={!!busy}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={saveNode}
                disabled={!!busy || !form.name || !form.aeTitle || !form.hostname}
              >
                {editingNode ? 'Save Changes' : 'Register Node'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send-study modal */}
      {sendNode && (
        <div className="modal-backdrop">
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">
                Push Study → {sendNode.name} ({sendNode.aeTitle})
              </div>
              <button className="modal-close" onClick={() => setSendNode(null)}>
                ✕
              </button>
            </div>
            {sendResult ? (
              <div>
                <div className="alert alert-success">
                  Sent {sendResult.filter((s) => !s.error && (s.ok === undefined || s.ok)).length}/{sendResult.length}{' '}
                  instances via C-STORE.
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>SOP Instance UID</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sendResult.map((s, i) => (
                        <tr key={s.sopInstanceUid + i}>
                          <td className="mono">{s.sopInstanceUid}</td>
                          <td>
                            <span className={`badge ${s.error ? 'badge-red' : 'badge-green'}`}>
                              {s.error ?? (s.ok === false ? 'FAILED' : 'STORED')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions">
                  <button className="btn" onClick={() => setSendNode(null)}>
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="field">
                  <span className="label">Study to send</span>
                  <select
                    className="select"
                    value={sendStudyId}
                    onChange={(e) => setSendStudyId(e.target.value)}
                    disabled={storedStudies.length === 0}
                  >
                    <option value="">{storedStudies.length ? 'Select a study…' : 'No stored studies found'}</option>
                    {storedStudies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.studyDescription || 'Untitled study'}
                        {s.accessionNumber ? ` [${s.accessionNumber}]` : ''}
                        {s.patient ? ` — ${nameOf(s.patient)}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setSendNode(null)} disabled={!!busy}>
                    Cancel
                  </button>
                  <button className="btn" onClick={sendStudy} disabled={!!busy || !sendStudyId}>
                    {busy === 'send' ? 'Sending…' : 'Send Study'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}