'use client';

import { useEffect, useState, useRef } from 'react';
import { api, API_URL } from '@/lib/api';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string | null;
  channel: string | null;
  referenceType: string | null;
  referenceId: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUnreadCount();

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const es = new EventSource(`${API_URL}/notifications/stream?token=${token}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const notification = JSON.parse(event.data);
        setUnreadCount((c) => c + 1);
        setToast(notification);
        setTimeout(() => setToast(null), 5000);
      } catch {}
    };

    es.onerror = () => {
      es.close();
      setTimeout(() => {
        if (eventSourceRef.current === es) {
          reconnect(token);
        }
      }, 5000);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function reconnect(token: string) {
    const es = new EventSource(`${API_URL}/notifications/stream?token=${token}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const notification = JSON.parse(event.data);
        setUnreadCount((c) => c + 1);
        setToast(notification);
        setTimeout(() => setToast(null), 5000);
      } catch {}
    };

    es.onerror = () => {
      es.close();
      setTimeout(() => {
        if (eventSourceRef.current === es) reconnect(token);
      }, 5000);
    };
  }

  async function fetchUnreadCount() {
    try {
      const res = await api('/notifications/mine?unreadOnly=true&limit=1');
      const payload = res?.data as any;
      setUnreadCount(payload?.unread || 0);
    } catch {}
  }

  async function fetchNotifications() {
    try {
      const res = await api('/notifications/mine?limit=10');
      const payload = res?.data as any;
      const list = Array.isArray(payload) ? payload : payload?.data ?? [];
      setNotifications(list);
      setUnreadCount(payload?.unread || 0);
    } catch {}
  }

  async function markAllRead() {
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch {}
  }

  async function markRead(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
    } catch {}
  }

  return (
    <>
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            background: '#1e293b',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: 10000,
            maxWidth: 360,
            fontSize: 13,
            cursor: 'pointer',
          }}
          onClick={() => {
            setToast(null);
            setOpen(true);
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{toast.title}</div>
          <div style={{ opacity: 0.8 }}>{toast.body}</div>
        </div>
      )}

      <div ref={panelRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            position: 'relative',
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 16,
            cursor: 'pointer',
            lineHeight: 1,
          }}
          title="Notifications"
        >
          🔔
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                background: '#dc2626',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                borderRadius: '50%',
                width: 18,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 8,
              width: 380,
              maxHeight: 480,
              overflow: 'auto',
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
              zIndex: 9999,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontWeight: 600 }}>Notifications</span>
              {unreadCount > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={markAllRead}
                  style={{ fontSize: 12 }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: n.readAt ? 'transparent' : '#f8fafc',
                    opacity: n.readAt ? 0.7 : 1,
                  }}
                  onClick={() => !n.readAt && markRead(n.id)}
                >
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{n.body}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
