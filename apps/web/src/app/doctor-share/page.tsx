'use client';

import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';
import { DEPARTMENT_REF, DOCTOR_REF } from '@/lib/options';

export default function DoctorSharePage() {
  return (
    <ModulePage
      title="Doctor Share"
      subtitle="Revenue sharing rules & settlements"
      tabs={[
        {
          key: 'rules',
          label: 'Rules',
          endpoint: '/doctor-share/rules',
          createLabel: 'Add rule',
          columns: [
            {
              key: 'doctor',
              label: 'Doctor',
              render: (r) => [r.doctor?.user?.firstName, r.doctor?.user?.lastName].filter(Boolean).join(' ') || r.doctorId || 'Any',
            },
            {
              key: 'department',
              label: 'Department',
              render: (r) => r.department?.name || r.departmentId || 'Any',
            },
            { key: 'schemeName', label: 'Scheme' },
            { key: 'shareType', label: 'Type', badge: true },
            { key: 'shareValue', label: 'Value' },
            { key: 'isActive', label: 'Active', render: (r) => (r.isActive ? 'Yes' : 'No') },
          ],
          fields: [
            { name: 'doctorId', label: 'Doctor', type: 'select', optionsFrom: DOCTOR_REF },
            { name: 'departmentId', label: 'Department', type: 'select', optionsFrom: DEPARTMENT_REF },
            { name: 'schemeName', label: 'Scheme name' },
            { name: 'shareType', label: 'Type', type: 'select', options: [
              { value: 'PERCENTAGE', label: 'Percentage' },
              { value: 'FIXED', label: 'Fixed amount' },
            ], defaultValue: 'PERCENTAGE' },
            { name: 'shareValue', label: 'Share value', type: 'number', required: true },
          ],
        },
        {
          key: 'transactions',
          label: 'Transactions',
          endpoint: '/doctor-share/transactions',
          columns: [
            { key: 'invoice', label: 'Invoice', render: (r) => <span className="mono">{r.invoice?.invoiceNumber || r.invoiceId?.slice(0, 8)}</span> },
            { key: 'schemeName', label: 'Scheme', render: (r) => r.rule?.schemeName || '—' },
            { key: 'grossAmount', label: 'Gross', render: (r) => Number(r.grossAmount || 0).toLocaleString() },
            { key: 'doctorShare', label: 'Share', render: (r) => Number(r.doctorShare || 0).toLocaleString() },
            { key: 'status', label: 'Status', badge: true },
            { key: 'calculatedAt', label: 'Calculated', render: (r) => formatDateTime(r.calculatedAt) },
          ],
        },
      ]}
    />
  );
}
