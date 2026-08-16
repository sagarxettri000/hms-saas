'use client';

import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';
import { DOCTOR_REF, ENCOUNTER_TYPES, PATIENT_REF } from '@/lib/options';

export default function EncountersPage() {
  return (
    <ModulePage
      title="Encounters"
      subtitle="Clinical encounters & consultations"
      endpoint="/encounters"
      createLabel="Start encounter"
      columns={[
        {
          key: 'patient',
          label: 'Patient',
          render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
        },
        {
          key: 'doctor',
          label: 'Doctor',
          render: (r) =>
            [r.doctor?.user?.firstName, r.doctor?.user?.lastName].filter(Boolean).join(' ') ||
            [r.doctor?.firstName, r.doctor?.lastName].filter(Boolean).join(' ') ||
            r.doctorId,
        },
        { key: 'type', label: 'Type', badge: true },
        { key: 'status', label: 'Status', badge: true },
        { key: 'diagnosis', label: 'Diagnosis' },
        { key: 'createdAt', label: 'Started', render: (r) => formatDateTime(r.createdAt) },
      ]}
      fields={[
        { name: 'patientId', label: 'Patient', required: true, type: 'select', optionsFrom: PATIENT_REF },
        { name: 'doctorId', label: 'Doctor', type: 'select', optionsFrom: DOCTOR_REF },
        { name: 'type', label: 'Type', type: 'select', options: ENCOUNTER_TYPES, defaultValue: 'OPD' },
        { name: 'symptoms', label: 'Symptoms', type: 'textarea', full: true },
        { name: 'history', label: 'History', type: 'textarea', full: true },
        { name: 'examination', label: 'Examination findings', type: 'textarea', full: true },
        { name: 'diagnosis', label: 'Diagnosis', full: true },
        { name: 'icd10Code', label: 'ICD-10 code' },
        { name: 'clinicalNotes', label: 'Clinical notes', type: 'textarea', full: true },
      ]}
    />
  );
}
