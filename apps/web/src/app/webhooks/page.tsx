'use client';

import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';

export default function WebhooksPage() {
  return (
    <ModulePage
      title="Webhooks & API Keys"
      subtitle="Integration endpoints & credentials"
      tabs={[
        {
          key: 'webhooks',
          label: 'Webhooks',
          endpoint: '/webhooks',
          createLabel: 'Add webhook',
          columns: [
            {
              key: 'name',
              label: 'Name',
              render: (r) => {
                try {
                  return r.name || new URL(r.url).hostname;
                } catch {
                  return r.url;
                }
              },
            },
            {
              key: 'url',
              label: 'URL',
              render: (r) => <span className="mono">{r.url}</span>,
            },
            {
              key: 'events',
              label: 'Events',
              render: (r) => (Array.isArray(r.events) ? r.events.join(', ') : r.events || '—'),
            },
            { key: 'status', label: 'Status', badge: true },
            { key: 'createdAt', label: 'Created', render: (r) => formatDateTime(r.createdAt) },
          ],
          fields: [
            { name: 'url', label: 'Callback URL', type: 'url', required: true },
            { name: 'secret', label: 'Secret token', hint: 'Used to sign deliveries' },
            { name: 'events', label: 'Events', type: 'json', placeholder: '["patient.created","billing.invoice.paid"]', hint: 'List of event names to listen for' },
          ],
        },
        {
          key: 'api-keys',
          label: 'API Keys',
          endpoint: '/api-keys',
          createLabel: 'Issue API key',
          columns: [
            { key: 'name', label: 'Name' },
            {
              key: 'prefix',
              label: 'Key',
              render: (r) => <span className="mono">{(r.prefix || (r.key || '').slice(0, 12)) + '••••••'}</span>,
            },
            { key: 'lastUsedAt', label: 'Last used', render: (r) => (r.lastUsedAt ? formatDateTime(r.lastUsedAt) : '—') },
            { key: 'isActive', label: 'Status', render: (r) => (r.isActive ? 'Active' : 'Revoked') },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'expiresAt', label: 'Expiry date', type: 'date' },
          ],
        },
      ]}
    />
  );
}
