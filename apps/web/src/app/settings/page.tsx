'use client';

import { useEffect, useState } from 'react';
import ModulePage from '@/components/ModulePage';
import IntegrationSettings from '@/components/IntegrationSettings';
import OrgProfile from '@/components/OrgProfile';
import TwoFactorManager from '@/components/auth/TwoFactorManager';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/hooks';

function ToggleList({ path }: { path: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  useEffect(() => {
    let active = true;
    api(path)
      .then((data) => { if (active) setItems(Array.isArray(data) ? data : data.data ?? []); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path]);

  async function toggle(item: any, enabled: boolean) {
    setBusyKey(item.key ?? item.provider);
    setError('');
    try {
      await api(`${path}/${item.key ?? item.provider}`, {
        method: 'PATCH',
        body: JSON.stringify(
          item.provider ? { enabled, config: item.config ?? {} } : { enabled },
        ),
      });
      setItems((prev) =>
        prev.map((i) =>
          (i.key ?? i.provider) === (item.key ?? item.provider) ? { ...i, enabled } : i,
        ),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyKey('');
    }
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="card">
      {items.length === 0 && <div className="empty">No items configured.</div>}
      {items.map((item) => {
        const key = item.key ?? item.provider;
        return (
          <div key={key} className="row-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <strong>{item.name ?? item.provider}</strong>
              {item.description && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{item.description}</div>}
            </div>
            <button
              className={item.enabled ? 'btn btn-sm' : 'btn btn-secondary btn-sm'}
              disabled={busyKey === key}
              onClick={() => toggle(item, !item.enabled)}
            >
              {item.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PharmacyBillingSettings({ canEdit }: { canEdit: boolean }) {
  const [vatNumber, setVatNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api('/pharmacy/billing-settings')
      .then((res: any) => {
        const v = res?.data ?? res ?? {};
        setVatNumber(v.vatNumber ?? '');
        setPanNumber(v.panNumber ?? '');
      })
      .catch((e: any) => setError(e?.message || 'Failed to load Pharmacy billing settings'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api('/pharmacy/billing-settings', {
        method: 'PUT',
        body: JSON.stringify({ vatNumber: vatNumber.trim() || undefined, panNumber: panNumber.trim() || undefined }),
      });
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-title">Pharmacy Billing</div>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>
        Tax registration numbers printed on <strong>Pharmacy receipts only</strong>. Other
        departments keep using the hospital profile PAN/VAT.
      </p>
      <div className="field">
        <label className="label">Pharmacy PAN Number</label>
        <input
          className="input"
          value={panNumber}
          onChange={(e) => setPanNumber(e.target.value)}
          placeholder="e.g. 123456789"
          disabled={!canEdit}
        />
      </div>
      <div className="field">
        <label className="label">Pharmacy VAT Number</label>
        <input
          className="input"
          value={vatNumber}
          onChange={(e) => setVatNumber(e.target.value)}
          placeholder="e.g. 601234567"
          disabled={!canEdit}
        />
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">Pharmacy billing settings saved.</div>}
      {canEdit ? (
        <div className="form-actions">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : (
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>
          Only hospital administrators can change these values.
        </p>
      )
      }
    </div>
  );
}

export default function SettingsPage() {
  const role = useAuth();
  const canEditOrg = ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN'].includes(role ?? '');
  const tabs: any[] = [
    {
      key: 'hospital',
      label: 'Hospital',
      render: () => <OrgProfile />,
    },
    {
      key: 'pharmacy-billing',
      label: 'Pharmacy Billing',
      render: () => <PharmacyBillingSettings canEdit={canEditOrg} />,
    },
    {
      key: 'users',
          label: 'Users',
          endpoint: '/users',
          createLabel: 'Add user',
          editable: true,
          createRoles: ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN'],
          columns: [
            {
              key: 'name',
              label: 'Name',
              render: (r: any) => [r.firstName, r.lastName].filter(Boolean).join(' ') || r.name,
            },
            { key: 'email', label: 'Email', render: (r: any) => <span className="mono">{r.email}</span> },
            { key: 'role', label: 'Role', badge: true },
            { key: 'status', label: 'Status', badge: true },
            {
              key: 'actions',
              label: 'Actions',
              render: (r: any) => {
                const isSuper = r.role === 'PLATFORM_SUPER_ADMIN';
                return (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {isSuper && (
                      <button
                        className="btn btn-link text-error text-sm"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete user ${r.firstName} ${r.lastName} (${r.email})?`,
                            )
                          ) {
                            api(`/users/${r.id}`, {
                              method: 'DELETE',
                            }).then(() => {
                              window.location.reload();
                            });
                          }
                        }}
                        title="Delete user"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                );
              },
            },
          ],
          fields: [
            { name: 'firstName', label: 'First name' },
            { name: 'lastName', label: 'Last name' },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'password', label: 'Password', type: 'password' },
            { name: 'role', label: 'Role', type: 'select', options: [
              { value: 'HOSPITAL_ADMIN', label: 'Hospital Admin' },
              { value: 'HOSPITAL_OWNER', label: 'Hospital Owner' },
              { value: 'DEPARTMENT_HEAD', label: 'Department Head' },
              { value: 'DOCTOR', label: 'Doctor' },
              { value: 'NURSE', label: 'Nurse' },
              { value: 'WARD_INCHARGE', label: 'Ward Incharge' },
              { value: 'LAB_TECHNICIAN', label: 'Lab Technician' },
              { value: 'PATHOLOGIST', label: 'Pathologist' },
              { value: 'RADIOLOGIST', label: 'Radiologist' },
              { value: 'RADIOLOGY_TECHNICIAN', label: 'Radiology Technician' },
              { value: 'PHARMACIST', label: 'Pharmacist' },
              { value: 'FINANCE_MANAGER', label: 'Finance Manager' },
              { value: 'INSURANCE_OFFICER', label: 'Insurance Officer' },
              { value: 'HR_MANAGER', label: 'HR Manager' },
              { value: 'INVENTORY_MANAGER', label: 'Inventory Manager' },
              { value: 'STORE_KEEPER', label: 'Store Keeper' },
              { value: 'PURCHASE_OFFICER', label: 'Purchase Officer' },
              { value: 'RECEPTIONIST', label: 'Receptionist' },
              { value: 'RECEPTION_SUPERVISOR', label: 'Reception Supervisor' },
              { value: 'OT_TECHNICIAN', label: 'OT Technician' },
              { value: 'OT_NURSE', label: 'OT Nurse' },
              { value: 'ANESTHETIST', label: 'Anesthetist' },
              { value: 'EMERGENCY_STAFF', label: 'Emergency Staff' },
              { value: 'BLOOD_BANK_STAFF', label: 'Blood Bank Staff' },
              { value: 'BIOMEDICAL_ENGINEER', label: 'Biomedical Engineer' },
              { value: 'IT_ADMIN', label: 'IT Admin' },
              { value: 'QUALITY_MANAGER', label: 'Quality Manager' },
              { value: 'AUDITOR', label: 'Auditor' },
            ] },
            { name: 'phone', label: 'Phone' },
          ],
        },
        {
          key: 'roles',
          label: 'Roles & Permissions',
          endpoint: '/roles',
          createLabel: 'Add role',
          createRoles: ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN'],
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'description', label: 'Description' },
            { key: 'isSystem', label: 'System', render: (r: any) => (r.isSystem ? 'Yes' : 'No') },
            {
              key: 'actions',
              label: 'Actions',
              render: (r: any) => {
                const isSuper = r.name === 'PLATFORM_SUPER_ADMIN' || false;
                return (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!r.isSystem && isSuper && (
                      <button
                        className="btn btn-link text-error text-sm"
                        onClick={() => {
                          if (window.confirm(`Delete role ${r.name}?`)) {
                            api(`/roles/${r.id}`, {
                              method: 'DELETE',
                            }).then(() => {
                              window.location.reload();
                            });
                          }
                        }}
                        title="Delete role"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                );
              },
            },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true, type: 'select', options: [
              { value: 'HOSPITAL_ADMIN', label: 'Hospital Admin' },
              { value: 'HOSPITAL_OWNER', label: 'Hospital Owner' },
              { value: 'DEPARTMENT_HEAD', label: 'Department Head' },
              { value: 'DOCTOR', label: 'Doctor' },
              { value: 'NURSE', label: 'Nurse' },
              { value: 'WARD_INCHARGE', label: 'Ward Incharge' },
              { value: 'LAB_TECHNICIAN', label: 'Lab Technician' },
              { value: 'PATHOLOGIST', label: 'Pathologist' },
              { value: 'RADIOLOGIST', label: 'Radiologist' },
              { value: 'RADIOLOGY_TECHNICIAN', label: 'Radiology Technician' },
              { value: 'PHARMACIST', label: 'Pharmacist' },
              { value: 'FINANCE_MANAGER', label: 'Finance Manager' },
              { value: 'INSURANCE_OFFICER', label: 'Insurance Officer' },
              { value: 'HR_MANAGER', label: 'HR Manager' },
              { value: 'INVENTORY_MANAGER', label: 'Inventory Manager' },
              { value: 'STORE_KEEPER', label: 'Store Keeper' },
              { value: 'PURCHASE_OFFICER', label: 'Purchase Officer' },
              { value: 'RECEPTIONIST', label: 'Receptionist' },
              { value: 'RECEPTION_SUPERVISOR', label: 'Reception Supervisor' },
              { value: 'OT_TECHNICIAN', label: 'OT Technician' },
              { value: 'OT_NURSE', label: 'OT Nurse' },
              { value: 'ANESTHETIST', label: 'Anesthetist' },
              { value: 'EMERGENCY_STAFF', label: 'Emergency Staff' },
              { value: 'BLOOD_BANK_STAFF', label: 'Blood Bank Staff' },
              { value: 'BIOMEDICAL_ENGINEER', label: 'Biomedical Engineer' },
              { value: 'IT_ADMIN', label: 'IT Admin' },
              { value: 'QUALITY_MANAGER', label: 'Quality Manager' },
              { value: 'AUDITOR', label: 'Auditor' },
            ] },
            { name: 'description', label: 'Description', type: 'textarea', full: true },
            { name: 'permissions', label: 'Permissions', type: 'json', full: true, hint: '["VIEW","CREATE","EDIT"]' },
          ],
        },
        {
          key: 'feature-flags',
          label: 'Feature Flags',
          render: () => <ToggleList path="/settings/feature-flags" />,
        },
        {
          key: 'integrations',
          label: 'Integrations',
          render: () => <IntegrationSettings />,
        },
        {
          key: 'security',
          label: 'Security',
          render: () => <TwoFactorManager />,
        },
      ];

  return (
    <ModulePage
      title="Settings"
      subtitle="Hospital configuration"
      tabs={canEditOrg ? tabs : tabs.filter((t) => t.key !== 'hospital')}
    />
  );
}
