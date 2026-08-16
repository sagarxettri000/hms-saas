'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export default function PatientPrescriptions({ patientId }: { patientId: string }) {
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const prevCountRef = useRef(0);

  function fetchRx() {
    if (!patientId) return;
    api(`/pharmacy/prescriptions?patientId=${patientId}&limit=20`)
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
        setPrescriptions(list);
        if (prevCountRef.current > 0 && list.length > prevCountRef.current) {
          setNewCount(list.length - prevCountRef.current);
          setTimeout(() => setNewCount(0), 3000);
        }
        prevCountRef.current = list.length;
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!patientId) { setPrescriptions([]); prevCountRef.current = 0; return; }
    setLoading(true);
    api(`/pharmacy/prescriptions?patientId=${patientId}&limit=20`)
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : res?.data?.data ?? [];
        setPrescriptions(list);
        prevCountRef.current = list.length;
      })
      .catch(() => setPrescriptions([]))
      .finally(() => setLoading(false));

    const interval = setInterval(fetchRx, 15000);
    return () => clearInterval(interval);
  }, [patientId]);

  if (!patientId) return null;

  return (
    <div style={{ marginTop: 8, marginBottom: 8, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: 'var(--primary-light)', fontSize: 12, fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Patient Prescriptions</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {newCount > 0 && <span style={{ background: '#16a34a', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>+{newCount} new</span>}
          {loading && <span style={{ fontSize: 11, fontWeight: 400 }}>Loading...</span>}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }} title="Auto-refreshes every 15s">● Live</span>
        </span>
      </div>
      {prescriptions.length === 0 && !loading && (
        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No prescriptions found</div>
      )}
      {prescriptions.map((rx) => (
        <div key={rx.id} style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 600 }}>Dr. {rx.doctor?.user?.firstName || ''} {rx.doctor?.user?.lastName || ''}</span>
            <span className={`badge badge-${rx.status === 'DISPENSED' ? 'green' : rx.status === 'PARTIAL' ? 'yellow' : 'blue'}`} style={{ fontSize: 10 }}>{rx.status}</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>{rx.createdAt?.slice(0, 10) || '—'}</div>
          {(rx.items || []).length > 0 && (
            <div style={{ marginTop: 4 }}>
              {rx.items.map((it: any, idx: number) => (
                <div key={it.id || idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: 'var(--text)', fontSize: 11 }}>
                  <span>{it.medicineName || it.medicine?.name || 'Unknown'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{it.dosage || ''} {it.frequency || ''} × {it.duration || ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
