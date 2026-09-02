'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/hooks';
import type { ApiResponse, Row } from '@/lib/types';

const DISCHARGE_STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'CLINICALLY_READY', label: 'Clinically Ready' },
  { value: 'BILLING_PENDING', label: 'Billing Pending' },
  { value: 'BILL_READY', label: 'Bill Ready' },
  { value: 'PAYMENT_PENDING', label: 'Payment Pending' },
  { value: 'FINANCIALLY_CLEARED', label: 'Financially Cleared' },
];

export default function DischargePage() {
  const router = useRouter();
  const [admissions, setAdmissions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const loadAdmissions = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('page', '1');
      q.set('limit', '50');
      if (search.trim()) q.set('search', search.trim());
      if (status) q.set('status', status);
      const res: ApiResponse<any> = await api(`/ipd/admissions?${q.toString()}`);
      const payload = res.data as any;
      setAdmissions(Array.isArray(payload) ? payload : payload.data ?? []);
    } catch {
      setAdmissions([]);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    loadAdmissions();
  }, [loadAdmissions]);

  function handleSearch(term: string) {
    setSearch(term);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadAdmissions(), 500);
  }

  function openDischargeAdmission(admissionId: string) {
    router.push(`/billing/discharge/${admissionId}`);
  }

  function admissionName(a: Row) {
    return [a.patient?.firstName, a.patient?.lastName].filter(Boolean).join(' ') || a.patientId || '—';
  }

  function formatCurrency(amount: any) {
    return formatMoney(amount);
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Discharge</h1>
          <p className="page-subtitle">Manage patient discharge workflow</p>
        </div>
      </div>

      {flash && <div className="alert alert-success">{flash}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input search-input"
          placeholder="Search patient name, admission number..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          style={{ flex: '1 1 260px', minWidth: 200 }}
        />
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ width: 180 }}
        >
          {DISCHARGE_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading admissions...</div>
      ) : admissions.length === 0 ? (
        <div className="empty">
          <div className="empty-state">No admitted patients found.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Admission #</th>
                  <th>Patient</th>
                  <th>Admitted</th>
                  <th>Ward</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {admissions.map((a) => (
                  <tr key={a.id}>
                    <td><span className="mono">{a.admissionNumber}</span></td>
                    <td>{admissionName(a)}</td>
                    <td>{a.admissionDate ? new Date(a.admissionDate).toLocaleDateString() : '—'}</td>
                    <td>{a.bed?.ward?.name || '—'}</td>
                    <td>
                      <span className={`badge badge-${a.dischargeStatus === 'FINANCIALLY_CLEARED' ? 'green' : a.dischargeStatus === 'BILLING_PENDING' ? 'blue' : a.dischargeStatus === 'PAYMENT_PENDING' ? 'yellow' : 'gray'}`}>{a.dischargeStatus}</span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm"
                        onClick={() => openDischargeAdmission(a.id)}
                      >
                        Discharge
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}

