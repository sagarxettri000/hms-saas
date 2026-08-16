'use client';

import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';

export default function AuditPage() {
  return (
    <ModulePage
      title="Audit Log"
      subtitle="System activity & audit trail"
      endpoint="/audit"
      columns={[
        { key: 'action', label: 'Action', badge: true },
        { key: 'entity', label: 'Entity', render: (r) => <span className="mono">{r.entity || '—'}</span> },
        { key: 'entityId', label: 'Entity ID', render: (r) => <span className="mono">{(r.entityId || '').slice(0, 8)}</span> },
        {
          key: 'performedBy',
          label: 'Performed by',
          render: (r) =>
            r.user
              ? [r.user.firstName, r.user.lastName].filter(Boolean).join(' ') || r.user.email
              : r.performedBy || '—',
        },
        { key: 'createdAt', label: 'When', render: (r) => formatDateTime(r.createdAt) },
      ]}
    />
  );
}
