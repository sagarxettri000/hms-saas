'use client';

import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';
import { api } from '@/lib/api';

async function apiPatch(path: string, body: Record<string, any>) {
  await api(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export default function TenantsPage() {
  return (
    <ModulePage
      title="Tenants"
      subtitle="Hospital workspaces & onboarding"
      endpoint="/tenants"
      createLabel="Onboard hospital"
      columns={[
        { key: 'name', label: 'Hospital' },
        { key: 'subdomain', label: 'Subdomain', render: (r) => <span className="mono">{r.subdomain || '—'}</span> },
        { key: 'status', label: 'Status', badge: true },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'createdAt', label: 'Created', render: (r) => formatDateTime(r.createdAt) },
      ]}
      fields={[
        { name: 'name', label: 'Hospital name', required: true, full: true },
        { name: 'code', label: 'Code', required: true, hint: 'Short unique code, e.g. NBM' },
        { name: 'adminFirstName', label: 'Admin first name', required: true },
        { name: 'adminLastName', label: 'Admin last name', required: true },
        { name: 'adminEmail', label: 'Admin email', type: 'email', required: true },
        { name: 'adminPassword', label: 'Admin password', type: 'password', required: true },
        { name: 'phone', label: 'Phone' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'addressLine1', label: 'Address line 1' },
        { name: 'city', label: 'City' },
        { name: 'country', label: 'Country' },
        { name: 'panNumber', label: 'PAN / VAT number' },
        { name: 'currency', label: 'Currency', defaultValue: 'NPR' },
        { name: 'timezone', label: 'Timezone', defaultValue: 'Asia/Kathmandu' },
      ]}
      actions={[
        {
          label: 'Activate',
          tone: 'primary',
          condition: (r) => r.status === 'TRIAL',
          onClick: (r) => apiPatch(`/tenants/${r.id}/status`, { status: 'ACTIVE' }),
        },
        {
          label: 'Suspend',
          tone: 'secondary',
          condition: (r) => r.status !== 'SUSPENDED' && r.status !== 'ARCHIVED',
          onClick: (r) => apiPatch(`/tenants/${r.id}/status`, { status: 'SUSPENDED' }),
        },
        {
          label: 'Archive',
          tone: 'danger',
          condition: (r) => r.status !== 'ARCHIVED',
          onClick: (r) => apiPatch(`/tenants/${r.id}/archive`, {}),
        },
      ]}
    />
  );
}
