import { useEffect, useState } from 'react';
import { api } from './api';

export function useData<T = any>(path: string, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api(path)
      .then((res) => {
        if (!active) return;
        setData((res.data ?? res) as T);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Request failed');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, refreshKey, ...deps]);

  function reload() {
    setRefreshKey((k) => k + 1);
  }

  return { data, loading, error, reload };
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(localStorage.getItem('accessToken'));
  }, []);
  return token;
}

export function formatDate(value: any): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value: any): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMoney(value: any): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return String(value);
  return 'Rs. ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function nameOf(row: any, keys: string[] = ['firstName', 'lastName']): string {
  if (!row) return '—';
  if (typeof row === 'string') return row;
  const parts = keys.map((k) => row[k]).filter((v) => v);
  return parts.length ? parts.join(' ') : (row.name ?? row.id ?? '—');
}

export function pick(row: any, key: string): any {
  if (!row) return undefined;
  if (key.includes('.')) {
    const parts = key.split('.');
    let cur = row;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }
  return row[key];
}

export function badgeTone(value: any): any {
  const map: Record<string, string> = {
    ACTIVE: 'green',
    INACTIVE: 'gray',
    DECEASED: 'gray',
    PENDING: 'yellow',
    PARTIAL: 'yellow',
    PAID: 'green',
    COMPLETED: 'green',
    APPROVED: 'green',
    SUBMITTED: 'blue',
    PROCESSING: 'blue',
    DRAFT: 'gray',
    CANCELLED: 'red',
    REJECTED: 'red',
    FAILED: 'red',
    CONFIRMED: 'green',
    SCHEDULED: 'blue',
    CHECKED_IN: 'cyan',
    IN_PROGRESS: 'blue',
    DISCHARGED: 'gray',
    OPEN: 'blue',
    SETTLED: 'green',
    NEW: 'cyan',
    CONVERTED: 'green',
    LOST: 'red',
    PUBLISHED: 'green',
    AVAILABLE: 'green',
    ISSUED: 'blue',
    EXPIRED: 'gray',
    DISCARDED: 'red',
    USED: 'gray',
    CLOSED: 'gray',
    REQUESTED: 'yellow',
    ADMITTED: 'blue',
    SENT: 'blue',
    DELIVERED: 'green',
    READ: 'gray',
  };
  return map[String(value)] || 'gray';
}
