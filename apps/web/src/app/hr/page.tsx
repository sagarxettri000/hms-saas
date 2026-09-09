'use client';

import { useEffect, useState } from 'react';
import EntityPage from '@/components/EntityPage';
import { api, unwrap } from '@/lib/api';
import { formatDate } from '@/lib/hooks';

type Tab = 'staff' | 'shifts' | 'rosters' | 'leaves' | 'departments' | 'attendance' | 'training';

interface AttendanceRecord {
  id: string;
  staffName: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
}

interface TrainingRecord {
  id: string;
  program: string;
  enrolledAt: string;
  completedAt: string | null;
  certificateDate: string;
}

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

const TRAINING_PROGRAMS = ['Basic Life Support', 'Fire Safety', 'Infection Control', 'Patient Rights', 'Data Privacy'];

function fullName(u: any): string {
  if (!u) return '—';
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email || '—';
}

function hoursBetween(a: string, b: string): number {
  return Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 3600000) * 100) / 100;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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

  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [training, setTraining] = useState<TrainingRecord[]>([]);

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

  const loadAttendance = async () => {
    try {
      const data = unwrap(await api('/hr/attendance?limit=200'));
      setAttendance(
        Array.isArray(data)
          ? data.map((r: any) => ({
              id: r.id,
              staffName: r.staffName,
              date: r.date,
              clockIn: r.clockIn,
              clockOut: r.clockOut,
            }))
          : [],
      );
    } catch {
      setAttendance([]);
    }
  };

  const loadTraining = async () => {
    try {
      const data = unwrap(await api('/hr/training?limit=200'));
      setTraining(
        Array.isArray(data)
          ? data.map((r: any) => ({
              id: r.id,
              program: r.program,
              enrolledAt: r.enrolledAt,
              completedAt: r.completedAt,
              certificateDate: r.certificateDate,
            }))
          : [],
      );
    } catch {
      setTraining([]);
    }
  };

  useEffect(() => {
    loadAttendance();
    loadTraining();
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

  const clockIn = async () => {
    const d = todayStr();
    if (attendance.some((r) => r.date === d && !r.clockOut)) return;
    try {
      const rec = unwrap(
        await api('/hr/attendance/clock-in', {
          method: 'POST',
          body: JSON.stringify({ staffName: localStorage.getItem('userName') || 'Current User' }),
        }),
      );
      if (rec && rec.id) {
        setAttendance((prev) => [
          ...prev,
          { id: rec.id, staffName: rec.staffName, date: rec.date, clockIn: rec.clockIn, clockOut: rec.clockOut },
        ]);
      }
    } catch {}
  };

  const clockOut = async () => {
    try {
      const rec = unwrap(await api('/hr/attendance/clock-out', { method: 'POST' }));
      if (rec && rec.id) {
        setAttendance((prev) => prev.map((r) => (r.id === rec.id ? { ...r, clockOut: rec.clockOut } : r)));
      }
    } catch {}
  };

  const enroll = async (program: string) => {
    if (training.some((t) => t.program === program)) return;
    try {
      const rec = unwrap(
        await api('/hr/training', {
          method: 'POST',
          body: JSON.stringify({ program, staffName: localStorage.getItem('userName') || 'Current User' }),
        }),
      );
      if (rec && rec.id) {
        setTraining((prev) => [
          ...prev,
          {
            id: rec.id,
            program: rec.program,
            enrolledAt: rec.enrolledAt,
            completedAt: rec.completedAt,
            certificateDate: rec.certificateDate,
          },
        ]);
      }
    } catch {}
  };

  const toggleComplete = async (id: string) => {
    try {
      const rec = unwrap(await api(`/hr/training/${id}/complete`, { method: 'PATCH' }));
      if (rec && rec.id) {
        setTraining((prev) => prev.map((r) => (r.id === rec.id ? { ...r, completedAt: rec.completedAt } : r)));
      }
    } catch {}
  };

  const setCertificateDate = async (id: string, value: string) => {
    try {
      const rec = unwrap(
        await api(`/hr/training/${id}/certificate`, {
          method: 'PATCH',
          body: JSON.stringify({ certificateDate: value }),
        }),
      );
      if (rec && rec.id) {
        setTraining((prev) => prev.map((r) => (r.id === rec.id ? { ...r, certificateDate: rec.certificateDate } : r)));
      }
    } catch {}
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

  const t = todayStr();
  const todayRecords = attendance.filter((r) => r.date === t);
  const openToday = todayRecords.find((r) => !r.clockOut);
  const hoursToday = todayRecords.reduce(
    (sum, r) => sum + (r.clockOut ? hoursBetween(r.clockIn, r.clockOut) : hoursBetween(r.clockIn, new Date().toISOString())),
    0,
  );
  const weekRecords = attendance.filter((r) => {
    const diff = new Date(t).getTime() - new Date(r.date).getTime();
    return diff >= 0 && diff <= 6 * 86400000;
  });
  const avgHours = attendance.length
    ? Math.round(
        (attendance.reduce(
          (sum, r) => sum + (r.clockOut ? hoursBetween(r.clockIn, r.clockOut) : hoursBetween(r.clockIn, new Date().toISOString())),
          0,
        ) /
          attendance.length) *
          10,
      ) / 10
    : 0;

  const completedPrograms = TRAINING_PROGRAMS.filter((p) =>
    training.some((tr) => tr.program === p && tr.completedAt),
  ).length;
  const compliancePct = Math.round((completedPrograms / TRAINING_PROGRAMS.length) * 100);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>HR &amp; Staff</h1>
          <p className="page-subtitle">Directory, scheduling, leave approvals, attendance and training</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button className={`tab ${tab === 'staff' ? 'active' : ''}`} onClick={() => setTab('staff')}>Staff</button>
        <button className={`tab ${tab === 'shifts' ? 'active' : ''}`} onClick={() => setTab('shifts')}>Shifts</button>
        <button className={`tab ${tab === 'rosters' ? 'active' : ''}`} onClick={() => setTab('rosters')}>Rosters</button>
        <button className={`tab ${tab === 'leaves' ? 'active' : ''}`} onClick={() => setTab('leaves')}>Leaves</button>
        <button className={`tab ${tab === 'departments' ? 'active' : ''}`} onClick={() => setTab('departments')}>Departments</button>
        <button className={`tab ${tab === 'attendance' ? 'active' : ''}`} onClick={() => setTab('attendance')}>Attendance</button>
        <button className={`tab ${tab === 'training' ? 'active' : ''}`} onClick={() => setTab('training')}>Training</button>
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

      {tab === 'attendance' && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Status Today</div>
              <div className="stat-value" style={{ color: openToday ? 'var(--success)' : todayRecords.length ? 'var(--info)' : 'var(--text-muted)', fontSize: 22 }}>
                {openToday ? 'On Shift' : todayRecords.length ? 'Clocked Out' : 'Not Started'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Hours Today</div>
              <div className="stat-value">{hoursToday.toFixed(1)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Sessions This Week</div>
              <div className="stat-value" style={{ color: 'var(--primary)' }}>{weekRecords.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Hours / Session</div>
              <div className="stat-value" style={{ color: 'var(--info)' }}>{avgHours.toFixed(1)}</div>
            </div>
          </div>

          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{attendance.length} total records</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={clockIn} disabled={!!openToday}>{openToday ? 'Clocked In' : 'Clock In'}</button>
              <button className="btn btn-sm btn-secondary" onClick={clockOut} disabled={!openToday}>Clock Out</button>
            </span>
          </div>

          {attendance.length === 0 ? (
            <div className="empty">No attendance records yet. Clock in to start tracking.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...attendance].reverse().map((r) => {
                    const hrs = r.clockOut ? hoursBetween(r.clockIn, r.clockOut) : null;
                    return (
                      <tr key={r.id}>
                        <td><strong>{formatDate(r.date)}</strong></td>
                        <td>{new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{r.clockOut ? new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td>{hrs !== null ? hrs.toFixed(2) : openToday?.id === r.id ? 'Running' : '—'}</td>
                        <td>
                          <span className={`badge ${!r.clockOut ? 'badge-green' : hrs !== null && hrs >= 8 ? 'badge-blue' : 'badge-gray'}`}>
                            {!r.clockOut ? 'ON SHIFT' : hrs !== null && hrs >= 8 ? 'FULL DAY' : 'COMPLETED'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'training' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>Compliance Programs Completed</strong>
              <span style={{ fontWeight: 700, color: compliancePct === 100 ? 'var(--success)' : 'var(--text-muted)' }}>{compliancePct}%</span>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${compliancePct}%`, background: compliancePct === 100 ? 'var(--success)' : 'var(--primary)' }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{completedPrograms} of {TRAINING_PROGRAMS.length} programs completed</div>
          </div>

          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{training.filter((x) => x.completedAt).length} completed · {training.length} enrollments</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {TRAINING_PROGRAMS.map((program) => {
              const recs = training.filter((tr) => tr.program === program);
              const doneCount = recs.filter((r) => r.completedAt).length;
              const enrolled = recs.length > 0;
              const pct = enrolled ? Math.round((doneCount / recs.length) * 100) : 0;
              return (
                <div className="card" key={program}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong>{program}</strong>
                    <span className={`badge ${doneCount > 0 ? 'badge-green' : enrolled ? 'badge-yellow' : 'badge-gray'}`}>
                      {doneCount > 0 ? 'COMPLETED' : enrolled ? 'ENROLLED' : 'NOT ENROLLED'}
                    </span>
                  </div>
                  <div className="bar-track" style={{ marginBottom: 10 }}>
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  {!enrolled ? (
                    <button className="btn btn-sm" onClick={() => enroll(program)}>Enroll</button>
                  ) : (
                    <>
                      {recs.map((rec) => (
                        <div key={rec.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: recs[0] !== rec ? 10 : 0 }}>
                          <label className="checkbox-row">
                            <input type="checkbox" checked={!!rec.completedAt} onChange={() => toggleComplete(rec.id)} />
                            <span>Completed{rec.completedAt ? ` on ${formatDate(rec.completedAt)}` : ''}</span>
                          </label>
                          <div className="field" style={{ marginTop: 8 }}>
                            <label className="label">Certificate Date</label>
                            <input
                              className="input"
                              type="date"
                              value={rec.certificateDate}
                              onChange={(e) => setCertificateDate(rec.id, e.target.value)}
                            />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}