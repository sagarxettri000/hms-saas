'use client';

import { useState } from 'react';
import ModulePage from '@/components/ModulePage';
import { formatDateTime } from '@/lib/hooks';
import { api } from '@/lib/api';
import type { Row, Action } from '@/lib/types';

export default function NotificationsPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const markRead: Action = {
    label: 'Mark read',
    tone: 'ghost',
    condition: (r) => !r.readAt,
    onClick: async (r: Row) => {
      try {
        await api(`/notifications/${r.id}/read`, { method: 'PATCH' });
        setMessage('Notification marked as read');
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update');
      }
    },
  };

  const markAllRead = (reload: () => void) => (
    <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className="btn"
          onClick={async () => {
            try {
              await api('/notifications/read-all', { method: 'PATCH' });
              setMessage('All notifications marked as read');
              setError(null);
              reload();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to update');
            }
          }}
        >
          Mark all read
        </button>
        {message && <span style={{ color: '#16a34a', fontSize: 13 }}>{message}</span>}
        {error && <span style={{ color: '#dc2626', fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );

  return (
    <ModulePage
      title="Notifications"
      subtitle="My notifications"
      endpoint="/notifications/mine"
      actions={[markRead]}
      extra={markAllRead}
      columns={[
        { key: 'title', label: 'Title' },
        { key: 'body', label: 'Message', render: (r) => (r.body || '').slice(0, 60) },
        { key: 'type', label: 'Type', badge: true },
        { key: 'channel', label: 'Channel', badge: true },
        { key: 'read', label: 'Status', render: (r) => (r.readAt ? 'Read' : 'Unread') },
        { key: 'createdAt', label: 'Received', render: (r) => formatDateTime(r.createdAt) },
      ]}
    />
  );
}