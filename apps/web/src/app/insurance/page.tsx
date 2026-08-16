'use client';

import ModulePage from '@/components/ModulePage';
import { formatMoney } from '@/lib/hooks';
import { PATIENT_REF, PROVIDER_REF } from '@/lib/options';

export default function InsurancePage() {
  return (
    <ModulePage
      title="Insurance"
      subtitle="Insurance providers & claims"
      tabs={[
        {
          key: 'providers',
          label: 'Providers',
          endpoint: '/insurance/providers',
          createLabel: 'Add provider',
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Code' },
            { key: 'contactPerson', label: 'Contact' },
            { key: 'phone', label: 'Phone' },
            { key: 'isActive', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'code', label: 'Code' },
            { name: 'contactPerson', label: 'Contact person' },
            { name: 'phone', label: 'Phone' },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'address', label: 'Address', type: 'textarea', full: true },
          ],
        },
        {
          key: 'claims',
          label: 'Claims',
          endpoint: '/insurance/claims',
          createLabel: 'New claim',
          columns: [
            { key: 'claimNumber', label: 'Claim no.', render: (r) => <span className="mono">{r.claimNumber}</span> },
            {
              key: 'patient',
              label: 'Patient',
              render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
            },
            {
              key: 'provider',
              label: 'Provider',
              render: (r) => r.provider?.name || r.providerId,
            },
            { key: 'claimAmount', label: 'Amount', render: (r) => formatMoney(r.claimAmount) },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            { name: 'patientId', label: 'Patient', required: true, type: 'select', optionsFrom: PATIENT_REF },
            { name: 'providerId', label: 'Provider', type: 'select', optionsFrom: PROVIDER_REF },
            { name: 'policyId', label: 'Policy', type: 'select', optionsFrom: {
              valueKey: 'id', labelKeys: ['policyNumber'], endpoint: '/insurance/policies',
            } },
            { name: 'invoiceId', label: 'Invoice', type: 'select', optionsFrom: {
              valueKey: 'id', labelKeys: ['invoiceNumber'], endpoint: '/billing/invoices',
            } },
            { name: 'claimAmount', label: 'Claim amount', type: 'number', required: true },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ],
        },
      ]}
    />
  );
}
