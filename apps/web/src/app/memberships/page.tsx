'use client';

import ModulePage from '@/components/ModulePage';
import { PATIENT_REF } from '@/lib/options';

export default function MembershipsPage() {
  return (
    <ModulePage
      title="Memberships"
      subtitle="Membership plans & subscribers"
      tabs={[
        {
          key: 'packages',
          label: 'Packages',
          endpoint: '/memberships/packages',
          createLabel: 'Add package',
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'price', label: 'Price' },
            { key: 'durationDays', label: 'Duration (days)' },
            { key: 'discountPercent', label: 'Discount %' },
            { key: 'isActive', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'description', label: 'Description', type: 'textarea', full: true },
            { name: 'price', label: 'Price', type: 'number' },
            { name: 'durationDays', label: 'Duration (days)', type: 'number' },
            { name: 'discountPercent', label: 'Discount %', type: 'number' },
            { name: 'benefits', label: 'Benefits', type: 'json', full: true },
          ],
        },
        {
          key: 'members',
          label: 'Members',
          endpoint: '/memberships',
          createLabel: 'Enroll member',
          columns: [
            {
              key: 'patient',
              label: 'Patient',
              render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
            },
            {
              key: 'package',
              label: 'Package',
              render: (r) => r.package?.name || r.packageId,
            },
            { key: 'membershipNumber', label: 'Member no.', render: (r) => <span className="mono">{r.membershipNumber}</span> },
            { key: 'startDate', label: 'Start', render: (r) => r.startDate?.slice(0, 10) || '—' },
            { key: 'endDate', label: 'Expiry', render: (r) => r.endDate?.slice(0, 10) || '—' },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            { name: 'patientId', label: 'Patient', required: true, type: 'select', optionsFrom: PATIENT_REF },
            {
              name: 'packageId',
              label: 'Package',
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/memberships/packages' },
            },
            { name: 'startDate', label: 'Start date', type: 'date' },
            { name: 'endDate', label: 'End date', type: 'date' },
            { name: 'discountPercent', label: 'Discount %', type: 'number' },
            { name: 'isFamily', label: 'Family plan', type: 'checkbox' },
          ],
        },
      ]}
    />
  );
}
