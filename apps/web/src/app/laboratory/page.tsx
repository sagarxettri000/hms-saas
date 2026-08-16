'use client';

import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';
import { DOCTOR_REF, PATIENT_REF } from '@/lib/options';

export default function LaboratoryPage() {
  return (
    <ModulePage
      title="Laboratory"
      subtitle="Lab tests & orders"
      tabs={[
        {
          key: 'tests',
          label: 'Tests',
          endpoint: '/lab/tests',
          createLabel: 'Add test',
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Code', render: (r) => <span className="mono">{r.code || '—'}</span> },
            { key: 'category', label: 'Category', badge: true },
            { key: 'specimenType', label: 'Specimen', render: (r) => r.specimenType || '—' },
            { key: 'unit', label: 'Unit', render: (r) => r.unit || '—' },
            { key: 'price', label: 'Price' },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'code', label: 'Code' },
            { name: 'category', label: 'Category' },
            { name: 'specimenType', label: 'Specimen type' },
            { name: 'unit', label: 'Unit' },
            { name: 'referenceRange', label: 'Reference range' },
            { name: 'price', label: 'Price', type: 'number' },
            { name: 'turnaroundTime', label: 'TAT (hours)', type: 'number' },
            { name: 'discipline', label: 'Discipline' },
          ],
        },
        {
          key: 'orders',
          label: 'Orders',
          endpoint: '/lab/orders',
          createLabel: 'New lab order',
          columns: [
            { key: 'orderNumber', label: 'Order no.', render: (r) => <span className="mono">{r.orderNumber}</span> },
            {
              key: 'patient',
              label: 'Patient',
              render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
            },
            { key: 'status', label: 'Status', badge: true },
            { key: 'isStat', label: 'STAT', render: (r) => (r.isStat ? 'Yes' : '') },
            { key: 'orderedAt', label: 'Ordered', render: (r) => formatDateTime(r.orderedAt) },
          ],
          fields: [
            { name: 'patientId', label: 'Patient', required: true, type: 'select', optionsFrom: PATIENT_REF },
            { name: 'doctorId', label: 'Doctor', type: 'select', optionsFrom: DOCTOR_REF },
            { name: 'isStat', label: 'STAT', type: 'checkbox' },
            { name: 'isEmergency', label: 'Emergency', type: 'checkbox' },
            { name: 'clinicalNote', label: 'Clinical notes', type: 'textarea', full: true },
            { name: 'items', label: 'Lab Tests', type: 'json', required: true, full: true, hint: '[{labTestId, testName, price}]' },
          ],
        },
      ]}
    />
  );
}
