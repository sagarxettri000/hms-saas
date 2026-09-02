'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/hooks';
import type { ApiResponse, Row } from '@/lib/types';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'FINALIZED', label: 'Finalized' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'VOID', label: 'Void' },
];

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  UNPAID: 'red',
  PARTIAL: 'yellow',
  PAID: 'green',
  REFUND_DUE: 'orange',
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'blue',
  FINALIZED: 'green',
  CANCELLED: 'red',
  VOID: 'gray',
};

export default function DischargeBillingPage() {
  const router = useRouter();
  const [bills, setBills] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [flash, setFlash] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [admissions, setAdmissions] = useState<Row[]>([]);
  const [loadingAdmissions, setLoadingAdmissions] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<Row | null>(null);
  const [admissionSearch, setAdmissionSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('page', String(page));
      q.set('limit', '15');
      if (search.trim()) q.set('search', search.trim());
      if (status) q.set('status', status);
      if (dateFrom) q.set('dateFrom', dateFrom);
      if (dateTo) q.set('dateTo', dateTo);
      const res: ApiResponse<any> = await api(`/billing/discharge/bills?${q.toString()}`);
      const payload = res.data as any;
      setBills(Array.isArray(payload) ? payload : payload.data ?? []);
      setTotal(Array.isArray(payload) ? payload.length : payload.total ?? 0);
    } catch {
      setBills([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  function handleAdmissionSearch(term: string) {
    setAdmissionSearch(term);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!term.trim()) {
      setAdmissions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setLoadingAdmissions(true);
      try {
        const res: ApiResponse<any> = await api(`/ipd/admissions?search=${encodeURIComponent(term.trim())}&limit=10&status=ADMITTED`);
        const payload = res.data as any;
        setAdmissions(Array.isArray(payload) ? payload : payload.data ?? []);
      } catch {
        setAdmissions([]);
      } finally {
        setLoadingAdmissions(false);
      }
    }, 300);
  }

  async function handleCreateBill() {
    if (!selectedAdmission) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res: ApiResponse<any> = await api('/billing/discharge/bills', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedAdmission.patientId,
          admissionId: selectedAdmission.id,
        }),
      });
      const bill = res.data ?? res;
      setShowCreateModal(false);
      setSelectedAdmission(null);
      setAdmissionSearch('');
      setAdmissions([]);
      setFlash('Draft bill created');
      router.push(`/billing/discharge-billing/${bill.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create bill');
    } finally {
      setCreating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 15));

  function patientName(r: Row) {
    return [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId || '—';
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Discharge Billing</h1>
          <p className="page-subtitle">Manage discharge bills and payments</p>
        </div>
        <button className="btn" onClick={() => { setShowCreateModal(true); setAdmissionSearch(''); setSelectedAdmission(null); setAdmissions([]); setCreateError(null); }}>
          + Create New Bill
        </button>
      </div>

      {flash && <div className="alert alert-success">{flash}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input search-input"
          placeholder="Search by patient or bill number..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: '1 1 260px', minWidth: 200 }}
        />
        <select
          className="input"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          style={{ width: 160 }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          className="input"
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          style={{ width: 160 }}
        />
        <input
          className="input"
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          style={{ width: 160 }}
        />
      </div>

      {loading ? (
        <div className="loading">Loading bills...</div>
      ) : bills.length === 0 ? (
        <div className="empty">
          <div className="empty-state">No discharge bills found.</div>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Patient</th>
                  <th>Admission #</th>
                  <th>Bill Date</th>
                  <th>Subtotal</th>
                  <th>Discount</th>
                  <th>Net Amount</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b: any, i: number) => (
                  <tr key={b.id ?? i}>
                    <td><span className="mono">{b.billNumber || '—'}</span></td>
                    <td>{patientName(b)}</td>
                    <td><span className="mono">{b.admission?.admissionNumber || b.admissionNumber || '—'}</span></td>
                    <td>{b.billDate ? new Date(b.billDate).toLocaleDateString() : '—'}</td>
                    <td className="mono">{formatMoney(b.subtotal)}</td>
                    <td className="mono">{formatMoney(b.discountAmount)}</td>
                    <td className="mono">{formatMoney(b.netAmount)}</td>
                    <td className="mono">{formatMoney(b.paidAmount)}</td>
                    <td className="mono">{formatMoney(b.dueAmount)}</td>
                    <td>
                      <span className={`badge badge-${STATUS_BADGE[b.status] || 'gray'}`}>
                        {b.status || '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${PAYMENT_STATUS_BADGE[b.paymentStatus] || 'gray'}`}>
                        {b.paymentStatus || '—'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => router.push(`/billing/discharge-billing/${b.id}`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap" style={{ borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
            <div className="pagination">
              <span>{total} bill{total === 1 ? '' : 's'}</span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                <span>Page {page} / {totalPages}</span>
                <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        </>
      )}

      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Create Discharge Bill</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)} aria-label="Close">×</button>
            </div>
            <p className="note" style={{ marginTop: 4 }}>Select an admitted patient to create a draft discharge bill.</p>

            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                className="input"
                placeholder="Search admitted patients..."
                value={admissionSearch}
                onChange={(e) => handleAdmissionSearch(e.target.value)}
                style={{ width: '100%' }}
              />
              {loadingAdmissions && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>...</span>}
              {admissions.length > 0 && !selectedAdmission && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', marginTop: 4 }}>
                  {admissions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => { setSelectedAdmission(a); setAdmissions([]); }}
                      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: 14 }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>
                          {[a.patient?.firstName, a.patient?.lastName].filter(Boolean).join(' ') || a.patientId}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {a.admissionNumber && <span className="mono" style={{ marginRight: 8 }}>{a.admissionNumber}</span>}
                          {a.admissionDate && <span>{new Date(a.admissionDate).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <span className="badge badge-blue" style={{ fontSize: 11 }}>Select</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedAdmission && (
              <div style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {[selectedAdmission.patient?.firstName, selectedAdmission.patient?.lastName].filter(Boolean).join(' ') || selectedAdmission.patientId}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {selectedAdmission.admissionNumber && <span className="mono">{selectedAdmission.admissionNumber}</span>}
                    {selectedAdmission.admissionDate && <span style={{ marginLeft: 8 }}>Admitted: {new Date(selectedAdmission.admissionDate).toLocaleDateString()}</span>}
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => { setSelectedAdmission(null); setAdmissionSearch(''); }}>
                  Change
                </button>
              </div>
            )}

            {createError && <div className="alert alert-error" style={{ marginTop: 8 }}>{createError}</div>}

            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)} disabled={creating}>Cancel</button>
              <button type="button" className="btn" onClick={handleCreateBill} disabled={creating || !selectedAdmission}>
                {creating ? 'Creating...' : 'Create Draft Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
