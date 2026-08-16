'use client';

import ModulePage from '@/components/ModulePage';
import { BLOOD_GROUPS, GENDERS, MARITAL_STATUS, PATIENT_TYPES } from '@/lib/options';

export default function PatientsPage() {
  return (
    <ModulePage
      title="Patients"
      subtitle="Patient registry & master index"
      endpoint="/patients"
      createLabel="Register patient"
      columns={[
        { key: 'mrn', label: 'MRN', render: (r) => <span className="mono">{r.mrn}</span> },
        {
          key: 'name',
          label: 'Name',
          render: (r) => [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' '),
        },
        { key: 'gender', label: 'Gender', badge: (v) => (v === 'FEMALE' ? 'purple' : 'blue') },
        { key: 'age', label: 'Age' },
        { key: 'mobile', label: 'Mobile' },
        { key: 'patientType', label: 'Type', badge: true },
        { key: 'status', label: 'Status', badge: true },
      ]}
      detailHref={(r) => `/patients/${r.id}`}
      fields={[
        { name: 'firstName', label: 'First name', required: true },
        { name: 'middleName', label: 'Middle name' },
        { name: 'lastName', label: 'Last name', required: true },
        { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
        { name: 'gender', label: 'Gender', type: 'select', options: GENDERS },
        { name: 'bloodGroup', label: 'Blood group', type: 'select', options: BLOOD_GROUPS },
        { name: 'maritalStatus', label: 'Marital status', type: 'select', options: MARITAL_STATUS },
        { name: 'patientType', label: 'Patient type', type: 'select', options: PATIENT_TYPES, defaultValue: 'GENERAL' },
        { name: 'mobile', label: 'Mobile' },
        { name: 'phone', label: 'Phone' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'nationality', label: 'Nationality' },
        { name: 'nationalId', label: 'National ID' },
        { name: 'addressLine1', label: 'Address line 1' },
        { name: 'city', label: 'City' },
        { name: 'district', label: 'District' },
        { name: 'province', label: 'Province' },
        { name: 'country', label: 'Country' },
        { name: 'emergencyContactName', label: 'Emergency contact' },
        { name: 'emergencyContactRelationship', label: 'Emergency relation' },
        { name: 'emergencyContactMobile', label: 'Emergency mobile' },
        { name: 'occupation', label: 'Occupation' },
        {
          name: 'allergies',
          label: 'Allergies',
          type: 'json',
          full: true,
          hint: '[{"allergen":"Penicillin","severity":"SEVERE"}]',
        },
      ]}
    />
  );
}
