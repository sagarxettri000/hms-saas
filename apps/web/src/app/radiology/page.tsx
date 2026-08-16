'use client';

import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';
import { DOCTOR_REF, PATIENT_REF } from '@/lib/options';

export default function RadiologyPage() {
  const orderColumns = [
    { key: 'orderNumber', label: 'Order no.', render: (r: any) => <span className="mono">{r.orderNumber}</span> },
    {
      key: 'patient',
      label: 'Patient',
      render: (r: any) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
    },
    { key: 'modality', label: 'Modality', badge: true },
    { key: 'bodyPart', label: 'Body part' },
    { key: 'status', label: 'Status', badge: true },
    { key: 'orderedAt', label: 'Ordered', render: (r: any) => formatDateTime(r.orderedAt || r.createdAt) },
  ];

  const orderFields = [
    { name: 'patientId', label: 'Patient', required: true, type: 'select' as const, optionsFrom: PATIENT_REF },
    { name: 'doctorId', label: 'Doctor', type: 'select' as const, optionsFrom: DOCTOR_REF },
    { name: 'modality', label: 'Modality', type: 'select' as const, options: [
      { value: 'XRAY', label: 'X-Ray' },
      { value: 'CT', label: 'CT scan' },
      { value: 'MRI', label: 'MRI' },
      { value: 'ULTRASOUND', label: 'Ultrasound' },
      { value: 'ECG', label: 'ECG' },
      { value: 'ECHO', label: 'Echo' },
      { value: 'OTHERS', label: 'Other' },
    ], defaultValue: 'XRAY' },
    { name: 'bodyPart', label: 'Body part', placeholder: 'Chest, Brain, Knee…' },
    { name: 'isEmergency', label: 'Emergency', type: 'checkbox' as const },
    { name: 'clinicalHistory', label: 'Clinical history', type: 'textarea' as const, full: true },
  ];

  return (
    <ModulePage
      title="Radiology"
      subtitle="Imaging services & orders"
      tabs={[
        {
          key: 'orders',
          label: 'Orders',
          endpoint: '/radiology/orders',
          createLabel: 'New imaging order',
          columns: orderColumns,
          fields: orderFields,
        },
        {
          key: 'worklist',
          label: 'Worklist',
          endpoint: '/radiology/orders/worklist',
          columns: orderColumns,
        },
      ]}
    />
  );
}
