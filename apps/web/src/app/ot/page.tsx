'use client';

import ModulePage from '@/components/ModulePage';
import { formatDate } from '@/lib/hooks';
import { ANESTHESIA_TYPES, DOCTOR_REF, OT_TYPES, PATIENT_REF } from '@/lib/options';

export default function OtPage() {
  const columns = [
    { key: 'otNumber', label: 'OT no.', render: (r: any) => <span className="mono">{r.otNumber}</span> },
    {
      key: 'patient',
      label: 'Patient',
      render: (r: any) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
    },
    { key: 'procedureName', label: 'Procedure' },
    { key: 'otType', label: 'Type', badge: true },
    { key: 'otRoom', label: 'Room', render: (r: any) => r.otRoom || '—' },
    { key: 'scheduledDate', label: 'Scheduled', render: (r: any) => formatDate(r.scheduledDate) },
    { key: 'status', label: 'Status', badge: true },
  ];

  const fields = [
    { name: 'patientId', label: 'Patient', required: true, type: 'select' as const, optionsFrom: PATIENT_REF },
    { name: 'surgeonId', label: 'Surgeon', type: 'select' as const, optionsFrom: DOCTOR_REF },
    { name: 'procedureName', label: 'Procedure', required: true },
    { name: 'procedureCode', label: 'Procedure code' },
    { name: 'otType', label: 'Type', type: 'select' as const, options: OT_TYPES, defaultValue: 'ELECTIVE' },
    { name: 'anesthesiaType', label: 'Anesthesia', type: 'select' as const, options: ANESTHESIA_TYPES },
    { name: 'otRoom', label: 'OT room' },
    { name: 'scheduledDate', label: 'Scheduled date', type: 'date' as const },
    { name: 'startTime', label: 'Start time (HH:MM)', placeholder: '09:00' },
    { name: 'endTime', label: 'End time (HH:MM)', placeholder: '11:00' },
    { name: 'notes', label: 'Notes', type: 'textarea' as const, full: true },
  ];

  return (
    <ModulePage
      title="Theatres (OT)"
      subtitle="Surgical cases & schedule"
      tabs={[
        {
          key: 'cases',
          label: 'Cases',
          endpoint: '/ot',
          createLabel: 'Schedule surgery',
          columns,
          fields,
        },
        {
          key: 'schedule',
          label: 'Schedule',
          endpoint: '/ot/schedule',
          columns,
        },
      ]}
    />
  );
}
