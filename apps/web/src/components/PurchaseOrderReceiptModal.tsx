'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { badgeTone, formatDate, formatDateTime, formatMoney } from '@/lib/hooks';
import type { Row } from '@/lib/types';

export default function PurchaseOrderReceiptModal({
  order,
  onClose,
}: {
  order: Row;
  onClose: () => void;
}) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState('Hospital');

  useEffect(() => {
    let cancelled = false;
    setTenantName(localStorage.getItem('tenantName') || 'Hospital');
    api(`/procurement/purchase-orders/${order.id}`)
      .then((res: any) => {
        if (!cancelled) setData((res as any).data ?? res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load purchase order');
      });
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  const downloadPdf = useCallback(
    async (endpoint: string, defaultName: string) => {
      try {
        const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
        const headers: Record<string, string> = { 'X-HMS-CSRF': '1' };
        if (tenantId) headers['X-Tenant-ID'] = tenantId;
        const res = await fetch(`${API_URL}${endpoint}`, { headers, credentials: 'include' });
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        const blob = await res.blob();
        const filename =
          res.headers.get('Content-Disposition')?.match(/filename="?(.+?)"?$/)?.[1] || defaultName;
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

  if (error) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
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
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="loading">Loading purchase order…</div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const supplier = data.supplier ?? {};
  const store = data.store ?? {};
  const items: Row[] = Array.isArray(data.items) ? data.items : [];
  const subtotal = items.reduce(
    (sum, it) => sum + Number(it.totalPrice ?? (Number(it.quantity) * Number(it.unitPrice) || 0)),
    0,
  );
  const receivedValue = items.reduce(
    (sum, it) => sum + (Number(it.receivedQuantity) || 0) * Number(it.unitPrice || 0),
    0,
  );
  const totalAmount = Number(data.totalAmount ?? subtotal);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Purchase Order</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="receipt-print" style={{ padding: 24 }}>
          <div className="receipt-header">
            <div>
              <h2 style={{ margin: 0 }}>{tenantName}</h2>
              <div className="muted">{data.poNumber}</div>
            </div>
            <div className="receipt-badge">
              <span className={`badge badge-${badgeTone(data.status)}`}>{data.status}</span>
            </div>
          </div>

          <div className="receipt-meta">
            <div>
              <div className="label">PO no.</div>
              <div className="mono">{data.poNumber}</div>
            </div>
            <div>
              <div className="label">Order date</div>
              <div>{formatDate(data.orderDate)}</div>
            </div>
            <div>
              <div className="label">Expected</div>
              <div>{data.expectedDate ? formatDate(data.expectedDate) : '—'}</div>
            </div>
          </div>

          <div className="receipt-meta">
            <div className="receipt-patient">
              <div className="label">Supplier</div>
              <div style={{ fontWeight: 600 }}>{supplier.name || '—'}</div>
              <div className="muted">
                {[supplier.contactPerson, supplier.phone, supplier.email]
                  .filter(Boolean)
                  .join(' · ') || ''}
              </div>
              <div className="muted">
                {[supplier.address, supplier.panNumber ? `PAN: ${supplier.panNumber}` : null]
                  .filter(Boolean)
                  .join(' · ') || ''}
              </div>
            </div>
            <div className="receipt-patient">
              <div className="label">Store</div>
              <div style={{ fontWeight: 600 }}>{store.name || '—'}</div>
              {data.deliveryAddress && <div className="muted">{data.deliveryAddress}</div>}
            </div>
          </div>

          <table className="table receipt-items">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Item</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 70 }}>Unit</th>
                <th style={{ width: 100 }}>Rate</th>
                <th style={{ width: 100 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No line items.
                  </td>
                </tr>
              )}
              {items.map((it, i) => (
                <tr key={it.id ?? i}>
                  <td>{i + 1}</td>
                  <td>
                    {it.itemName}
                    {Number(it.receivedQuantity) > 0 && (
                      <span className="muted">
                        {' '}
                        (received {it.receivedQuantity})
                      </span>
                    )}
                  </td>
                  <td>{it.quantity}</td>
                  <td>{it.unit || ''}</td>
                  <td className="mono">{formatMoney(it.unitPrice)}</td>
                  <td className="mono">{formatMoney(it.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="receipt-totals">
            <div className="receipt-total-row">
              <span>Subtotal</span>
              <span className="mono">{formatMoney(subtotal)}</span>
            </div>
            {receivedValue > 0 && (
              <div className="receipt-total-row">
                <span>Received</span>
                <span className="mono">{formatMoney(receivedValue)}</span>
              </div>
            )}
            <div className="receipt-total-row receipt-grand">
              <span>Total</span>
              <span className="mono">{formatMoney(totalAmount)}</span>
            </div>
          </div>

          {(data.terms || data.notes) && (
            <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              {data.terms && (
                <div>
                  <span style={{ fontWeight: 600 }}>Terms: </span>
                  {data.terms}
                </div>
              )}
              {data.notes && (
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontWeight: 600 }}>Notes: </span>
                  {data.notes}
                </div>
              )}
            </div>
          )}

          <div className="receipt-footer">
            Purchase Order · {tenantName}. {formatDateTime(new Date())}
          </div>
        </div>

        <div className="form-actions no-print">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-secondary"
            onClick={() =>
              downloadPdf(`/procurement/purchase-orders/${data.id}/pdf`, `${data.poNumber}.pdf`)
            }
          >
            Download PDF
          </button>
          <button className="btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>
    </div>
  );
}