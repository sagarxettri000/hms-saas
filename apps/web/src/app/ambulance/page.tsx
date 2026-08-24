'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';

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

function uid(prefix: string) {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function seedVehicles(): Vehicle[] {
  return [
    { id: 'veh-1', callSign: 'AMB-101', type: 'BASIC', status: 'IN_SERVICE', driverName: 'Ram Bahadur', currentLocation: 'Dispatched to Thamel' },
    { id: 'veh-2', callSign: 'AMB-102', type: 'ADVANCED', status: 'AVAILABLE', driverName: 'Sita Sharma', currentLocation: 'Hospital Bay 1' },
    { id: 'veh-3', callSign: 'AMB-103', type: 'ICU', status: 'MAINTENANCE', driverName: 'Hari Thapa', currentLocation: 'Workshop' },
  ];
}

function seedCalls(): AmbulanceCall[] {
  const now = Date.now();
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();
  return [
    { id: 'call-1', callerName: 'Anita Rana', callerPhone: '9841000111', patientName: 'Kiran Rana', location: 'Baneshwor, Shanti Nagar', complaint: 'Chest pain, sweating', priority: 'EMERGENCY', status: 'PENDING', dispatchedAt: null, vehicleId: null, history: [{ status: 'PENDING', at: iso(6) }] },
    { id: 'call-2', callerName: 'Bikash Tamang', callerPhone: '9812222333', patientName: 'Mina Tamang', location: 'Kalanki Chowk', complaint: 'Road accident, leg injury', priority: 'URGENT', status: 'PENDING', dispatchedAt: null, vehicleId: null, history: [{ status: 'PENDING', at: iso(14) }] },
    { id: 'call-3', callerName: 'Prakash Joshi', callerPhone: '9855555666', patientName: 'Gita Joshi', location: 'Patan Hospital Gate', complaint: 'High fever, weakness', priority: 'NON_URGENT', status: 'PENDING', dispatchedAt: null, vehicleId: null, history: [{ status: 'PENDING', at: iso(32) }] },
    { id: 'call-4', callerName: 'Sunita Karki', callerPhone: '9861111222', patientName: 'Dipak Karki', location: 'Thamel, Chaksibari Marg', complaint: 'Difficulty breathing', priority: 'EMERGENCY', status: 'DISPATCHED', dispatchedAt: iso(11), vehicleId: 'veh-1', history: [{ status: 'PENDING', at: iso(16) }, { status: 'DISPATCHED', at: iso(11) }] },
    { id: 'call-5', callerName: 'Ramesh Shrestha', callerPhone: '9803333444', patientName: 'Nirmala Shrestha', location: 'Koteshwor', complaint: 'Routine transfer request', priority: 'URGENT', status: 'CANCELLED', dispatchedAt: null, vehicleId: null, history: [{ status: 'PENDING', at: iso(58) }, { status: 'CANCELLED', at: iso(50) }] },
  ];
}

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
    let c: AmbulanceCall[] = [];
    try {
      c = JSON.parse(localStorage.getItem('ambulance_calls') || '[]');
    } catch {
      c = [];
    }
    if (!Array.isArray(c) || c.length === 0) {
      c = seedCalls();
      localStorage.setItem('ambulance_calls', JSON.stringify(c));
    }
    setCalls(c);
    let v: Vehicle[] = [];
    try {
      v = JSON.parse(localStorage.getItem('ambulance_vehicles') || '[]');
    } catch {
      v = [];
    }
    if (!Array.isArray(v) || v.length === 0) {
      v = seedVehicles();
      localStorage.setItem('ambulance_vehicles', JSON.stringify(v));
    }
    setVehicles(v);
    setLoaded(true);
  }, []);

  function persistCalls(next: AmbulanceCall[]) {
    setCalls(next);
    localStorage.setItem('ambulance_calls', JSON.stringify(next));
  }

  function persistVehicles(next: Vehicle[]) {
    setVehicles(next);
    localStorage.setItem('ambulance_vehicles', JSON.stringify(next));
  }

  function patchCall(id: string, patch: Partial<AmbulanceCall>, event?: string) {
    persistCalls(
      calls.map((c) =>
        c.id === id
          ? {
              ...c,
              ...patch,
              history:
                event && c.history[c.history.length - 1]?.status !== event
                  ? [...c.history, { status: event, at: new Date().toISOString() }]
                  : c.history,
            }
          : c
      )
    );
  }

  function createCall(e: React.FormEvent) {
    e.preventDefault();
    if (!callForm.patientName.trim() || !callForm.location.trim()) return;
    const entry: AmbulanceCall = {
      id: uid('call'),
      ...callForm,
      status: 'PENDING',
      dispatchedAt: null,
      vehicleId: null,
      history: [{ status: 'PENDING', at: new Date().toISOString() }],
    };
    persistCalls([entry, ...calls]);
    setCallForm({ ...EMPTY_CALL });
    setNewCallOpen(false);
  }

  function dispatch(call: AmbulanceCall) {
    const veh = vehicles.find((v) => v.status === 'AVAILABLE');
    if (!veh) {
      window.alert('No ambulances available. Free a vehicle first.');
      return;
    }
    const at = new Date().toISOString();
    patchCall(call.id, { status: 'DISPATCHED', dispatchedAt: at, vehicleId: veh.id }, 'DISPATCHED');
    persistVehicles(
      vehicles.map((v) => (v.id === veh.id ? { ...v, status: 'IN_SERVICE', currentLocation: `Dispatched to ${call.location}` } : v))
    );
  }

  function cancelCall(call: AmbulanceCall) {
    if (!window.confirm(`Cancel call for ${call.patientName}?`)) return;
    patchCall(call.id, { status: 'CANCELLED' }, 'CANCELLED');
  }

  function markEnRoute(call: AmbulanceCall) {
    patchCall(call.id, { status: 'EN_ROUTE' }, 'EN_ROUTE');
  }

  function markArrived(call: AmbulanceCall) {
    patchCall(
      call.id,
      { status: 'ARRIVED' },
      'ARRIVED'
    );
    if (call.vehicleId) {
      persistVehicles(
        vehicles.map((v) => (v.id === call.vehicleId ? { ...v, currentLocation: `On scene: ${call.location}` } : v))
      );
    }
  }

  function completeHandover(e: React.FormEvent) {
    e.preventDefault();
    if (!handoverTarget) return;
    if (!HANDOVER_CHECKS.every((c) => checks[c])) return;
    patchCall(handoverTarget.id, { status: 'COMPLETED' }, 'COMPLETED');
    if (handoverTarget.vehicleId) {
      persistVehicles(
        vehicles.map((v) =>
          v.id === handoverTarget.vehicleId ? { ...v, status: 'AVAILABLE', currentLocation: 'Hospital Bay 1' } : v
        )
      );
    }
    setHandoverTarget(null);
    setChecks({});
  }

  function toggleVehicle(v: Vehicle) {
    if (v.status === 'IN_SERVICE') return;
    const next = v.status === 'AVAILABLE'
      ? { status: 'MAINTENANCE', currentLocation: 'Workshop' }
      : { status: 'AVAILABLE', currentLocation: 'Hospital Bay 2' };
    persistVehicles(vehicles.map((x) => (x.id === v.id ? { ...x, ...next } : x)));
  }

  function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleForm.callSign.trim() || !vehicleForm.driverName.trim()) return;
    const entry: Vehicle = { id: uid('veh'), ...vehicleForm, status: 'AVAILABLE', currentLocation: vehicleForm.currentLocation || 'Hospital Bay 2' };
    persistVehicles([...vehicles, entry]);
    setVehicleForm({ ...EMPTY_VEHICLE });
    setAddVehicleOpen(false);
  }

  const q = search.trim().toLowerCase();
  const boardCalls = calls
    .filter(
      (c) =>
        !q ||
        [c.patientName, c.callerName, c.callerPhone, c.location, c.complaint].join(' ').toLowerCase().includes(q)
    )
    .slice()
    .sort((a, b) => (b.dispatchedAt || b.history[0]?.at || '').localeCompare(a.dispatchedAt || a.history[0]?.at || ''));

  const activeCases = calls
    .filter((c) => ['DISPATCHED', 'EN_ROUTE', 'ARRIVED'].includes(c.status))
    .sort((a, b) => (b.dispatchedAt || '').localeCompare(a.dispatchedAt || ''));

  const availableCount = vehicles.filter((v) => v.status === 'AVAILABLE').length;

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
      return <button className="btn btn-sm" onClick={() => markEnRoute(call)}>Mark En Route</button>;
    }
    if (call.status === 'EN_ROUTE') {
      return <button className="btn btn-sm" onClick={() => markArrived(call)}>Mark Arrived</button>;
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
    return (
      <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 6 }}>
        {history.map((h, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: i === history.length - 1 ? '#2563eb' : '#cbd5e1', flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{h.status.replace(/_/g, ' ')}</span>
            <span style={{ color: 'var(--text-muted)' }}>{fmtDateTime(h.at)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (!loaded) {
    return (
      <AppShell>
        <div className="loading">Loading dispatch board...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
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
                          Vehicle: <strong>{vehicles.find((v) => v.id === c.vehicleId)?.callSign || c.vehicleId}</strong>
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
                    <span>Vehicle: {vehicles.find((v) => v.id === c.vehicleId)?.callSign || '—'}</span>
                    <span>Dispatched {timeSince(c.dispatchedAt)} ago · {fmtDateTime(c.dispatchedAt)}</span>
                  </div>
                  {c.status === 'DISPATCHED' && (
                    <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => markEnRoute(c)}>
                      Mark En Route
                    </button>
                  )}
                  {c.status === 'EN_ROUTE' && (
                    <button className="btn" style={{ width: '100%', marginTop: 14 }} onClick={() => markArrived(c)}>
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
                        <td>{v.currentLocation}</td>
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
    </AppShell>
  );
}
