'use client';

import { useEffect, useState } from 'react';
import EntityPage from '@/components/EntityPage';
import { api, unwrap } from '@/lib/api';
import { formatDate } from '@/lib/hooks';

type Tab = 'staff' | 'shifts' | 'rosters' | 'leaves' | 'departments';

const ROLES = ['DOCTOR', 'NURSE', 'PHARMACIST', 'LAB_TECHNICIAN', 'RECEPTIONIST', 'HR_MANAGER', 'INVENTORY_MANAGER', 'RADIOLOGIST', 'RADIOLOGY_TECHNICIAN', 'ADMIN'];

const ROLE_COLORS: Record<string, string> = {
  DOCTOR: '#2563eb',
  NURSE: '#16a34a',
  PHARMACIST: '#9333ea',
  LAB_TECHNICIAN: '#ea580c',
  RECEPTIONIST: '#6b7280',
  ADMIN: '#dc2626',
  HR_MANAGER: '#0891b2',
  INVENTORY_MANAGER: '#ca8a04',
  RADIOLOGIST: '#7c3aed',
  RADIOLOGY_TECHNICIAN: '#c2410c',
};

function fullName(u: any): string {
  if (!u) return '—';
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email || '—';
}

export default function HrPage() {
  const [tab, setTab] = useState<Tab>('staff');

  const [staff, setStaff] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({ firstName: '', lastName: '', email: '', role: 'NURSE', departmentId: '' });

  const [departments, setDepartments] = useState<any[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);

  const [leaves, setLeaves] = useState<any[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState<string | null>(null);

  const loadStaff = async () => {
    setLoadingStaff(true);
    try {
      const data = unwrap(await api('/hr/staff?limit=200'));
      setStaff(Array.isArray(data) ? data : []);
    } catch {
      setStaff([]);
    }
    setLoadingStaff(false);
  };

  const loadDepts = async () => {
    setLoadingDepts(true);
    try {
      const data = unwrap(await api('/departments?limit=100'));
      setDepartments(Array.isArray(data) ? data : []);
    } catch {
      setDepartments([]);
    }
    setLoadingDepts(false);
  };

  const loadLeaves = async () => {
    setLoadingLeaves(true);
    try {
      const data = unwrap(await api('/hr/leaves?limit=100'));
      setLeaves(Array.isArray(data) ? data : []);
    } catch {
      setLeaves([]);
    }
    setLoadingLeaves(false);
  };

  useEffect(() => {
    loadDepts();
  }, []);
  useEffect(() => {
    if (tab === 'staff') loadStaff();
    if (tab === 'leaves') loadLeaves();
    if (tab === 'departments') loadDepts();
  }, [tab]);

  const submitStaff = async () => {
    if (!staffForm.firstName.trim() || !staffForm.email.trim()) return;
    setSavingStaff(true);
    try {
      await api('/hr/staff', {
        method: 'POST',
        body: JSON.stringify({
          firstName: staffForm.firstName,
          lastName: staffForm.lastName,
          email: staffForm.email,
          role: staffForm.role,
          departmentId: staffForm.departmentId || undefined,
        }),
      });
      setShowAddStaff(false);
      setStaffForm({ firstName: '', lastName: '', email: '', role: 'NURSE', departmentId: '' });
      await loadStaff();
    } catch {}
    setSavingStaff(false);
  };

  const decideLeave = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setLeaveBusy(id);
    try {
      await api(`/hr/leaves/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setLeaves((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    } catch {}
    setLeaveBusy(null);
  };

  const q = search.trim().toLowerCase();
  const filteredStaff = staff.filter((s: any) => {
    const inDept = !deptFilter || s.departmentId === deptFilter || s.department?.id === deptFilter;
    const hay = `${fullName(s)} ${s.email || ''} ${s.role || ''}`.toLowerCase();
    return inDept && (!q || hay.includes(q));
  });

  const activeCount = staff.filter((s: any) => s.isActive).length;
  const inactiveCount = staff.filter((s: any) => !s.isActive).length;

  const pendingLeaves = leaves.filter((l) => l.status === 'PENDING').length;
  const approvedLeaves = leaves.filter((l) => l.status === 'APPROVED').length;
  const rejectedLeaves = leaves.filter((l) => l.status === 'REJECTED').length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>HR &amp; Staff</h1>
          <p className="page-subtitle">Directory, scheduling, leave approvals and departments</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button className={`tab ${tab === 'staff' ? 'active' : ''}`} onClick={() => setTab('staff')}>Staff</button>
        <button className={`tab ${tab === 'shifts' ? 'active' : ''}`} onClick={() => setTab('shifts')}>Shifts</button>
        <button className={`tab ${tab === 'rosters' ? 'active' : ''}`} onClick={() => setTab('rosters')}>Rosters</button>
        <button className={`tab ${tab === 'leaves' ? 'active' : ''}`} onClick={() => setTab('leaves')}>Leaves</button>
        <button className={`tab ${tab === 'departments' ? 'active' : ''}`} onClick={() => setTab('departments')}>Departments</button>
      </div>

      {tab === 'staff' && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Total Staff</div>
              <div className="stat-value">{staff.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{activeCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Inactive</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{inactiveCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Departments</div>
              <div className="stat-value" style={{ color: 'var(--info)' }}>{departments.length}</div>
            </div>
          </div>

          <div className="toolbar">
            <input
              className="input search-input"
              placeholder="Search name, email or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="input" style={{ maxWidth: 240 }} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="">All Departments</option>
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => setShowAddStaff(true)}>+ Add Staff</button>
          </div>

          {loadingStaff ? (
            <div className="loading">Loading staff...</div>
          ) : filteredStaff.length === 0 ? (
            <div className="empty">No staff members found.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{fullName(s)}</strong>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.email || '—'}</div>
                      </td>
                      <td>{s.department?.name || '—'}</td>
                      <td>
                        <span className="badge" style={{ background: ROLE_COLORS[s.role] || 'var(--muted)', color: '#fff' }}>
                          {(s.role || '').replace(/_/g, ' ') || '—'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${s.isActive ? 'badge-green' : 'badge-red'}`}>
                          {s.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showAddStaff && (
            <div className="modal-backdrop" onClick={() => setShowAddStaff(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3 className="modal-title">Add Staff Member</h3>
                  <button className="modal-close" onClick={() => setShowAddStaff(false)}>x</button>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label className="label">First Name *</label>
                    <input className="input" value={staffForm.firstName} onChange={(e) => setStaffForm({ ...staffForm, firstName: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label">Last Name</label>
                    <input className="input" value={staffForm.lastName} onChange={(e) => setStaffForm({ ...staffForm, lastName: e.target.value })} />
                  </div>
                  <div className="field field-full">
                    <label className="label">Email *</label>
                    <input className="input" type="email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="label">Role</label>
                    <select className="input" value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label">Department</label>
                    <select className="input" value={staffForm.departmentId} onChange={(e) => setStaffForm({ ...staffForm, departmentId: e.target.value })}>
                      <option value="">None</option>
                      {departments.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => setShowAddStaff(false)} disabled={savingStaff}>Cancel</button>
                  <button className="btn" onClick={submitStaff} disabled={savingStaff}>{savingStaff ? 'Saving...' : 'Add Staff'}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'shifts' && (
        <EntityPage
          title="Shifts"
          subtitle="Manage work shifts"
          endpoint="/hr/shifts"
          createLabel="Add shift"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'startTime', label: 'Start' },
            { key: 'endTime', label: 'End' },
            { key: 'workingHours', label: 'Hours', render: (r) => r.workingHours ?? '—' },
          ]}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'startTime', label: 'Start time', required: true },
            { name: 'endTime', label: 'End time', required: true },
            { name: 'workingHours', label: 'Working hours', type: 'number' },
          ]}
        />
      )}

      {tab === 'rosters' && (
        <EntityPage
          title="Rosters"
          subtitle="Shift assignments"
          endpoint="/hr/rosters"
          createLabel="Assign shift"
          columns={[
            { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
            { key: 'user', label: 'Staff', render: (r) => fullName(r.user) !== '—' ? fullName(r.user) : r.userId || '—' },
            { key: 'role', label: 'Role', render: (r) => r.user?.role?.replace(/_/g, ' ') || '—' },
            { key: 'shift', label: 'Shift', render: (r) => r.shift?.name || '—' },
          ]}
          fields={[
            { name: 'userId', label: 'Staff', required: true, type: 'select', optionsFrom: { valueKey: 'id', labelKeys: ['firstName', 'lastName'], endpoint: '/users' } },
            { name: 'shiftId', label: 'Shift', type: 'select', optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/hr/shifts' } },
            { name: 'date', label: 'Date', type: 'date', required: true },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ]}
        />
      )}

      {tab === 'leaves' && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Pending</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{pendingLeaves}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Approved</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{approvedLeaves}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Rejected</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{rejectedLeaves}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Requests</div>
              <div className="stat-value">{leaves.length}</div>
            </div>
          </div>

          {loadingLeaves ? (
            <div className="loading">Loading leave requests...</div>
          ) : leaves.length === 0 ? (
            <div className="empty">No leave requests.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th style={{ width: 1 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((l: any) => (
                    <tr key={l.id}>
                      <td><strong>{fullName(l.user) !== '—' ? fullName(l.user) : l.userId || '—'}</strong></td>
                      <td><span className="badge badge-blue">{(l.type || '').replace(/_/g, ' ') || '—'}</span></td>
                      <td>{formatDate(l.startDate)}</td>
                      <td>{formatDate(l.endDate)}</td>
                      <td>{l.days ?? '—'}</td>
                      <td>
                        <span className={`badge ${l.status === 'APPROVED' ? 'badge-green' : l.status === 'REJECTED' ? 'badge-red' : l.status === 'PENDING' ? 'badge-yellow' : 'badge-gray'}`}>
                          {(l.status || 'UNKNOWN').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        {l.status === 'PENDING' && (
                          <span style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-sm btn-secondary" disabled={leaveBusy === l.id} onClick={() => decideLeave(l.id, 'APPROVED')}>Approve</button>
                            <button className="btn btn-sm btn-danger" disabled={leaveBusy === l.id} onClick={() => decideLeave(l.id, 'REJECTED')}>Reject</button>
                          </span>
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

      {tab === 'departments' && (
        <>
          {loadingDepts ? (
            <div className="loading">Loading departments...</div>
          ) : departments.length === 0 ? (
            <div className="empty">No departments found.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Staff</th>
                    <th>Wards</th>
                    <th>Doctors</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d: any) => (
                    <tr key={d.id}>
                      <td><strong>{d.name}</strong></td>
                      <td className="mono">{d.code || '—'}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{d.description || '—'}</td>
                      <td>{d._count?.users ?? 0}</td>
                      <td>{d._count?.wards ?? 0}</td>
                      <td>{d._count?.doctors ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

    </>
  );
}