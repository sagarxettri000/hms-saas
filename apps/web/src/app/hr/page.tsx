'use client';

import ModulePage from '@/components/ModulePage';
import { LEAVE_TYPES } from '@/lib/options';

export default function HrPage() {
  return (
    <ModulePage
      title="HR & Staff"
      subtitle="Shifts, rosters & leave management"
      tabs={[
        {
          key: 'shifts',
          label: 'Shifts',
          endpoint: '/hr/shifts',
          createLabel: 'Add shift',
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'startTime', label: 'Start', render: (r) => r.startTime || '—' },
            { key: 'endTime', label: 'End', render: (r) => r.endTime || '—' },
            { key: 'workingHours', label: 'Working hours', render: (r) => r.workingHours ?? '—' },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'startTime', label: 'Start time', required: true },
            { name: 'endTime', label: 'End time', required: true },
            { name: 'workingHours', label: 'Working hours', type: 'number' },
          ],
        },
        {
          key: 'rosters',
          label: 'Rosters',
          endpoint: '/hr/rosters',
          createLabel: 'Assign shift',
          columns: [
            { key: 'date', label: 'Date', render: (r) => r.date?.slice(0, 10) || '—' },
            {
              key: 'user',
              label: 'Staff',
              render: (r) => [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ') || r.userId,
            },
            { key: 'role', label: 'Role', render: (r) => r.user?.role || '—' },
            { key: 'shift', label: 'Shift', render: (r) => r.shift?.name || '—' },
          ],
          fields: [
            {
              name: 'userId',
              label: 'Staff',
              required: true,
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['firstName', 'lastName'], endpoint: '/users' },
            },
            {
              name: 'shiftId',
              label: 'Shift',
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/hr/shifts' },
            },
            { name: 'date', label: 'Date', type: 'date', required: true },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ],
        },
        {
          key: 'leaves',
          label: 'Leaves',
          endpoint: '/hr/leaves',
          createLabel: 'Request leave',
          columns: [
            {
              key: 'user',
              label: 'Staff',
              render: (r) => [r.user?.firstName, r.user?.lastName].filter(Boolean).join(' ') || r.userId,
            },
            { key: 'type', label: 'Type', badge: true },
            { key: 'startDate', label: 'From', render: (r) => r.startDate?.slice(0, 10) || '—' },
            { key: 'endDate', label: 'To', render: (r) => r.endDate?.slice(0, 10) || '—' },
            { key: 'days', label: 'Days' },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            {
              name: 'userId',
              label: 'Staff',
              required: true,
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['firstName', 'lastName'], endpoint: '/users' },
            },
            { name: 'type', label: 'Type', type: 'select', options: LEAVE_TYPES },
            { name: 'startDate', label: 'Start date', type: 'date', required: true },
            { name: 'endDate', label: 'End date', type: 'date', required: true },
            { name: 'days', label: 'Days', type: 'number' },
            { name: 'reason', label: 'Reason', type: 'textarea', full: true },
          ],
        },
      ]}
    />
  );
}
