'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/hooks';
import PaymentModal from '@/components/PaymentModal';
import ReceiptModal from '@/components/ReceiptModal';

const ALLOWED_ROLES = [
  'PHARMACIST',
  'HOSPITAL_ADMIN',
  'HOSPITAL_OWNER',
  'PLATFORM_SUPER_ADMIN',
  'IT_ADMIN',
];

function toList(res: any): any[] {
  const d = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(d)) return d;
  return d?.data ?? [];
}

function toObj(res: any): any {
  const d = res?.data?.data ?? res?.data ?? res;
  return d ?? null;
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'PAID' ? 'green' :
    status === 'PENDING' ? 'yellow' :
    status === 'PARTIAL' ? 'blue' :
    status === 'CANCELLED' || status === 'REFUNDED' || status === 'OVERDUE' ? 'red' :
    'gray';
  return <span className={`badge badge-${tone}`}>{status}</span>;
}

export default function PharmacyDashboardPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [paymentTarget, setPaymentTarget] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [userName, setUserName] = useState('User');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api('/pharmacy/summary'),
      api('/pharmacy/alerts'),
      api('/pharmacy/sales?limit=8'),
    ])
      .then(([summaryRes, alertsRes, salesRes]: any[]) => {
        const s = toObj(summaryRes) || {};
        const alerts = toObj(alertsRes) || {};
        const billList = toList(salesRes);

        setStats([
          { label: 'Total medicines', value: s.totalMedicines ?? 0, tone: 'blue', icon: '💊' },
          { label: 'Low stock items', value: s.lowStockCount ?? alerts.summary?.lowStockCount ?? 0, tone: (s.lowStockCount ?? 0) > 0 ? 'amber' : 'green', icon: '⚠️' },
          { label: 'Dispensed today', value: s.dispensedToday ?? 0, tone: 'green', icon: '✅' },
          { label: 'Revenue today', value: formatMoney(s.revenueToday ?? 0), tone: 'green', icon: '₨' },
          { label: 'Bills today', value: s.billsToday ?? 0, tone: 'blue', icon: '📄' },
          { label: 'Expiring soon', value: alerts.summary?.nearExpiryCount ?? 0, tone: (alerts.summary?.nearExpiryCount ?? 0) > 0 ? 'red' : 'green', icon: '⏰' },
        ]);
        setBills(billList);
        setLowStock(Array.isArray(alerts.lowStock) ? alerts.lowStock : []);
        setExpiring(Array.isArray(alerts.nearExpiry) ? alerts.nearExpiry : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const role = typeof window !== 'undefined' ? localStorage.getItem('role') || '' : '';
    setAllowed(ALLOWED_ROLES.includes(role));
    setUserName(typeof window !== 'undefined' ? localStorage.getItem('userName') || 'User' : 'User');
    setChecked(true);
    if (ALLOWED_ROLES.includes(role)) load();
  }, [load]);

  if (!checked) {
    return <div className="loading">Loading pharmacy dashboard...</div>;
  }
  if (!allowed) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 8px' }}>Not authorized</h2>
        <p style={{ margin: 0, color: '#64748b' }}>
          Your role does not grant access to the pharmacy dashboard.
        </p>
      </div>
    );
  }

  const outstanding = bills.reduce(
    (sum, b) => sum + Math.max(0, Number(b.totalAmount || 0) - Number(b.paidAmount || 0)),
    0,
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Pharmacy Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 13 }}>
            {userName} · Medicines, dispensing, sales and stock overview
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading pharmacy data…</div>
      ) : (
        <>
          <div className="stat-grid">
            {stats.map((s) => (
              <div key={s.label} className="card stat-card">
                {s.icon && <span style={{ fontSize: 20 }}>{s.icon}</span>}
                <p className="stat-label">{s.label}</p>
                <p className={`stat-value stat-${s.tone || 'blue'}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
              gap: 20,
              alignItems: 'start',
            }}
          >
            <div>
              <h2 className="section-title">Quick actions</h2>
              <div className="link-grid" style={{ marginBottom: 24 }}>
                {[
                  { label: 'Dispense medicines', href: '/pharmacy?tab=dispensing', icon: '📋' },
                  { label: 'Walk-in sales', href: '/pharmacy?tab=sales', icon: '₨' },
                  { label: 'Bills', href: '/pharmacy?tab=bills', icon: '📄' },
                  { label: 'Stores & stock', href: '/pharmacy?tab=stores', icon: '🗄' },
                  { label: 'Stock alerts', href: '/pharmacy?tab=alerts', icon: '⚠️' },
                ].map((l) => (
                  <button key={l.href + l.label} className="card link-card" onClick={() => router.push(l.href)}>
                    <span style={{ fontSize: 22 }}>{l.icon}</span>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>

              <h2 className="section-title">Recent bills</h2>
              {bills.length === 0 ? (
                <div className="empty">No pharmacy bills yet.</div>
              ) : (
                <div className="card" style={{ padding: 0 }}>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Patient</th>
                          <th>Amount</th>
                          <th>Due</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bills.slice(0, 7).map((b) => {
                          const due = Math.max(0, Number(b.totalAmount || 0) - Number(b.paidAmount || 0));
                          return (
                            <tr key={b.id}>
                              <td className="mono">{b.invoiceNumber}</td>
                              <td>
                                {b.patient?.firstName} {b.patient?.lastName}
                              </td>
                              <td>{formatMoney(b.totalAmount)}</td>
                              <td>{formatMoney(due)}</td>
                              <td><InvoiceStatusBadge status={b.status} /></td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {due > 0 && b.status !== 'CANCELLED' && (
                                  <button className="btn btn-sm btn-primary" onClick={() => setPaymentTarget(b)}>Pay</button>
                                )}
                                <button className="btn btn-sm" onClick={() => setReceipt(b)}>Receipt</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {outstanding > 0 && (
                <p className="note" style={{ marginTop: 8 }}>
                  Outstanding on recent bills: {formatMoney(outstanding)}
                </p>
              )}
            </div>

            <div>
              <h2 className="section-title">Low stock items</h2>
              {lowStock.length === 0 ? (
                <div className="empty">No low stock alerts right now.</div>
              ) : (
                <div className="card" style={{ padding: 0 }}>
                  {lowStock.slice(0, 6).map((item, i) => (
                    <div
                      key={item.id || i}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '12px 16px',
                        borderBottom: i < Math.min(lowStock.length, 6) - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1.3 }}>⚠️</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {item.medicine?.name || item.name || '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {item.store?.name || '—'} · {Number(item.currentStock ?? 0)} left · reorder at {Number(item.reorderLevel ?? 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <h2 className="section-title" style={{ marginTop: 24 }}>Expiring soon</h2>
              {expiring.length === 0 ? (
                <div className="empty">No items expiring within 30 days.</div>
              ) : (
                <div className="card" style={{ padding: 0 }}>
                  {expiring.slice(0, 5).map((item, i) => (
                    <div
                      key={item.id || i}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '12px 16px',
                        borderBottom: i < Math.min(expiring.length, 5) - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: 18, lineHeight: 1.3 }}>⏰</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {item.medicine?.name || item.name || '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {item.store?.name || '—'} · {formatDateTime(item.expiryDate)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {paymentTarget && (
        <PaymentModal
          invoice={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onDone={() => { setPaymentTarget(null); load(); }}
        />
      )}
      {receipt && <ReceiptModal invoice={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}