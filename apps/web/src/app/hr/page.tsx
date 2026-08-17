'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatDateTime, formatDate } from '@/lib/hooks';
import { LEAVE_TYPES } from '@/lib/options';
import ModulePage from '@/components/ModulePage';

type Tab = 'staff' | 'shifts' | 'rosters' | 'leaves' | 'departments';

const ROLE_COLORS: Record<string, string> = {
  DOCTOR: '#2563eb', NURSE: '#16a34a', PHARMACIST: '#9333ea',
  LAB_TECHNICIAN: '#ea580c', RECEPTIONIST: '#6b7280', ADMIN: '#dc2626',
  HR_MANAGER: '#0891b2', INVENTORY_MANAGER: '#ca8a04',
};

export default function HrPage() {
  const [activeTab, setActiveTab] = useState<Tab>('staff');
  const [staff, setStaff] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [selectedDept, setSelectedDept] = useState('');

  const tabBtn = (key: Tab, label: string) => (
    <button className="btn btn-sm" style={{ background: activeTab === key ? 'var(--primary)' : 'var(--bg-secondary)', color: activeTab === key ? '#fff' : undefined }} onClick={() => setActiveTab(key)}>{label}</button>
  );

  const loadStaff = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const r = await api('/users?limit=500');
      const list = r?.data?.data ?? r?.data ?? [];
      setStaff(Array.isArray(list) ? list : []);
    } catch { setStaff([]); }
    setLoadingStaff(false);
  }, []);

  const loadDepts = useCallback(async () => {
    setLoadingDepts(true);
    try {
      const r = await api('/departments?limit=500');
      const list = r?.data?.data ?? r?.data ?? [];
      setDepartments(Array.isArray(list) ? list : []);
    } catch { setDepartments([]); }
    setLoadingDepts(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'staff') loadStaff();
    if (activeTab === 'departments') loadDepts();
  }, [activeTab, loadStaff, loadDepts]);

  const filteredStaff = selectedDept ? staff.filter((s: any) => s.departmentId === selectedDept) : staff;

  const renderContent = () => {
    if (activeTab === 'staff') {
      return (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Staff Directory</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="input" value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)} style={{ minWidth: 200 }}>
                <option value="">All Departments</option>
                {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 16 }}>
            <div className="card" style={{ padding: '12px 16px', flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>{staff.length}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Total Staff</div>
            </div>
            <div className="card" style={{ padding: '12px 16px', flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{staff.filter((s: any) => s.isActive).length}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Active</div>
            </div>
            <div className="card" style={{ padding: '12px 16px', flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--danger)' }}>{staff.filter((s: any) => !s.isActive).length}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Inactive</div>
            </div>
          </div>

          {loadingStaff && <div className="loading">Loading staff...</div>}
          {!loadingStaff && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {filteredStaff.map((s: any) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{[s.firstName, s.lastName].filter(Boolean).join(' ')}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.email}</td>
                      <td>
                        <span className="badge" style={{ background: ROLE_COLORS[s.role] || 'var(--muted)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{s.role?.replace(/_/g, ' ')}</span>
                      </td>
                      <td style={{ fontSize: 12 }}>{s.department?.name || '—'}</td>
                      <td>
                        <span className="badge" style={{ background: s.isActive ? 'var(--success)' : 'var(--danger)', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{s.isActive ? 'Active' : 'Inactive'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loadingStaff && filteredStaff.length === 0 && (
            <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No staff members found.</div>
          )}
        </div>
      );
    }

    if (activeTab === 'departments') {
      return (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Departments</h2>
          {loadingDepts && <div className="loading">Loading departments...</div>}
          {!loadingDepts && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {departments.map((d: any) => (
                <div key={d.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>{d.name}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.code}</span>
                  </div>
                  {d.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{d.description}</div>}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {d._count?.users ?? 0} staff · {d._count?.wards ?? 0} wards · {d._count?.doctors ?? 0} doctors
                  </div>
                </div>
              ))}
              {departments.length === 0 && (
                <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No departments found.</div>
              )}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  if (activeTab === 'staff' || activeTab === 'departments') {
    return (
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>HR & Staff</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>Staff directory, shifts, rosters & leave management</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tabBtn('staff', 'Staff')}
            {tabBtn('departments', 'Departments')}
            {tabBtn('shifts', 'Shifts')}
            {tabBtn('rosters', 'Rosters')}
            {tabBtn('leaves', 'Leaves')}
          </div>
        </div>
        {renderContent()}
      </div>
    );
  }

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabBtn('staff', 'Staff')}
        {tabBtn('departments', 'Departments')}
        {tabBtn('shifts', 'Shifts')}
        {tabBtn('rosters', 'Rosters')}
        {tabBtn('leaves', 'Leaves')}
      </div>

      {activeTab === 'shifts' && (
        <ModulePage
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

      {activeTab === 'rosters' && (
        <ModulePage
          title="Rosters"
          subtitle="Shift assignments"
          endpoint="/hr/rosters"
          createLabel="Assign shift"
          columns={[
            { key: 'date', label: 'Date', render: (r) => r.date?.slice(0, 10) || '—' },
            { key: 'user', label: 'Staff', render: (r) => [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ') || r.userId },
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

      {activeTab === 'leaves' && (
        <ModulePage
          title="Leaves"
          subtitle="Leave requests and approvals"
          endpoint="/hr/leaves"
          createLabel="Request leave"
          columns={[
            { key: 'user', label: 'Staff', render: (r) => [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ') || r.userId },
            { key: 'type', label: 'Type', badge: true },
            { key: 'startDate', label: 'From', render: (r) => r.startDate?.slice(0, 10) || '—' },
            { key: 'endDate', label: 'To', render: (r) => r.endDate?.slice(0, 10) || '—' },
            { key: 'days', label: 'Days' },
            { key: 'status', label: 'Status', badge: true },
          ]}
          fields={[
            { name: 'userId', label: 'Staff', required: true, type: 'select', optionsFrom: { valueKey: 'id', labelKeys: ['firstName', 'lastName'], endpoint: '/users' } },
            { name: 'type', label: 'Type', type: 'select', options: LEAVE_TYPES },
            { name: 'startDate', label: 'Start date', type: 'date', required: true },
            { name: 'endDate', label: 'End date', type: 'date', required: true },
            { name: 'days', label: 'Days', type: 'number' },
            { name: 'reason', label: 'Reason', type: 'textarea', full: true },
          ]}
        />
      )}
    </>
  );
}
