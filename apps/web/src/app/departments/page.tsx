'use client';

import ModulePage from '@/components/ModulePage';

export default function DepartmentsPage() {
  return (
    <ModulePage
      title="Departments"
      subtitle="Departments, wards, rooms & beds"
      tabs={[
        {
          key: 'departments',
          label: 'Departments',
          endpoint: '/departments',
          createLabel: 'Add department',
          editable: true,
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Code', render: (r) => <span className="mono">{r.code}</span> },
            { key: 'description', label: 'Description' },
            { key: 'isActive', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'code', label: 'Code', required: true },
            { name: 'description', label: 'Description', type: 'textarea', full: true },
            { name: 'isActive', label: 'Active', type: 'checkbox' },
          ],
        },
        {
          key: 'wards',
          label: 'Wards',
          endpoint: '/departments/wards',
          createLabel: 'Add ward',
          editable: true,
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Code' },
            { key: 'location', label: 'Location' },
            {
              key: 'department',
              label: 'Department',
              render: (r) => r.department?.name || r.departmentId,
            },
            { key: 'isActive', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'code', label: 'Code' },
            { name: 'location', label: 'Location' },
            {
              name: 'departmentId',
              label: 'Department',
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/departments' },
            },
            { name: 'isActive', label: 'Active', type: 'checkbox' },
          ],
        },
        {
          key: 'rooms',
          label: 'Rooms',
          endpoint: '/departments/rooms',
          createLabel: 'Add room',
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'roomNumber', label: 'Room number' },
            { key: 'roomType', label: 'Type', badge: true },
            { key: 'capacity', label: 'Capacity' },
            { key: 'ratePerDay', label: 'Rate / day' },
            { key: 'isActive', label: 'Status', badge: true, render: (r) => (r.isActive ? 'ACTIVE' : 'INACTIVE') },
          ],
          fields: [
            {
              name: 'wardId',
              label: 'Ward',
              required: true,
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/departments/wards' },
            },
            { name: 'name', label: 'Name', required: true },
            { name: 'roomNumber', label: 'Room number' },
            { name: 'roomType', label: 'Room type' },
            { name: 'capacity', label: 'Capacity', type: 'number' },
            { name: 'ratePerDay', label: 'Rate / day', type: 'number' },
          ],
        },
        {
          key: 'beds',
          label: 'Beds',
          endpoint: '/departments/beds',
          createLabel: 'Add bed',
          columns: [
            {
              key: 'bedNumber',
              label: 'Bed',
              render: (r) => r.bedNumber || r.name,
            },
            {
              key: 'room',
              label: 'Room',
              render: (r) => r.room?.name || r.roomId,
            },
            { key: 'status', label: 'Status', badge: true },
            {
              key: 'currentPatient',
              label: 'Current patient',
              render: (r) => {
                const p = r.allocations?.[0]?.admission?.patient;
                return p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '—';
              },
            },
          ],
          fields: [
            {
              name: 'roomId',
              label: 'Room',
              required: true,
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/departments/rooms' },
            },
            { name: 'bedNumber', label: 'Bed number', required: true },
            { name: 'ratePerDay', label: 'Rate / day', type: 'number' },
          ],
        },
      ]}
    />
  );
}
