'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, unwrap, API_URL } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/hooks';
import { amountInWords } from '@/lib/number-to-words';

function nameOf(u: any): string {
  if (!u) return '—';
  if (typeof u === 'string') return u;
  return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ') || '—';
}

function roleOf(u: any): string {
  if (!u || typeof u === 'string') return '';
  return u.role ? String(u.role).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : '';
}

function fmtDate(d: any): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(d: any): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function lineGross(it: any): number {
  return (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
}

function lineDiscount(it: any, header: any): number {
  const gross = lineGross(it);
  const pct = it.discountPercent != null ? Number(it.discountPercent) : (header.discountPercent != null ? Number(header.discountPercent) : 0);
  return Math.round(gross * pct / 100 * 100) / 100;
}

function lineTaxable(it: any, header: any): number {
  return lineGross(it) - lineDiscount(it, header);
}

function lineTax(it: any, header: any): number {
  const taxable = lineTaxable(it, header);
  const pct = it.taxPercent != null ? Number(it.taxPercent) : (header.taxPercent != null ? Number(header.taxPercent) : 0);
  return Math.round(taxable * pct / 100 * 100) / 100;
}

function lineTotal(it: any, header: any): number {
  return lineTaxable(it, header) + lineTax(it, header) + (Number(it.otherCharges) || 0);
}

export default function PurchaseOrderDocumentPage() {
  const params = useParams();
  const id = params?.id as string;
  const [order, setOrder] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    Promise.all([
      api(`/procurement/purchase-orders/${id}`),
      api('/auth/me'),
    ])
      .then(([orderRes, meRes]) => {
        if (!active) return;
        setOrder(unwrap(orderRes));
        setTenant((unwrap(meRes) as any)?.tenant || (unwrap(meRes) as any));
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Failed to load'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const handleDownloadPdf = useCallback(async () => {
    if (!id) return;
    setDownloading(true);
    try {
      const res = await fetch(`${API_URL}/procurement/purchase-orders/${id}/pdf`, {
        credentials: 'include',
        headers: {
          'X-HMS-CSRF': '1',
          'X-Tenant-ID': localStorage.getItem('tenantId') || '',
        },
      });
      if (!res.ok) throw new Error(`PDF generation failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${order?.poNumber || 'PO'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setDownloading(false);
    }
  }, [id, order?.poNumber]);

  if (loading) return <div className="loading" style={{ padding: 40 }}>Loading purchase order…</div>;
  if (error) return <div className="alert alert-error" style={{ margin: 24 }}>{error}</div>;
  if (!order) return <div className="empty">Purchase order not found.</div>;

  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const showHsCol = items.some((i: any) => i.hsCode && String(i.hsCode).trim());
  const showReceivedCol = items.some((i: any) => Number(i.receivedQuantity) > 0);
  const currency = order.currency || tenant?.currency || 'NPR';
  const subtotal = Number(order.subtotal) || items.reduce((s, i) => s + lineGross(i), 0);
  const discountAmount = Number(order.discountAmount) || items.reduce((s, i) => s + lineDiscount(i, order), 0);
  const taxableAmount = Number(order.taxableAmount) || items.reduce((s, i) => s + lineTaxable(i, order), 0);
  const taxAmount = Number(order.taxAmount) || items.reduce((s, i) => s + lineTax(i, order), 0);
  const grandTotal = Number(order.grandTotal ?? order.totalAmount) || items.reduce((s, i) => s + lineTotal(i, order), 0);

  return (
    <>
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <a href="/procurement" className="btn btn-secondary btn-sm">← Back to Procurement</a>
        <button className="btn btn-secondary btn-sm" onClick={() => window.print()} disabled={downloading}>
          Print
        </button>
        <button className="btn btn-sm" onClick={handleDownloadPdf} disabled={downloading}>
          {downloading ? 'Downloading…' : 'Download PDF'}
        </button>
        <span className="note" style={{ marginLeft: 'auto' }}>
          {order.poNumber} • Rev {String(order.revision ?? 1).padStart(2, '0')}
        </span>
      </div>

      <div ref={printRef} className="po-document">
        {/* Header */}
        <div className="po-letterhead">
          <div className="po-org-name">{tenant?.name || 'Hospital'}</div>
          {tenant?.addressLine1 && <div className="po-org-detail">{tenant.addressLine1}{tenant.addressLine2 ? `, ${tenant.addressLine2}` : ''}</div>}
          {[tenant?.city || tenant?.district, tenant?.province, tenant?.country].filter(Boolean).length > 0 && (
            <div className="po-org-detail">{[tenant?.city || tenant?.district, tenant?.province, tenant?.country].filter(Boolean).join(', ')}</div>
          )}
          {[tenant?.phone, tenant?.email, tenant?.website].filter(Boolean).length > 0 && (
            <div className="po-org-detail">{[tenant?.phone, tenant?.email, tenant?.website].filter(Boolean).join(' | ')}</div>
          )}
          {tenant?.registrationNumber && <div className="po-org-detail">Reg: {tenant.registrationNumber} | PAN: {tenant.panNumber || '—'} | VAT: {tenant.vatNumber || '—'}</div>}
        </div>

        <h2 className="po-title">PURCHASE ORDER</h2>

        {/* PO metadata */}
        <div className="po-meta-grid">
          <div className="po-meta-item"><span className="po-meta-label">PO Number</span><span className="po-meta-value mono">{order.poNumber}</span></div>
          <div className="po-meta-item"><span className="po-meta-label">PO Date</span><span className="po-meta-value">{fmtDate(order.orderDate)}</span></div>
          <div className="po-meta-item"><span className="po-meta-label">Status</span><span className="po-meta-value">{order.status?.replace(/_/g, ' ')}</span></div>
          {order.poType && <div className="po-meta-item"><span className="po-meta-label">PO Type</span><span className="po-meta-value">{order.poType.replace(/_/g, ' ')}</span></div>}
          <div className="po-meta-item"><span className="po-meta-label">Currency</span><span className="po-meta-value">{currency}</span></div>
          {order.validityDays && <div className="po-meta-item"><span className="po-meta-label">Validity</span><span className="po-meta-value">{order.validityDays} days</span></div>}
          <div className="po-meta-item"><span className="po-meta-label">Revision</span><span className="po-meta-value">REV-{String(order.revision ?? 1).padStart(2, '0')}</span></div>
          {order.expectedDate && <div className="po-meta-item"><span className="po-meta-label">Required Delivery</span><span className="po-meta-value">{fmtDate(order.expectedDate)}</span></div>}
        </div>

        {/* Buyer & Vendor blocks */}
        <div className="po-section">
          <h3 className="po-section-title">BUYER & VENDOR</h3>
          <div className="po-two-col">
            <div className="po-col-block">
              <div className="po-block-label">BUYER / HOSPITAL</div>
              <div className="po-block-field"><span>Organization:</span> {tenant?.name || '—'}</div>
              {[tenant?.addressLine1, tenant?.addressLine2, tenant?.city || tenant?.district, tenant?.province, tenant?.country].filter(Boolean).length > 0 && (
                <div className="po-block-field"><span>Address:</span> {[tenant?.addressLine1, tenant?.addressLine2, tenant?.city || tenant?.district, tenant?.province, tenant?.country].filter(Boolean).join(', ')}</div>
              )}
              {tenant?.phone && <div className="po-block-field"><span>Phone:</span> {tenant.phone}</div>}
              {tenant?.email && <div className="po-block-field"><span>Email:</span> {tenant.email}</div>}
              {tenant?.panNumber && <div className="po-block-field"><span>PAN:</span> {tenant.panNumber}</div>}
              {tenant?.vatNumber && <div className="po-block-field"><span>VAT:</span> {tenant.vatNumber}</div>}
              {tenant?.registrationNumber && <div className="po-block-field"><span>Reg No:</span> {tenant.registrationNumber}</div>}
            </div>
            <div className="po-col-block">
              <div className="po-block-label">VENDOR / SUPPLIER</div>
              <div className="po-block-field"><span>Name:</span> {order.supplier?.name || '—'}</div>
              {order.supplier?.code && <div className="po-block-field"><span>Code:</span> {order.supplier.code}</div>}
              {order.supplier?.contactPerson && <div className="po-block-field"><span>Contact:</span> {order.supplier.contactPerson}</div>}
              {order.supplier?.phone && <div className="po-block-field"><span>Phone:</span> {order.supplier.phone}</div>}
              {order.supplier?.email && <div className="po-block-field"><span>Email:</span> {order.supplier.email}</div>}
              {order.supplier?.address && <div className="po-block-field"><span>Address:</span> {order.supplier.address}</div>}
              {order.supplier?.billingAddress && <div className="po-block-field"><span>Billing:</span> {order.supplier.billingAddress}</div>}
              {order.supplier?.shippingAddress && <div className="po-block-field"><span>Shipping:</span> {order.supplier.shippingAddress}</div>}
              {order.supplier?.panNumber && <div className="po-block-field"><span>PAN:</span> {order.supplier.panNumber}</div>}
              {order.supplier?.vatNumber && <div className="po-block-field"><span>VAT:</span> {order.supplier.vatNumber}</div>}
              {order.supplier?.registrationNumber && <div className="po-block-field"><span>Reg No:</span> {order.supplier.registrationNumber}</div>}
              {order.supplier?.category && <div className="po-block-field"><span>Category:</span> {order.supplier.category}</div>}
              {order.supplier?.bankName && <div className="po-block-field"><span>Bank:</span> {order.supplier.bankName}{order.supplier.bankBranch ? ` | ${order.supplier.bankBranch}` : ''}</div>}
              {order.supplier?.bankAccount && <div className="po-block-field"><span>A/c No:</span> {order.supplier.bankAccount}</div>}
            </div>
          </div>
        </div>

        {/* Procurement references */}
        {order.purchaseRequest?.requestNumber && (
          <div className="po-section">
            <h3 className="po-section-title">PROCUREMENT REFERENCES</h3>
            <div className="po-meta-grid">
              <div className="po-meta-item"><span className="po-meta-label">Request #</span><span className="po-meta-value mono">{order.purchaseRequest.requestNumber}</span></div>
              {order.purchaseRequest.requestedBy && <div className="po-meta-item"><span className="po-meta-label">Requested By</span><span className="po-meta-value">{nameOf(order.purchaseRequest.requestedBy)}</span></div>}
              {order.purchaseRequest.department && <div className="po-meta-item"><span className="po-meta-label">Department</span><span className="po-meta-value">{order.purchaseRequest.department}</span></div>}
              {order.purchaseRequest.priority && <div className="po-meta-item"><span className="po-meta-label">Priority</span><span className="po-meta-value">{order.purchaseRequest.priority}</span></div>}
              {order.purchaseRequest.neededBy && <div className="po-meta-item"><span className="po-meta-label">Needed By</span><span className="po-meta-value">{fmtDate(order.purchaseRequest.neededBy)}</span></div>}
            </div>
          </div>
        )}

        {/* Items table */}
        <div className="po-section">
          <h3 className="po-section-title">PURCHASE ORDER ITEMS</h3>
          <div className="po-table-wrap">
            <table className="po-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>SN</th>
                  <th>Code</th>
                  {showHsCol && <th style={{ width: 28 }}>HS Code</th>}
                  <th>Item Description</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th style={{ width: 48 }}>Qty</th>
                  {showReceivedCol && <th style={{ width: 52 }}>Received</th>}
                  <th style={{ width: 68 }}>Unit Price</th>
                  <th style={{ width: 56 }}>Disc</th>
                  <th style={{ width: 36 }}>VAT%</th>
                  <th style={{ width: 64 }}>VAT</th>
                  <th style={{ width: 72 }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, i: number) => (
                  <tr key={it.id || i}>
                    <td className="muted">{i + 1}</td>
                    <td className="mono">{it.itemCode || '—'}</td>
                    {showHsCol && <td className="mono">{it.hsCode ? String(it.hsCode) : '—'}</td>}
                    <td>
                      <strong>{it.itemName}</strong>
                      {[it.brand, it.model, it.specification].filter(Boolean).length > 0 && (
                        <div className="po-item-detail">{[it.brand, it.model, it.specification].filter(Boolean).join(' • ')}</div>
                      )}
                    </td>
                    <td>{it.category || '—'}</td>
                    <td>{it.unit || '—'}</td>
                    <td className="r">{Number(it.quantity)}</td>
                    {showReceivedCol && <td className="r">{it.receivedQuantity != null && Number(it.receivedQuantity) > 0 ? Number(it.receivedQuantity) : '—'}</td>}
                    <td className="r mono">{formatMoney(it.unitPrice)}</td>
                    <td className="r mono">{it.discountAmount ? formatMoney(it.discountAmount) : '—'}</td>
                    <td className="r">{it.taxPercent != null ? `${Number(it.taxPercent)}%` : '—'}</td>
                    <td className="r mono">{it.taxAmount ? formatMoney(it.taxAmount) : '—'}</td>
                    <td className="r mono"><strong>{formatMoney(it.lineTotal ?? it.totalPrice)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hospital-specific requirements */}
        {items.some((it: any) => it.batchRequired || it.expiryRequired || it.sterilityRequired || it.coldChainRequired || it.temperatureRequirement || it.warrantyRequired || it.calibrationRequired || it.installationRequired || it.trainingRequired || it.criticality) && (
          <div className="po-section">
            <h3 className="po-section-title">HOSPITAL-SPECIFIC PROCUREMENT REQUIREMENTS</h3>
            {items.filter((it: any) => it.batchRequired || it.expiryRequired || it.sterilityRequired || it.coldChainRequired || it.temperatureRequirement || it.warrantyRequired || it.calibrationRequired || it.installationRequired || it.trainingRequired || it.criticality).map((it: any, i: number) => {
              const flags: string[] = [];
              if (it.criticality) flags.push(`Criticality: ${it.criticality}`);
              if (it.batchRequired) flags.push('Batch/Lot required');
              if (it.expiryRequired) flags.push('Expiry required');
              if (it.sterilityRequired) flags.push('Sterility required');
              if (it.coldChainRequired) flags.push('Cold chain required');
              if (it.temperatureRequirement) flags.push(`Temp: ${it.temperatureRequirement}`);
              if (it.warrantyRequired) flags.push('Warranty required');
              if (it.calibrationRequired) flags.push('Calibration certificate');
              if (it.installationRequired) flags.push('Installation');
              if (it.trainingRequired) flags.push('Training');
              return <div key={i} className="po-req-line"><strong>{it.itemName}:</strong> {flags.join(', ')}</div>;
            })}
          </div>
        )}

        {/* Financial summary */}
        <div className="po-section">
          <h3 className="po-section-title">FINANCIAL SUMMARY</h3>
          <div className="po-finance-grid">
            <div className="po-finance-row"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
            {discountAmount > 0 && <div className="po-finance-row"><span>Total Discount</span><span>({formatMoney(discountAmount)})</span></div>}
            <div className="po-finance-row po-finance-header"><span>Taxable Amount</span><span>{formatMoney(taxableAmount)}</span></div>
            <div className="po-finance-row"><span>{order.taxPercent != null ? `VAT (${Number(order.taxPercent)}%)` : 'VAT'}</span><span>{formatMoney(taxAmount)}</span></div>
            {Number(order.tdsAmount) > 0 && <div className="po-finance-row"><span>TDS</span><span>({formatMoney(order.tdsAmount)})</span></div>}
            {Number(order.freightAmount) > 0 && <div className="po-finance-row"><span>Freight</span><span>{formatMoney(order.freightAmount)}</span></div>}
            {Number(order.insuranceAmount) > 0 && <div className="po-finance-row"><span>Insurance</span><span>{formatMoney(order.insuranceAmount)}</span></div>}
            {Number(order.otherCharges) > 0 && <div className="po-finance-row"><span>Other Charges</span><span>{formatMoney(order.otherCharges)}</span></div>}
            <div className="po-finance-row po-finance-total"><span>GRAND TOTAL</span><span>{formatMoney(grandTotal)}</span></div>
          </div>
          <div className="po-amount-words">
            <strong>Amount in Words:</strong> {amountInWords(grandTotal, currency) || '—'}
          </div>
        </div>

        {/* Payment terms */}
        {(order.paymentTerms || order.paymentMethod || order.validityDays) && (
          <div className="po-section">
            <h3 className="po-section-title">PAYMENT TERMS</h3>
            {[order.paymentTerms, order.paymentMethod ? String(order.paymentMethod).replace(/_/g, ' ') : null, order.validityDays ? `Valid ${order.validityDays} days` : null].filter(Boolean).map((s, i) => <div key={i} className="po-field-line">{s}</div>)}
          </div>
        )}

        {/* Delivery */}
        {(order.store?.name || order.deliveryAddress || order.expectedDate) && (
          <div className="po-section">
            <h3 className="po-section-title">DELIVERY & LOGISTICS</h3>
            {order.store?.name && <div className="po-field-line">Store: {order.store.name}{order.store.location ? ` - ${order.store.location}` : ''}</div>}
            {order.deliveryAddress && <div className="po-field-line">Deliver to: {order.deliveryAddress}</div>}
            {order.expectedDate && <div className="po-field-line">Required by: {fmtDate(order.expectedDate)}</div>}
            {order.supplier?.shippingAddress && order.supplier.shippingAddress !== order.deliveryAddress && (
              <div className="po-field-line">Supplier shipping: {order.supplier.shippingAddress}</div>
            )}
          </div>
        )}

        {/* GRN linkage */}
        {Array.isArray(order.goodsReceipts) && order.goodsReceipts.length > 0 && (
          <div className="po-section">
            <h3 className="po-section-title">GOODS RECEIPTS</h3>
            {order.goodsReceipts.map((grn: any, i: number) => (
              <div key={i} className="po-field-line">
                <strong>{grn.grnNumber}</strong> — Received {fmtDate(grn.receivedDate)}{grn.invoiceNumber ? ` | Invoice: ${grn.invoiceNumber}` : ''}
              </div>
            ))}
          </div>
        )}

        {/* Justification */}
        {order.purchaseRequest?.justification && (
          <div className="po-section">
            <h3 className="po-section-title">PURCHASE JUSTIFICATION</h3>
            <div className="po-field-line">{order.purchaseRequest.justification}</div>
          </div>
        )}

        {/* Approval */}
        {(order.approvedBy || order.approvedAt) && (
          <div className="po-section">
            <h3 className="po-section-title">APPROVAL</h3>
            <div className="po-field-line">
              Approved by: {nameOf(order.approvedBy)}{roleOf(order.approvedBy) ? ` (${roleOf(order.approvedBy)})` : ''} on {fmtDateTime(order.approvedAt)}
            </div>
          </div>
        )}

        {/* Vendor acceptance */}
        {(order.vendorAcceptedBy || order.vendorAcceptedAt) && (
          <div className="po-section">
            <h3 className="po-section-title">VENDOR ACCEPTANCE</h3>
            <div className="po-field-line">
              Accepted by: {nameOf(order.vendorAcceptedBy)} on {fmtDateTime(order.vendorAcceptedAt)}
            </div>
          </div>
        )}

        {/* Terms */}
        {(order.terms || order.notes) && (
          <div className="po-section">
            <h3 className="po-section-title">TERMS & CONDITIONS</h3>
            {order.terms && <div className="po-field-line">{order.terms}</div>}
            {order.notes && <div className="po-field-line">{order.notes}</div>}
          </div>
        )}

        {/* Document control */}
        <div className="po-section">
          <h3 className="po-section-title">DOCUMENT CONTROL</h3>
          <div className="po-doc-control-grid">
            <div><span>Created By:</span> {nameOf(order.createdBy)}</div>
            <div><span>Created At:</span> {fmtDateTime(order.createdAt)}</div>
            <div><span>Last Updated By:</span> {nameOf(order.updatedBy)}</div>
            <div><span>Last Updated At:</span> {fmtDateTime(order.updatedAt)}</div>
          </div>
        </div>

        {/* Signatures */}
        <div className="po-signatures">
          <div className="po-signature-block">
            <div className="po-sig-line" />
            <div className="po-sig-label">Authorized Signature (Hospital)</div>
          </div>
          <div className="po-signature-block">
            <div className="po-sig-line" />
            <div className="po-sig-label">Authorized Signature (Vendor)</div>
          </div>
        </div>
      </div>
    </>
  );
}
