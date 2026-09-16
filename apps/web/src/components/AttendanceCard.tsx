'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Status = 'NOT_CLOCKED_IN' | 'PRESENT' | 'ABSENT' | 'CLOCKED_OUT';

interface AttendanceData {
  status: Status;
  record: {
    id: string;
    status: string;
    clockIn: string;
    clockOut: string | null;
    hours: number | null;
  } | null;
  shift: { id: string; name: string; startTime?: string; endTime?: string } | null;
  serverTime: string;
}

function timeOf(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function elapsed(from: string, to?: string | null): string {
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  let s = Math.max(0, Math.floor((end - start) / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

const STATUS_LABEL: Record<Status, string> = {
  NOT_CLOCKED_IN: 'Not Clocked In',
  PRESENT: 'Present',
  ABSENT: 'Absent',
  CLOCKED_OUT: 'Attendance Complete',
};

const STATUS_TONE: Record<Status, string> = {
  NOT_CLOCKED_IN: 'var(--text-muted)',
  PRESENT: '#15803d',
  ABSENT: '#b91c1c',
  CLOCKED_OUT: 'var(--primary)',
};

export default function AttendanceCard({ role }: { role: string }) {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [, setTick] = useState(0);
  const timerRef = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const r = await api('/hr/attendance/me');
      setData(r?.data ?? r);
      setError(null);
    } catch {
      setError('Attendance unavailable');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, role]);

  // Live elapsed timer while clocked in
  useEffect(() => {
    if (data?.status === 'PRESENT') {
      timerRef.current = window.setInterval(() => setTick((t) => t + 1), 1000);
      return () => window.clearInterval(timerRef.current);
    }
  }, [data?.status]);

  async function action(status: 'PRESENT' | 'ABSENT' | 'CLOCK_OUT') {
    setBusy(true);
    setError(null);
    try {
      if (status === 'CLOCK_OUT') {
        await api('/hr/attendance/clock-out', { method: 'POST', body: JSON.stringify({}) });
      } else {
        await api('/hr/attendance/clock-in', { method: 'POST', body: JSON.stringify({ status }) });
      }
      setShowActions(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not record attendance');
    }
    setBusy(false);
  }

  const status = data?.status ?? 'NOT_CLOCKED_IN';
  const rec = data?.record;

  return (
    <div className="card" style={{ padding: '18px 20px' }} data-testid="attendance-card">
      <div className="row-between" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Today&apos;s Attendance</h3>
        {data?.shift?.name && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Shift: {data.shift.name}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          aria-hidden
          style={{
            width: 9, height: 9, borderRadius: '50%',
            background: STATUS_TONE[status], display: 'inline-block', flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 20, fontWeight: 700, color: STATUS_TONE[status] }}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {rec && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'grid', gap: 3, marginBottom: 10 }}>
          {status !== 'ABSENT' && <div>Clocked in: {timeOf(rec.clockIn)}</div>}
          {rec.clockOut && <div>Clocked out: {timeOf(rec.clockOut)}</div>}
          {status === 'PRESENT' && <div>Working: {elapsed(rec.clockIn)}</div>}
          {rec.clockOut && rec.clockIn && (
            <div>Total time: {elapsed(rec.clockIn, rec.clockOut)}</div>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{error}</div>
      )}

      {(status === 'NOT_CLOCKED_IN' || status === 'PRESENT') && (
        <div style={{ marginTop: 4 }}>
          {!showActions ? (
            <button
              className={`btn ${status === 'NOT_CLOCKED_IN' ? '' : 'btn-secondary'}`}
              onClick={() => setShowActions(true)}
              disabled={busy}
              style={{ minWidth: 140 }}
            >
              {status === 'NOT_CLOCKED_IN' ? 'Clock In' : 'Clock Out'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {status === 'NOT_CLOCKED_IN' ? (
                <>
                  <button className="btn" onClick={() => action('PRESENT')} disabled={busy} style={{ minWidth: 110 }}>
                    {busy ? 'Saving…' : 'Present'}
                  </button>
                  <button className="btn btn-danger" onClick={() => action('ABSENT')} disabled={busy} style={{ minWidth: 110 }}>
                    Absent
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowActions(false)} disabled={busy}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-danger" onClick={() => action('CLOCK_OUT')} disabled={busy} style={{ minWidth: 110 }}>
                    {busy ? 'Saving…' : 'Confirm Clock Out'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setShowActions(false)} disabled={busy}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
          {status === 'NOT_CLOCKED_IN' && (
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              Time is recorded by the server when you confirm.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
