'use client';

import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';
import { PATIENT_REF } from '@/lib/options';

export default function EmergencyPage() {
  return (
    <ModulePage
      title="Emergency"
      subtitle="Emergency department cases"
      endpoint="/emergency"
      createLabel="New emergency case"
      columns={[
        { key: 'caseNumber', label: 'Case no.', render: (r) => <span className="mono">{r.caseNumber}</span> },
        {
          key: 'patient',
          label: 'Patient',
          render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
        },
        { key: 'triageLevel', label: 'Triage', badge: true },
        { key: 'arrivalMode', label: 'Arrival', badge: true },
        { key: 'chiefComplaint', label: 'Chief complaint' },
        { key: 'admitted', label: 'Admitted', render: (r) => (r.admitted ? 'Yes' : '—') },
        { key: 'createdAt', label: 'Arrived', render: (r) => formatDateTime(r.createdAt) },
      ]}
      fields={[
        { name: 'patientId', label: 'Patient', required: true, type: 'searchSelect', optionsFrom: PATIENT_REF },
        { name: 'triageLevel', label: 'Triage level', type: 'select', options: [
          { value: 'RED', label: 'Red (resuscitation)' },
          { value: 'ORANGE', label: 'Orange (emergent)' },
          { value: 'YELLOW', label: 'Yellow (urgent)' },
          { value: 'GREEN', label: 'Green (less urgent)' },
          { value: 'BLUE', label: 'Blue (non urgent)' },
        ] },
        { name: 'arrivalMode', label: 'Arrival mode', type: 'select', options: [
          { value: 'AMBULANCE', label: 'Ambulance' },
          { value: 'WALK_IN', label: 'Walk in' },
          { value: 'REFERRAL', label: 'Referral' },
          { value: 'POLICE', label: 'Police' },
          { value: 'OTHER', label: 'Other' },
        ] },
        { name: 'chiefComplaint', label: 'Chief complaint', full: true },
        { name: 'history', label: 'History', type: 'textarea', full: true },
        { name: 'examination', label: 'Examination', type: 'textarea', full: true },
        { name: 'vitals', label: 'Vitals', type: 'json', full: true, hint: '{bp, pulse, spo2, temperature}' },
        { name: 'isMLC', label: 'MLC case', type: 'checkbox' },
        { name: 'mlcNumber', label: 'MLC number' },
        { name: 'policeCase', label: 'Police case', type: 'checkbox' },
        { name: 'triageNotes', label: 'Triage notes', type: 'textarea', full: true },
      ]}
    />
  );
}
