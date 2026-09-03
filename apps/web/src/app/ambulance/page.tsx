'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface CallEvent {
  status: string;
  at: string;
}

interface AmbulanceCall {
  id: string;
  callerName: string;
  callerPhone: string;
  patientName: string;
  location: string;
  complaint: string;
  priority: string;
  status: string;
  dispatchedAt: string | null;
  vehicleId: string | null;
  vehicle?: { id: string; callSign: string } | null;
  history: CallEvent[];
}

interface Vehicle {
  id: string;
  callSign: string;
  type: string;
  status: string;
  driverName: string;
  currentLocation: string;
}

const EMPTY_CALL = {
  callerName: '',
  callerPhone: '',
  patientName: '',
  location: '',
  complaint: '',
  priority: 'URGENT',
};

const EMPTY_VEHICLE = {
  callSign: '',
  type: 'BASIC',
  driverName: '',
  currentLocation: '',
};

const HANDOVER_CHECKS = ['Patient name confirmed', 'Vitals recorded', 'Medications listed', 'Allergies noted'];

function priorityBadge(priority: string) {
  const tone =
    priority === 'EMERGENCY' ? 'badge-red' :
    priority === 'URGENT' ? 'badge-yellow' :
    'badge-green';
  return <span className={`badge ${tone}`}>{priority.replace(/_/g, ' ')}</span>;
}

function callStatusBadge(status: string) {
  const tone =
    status === 'ARRIVED' || status === 'COMPLETED' ? 'badge-green' :
    status === 'DISPATCHED' ? 'badge-blue' :
    status === 'EN_ROUTE' ? 'badge-cyan' :
    status === 'CANCELLED' ? 'badge-gray' :
    'badge-yellow';
  return <span className={`badge ${tone}`}>{status.replace(/_/g, ' ')}</span>;
}

function vehicleStatusBadge(status: string) {
  const tone =
    status === 'AVAILABLE' ? 'badge-green' :
    status === 'MAINTENANCE' ? 'badge-yellow' :
    'badge-blue';
  return <span className={`badge ${tone}`}>{status.replace(/_/g, ' ')}</span>;
}

function typeBadge(type: string) {
  const tone = type === 'ICU' ? 'badge-red' : type === 'ADVANCED' ? 'badge-purple' : 'badge-gray';
  return <span className={`badge ${tone}`}>{type}</span>;
}

