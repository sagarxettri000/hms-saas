'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { ApiResponse, Row } from '@/lib/types';

const DISCHARGE_STATUS_OPTIONS = [
  { value: '', label: 'All admitted' },
  { value: 'ADMITTED', label: 'Admitted (billing pending)' },
  { value: 'DISCHARGED', label: 'Discharged' },
];

function mapAdmissionStatus(status: string) {
  switch (status) {
    case 'ADMITTED':
      return 'ADMITTED';
    case 'DISCHARGED':
      return 'DISCHARGED';
    default:
      return '';
  }
}

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
      const mapped = mapAdmissionStatus(status);
      if (mapped) q.set('status', mapped);
      const res: ApiResponse<any> = await api(`/admissions?${q.toString()}`);
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

  function admissionWard(a: Row) {
    const allocations = (a.bedAllocations as Row[] | undefined) || [];
    const bed = allocations[0]?.bed as Row | undefined;
    return (bed?.ward as Row | undefined)?.name || bed?.name || '—';
  }

  function admissionStatus(a: Row) {
    return a.isDischarged || a.status === 'DISCHARGED' ? 'DISCHARGED' : 'ADMITTED';
  }

  return (
    <>
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
                    <td>{admissionWard(a)}</td>
                    <td>
                      <span className={`badge ${admissionStatus(a) === 'DISCHARGED' ? 'badge-gray' : 'badge-blue'}`}>{admissionStatus(a)}</span>
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
    </>
  );
}
