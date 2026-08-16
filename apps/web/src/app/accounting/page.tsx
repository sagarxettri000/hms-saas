'use client';

import ModulePage from '@/components/ModulePage';
import { ACCOUNT_TYPES } from '@/lib/options';

export default function AccountingPage() {
  return (
    <ModulePage
      title="Accounting"
      subtitle="Chart of accounts & transactions"
      tabs={[
        {
          key: 'accounts',
          label: 'Accounts',
          endpoint: '/accounting/accounts',
          createLabel: 'Add account',
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Code', render: (r) => <span className="mono">{r.code}</span> },
            { key: 'type', label: 'Type', badge: true },
            {
              key: 'parent',
              label: 'Parent',
              render: (r) => r.parentId?.slice(0, 8) || '—',
            },
            { key: 'isActive', label: 'Status', render: (r) => (r.isActive ? 'Active' : 'Inactive') },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'code', label: 'Code', required: true },
            { name: 'type', label: 'Type', type: 'select', options: ACCOUNT_TYPES, defaultValue: 'EXPENSE' },
            { name: 'parentId', label: 'Parent account', type: 'select', optionsFrom: {
              valueKey: 'id', labelKeys: ['name'], endpoint: '/accounting/accounts',
            } },
            { name: 'description', label: 'Description', type: 'textarea', full: true },
          ],
        },
        {
          key: 'journal',
          label: 'Journal',
          endpoint: '/accounting/journal',
          createLabel: 'New journal entry',
          columns: [
            { key: 'entryNumber', label: 'Entry no.', render: (r) => <span className="mono">{r.entryNumber || r.id.slice(0, 8)}</span> },
            { key: 'date', label: 'Date', render: (r) => r.date?.slice(0, 10) || '—' },
            { key: 'description', label: 'Description' },
            { key: 'referenceType', label: 'Ref type', badge: true },
            {
              key: 'debit',
              label: 'Debit',
              render: (r) => (r.lines || []).reduce((s: number, l: any) => s + Number(l.debit || 0), 0).toLocaleString(),
            },
            {
              key: 'credit',
              label: 'Credit',
              render: (r) => (r.lines || []).reduce((s: number, l: any) => s + Number(l.credit || 0), 0).toLocaleString(),
            },
          ],
          fields: [
            { name: 'date', label: 'Date', type: 'date' },
            { name: 'description', label: 'Description', required: true, full: true },
            { name: 'referenceType', label: 'Reference type', type: 'select', options: [
              { value: 'INVOICE', label: 'Invoice' },
              { value: 'PAYMENT', label: 'Payment' },
              { value: 'PURCHASE', label: 'Purchase' },
              { value: 'OTHER', label: 'Other' },
            ] },
            { name: 'lines', label: 'Journal Lines', type: 'json', full: true, hint: '[{accountId, debit, credit, notes}]' },
          ],
        },
      ]}
    />
  );
}