function fmtClock(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeSince(iso: string | null) {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

async function loadCalls(): Promise<AmbulanceCall[]> {
  const res = await api('/ambulance/calls?limit=500');
  return res.data?.data ?? res.data ?? [];
}

async function loadVehicles(): Promise<Vehicle[]> {
  const res = await api('/ambulance/vehicles?limit=500');
  return res.data?.data ?? res.data ?? [];
}

export default function AmbulancePage() {
  const [tab, setTab] = useState('dispatch');
  const [loaded, setLoaded] = useState(false);
  const [calls, setCalls] = useState<AmbulanceCall[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [search, setSearch] = useState('');
  const [newCallOpen, setNewCallOpen] = useState(false);
  const [callForm, setCallForm] = useState({ ...EMPTY_CALL });
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ ...EMPTY_VEHICLE });
  const [handoverTarget, setHandoverTarget] = useState<AmbulanceCall | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const [c, v] = await Promise.all([loadCalls(), loadVehicles()]);
        setCalls(c);
        setVehicles(v);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function refreshVehicles() {
    setVehicles(await loadVehicles());
  }

  async function refresh() {
    const [c, v] = await Promise.all([loadCalls(), loadVehicles()]);
    setCalls(c);
    setVehicles(v);
  }

  async function createCall(e: React.FormEvent) {
    e.preventDefault();
    if (!callForm.patientName.trim() || !callForm.location.trim()) return;
    try {
      await api('/ambulance/calls', {
        method: 'POST',
        body: JSON.stringify(callForm),
      });
      await refresh();
      setCallForm({ ...EMPTY_CALL });
      setNewCallOpen(false);
    } catch (err: any) {
      window.alert(err.message);
    }
  }

  async function dispatch(call: AmbulanceCall) {
    try {
      await api(`/ambulance/calls/${call.id}/dispatch`, { method: 'PATCH' });
    } catch (err: any) {
      window.alert(err.message);
      return;
    }
    await refresh();
  }

  async function cancelCall(call: AmbulanceCall) {
    if (!window.confirm(`Cancel call for ${call.patientName}?`)) return;
    try {
      await api(`/ambulance/calls/${call.id}/cancel`, { method: 'PATCH' });
      await refresh();
    } catch (err: any) {
      window.alert(err.message);
    }
  }

  async function advanceCall(call: AmbulanceCall, status: 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED') {
    try {
      await api(`/ambulance/calls/${call.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (err: any) {
      window.alert(err.message);
    }
  }

  async function completeHandover(e: React.FormEvent) {
    e.preventDefault();
    if (!handoverTarget) return;
    if (!HANDOVER_CHECKS.every((c) => checks[c])) return;
    try {
      await api(`/ambulance/calls/${handoverTarget.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      await refresh();
    } catch (err: any) {
      window.alert(err.message);
    }
    setHandoverTarget(null);
    setChecks({});
  }

  async function toggleVehicle(v: Vehicle) {
    if (v.status === 'IN_SERVICE') return;
    const next = v.status === 'AVAILABLE'
      ? { status: 'MAINTENANCE', currentLocation: 'Workshop' }
      : { status: 'AVAILABLE', currentLocation: 'Hospital Bay 2' };
    try {
      await api(`/ambulance/vehicles/${v.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(next),
      });
      await refreshVehicles();
    } catch (err: any) {
      window.alert(err.message);
    }
  }

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleForm.callSign.trim() || !vehicleForm.driverName.trim()) return;
    try {
      await api('/ambulance/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...vehicleForm, currentLocation: vehicleForm.currentLocation || 'Hospital Bay 2' }),
      });
      await refreshVehicles();
      setVehicleForm({ ...EMPTY_VEHICLE });
      setAddVehicleOpen(false);
    } catch (err: any) {
      window.alert(err.message);
    }
  }

  const q = search.trim().toLowerCase();
  const boardCalls = calls
    .filter(
      (c) =>
        !q ||
        [c.patientName, c.callerName, c.callerPhone, c.location, c.complaint].join(' ').toLowerCase().includes(q)
    )
    .slice()
    .sort((a, b) => (b.dispatchedAt || b.history?.[0]?.at || '').localeCompare(a.dispatchedAt || a.history?.[0]?.at || ''));

  const activeCases = calls
    .filter((c) => ['DISPATCHED', 'EN_ROUTE', 'ARRIVED'].includes(c.status))
    .sort((a, b) => (b.dispatchedAt || '').localeCompare(a.dispatchedAt || ''));

  const availableCount = vehicles.filter((v) => v.status === 'AVAILABLE').length;

  function callSignOf(call: AmbulanceCall) {
    return call.vehicle?.callSign || vehicles.find((v) => v.id === call.vehicleId)?.callSign || call.vehicleId;
  }

  function actionFor(call: AmbulanceCall) {
    if (call.status === 'PENDING') {
      return (
        <>
          <button className="btn btn-sm" onClick={() => dispatch(call)}>Dispatch</button>
          <button className="btn btn-secondary btn-sm" onClick={() => cancelCall(call)}>Cancel</button>
        </>
      );
    }
    if (call.status === 'DISPATCHED') {
      return <button className="btn btn-sm" onClick={() => advanceCall(call, 'EN_ROUTE')}>Mark En Route</button>;
    }
    if (call.status === 'EN_ROUTE') {
      return <button className="btn btn-sm" onClick={() => advanceCall(call, 'ARRIVED')}>Mark Arrived</button>;
    }
    if (call.status === 'ARRIVED') {
      return (
        <button
          className="btn btn-sm"
          onClick={() => {
            setHandoverTarget(call);
            setChecks({});
          }}
        >
          Complete Handover
        </button>
      );
    }
    return null;
  }

  function timeline(history: CallEvent[]) {
    const items = Array.isArray(history) ? history : [];
    return (
      <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 6 }}>
        {items.map((h, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: i === items.length - 1 ? '#2563eb' : '#cbd5e1', flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{h.status.replace(/_/g, ' ')}</span>
            <span style={{ color: 'var(--text-muted)' }}>{fmtDateTime(h.at)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (!loaded) {
    return (
      <>
        <div className="loading">Loading dispatch board...</div>
      </>
    );
  }

  return (
    <>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Ambulance Dispatch</h1>
            <p className="page-subtitle">Emergency call dispatch, active cases and fleet management</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="badge badge-green">{availableCount} vehicle(s) available</span>
            {tab === 'dispatch' && (
              <button className="btn" onClick={() => setNewCallOpen(true)}>New Call</button>
            )}
            {tab === 'vehicles' && (
              <button className="btn" onClick={() => setAddVehicleOpen(true)}>Add Vehicle</button>
            )}
          </div>
        </div>

        <div className="tabs">
          {[
            { key: 'dispatch', label: 'Dispatch Board' },
            { key: 'active', label: 'Active Cases' },
            { key: 'vehicles', label: 'Vehicles' },
          ].map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'dispatch' && (
          <div className="card">
            <div className="toolbar">
              <input
                className="search-input"
                placeholder="Search calls..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>Clear</button>
            </div>
            {boardCalls.length === 0 ? (
              <div className="empty">No calls match.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                {boardCalls.map((c) => (
                  <div key={c.id} className="card" style={{ boxShadow: 'none', marginBottom: 0 }}>
                    <div className="row-between" style={{ marginBottom: 8 }}>
                      <strong>{c.patientName}</strong>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {priorityBadge(c.priority)}
                        {callStatusBadge(c.status)}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'grid', gap: 3 }}>
                      <span>Caller: {c.callerName} ({c.callerPhone})</span>
                      <span>From: {c.location}</span>
                      <span>Complaint: {c.complaint}</span>
                      {c.vehicleId && (
                        <span>
                          Vehicle: <strong>{callSignOf(c)}</strong>
                          {c.status !== 'PENDING' && <> · dispatched {timeSince(c.dispatchedAt)} ago</>}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{actionFor(c)}</div>
                    {timeline(c.history)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'active' && (
          activeCases.length === 0 ? (
            <div className="card"><div className="empty">No active ambulance cases.</div></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {activeCases.map((c) => (
                <div key={c.id} className="card" style={{ marginBottom: 0 }}>
                  <div className="row-between" style={{ marginBottom: 8 }}>
                    <strong style={{ fontSize: 16 }}>{c.patientName}</strong>
                    {callStatusBadge(c.status)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'grid', gap: 3 }}>
                    <span>From: {c.location}</span>
                    <span>Priority: {priorityBadge(c.priority)}</span>
                    <span>Vehicle: {callSignOf(c) || '—'}</span>
                    <span>Dispatched {timeSince(c.dispatchedAt)} ago · {fmtDateTime(c.dispatchedAt)}</span>
                  </div>
                  {c.status === 'DISPATCHED' && (
                    <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => advanceCall(c, 'EN_ROUTE')}>
                      Mark En Route
                    </button>
                  )}
                  {c.status === 'EN_ROUTE' && (
                    <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => advanceCall(c, 'ARRIVED')}>
                      Mark Arrived
                    </button>
                  )}
                  {c.status === 'ARRIVED' && (
                    <button
                      className="btn"
                      style={{ width: '100%', marginTop: 14 }}
                      onClick={() => {
                        setHandoverTarget(c);
                        setChecks({});
                      }}
                    >
                      Complete Handover
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'vehicles' && (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Call Sign</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Driver</th>
                    <th>Location</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty">No vehicles registered.</div>
                      </td>
                    </tr>
                  ) : (
                    vehicles.map((v) => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 600 }}>{v.callSign}</td>
                        <td>{typeBadge(v.type)}</td>
                        <td>{vehicleStatusBadge(v.status)}</td>
                        <td>{v.driverName}</td>
                        <td>{v.currentLocation || '—'}</td>
                        <td>
                          {v.status === 'IN_SERVICE' ? (
                            <span className="note">On duty</span>
                          ) : (
                            <button
                              className={`btn btn-sm ${v.status === 'AVAILABLE' ? 'btn-secondary' : ''}`}
                              onClick={() => toggleVehicle(v)}
                            >
                              {v.status === 'AVAILABLE' ? 'Send to Maintenance' : 'Mark Available'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {newCallOpen && (
          <div className="modal-backdrop" onClick={() => setNewCallOpen(false)}>
            <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Log New Call</h3>
              <form onSubmit={createCall}>
                <div className="form-grid">
                  <div className="field">
                    <label className="label">Caller Name</label>
                    <input className="input" value={callForm.callerName} onChange={(e) => setCallForm({ ...callForm, callerName: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label">Caller Phone</label>
                    <input className="input" value={callForm.callerPhone} onChange={(e) => setCallForm({ ...callForm, callerPhone: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label">Patient Name *</label>
                    <input className="input" value={callForm.patientName} onChange={(e) => setCallForm({ ...callForm, patientName: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label className="label">Pickup Location *</label>
                    <input className="input" value={callForm.location} onChange={(e) => setCallForm({ ...callForm, location: e.target.value })} required />
                  </div>
                  <div className="field field-full">
                    <label className="label">Complaint</label>
                    <input className="input" value={callForm.complaint} onChange={(e) => setCallForm({ ...callForm, complaint: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label">Priority</label>
                    <select className="input" value={callForm.priority} onChange={(e) => setCallForm({ ...callForm, priority: e.target.value })}>
                      <option value="EMERGENCY">Emergency</option>
                      <option value="URGENT">Urgent</option>
                      <option value="NON_URGENT">Non-Urgent</option>
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setNewCallOpen(false)}>Cancel</button>
                  <button type="submit" className="btn">Log Call</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {handoverTarget && (
          <div className="modal-backdrop" onClick={() => setHandoverTarget(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Handover - {handoverTarget.patientName}</h3>
              <p className="note">Confirm all items before completing the handover.</p>
              <form onSubmit={completeHandover} style={{ display: 'grid', gap: 10 }}>
                {HANDOVER_CHECKS.map((item) => (
                  <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={!!checks[item]}
                      onChange={(e) => setChecks({ ...checks, [item]: e.target.checked })}
                    />
                    {item}
                  </label>
                ))}
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setHandoverTarget(null)}>Cancel</button>
                  <button type="submit" className="btn" disabled={!HANDOVER_CHECKS.every((c) => checks[c])}>
                    Complete Handover
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {addVehicleOpen && (
          <div className="modal-backdrop" onClick={() => setAddVehicleOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Add Vehicle</h3>
              <form onSubmit={addVehicle}>
                <div className="form-grid">
                  <div className="field">
                    <label className="label">Call Sign *</label>
                    <input className="input" value={vehicleForm.callSign} onChange={(e) => setVehicleForm({ ...vehicleForm, callSign: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label className="label">Type</label>
                    <select className="input" value={vehicleForm.type} onChange={(e) => setVehicleForm({ ...vehicleForm, type: e.target.value })}>
                      <option value="BASIC">Basic</option>
                      <option value="ADVANCED">Advanced</option>
                      <option value="ICU">ICU</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="label">Driver Name *</label>
                    <input className="input" value={vehicleForm.driverName} onChange={(e) => setVehicleForm({ ...vehicleForm, driverName: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label className="label">Current Location</label>
                    <input className="input" value={vehicleForm.currentLocation} onChange={(e) => setVehicleForm({ ...vehicleForm, currentLocation: e.target.value })} placeholder="Hospital Bay 2" />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setAddVehicleOpen(false)}>Cancel</button>
                  <button type="submit" className="btn">Add Vehicle</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}