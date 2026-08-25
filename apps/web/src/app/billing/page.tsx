'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ModulePage from '@/components/ModulePage';
import PaymentModal from '@/components/PaymentModal';
import ReceiptModal from '@/components/ReceiptModal';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/hooks';
import { INVOICE_TYPES, PAYMENT_METHODS } from '@/lib/options';
import type { ApiResponse, Row } from '@/lib/types';

const PATIENT_REF = { valueKey: 'id', labelKeys: ['firstName', 'lastName', 'mrn', 'mobile'], endpoint: '/patients' };

function CommandCenter() {
  const [a, setA] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res: ApiResponse<Row> = await api('/billing/analytics');
      setA(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!a) return <div className="loading">Loading…</div>;

  const t = a.today || {};
  const trend = Array.isArray(a.trend) ? a.trend : [];
  const doctorIncome: Row = a.doctorIncome || {};
  const userCollection: Row = a.userCollection || {};
  const byMethod: Row = t.collectionByMethod || {};
  const byType: Row = t.revenueByType || {};

  const cards = [
    { label: "Today's Revenue", value: formatMoney(t.revenue) },
    { label: "Today's Collection", value: formatMoney(t.collection) },
    { label: "Today's Bills", value: String(t.bills ?? 0) },
    { label: 'Paid Bills', value: String(t.paidBills ?? 0) },
    { label: 'Credit Bills', value: String(t.creditBills ?? 0) },
    { label: 'Unpaid bills', value: formatMoney(t.outstanding) },
    { label: 'Refunds', value: formatMoney(t.refunds) },
    { label: 'Deposits', value: formatMoney(t.deposits) },
  ];

  return (
    <div>
      <div className="stats-grid">
        {cards.map((c) => (
          <div key={c.label} className="stat-card">
            <div className="stat-value">{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <h4>Revenue by type (today)</h4>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(byType).length ? (
                Object.entries(byType).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="mono">{formatMoney(v)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={2}>No revenue recorded today.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <h4>Collection by method (today)</h4>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(byMethod).length ? (
                Object.entries(byMethod).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="mono">{formatMoney(v)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={2}>No collections today.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <h4>Revenue & collection trend (30 days)</h4>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Revenue</th>
                <th>Collection</th>
              </tr>
            </thead>
            <tbody>
              {trend.slice(-14).reverse().map((p: Row) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td className="mono">{formatMoney(p.revenue)}</td>
                  <td className="mono">{formatMoney(p.collection)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h4>Doctor income (all time)</h4>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Doctor</th><th>Income</th></tr>
              </thead>
              <tbody>
                {Object.keys(doctorIncome).length ? (
                  Object.entries(doctorIncome).slice(0, 15).map(([k, v]) => (
                    <tr key={k}>
                      <td className="mono">{k.slice(0, 10)}…</td>
                      <td className="mono">{formatMoney(v)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={2}>No doctor-tagged charges.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <h4>User collection (all time)</h4>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>User</th><th>Total</th></tr>
              </thead>
              <tbody>
                {Object.keys(userCollection).length ? (
                  Object.entries(userCollection).slice(0, 15).map(([k, v]) => (
                    <tr key={k}>
                      <td className="mono">{k.slice(0, 10)}…</td>
                      <td className="mono">{formatMoney((v as Row).total)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={2}>No collections recorded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function DepositRefundModal({ deposit, onClose, onDone }: { deposit: Row; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState<number>(Number(deposit.balance || 0));
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || amount <= 0) return setError('Enter a valid amount');
    if (!reason.trim()) return setError('Reason is required');
    setSaving(true);
    setError(null);
    try {
      await api(`/billing/deposits/${deposit.id}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), reason: reason.trim(), refundMethod }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refund deposit');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Refund deposit</h3>
        <p className="muted">
          Deposit <span className="mono">{deposit.depositNumber}</span> · Balance{' '}
          {formatMoney(deposit.balance)}
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label className="label">Amount</label>
            <input className="input" type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} required />
          </div>
          <div className="field">
            <label className="label">Reason</label>
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} required />
          </div>
          <div className="field">
            <label className="label">Refund method</label>
            <select className="input" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          {error && <p style={{ margin: 0, color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Refunding…' : 'Refund deposit'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BillingPageInner() {
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patientId');
  const [payTarget, setPayTarget] = useState<Row | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<Row | null>(null);
  const [refundDepositTarget, setRefundDepositTarget] = useState<Row | null>(null);
  const reloadRef = useRef<() => void>(() => {});

  async function approveRefund(row: Row) {
    if (!window.confirm(`Approve and process refund ${row.refundNumber}?`)) return;
    try {
      await api(`/billing/refunds/${row.id}/approve`, { method: 'PATCH' });
      reloadRef.current();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to approve refund');
    }
  }

  function reprintReceipt(row: Row) {
    api(`/billing/invoices/${row.id}/reprint`, { method: 'POST' }).catch(() => {});
    setReceiptTarget(row);
  }

  const schemeRef = { valueKey: 'id', labelKeys: ['name'], endpoint: '/billing/schemes' };

  return (
    <ModulePage
      title="Billing"
      subtitle="Invoices, payments & receipts"
      initialTab={patientId ? 'invoices' : undefined}
      initialCreateValues={patientId ? { patientId } : undefined}
      autoOpenCreate={Boolean(patientId)}
      tabs={[
        {
          key: 'invoices',
          label: 'Invoices',
          endpoint: '/billing/invoices',
          createLabel: 'New invoice',
          columns: [
            { key: 'invoiceNumber', label: 'Invoice no.', render: (r) => <span className="mono">{r.invoiceNumber}</span> },
            {
              key: 'patient',
              label: 'Patient',
              render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
            },
            { key: 'type', label: 'Type', badge: true },
            { key: 'totalAmount', label: 'Total', render: (r) => formatMoney(r.totalAmount) },
            { key: 'paidAmount', label: 'Paid', render: (r) => formatMoney(r.paidAmount) },
            { key: 'status', label: 'Status', badge: true },
          ],
          actions: [
            {
              label: 'Record payment',
              onClick: (row) => setPayTarget(row),
              condition: (row) => Number(row.totalAmount || 0) > Number(row.paidAmount || 0),
            },
            {
              label: 'Receipt',
              tone: 'secondary',
              onClick: (row) => setReceiptTarget(row),
              condition: (row) => Number(row.paidAmount || 0) > 0,
              skipReload: true,
            },
            {
              label: 'Reprint',
              tone: 'ghost',
              onClick: (row) => reprintReceipt(row),
              condition: (row) => Number(row.paidAmount || 0) > 0,
              skipReload: true,
            },
          ],
          fields: [
            { name: 'patientId', label: 'Patient', required: true, type: 'searchSelect', optionsFrom: PATIENT_REF },
            { name: 'type', label: 'Type', type: 'select', options: INVOICE_TYPES },
            { name: 'schemeId', label: 'Scheme', type: 'select', optionsFrom: schemeRef },
            { name: 'encounterId', label: 'Encounter ID' },
            { name: 'items', label: 'Line items', type: 'items', required: true, full: true },
            { name: 'discountAmount', label: 'Discount (NPR)', type: 'number' },
            { name: 'taxPercent', label: 'Tax %', type: 'number' },
            { name: 'isCredit', label: 'Credit invoice', type: 'checkbox' },
            { name: 'dueDate', label: 'Due date', type: 'date' },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ],
        },
        {
          key: 'payments',
          label: 'Payments',
          endpoint: '/billing/payments',
          createLabel: 'Record payment',
          columns: [
            { key: 'paymentNumber', label: 'Ref', render: (r) => <span className="mono">{r.paymentNumber || r.id.slice(0, 8)}</span> },
            { key: 'invoiceNumber', label: 'Invoice', render: (r) => <span className="mono">{r.invoice?.invoiceNumber || r.invoiceId?.slice(0, 8)}</span> },
            { key: 'amount', label: 'Amount', render: (r) => formatMoney(r.amount) },
            { key: 'method', label: 'Method', badge: true },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            { name: 'patientId', label: 'Patient', required: true, type: 'searchSelect', optionsFrom: PATIENT_REF },
            { name: 'invoiceId', label: 'Invoice', required: true, type: 'select', optionsFrom: {
              valueKey: 'id', labelKeys: ['invoiceNumber'], endpoint: '/billing/invoices',
            } },
            { name: 'amount', label: 'Amount', type: 'number', required: true },
            { name: 'method', label: 'Method', type: 'select', options: PAYMENT_METHODS, defaultValue: 'CASH' },
            { name: 'referenceNumber', label: 'Reference / Txn no.' },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ],
        },
        {
          key: 'deposits',
          label: 'Deposits',
          endpoint: '/billing/deposits',
          createLabel: 'Receive deposit',
          columns: [
            { key: 'depositNumber', label: 'Deposit no.', render: (r) => <span className="mono">{r.depositNumber}</span> },
            {
              key: 'patient',
              label: 'Patient',
              render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
            },
            { key: 'type', label: 'Type', badge: true },
            { key: 'amount', label: 'Amount', render: (r) => formatMoney(r.amount) },
            { key: 'balance', label: 'Balance', render: (r) => formatMoney(r.balance) },
            { key: 'method', label: 'Method', badge: true },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            { name: 'patientId', label: 'Patient', required: true, type: 'searchSelect', optionsFrom: PATIENT_REF },
            { name: 'type', label: 'Type', type: 'select', options: [
              { value: 'ADMISSION', label: 'Admit' },
              { value: 'IPD', label: 'IPD' },
              { value: 'PROCEDURE', label: 'Procedure' },
              { value: 'OT', label: 'OT' },
              { value: 'EMERGENCY', label: 'Emergency' },
              { value: 'GENERAL', label: 'General' },
            ] },
            { name: 'amount', label: 'Amount', type: 'number', required: true },
            { name: 'method', label: 'Method', type: 'select', options: PAYMENT_METHODS, defaultValue: 'CASH' },
            { name: 'referenceNumber', label: 'Reference / Txn no.' },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ],
          actions: [
            {
              label: 'Refund',
              tone: 'danger',
              onClick: (row) => setRefundDepositTarget(row),
              condition: (row) => Number(row.balance || 0) > 0,
            },
          ],
        },
        {
          key: 'schemes',
          label: 'Schemes',
          endpoint: '/billing/schemes',
          createLabel: 'New scheme',
          columns: [
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Code', render: (r) => <span className="mono">{r.code || '—'}</span> },
            { key: 'discountPercent', label: 'Discount %' },
            { key: 'isActive', label: 'Active', badge: true },
          ],
          fields: [
            { name: 'name', label: 'Name', required: true },
            { name: 'code', label: 'Code' },
            { name: 'description', label: 'Description', type: 'textarea', full: true },
            { name: 'discountPercent', label: 'Discount %', type: 'number' },
            { name: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
          ],
        },
        {
          key: 'refunds',
          label: 'Refunds',
          endpoint: '/billing/refunds',
          createLabel: 'Request refund',
          columns: [
            { key: 'refundNumber', label: 'Refund no.', render: (r) => <span className="mono">{r.refundNumber}</span> },
            {
              key: 'patient',
              label: 'Patient',
              render: (r) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || r.patientId,
            },
            { key: 'invoice', label: 'Invoice', render: (r) => r.invoice?.invoiceNumber ? <span className="mono">{r.invoice.invoiceNumber}</span> : '—' },
            { key: 'amount', label: 'Amount', render: (r) => formatMoney(r.amount) },
            { key: 'refundMethod', label: 'Method', badge: true },
            { key: 'status', label: 'Status', badge: true },
          ],
          actions: [
            {
              label: 'Approve',
              onClick: (row) => approveRefund(row),
              tone: 'primary',
              condition: (row) => row.status === 'REQUESTED',
            },
          ],
          fields: [
            { name: 'invoiceId', label: 'Invoice', required: true, type: 'select', optionsFrom: {
              valueKey: 'id', labelKeys: ['invoiceNumber'], endpoint: '/billing/invoices',
            } },
            { name: 'amount', label: 'Amount', type: 'number', required: true },
            { name: 'reason', label: 'Reason', required: true, type: 'textarea', full: true },
            { name: 'refundMethod', label: 'Refund method', type: 'select', options: PAYMENT_METHODS, defaultValue: 'CASH' },
          ],
        },
        {
          key: 'services',
          label: 'Services',
          endpoint: '/billing/services',
          createLabel: 'New service',
          columns: [
            { key: 'code', label: 'Code', render: (r) => <span className="mono">{r.code}</span> },
            { key: 'name', label: 'Name' },
            { key: 'category', label: 'Category', badge: true },
            { key: 'price', label: 'Price', render: (r) => formatMoney(r.price) },
            { key: 'taxPercent', label: 'Tax %' },
            { key: 'isActive', label: 'Active', badge: true },
          ],
          fields: [
            { name: 'code', label: 'Code', required: true },
            { name: 'name', label: 'Name', required: true },
            { name: 'category', label: 'Category', type: 'select', options: [
              { value: 'OPD', label: 'OPD' },
              { value: 'CONSULTATION', label: 'Consultation' },
              { value: 'LABORATORY', label: 'Laboratory' },
              { value: 'RADIOLOGY', label: 'Radiology' },
              { value: 'PHARMACY', label: 'Pharmacy' },
              { value: 'PROCEDURE', label: 'Procedure' },
              { value: 'OT', label: 'OT' },
              { value: 'ICU', label: 'ICU' },
              { value: 'EMERGENCY', label: 'Emergency' },
              { value: 'ROOM', label: 'Room' },
              { value: 'BED', label: 'Bed' },
              { value: 'NURSING', label: 'Nursing' },
              { value: 'AMBULANCE', label: 'Ambulance' },
              { value: 'OTHER', label: 'Other' },
            ] },
            { name: 'description', label: 'Description', type: 'textarea', full: true },
            { name: 'price', label: 'Price (NPR)', type: 'number', required: true },
            { name: 'taxPercent', label: 'Tax %', type: 'number' },
            { name: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
          ],
        },
        {
          key: 'closing',
          label: 'Daily closing',
          endpoint: '/billing/daily-closings',
          createLabel: 'Close day',
          columns: [
            { key: 'closeDate', label: 'Date', render: (r) => new Date(r.closeDate).toLocaleDateString() },
            { key: 'totalSales', label: 'Sales', render: (r) => formatMoney(r.totalSales) },
            { key: 'totalCollections', label: 'Collected', render: (r) => formatMoney(r.totalCollections) },
            { key: 'expectedCash', label: 'Expected cash', render: (r) => formatMoney(r.expectedCash) },
            { key: 'actualCash', label: 'Actual cash', render: (r) => formatMoney(r.actualCash) },
            { key: 'difference', label: 'Diff', render: (r) => formatMoney(r.difference) },
            { key: 'status', label: 'Status', badge: true },
          ],
          fields: [
            { name: 'closeDate', label: 'Close date', type: 'date' },
            { name: 'actualCash', label: 'Actual cash (NPR)', type: 'number', required: true },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ],
        },
        {
          key: 'summary',
          label: 'Command Center',
          render: () => <CommandCenter />,
        },
      ]}
      extra={(load) => {
        reloadRef.current = load;
        return (
          <>
            {payTarget ? (
              <PaymentModal
                invoice={payTarget}
                onClose={() => setPayTarget(null)}
                onDone={() => {
                  setPayTarget(null);
                  load();
                  setReceiptTarget(payTarget);
                }}
              />
            ) : null}
            {receiptTarget ? (
              <ReceiptModal invoice={receiptTarget} onClose={() => setReceiptTarget(null)} />
            ) : null}
            {refundDepositTarget ? (
              <DepositRefundModal
                deposit={refundDepositTarget}
                onClose={() => setRefundDepositTarget(null)}
                onDone={() => {
                  setRefundDepositTarget(null);
                  load();
                }}
              />
            ) : null}
          </>
        );
      }}
    />
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="muted">Loading...</p>}>
      <BillingPageInner />
    </Suspense>
  );
}
