'use client';

import ModulePage from '@/components/ModulePage';
import { BLOOD_COMPONENTS } from '@/lib/options';

export default function BloodBankPage() {
  return (
    <ModulePage
      title="Blood Bank"
      subtitle="Blood donors & inventory"
      tabs={[
        {
          key: 'donors',
          label: 'Donors',
          endpoint: '/blood-bank/donors',
          createLabel: 'Register donor',
          columns: [
            { key: 'donorCode', label: 'Donor code', render: (r) => <span className="mono">{r.donorCode || r.id.slice(0, 8)}</span> },
            { key: 'name', label: 'Name' },
            { key: 'bloodGroup', label: 'Blood group', render: (r) => r.bloodGroup?.replace('_', ' ') },
            { key: 'phone', label: 'Phone' },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'bloodGroup', label: 'Blood group', required: true },
            { name: 'phone', label: 'Phone', required: true },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'gender', label: 'Gender', type: 'select', options: [
              { value: 'MALE', label: 'Male' },
              { value: 'FEMALE', label: 'Female' },
              { value: 'OTHER', label: 'Other' },
            ] },
            { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
            { name: 'weight', label: 'Weight (kg)', type: 'number' },
            { name: 'address', label: 'Address' },
            { name: 'medicalHistory', label: 'Medical history', type: 'textarea', full: true },
          ],
        },
        {
          key: 'inventory',
          label: 'Inventory',
          endpoint: '/blood-bank/units',
          createLabel: 'Register unit',
          columns: [
            { key: 'unitNumber', label: 'Unit no.', render: (r) => <span className="mono">{r.unitNumber || r.id.slice(0, 8)}</span> },
            { key: 'bloodGroup', label: 'Blood group', render: (r) => r.bloodGroup?.replace('_', ' ') },
            { key: 'component', label: 'Component', badge: true },
            { key: 'storageLocation', label: 'Location' },
            { key: 'expiryDate', label: 'Expiry', render: (r) => r.expiryDate?.slice(0, 10) || '—' },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            {
              name: 'donorId',
              label: 'Donor',
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/blood-bank/donors' },
            },
            { name: 'bloodGroup', label: 'Blood group', required: true },
            { name: 'component', label: 'Component', type: 'select', options: BLOOD_COMPONENTS, defaultValue: 'WHOLE_BLOOD' },
            { name: 'collectionDate', label: 'Collection date', type: 'date' },
            { name: 'expiryDate', label: 'Expiry date', type: 'date' },
            { name: 'storageLocation', label: 'Storage location' },
            { name: 'tested', label: 'Tested', type: 'checkbox' },
            { name: 'testResults', label: 'Test Results', type: 'json', full: true },
          ],
        },
      ]}
    />
  );
}
