'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { badgeTone, formatDate, nameOf } from '@/lib/hooks';
import type { Row } from '@/lib/types';

function groupHour(startTime?: string): string {
  if (!startTime) return 'Unscheduled';
  const [h] = startTime.split(':');
  const hour = Number(h);
  if (isNaN(hour)) return 'Unscheduled';
  return `${String(hour).padStart(2, '0')}:00 – ${String(hour + 1).padStart(2, '0')}:00`;
}

function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DaySchedule() {
  const [appts, setAppts] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => localDateString(new Date()));

  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/appointments?date=${date}&limit=200`)
      .then((res) => {
        if (!active) return;
        const payload = res.data;
        const list = Array.isArray(payload) ? payload : payload.data ?? [];
        setAppts(list);
        const s: Row = {};
        for (const a of list) s[a.status || 'UNKNOWN'] = (s[a.status || 'UNKNOWN'] || 0) + 1;
        setSummary(s);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [date]);

  const hours = Array.from(new Set(appts.map((a) => groupHour(a.startTime)))).sort((a, b) =>
    a === 'Unscheduled' ? 1 : b === 'Unscheduled' ? -1 : a.localeCompare(b),
  );

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 className="card-title" style={{ margin: 0 }}>
          Day schedule
        </h3>
        <input
          type="date"
          className="input"
          style={{ maxWidth: 160 }}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {Object.entries(summary).map(([k, v]) => (
          <span key={k} className={`badge badge-${badgeTone(k)}`}>
            {k}: {String(v)}
          </span>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading schedule…</p>
      ) : !appts.length ? (
        <p className="empty">No appointments for {formatDate(date)}.</p>
      ) : (
        <div className="schedule">
          {hours.map((h) => {
            const slot = appts.filter((a) => groupHour(a.startTime) === h);
            return (
              <div key={h} className="schedule-row">
                <div className="schedule-hour">{h}</div>
                <div className="schedule-slots">
                  {slot.map((a) => (
                    <div key={a.id} className={`schedule-slot slot-${badgeTone(a.status)}`}>
                      <div className="slot-top">
                        <strong>{nameOf(a.patient)}</strong>
                        <span className={`badge badge-${badgeTone(a.status)}`}>{a.status}</span>
                      </div>
                      <div className="slot-sub">
                        {a.startTime || '—'} · {nameOf(a.doctor?.user ?? a.doctor)} · {a.department?.name || ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
