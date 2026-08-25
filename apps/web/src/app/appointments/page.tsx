'use client';

import ModulePage from '@/components/ModulePage';
import DaySchedule from '@/components/DaySchedule';
import { formatDateTime } from '@/lib/hooks';
import { APPOINTMENT_TYPES, DOCTOR_REF, GENDERS, PATIENT_REF } from '@/lib/options';

export default function AppointmentsPage() {
  return (
    <ModulePage
      title="Appointments"
      subtitle="Outpatient appointments & scheduling"
      endpoint="/appointments"
      createLabel="Book appointment"
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
        {
          key: 'appointmentDate',
          label: 'Date & time',
          render: (r) =>
            r.appointmentDate
              ? formatDateTime(`${r.appointmentDate.slice(0, 10)}T${r.startTime || '00:00'}`)
              : '—',
        },
        { key: 'type', label: 'Type', badge: true },
        { key: 'status', label: 'Status', badge: true },
        { key: 'reason', label: 'Reason' },
      ]}
      fields={[
        { name: 'patientId', label: 'Existing patient', type: 'searchSelect', optionsFrom: PATIENT_REF, hint: 'Leave empty to auto-register a new patient' },
        { name: 'patientFirstName', label: 'New patient — First name' },
        { name: 'patientLastName', label: 'Last name' },
        { name: 'patientMobile', label: 'Mobile' },
        { name: 'patientGender', label: 'Gender', type: 'select', options: GENDERS },
        { name: 'patientDateOfBirth', label: 'Date of birth', type: 'date' },
        { name: 'doctorId', label: 'Doctor', required: true, type: 'select', optionsFrom: DOCTOR_REF },
        { name: 'appointmentDate', label: 'Date', required: true, type: 'date' },
        { name: 'startTime', label: 'Start time (HH:MM)', required: true, placeholder: '09:30' },
        { name: 'endTime', label: 'End time (HH:MM)', placeholder: '10:00' },
        { name: 'type', label: 'Type', type: 'select', options: APPOINTMENT_TYPES, defaultValue: 'OPD' },
        { name: 'reason', label: 'Reason', full: true },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true },
        { name: 'source', label: 'Source', type: 'select', options: [
          { value: 'ONLINE', label: 'Online' },
          { value: 'PHONE', label: 'Phone' },
          { value: 'WALKIN', label: 'Walk-in' },
          { value: 'REFERRAL', label: 'Referral' },
          { value: 'OTHER', label: 'Other' },
        ] },
      ]}
      extra={() => <DaySchedule />}
    />
  );
}
