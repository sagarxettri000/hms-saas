'use client';

import ModulePage from '@/components/ModulePage';
import { STORE_REF, STORE_TYPES } from '@/lib/options';

export default function ProcurementPage() {
  return (
    <ModulePage
      title="Procurement"
      subtitle="Purchase orders & suppliers"
      tabs={[
        {
          key: 'suppliers',
          label: 'Suppliers',
          endpoint: '/procurement/suppliers',
          createLabel: 'Add supplier',
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'contactPerson', label: 'Contact' },
            { key: 'phone', label: 'Phone' },
            { key: 'email', label: 'Email' },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'contactPerson', label: 'Contact person' },
            { name: 'phone', label: 'Phone' },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'address', label: 'Address', type: 'textarea', full: true },
            { name: 'panNumber', label: 'Tax / PAN number' },
          ],
        },
        {
          key: 'purchase-orders',
          label: 'Purchase Orders',
          endpoint: '/procurement/purchase-orders',
          createLabel: 'Create PO',
          columns: [
            { key: 'poNumber', label: 'PO no.', render: (r) => <span className="mono">{r.poNumber}</span> },
            {
              key: 'supplier',
              label: 'Supplier',
              render: (r) => r.supplier?.name || r.supplierId,
            },
            { key: 'totalAmount', label: 'Total' },
            { key: 'status', label: 'Status', badge: true },
            { key: 'orderDate', label: 'Date', render: (r) => r.orderDate?.slice(0, 10) || '—' },
          ],
          fields: [
            {
              name: 'supplierId',
              label: 'Supplier',
              type: 'select',
              optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/procurement/suppliers' },
            },
            { name: 'storeId', label: 'Delivery store', type: 'select', optionsFrom: STORE_REF },
            { name: 'expectedDate', label: 'Expected delivery', type: 'date' },
            { name: 'deliveryAddress', label: 'Delivery address', type: 'textarea', full: true },
            { name: 'terms', label: 'Terms', type: 'textarea', full: true },
            { name: 'items', label: 'Items', type: 'json', required: true, full: true, hint: '[{itemName, quantity, unitPrice}]' },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ],
        },
      ]}
    />
  );
}
