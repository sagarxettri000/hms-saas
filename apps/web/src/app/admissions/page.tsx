'use client';

import { useEffect, useRef, useState } from 'react';
import ModulePage from '@/components/ModulePage';
import DischargeModal from '@/components/DischargeModal';
import { DOCTOR_REF, PATIENT_REF } from '@/lib/options';
import type { Row } from '@/lib/types';

const CLINICAL_ROLES = ['DOCTOR', 'NURSE', 'WARD_INCHARGE', 'ICU_STAFF', 'EMERGENCY_STAFF', 'ANESTHETIST'];
const ADMIN_ROLES = ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN', 'DEPARTMENT_HEAD'];

export default function AdmissionsPage() {
  const [dischargeTarget, setDischargeTarget] = useState<Row | null>(null);
  const [role, setRole] = useState('');
  const reloadRef = useRef<() => void>(() => {});
  const canDischarge = CLINICAL_ROLES.concat(ADMIN_ROLES).includes(role);

  useEffect(() => {
    setRole(localStorage.getItem('role') || '');
  }, []);

  const actions = canDischarge
    ? [
        {
          label: 'Discharge',
          tone: 'secondary' as const,
          onClick: (row: Row) =>
            setDischargeTarget({
              ...row,
              patientName: [row.patient?.firstName, row.patient?.lastName]
                .filter(Boolean)
                .join(' '),
            }),
          condition: (row: Row) => row.status !== 'DISCHARGED' && !row.isDischarged,
        },
      ]
    : [];

  return (
    <ModulePage
      title="Admit"
      subtitle="IPD admissions & bed management"
      endpoint="/admissions"
      createLabel="Admit patient"
      columns={[
        {
          key: 'patient',
          label: 'Patient',
          render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
        },
        {
          key: 'bed',
          label: 'Bed',
          render: (r) => r.bedAllocations?.[0]?.bed?.bedNumber || '—',
        },
        { key: 'admissionType', label: 'Type', badge: true },
        { key: 'status', label: 'Status', badge: true },
        { key: 'admissionDate', label: 'Admitted', render: (r) => r.admissionDate?.slice(0, 10) || '—' },
      ]}
      actions={[
        {
          label: 'Discharge',
          tone: 'secondary',
          onClick: (row) => setDischargeTarget({ ...row, patientName: [row.patient?.firstName, row.patient?.lastName].filter(Boolean).join(' ') }),
          condition: (row) => row.status !== 'DISCHARGED' && !row.isDischarged,
        },
      ]}
      fields={[
        { name: 'patientId', label: 'Patient', required: true, type: 'select', optionsFrom: PATIENT_REF },
        { name: 'admittingDoctorId', label: 'Attending doctor', type: 'select', optionsFrom: DOCTOR_REF },
        {
          name: 'departmentId',
          label: 'Department',
          type: 'select',
          optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/departments' },
        },
        {
          name: 'bedId',
          label: 'Bed',
          type: 'select',
          optionsFrom: { valueKey: 'id', labelKeys: ['bedNumber'], endpoint: '/departments/beds' },
        },
        { name: 'admissionType', label: 'Type', type: 'select', options: [
          { value: 'GENERAL', label: 'General' },
          { value: 'EMERGENCY', label: 'Emergency' },
          { value: 'PLANNED', label: 'Planned' },
          { value: 'TRANSFER', label: 'Transfer' },
        ], defaultValue: 'GENERAL' },
        { name: 'provisionalDiagnosis', label: 'Diagnosis', full: true },
        { name: 'referringDoctor', label: 'Referring doctor' },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true },
      ]}
      extra={(load) => {
        reloadRef.current = load;
        return dischargeTarget ? (
          <DischargeModal
            admission={{ id: dischargeTarget.id, admissionNumber: dischargeTarget.admissionNumber, patientName: dischargeTarget.patientName }}
            patientId={dischargeTarget.patientId}
            patientName={dischargeTarget.patientName}
            onClose={() => setDischargeTarget(null)}
            onDone={() => {
              setDischargeTarget(null);
              load();
            }}
          />
        ) : null;
      }}
    />
  );
}