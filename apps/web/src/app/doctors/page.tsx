'use client';

import ModulePage from '@/components/ModulePage';
import { formatMoney } from '@/lib/hooks';
import { DEPARTMENT_REF, GENDERS } from '@/lib/options';

export default function DoctorsPage() {
  return (
    <ModulePage
      title="Doctors"
      subtitle="Doctor profiles & practitioners"
      endpoint="/doctors"
      createLabel="Add doctor"
      createRoles={['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN']}
      columns={[
        {
          key: 'name',
          label: 'Name',
          render: (r) => [r.user?.firstName ?? r.firstName, r.user?.lastName ?? r.lastName].filter(Boolean).join(' '),
        },
        { key: 'specialization', label: 'Specialization' },
        {
          key: 'department',
          label: 'Department',
          render: (r) => r.department?.name || r.departmentId,
        },
        { key: 'consultationFee', label: 'Consultation fee', render: (r) => formatMoney(r.consultationFee) },
        { key: 'isActive', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
      ]}
      detailHref={(r) => `/doctors/${r.id}`}
      fields={[
        { name: 'firstName', label: 'First name', required: true },
        { name: 'lastName', label: 'Last name', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'phone', label: 'Phone' },
        { name: 'gender', label: 'Gender', type: 'select', options: GENDERS },
        { name: 'departmentId', label: 'Department', type: 'select', optionsFrom: DEPARTMENT_REF },
        { name: 'specialization', label: 'Specialization' },
        { name: 'qualification', label: 'Qualification' },
        { name: 'licenseNumber', label: 'License number' },
        { name: 'consultationFee', label: 'Consultation fee (NPR)', type: 'number' },
        { name: 'experienceYears', label: 'Experience (years)', type: 'number' },
        { name: 'bio', label: 'Bio', type: 'textarea', full: true },
      ]}
    />
  );
}
