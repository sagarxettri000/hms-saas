'use client';

import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';
import { api } from '@/lib/api';
import { PATIENT_REF } from '@/lib/options';

async function apiPatch(path: string, body: Record<string, any>) {
  await api(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export default function AdverseEventsPage() {
  return (
    <ModulePage
      title="Adverse Events"
      subtitle="Patient safety incident reporting & tracking"
      endpoint="/adverse-events"
      createLabel="Report event"
      columns={[
        { key: 'type', label: 'Type', badge: true },
        {
          key: 'severity',
          label: 'Severity',
          badge: true,
        },
        {
          key: 'status',
          label: 'Status',
          badge: true,
        },
        {
          key: 'patient',
          label: 'Patient',
          render: (r) =>
            r.patient
              ? [r.patient.firstName, r.patient.lastName].filter(Boolean).join(' ') || r.patient.mrn
              : '—',
        },
        {
          key: 'description',
          label: 'Description',
          render: (r) => (
            <span title={r.description}>
              {String(r.description || '').slice(0, 60)}
              {String(r.description || '').length > 60 ? '…' : ''}
            </span>
          ),
        },
        { key: 'occurredAt', label: 'Occurred', render: (r) => formatDateTime(r.occurredAt) },
      ]}
      fields={[
        { name: 'patientId', label: 'Patient', type: 'searchSelect', optionsFrom: PATIENT_REF },
        { name: 'type', label: 'Event type', required: true, placeholder: 'e.g. Medication error' },
        {
          name: 'severity',
          label: 'Severity',
          type: 'select',
          options: [
            { value: 'MILD', label: 'Mild' },
            { value: 'MODERATE', label: 'Moderate' },
            { value: 'SEVERE', label: 'Severe' },
            { value: 'FATAL', label: 'Fatal' },
          ],
          defaultValue: 'MODERATE',
        },
        {
          name: 'category',
          label: 'Category',
          type: 'select',
          options: [
            { value: 'MEDICATION', label: 'Medication' },
            { value: 'SURGICAL', label: 'Surgical' },
            { value: 'FALL', label: 'Patient fall' },
            { value: 'INFECTION', label: 'Healthcare-associated infection' },
            { value: 'DEVICE', label: 'Medical device' },
            { value: 'TRANSFUSION', label: 'Transfusion' },
            { value: 'OTHER', label: 'Other' },
          ],
        },
        { name: 'description', label: 'Description', type: 'textarea', required: true, full: true },
        { name: 'occurredAt', label: 'Occurred at', type: 'date' },
      ]}
      actions={[
        {
          label: 'Close',
          tone: 'primary',
          condition: (r) => r.status !== 'CLOSED',
          onClick: (r) =>
            apiPatch(`/adverse-events/${r.id}`, { status: 'CLOSED' }),
        },
      ]}
    />
  );
}
