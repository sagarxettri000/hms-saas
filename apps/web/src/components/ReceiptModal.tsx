'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, API_URL } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/hooks';
import { INVOICE_TYPES, PAYMENT_METHODS } from '@/lib/options';
import type { Row } from '@/lib/types';

function labelOf(options: { value: string; label: string }[], value: any): string {
  return options.find((o) => o.value === value)?.label ?? value ?? '—';
}

export default function ReceiptModal({
  invoice,
  onClose,
}: {
  invoice: Row;
  onClose: () => void;
}) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState('Hospital');

  useEffect(() => {
    setTenantName(localStorage.getItem('tenantName') || 'Hospital');
    api(`/billing/invoices/${invoice.id}`)
      .then((res: any) => setData(res.data ?? res))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invoice'));
  }, [invoice.id]);

  if (error) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal">
          <div className="alert alert-error">{error}</div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="modal-backdrop">
        <div className="modal">
          <div className="loading">Loading receipt…</div>
        </div>
      </div>
    );
  }

  const patient = data.patient ?? {};
  const items: Row[] = data.items ?? [];
  const payments: Row[] = data.payments ?? [];
  const paidAmount = Number(data.paidAmount || 0);
  const totalAmount = Number(data.totalAmount || 0);
  const dueAmount = Number(data.dueAmount || 0);
  const discountAmount = Number(data.discountAmount || 0);
  const taxAmount = Number(data.taxAmount || 0);
  const subtotal = Number(data.subtotal || 0);

  const downloadPdf = useCallback(
    async (endpoint: string, defaultName: string) => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (tenantId) headers['X-Tenant-ID'] = tenantId;
        const res = await fetch(`${API_URL}${endpoint}`, { headers });
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        const blob = await res.blob();
        const filename = res.headers.get('Content-Disposition')?.match(/filename="?(.+?)"?$/)?.[1] || defaultName;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Download failed');
      }
    },
    [],
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Invoice / Receipt</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="receipt-print" style={{ padding: 24 }}>
          <div className="receipt-header">
            <div>
              <h2 style={{ margin: 0 }}>{tenantName}</h2>
              <div className="muted">
                {data.invoiceNumber} · {labelOf(INVOICE_TYPES, data.type)}
              </div>
            </div>
            <div className="receipt-badge">
              <span className={`badge badge-${data.status === 'PAID' ? 'green' : data.status === 'PARTIAL' ? 'yellow' : 'gray'}`}>
                {data.status}
              </span>
            </div>
          </div>

          <div className="receipt-meta">
            <div>
              <div className="label">Invoice no.</div>
              <div className="mono">{data.invoiceNumber}</div>
            </div>
            <div>
              <div className="label">Issued</div>
              <div>{formatDate(data.issuedDate)}</div>
            </div>
            <div>
              <div className="label">Due date</div>
              <div>{data.dueDate ? formatDate(data.dueDate) : '—'}</div>
            </div>
          </div>

          <div className="receipt-meta">
            <div className="receipt-patient">
              <div className="label">Billed to</div>
              <div style={{ fontWeight: 600 }}>
                {[patient.firstName, patient.lastName].filter(Boolean).join(' ') || '—'}
              </div>
              <div className="muted">
                {[patient.mrn, patient.phone].filter(Boolean).join(' · ') || ''}
              </div>
            </div>
          </div>

          <table className="table receipt-items">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Service</th>
                <th style={{ width: 70 }}>Qty</th>
                <th style={{ width: 110 }}>Rate</th>
                <th style={{ width: 110 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No line items.
                  </td>
                </tr>
              )}
              {items.map((it, i) => (
                <tr key={it.id ?? i}>
                  <td>{i + 1}</td>
                  <td>
                    {it.serviceName}
                    {it.serviceCode ? <span className="mono muted"> ({it.serviceCode})</span> : null}
                  </td>
                  <td>{it.quantity}</td>
                  <td className="mono">{formatMoney(it.rate)}</td>
                  <td className="mono">{formatMoney(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="receipt-totals">
            <div className="receipt-total-row">
              <span>Subtotal</span>
              <span className="mono">{formatMoney(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="receipt-total-row">
                <span>Discount</span>
                <span className="mono">-{formatMoney(discountAmount)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="receipt-total-row">
                <span>Tax</span>
                <span className="mono">{formatMoney(taxAmount)}</span>
              </div>
            )}
            <div className="receipt-total-row receipt-grand">
              <span>Total</span>
              <span className="mono">{formatMoney(totalAmount)}</span>
            </div>
          </div>

          {payments.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 16 }}>Payments</div>
              <table className="table receipt-items">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Date</th>
                    <th>Method</th>
                    <th style={{ width: 110 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{p.paymentNumber || p.id.slice(0, 8)}</td>
                      <td>{p.paidAt ? formatDate(p.paidAt) : '—'}</td>
                      <td>{labelOf(PAYMENT_METHODS, p.method)}</td>
                      <td className="mono">{formatMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="receipt-totals">
                <div className="receipt-total-row">
                  <span>Total paid</span>
                  <span className="mono">{formatMoney(paidAmount)}</span>
                </div>
                <div className="receipt-total-row receipt-grand">
                  <span>Balance due</span>
                  <span className="mono">{formatMoney(dueAmount)}</span>
                </div>
              </div>
            </>
          )}

          {data.notes && (
            <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              {data.notes}
            </div>
          )}

          <div className="receipt-footer">
            Thank you for choosing {tenantName}. {formatDateTime(new Date())}
          </div>
        </div>

        <div className="form-actions no-print">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => downloadPdf(`/billing/invoices/${data.id}/pdf`, `${data.invoiceNumber}.pdf`)}
          >
            Download PDF
          </button>
          {payments.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => downloadPdf(`/billing/invoices/${data.id}/receipt`, `receipt-${data.invoiceNumber}.pdf`)}
            >
              Download Receipt
            </button>
          )}
          <button className="btn" onClick={() => window.print()}>
            Print receipt
          </button>
        </div>
      </div>
    </div>
  );
}
