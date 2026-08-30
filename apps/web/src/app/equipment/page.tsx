'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

interface Equipment {
  id: string;
  name: string;
  department: string;
  model: string;
  serialNumber: string;
  manufacturer: string;
  purchaseDate: string;
  warrantyExpiry: string;
  status: string;
  location: string;
  lastServiceDate: string;
}

interface LogEntry {
  id: string;
  equipmentId: string;
  date: string;
  type: string;
  notes: string;
  performedBy: string;
}

const DEPARTMENTS = ['Cardiology', 'Radiology', 'ICU', 'OT', 'Emergency', 'Laboratory', 'General'];
const STATUSES = ['OPERATIONAL', 'MAINTENANCE', 'OUT_OF_SERVICE'];

const EMPTY_FORM = {
  name: '',
  department: 'General',
  model: '',
  serialNumber: '',
  manufacturer: '',
  purchaseDate: '',
  warrantyExpiry: '',
  status: 'OPERATIONAL',
  location: '',
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

function toDateStr(value: string | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

async function loadEquipment(): Promise<Equipment[]> {
  const res = await api('/equipment?limit=500');
  const list = res.data?.data ?? res.data ?? [];
  return (list as any[]).map((x) => ({
    ...x,
    purchaseDate: toDateStr(x.purchaseDate),
    warrantyExpiry: toDateStr(x.warrantyExpiry),
    lastServiceDate: toDateStr(x.lastServiceDate),
  }));
}

async function loadLogs(): Promise<LogEntry[]> {
  const res = await api('/equipment/logs?limit=500');
  const list = res.data?.data ?? res.data ?? [];
  return (list as any[]).map((x) => ({
    id: x.id,
    equipmentId: x.equipmentId,
    date: toDateStr(x.date),
    type: x.type,
    notes: x.notes,
    performedBy: x.performedBy,
  }));
}

function statusBadge(status: string) {
  const tone =
    status === 'OPERATIONAL' ? 'badge-green' :
    status === 'MAINTENANCE' ? 'badge-yellow' :
    'badge-red';
  return <span className={`badge ${tone}`}>{status.replace(/_/g, ' ')}</span>;
}

export default function EquipmentPage() {
  const [tab, setTab] = useState('registry');
  const [loaded, setLoaded] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [serviceTarget, setServiceTarget] = useState<Equipment | null>(null);
  const [serviceForm, setServiceForm] = useState({ type: 'Preventive', performedBy: '', notes: '' });

  useEffect(() => {
    (async () => {
      try {
        const [eq, lg] = await Promise.all([loadEquipment(), loadLogs()]);
        setEquipment(eq);
        setLog(lg);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function refresh() {
    const [eq, lg] = await Promise.all([loadEquipment(), loadLogs()]);
    setEquipment(eq);
    setLog(lg);
  }

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormOpen(true);
  }

  function openEdit(item: Equipment) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      department: item.department,
      model: item.model,
      serialNumber: item.serialNumber,
      manufacturer: item.manufacturer,
      purchaseDate: item.purchaseDate,
      warrantyExpiry: item.warrantyExpiry,
      status: item.status,
      location: item.location,
    });
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      if (editingId) {
        await api(`/equipment/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(form),
        });
      } else {
        await api('/equipment', {
          method: 'POST',
          body: JSON.stringify(form),
        });
      }
      await refresh();
    } catch (err: any) {
      window.alert(err.message);
    }
    setFormOpen(false);
    setEditingId(null);
  }

  async function handleDelete(item: Equipment) {
    if (!window.confirm(`Delete ${item.name} (${item.serialNumber})?`)) return;
    try {
      await api(`/equipment/${item.id}`, { method: 'DELETE' });
      await refresh();
    } catch (err: any) {
      window.alert(err.message);
    }
  }

  async function handleServiced(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceTarget) return;
    try {
      await api(`/equipment/${serviceTarget.id}/serviced`, {
        method: 'POST',
        body: JSON.stringify(serviceForm),
      });
      await refresh();
    } catch (err: any) {
      window.alert(err.message);
    }
    setServiceTarget(null);
    setServiceForm({ type: 'Preventive', performedBy: '', notes: '' });
  }

  const today = todayISO();
  const q = search.trim().toLowerCase();
  const filtered = equipment.filter(
    (x) =>
      !q ||
      [x.name, x.department, x.model, x.serialNumber, x.manufacturer, x.location]
        .join(' ')
        .toLowerCase()
        .includes(q)
  );
  const nameOf = (id: string) => equipment.find((x) => x.id === id)?.name || 'Unknown';
  const dueList = equipment
    .filter((x) => !x.lastServiceDate || daysBetween(x.lastServiceDate, today) > 90)
    .sort((a, b) => (a.lastServiceDate || '').localeCompare(b.lastServiceDate || ''));

  const operational = equipment.filter((x) => x.status === 'OPERATIONAL').length;
  const underMaintenance = equipment.filter((x) => x.status === 'MAINTENANCE').length;
  const outOfService = equipment.filter((x) => x.status === 'OUT_OF_SERVICE').length;

  const deptCounts = DEPARTMENTS.map((d) => ({ dept: d, count: equipment.filter((x) => x.department === d).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...deptCounts.map((r) => r.count));

  const expiredWarranty = equipment.filter((x) => x.warrantyExpiry && daysBetween(today, x.warrantyExpiry) < 0);
  const in30 = equipment.filter((x) => x.warrantyExpiry && daysBetween(today, x.warrantyExpiry) >= 0 && daysBetween(today, x.warrantyExpiry) <= 30);
  const in60 = equipment.filter((x) => x.warrantyExpiry && daysBetween(today, x.warrantyExpiry) > 30 && daysBetween(today, x.warrantyExpiry) <= 60);
  const in90 = equipment.filter((x) => x.warrantyExpiry && daysBetween(today, x.warrantyExpiry) > 60 && daysBetween(today, x.warrantyExpiry) <= 90);

  const warrantyGroups = [
    { title: 'Expired', items: expiredWarranty, tone: '#dc2626' },
    { title: 'Next 30 days', items: in30, tone: '#d97706' },
    { title: '31-60 days', items: in60, tone: '#2563eb' },
    { title: '61-90 days', items: in90, tone: '#16a34a' },
  ];

  if (!loaded) {
    return (
      <AppShell>
        <div className="loading">Loading equipment...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Equipment</h1>
            <p className="page-subtitle">Biomedical equipment registry, maintenance schedule and analytics</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'registry' && (
              <button className="btn" onClick={openAdd}>Add Equipment</button>
            )}
          </div>
        </div>

        <div className="tabs">
          {[
            { key: 'registry', label: 'Registry' },
            { key: 'maintenance', label: 'Maintenance' },
            { key: 'analytics', label: 'Analytics' },
          ].map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'registry' && (
          <>
            {formOpen && (
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit Equipment' : 'Add Equipment'}</h3>
                <form onSubmit={handleSave}>
                  <div className="form-grid">
                    <div className="field">
                      <label className="label">Name *</label>
                      <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                    </div>
                    <div className="field">
                      <label className="label">Department</label>
                      <select className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Model</label>
                      <input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Serial Number</label>
                      <input className="input" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Manufacturer</label>
                      <input className="input" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Purchase Date</label>
                      <input className="input" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Warranty Expiry</label>
                      <input className="input" type="date" value={form.warrantyExpiry} onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })} />
                    </div>
                    <div className="field">
                      <label className="label">Status</label>
                      <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label className="label">Location</label>
                      <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => { setFormOpen(false); setEditingId(null); }}>Cancel</button>
                    <button type="submit" className="btn">{editingId ? 'Save Changes' : 'Add Equipment'}</button>
                  </div>
                </form>
              </div>
            )}

            <div className="card">
              <div className="toolbar">
                <input
                  className="search-input"
                  placeholder="Search equipment..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>Clear</button>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Department</th>
                      <th>Model</th>
                      <th>Serial</th>
                      <th>Status</th>
                      <th>Warranty</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="empty">No equipment found.</div>
                        </td>
                      </tr>
                    ) : (
                      filtered.map((item) => {
                        const left = item.warrantyExpiry ? daysBetween(today, item.warrantyExpiry) : null;
                        return (
                          <tr key={item.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{item.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.location || '—'}</div>
                            </td>
                            <td>{item.department}</td>
                            <td>{item.model || '—'}</td>
                            <td className="mono">{item.serialNumber || '—'}</td>
                            <td>{statusBadge(item.status)}</td>
                            <td>
                              <span className="mono">{item.warrantyExpiry || '—'}</span>
                              {left !== null && left < 0 && <span className="badge badge-red" style={{ marginLeft: 6 }}>expired</span>}
                              {left !== null && left >= 0 && left <= 30 && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>≤30d</span>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>Edit</button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === 'maintenance' && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Due for Maintenance</h3>
              <p className="note" style={{ marginTop: -8 }}>Not serviced in the last 90 days</p>
              {dueList.length === 0 ? (
                <div className="empty">All equipment has been serviced recently.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Equipment Name</th>
                        <th>Location</th>
                        <th>Last Service</th>
                        <th>Next Due</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dueList.map((item) => {
                        const nextDue = item.lastServiceDate ? addDays(item.lastServiceDate, 90) : null;
                        const overdue = !nextDue || nextDue < today;
                        return (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 600 }}>{item.name}</td>
                            <td>{item.location || item.department}</td>
                            <td className="mono">{item.lastServiceDate || 'Never'}</td>
                            <td>
                              {overdue ? (
                                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Overdue</span>
                              ) : (
                                <span className="mono">{nextDue}</span>
                              )}
                            </td>
                            <td>{statusBadge(item.status)}</td>
                            <td>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => { setServiceTarget(item); setServiceForm({ type: 'Preventive', performedBy: '', notes: '' }); }}
                              >
                                Mark as Serviced
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Maintenance Log</h3>
              {log.length === 0 ? (
                <div className="empty">No service records yet.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Equipment</th>
                        <th>Type</th>
                        <th>Performed By</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...log].reverse().map((entry) => (
                        <tr key={entry.id}>
                          <td className="mono">{entry.date}</td>
                          <td>{nameOf(entry.equipmentId)}</td>
                          <td><span className="badge badge-blue">{entry.type}</span></td>
                          <td>{entry.performedBy || '—'}</td>
                          <td>{entry.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'analytics' && (
          <>
            <div className="stat-grid">
              <div className="card stat-card">
                <p className="stat-label">Total Equipment</p>
                <p className="stat-value">{equipment.length}</p>
              </div>
              <div className="card stat-card">
                <p className="stat-label">Operational</p>
                <p className="stat-value stat-green">{operational}</p>
              </div>
              <div className="card stat-card">
                <p className="stat-label">Under Maintenance</p>
                <p className="stat-value stat-amber">{underMaintenance}</p>
              </div>
              <div className="card stat-card">
                <p className="stat-label">Out of Service</p>
                <p className="stat-value stat-red">{outOfService}</p>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Equipment by Department</h3>
              {deptCounts.length === 0 ? (
                <div className="empty">No equipment registered.</div>
              ) : (
                deptCounts.map((row) => (
                  <div key={row.dept} className="bar-row">
                    <div className="bar-label">
                      <span>{row.dept}</span>
                      <span className="bar-count">{row.count}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill bar-blue" style={{ width: `${Math.round((row.count / maxCount) * 100)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
              {warrantyGroups.map((group) => (
                <div key={group.title} className="card">
                  <h4 style={{ marginTop: 0, color: group.tone }}>{group.title}</h4>
                  {group.items.length === 0 ? (
                    <p className="note">None</p>
                  ) : (
                    group.items
                      .slice()
                      .sort((a, b) => (a.warrantyExpiry || '').localeCompare(b.warrantyExpiry || ''))
                      .map((item) => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                          <span style={{ fontWeight: 500 }}>{item.name}</span>
                          <span className="mono">{item.warrantyExpiry}</span>
                        </div>
                      ))
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {serviceTarget && (
          <div className="modal-backdrop" onClick={() => setServiceTarget(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Record Service - {serviceTarget.name}</h3>
              <form onSubmit={handleServiced} style={{ display: 'grid', gap: 12 }}>
                <div className="field">
                  <label className="label">Service Type</label>
                  <select className="input" value={serviceForm.type} onChange={(e) => setServiceForm({ ...serviceForm, type: e.target.value })}>
                    {['Preventive', 'Corrective', 'Inspection', 'Calibration'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Performed By</label>
                  <input
                    className="input"
                    placeholder="Technician name"
                    value={serviceForm.performedBy}
                    onChange={(e) => setServiceForm({ ...serviceForm, performedBy: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="label">Notes</label>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={serviceForm.notes}
                    onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })}
                  />
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setServiceTarget(null)}>Cancel</button>
                  <button type="submit" className="btn">Save Record</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
