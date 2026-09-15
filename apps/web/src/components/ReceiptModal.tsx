'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, API_URL } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/hooks';
import { INVOICE_TYPES, PAYMENT_METHODS } from '@/lib/options';
import type { Row } from '@/lib/types';

const PATIENT_CATEGORY_LABELS: Record<string, string> = {
  GENERAL: 'Normal / General Patient',
  FOREIGN: 'Foreign Patient',
  STAFF: 'Staff',
  STAFF_RELATIVE: 'Staff Dependent',
  CORPORATE: 'Corporate',
  INSURANCE: 'Insurance',
  MEMBER: 'Member',
  EMERGENCY: 'Emergency',
  OTHER: 'Other',
};

function labelOf(options: { value: string; label: string }[], value: any): string {
  return options.find((o) => o.value === value)?.label ?? value ?? '—';
}

function titleCase(v: any): string {
  if (!v) return '—';
  const s = String(v).toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ageOf(p: any): string {
  if (!p) return '—';
  if (p.age !== null && p.age !== undefined && p.age !== '') return `${p.age} yrs`;
  if (p.dateOfBirth) {
    const dob = new Date(p.dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const years = new Date().getFullYear() - dob.getFullYear();
      return `${years} yrs`;
    }
  }
  return '—';
}

function addressOf(p: any): string {
  if (!p) return '—';
  const parts = [p.addressLine1, p.addressLine2, p.city, p.district, p.province, p.country]
    .filter((v): v is string => Boolean(v));
  return parts.length ? parts.join(', ') : '—';
}

function categoryOf(data: Row): string {
  const scheme = data.scheme as Row | null | undefined;
  if (scheme?.name) return scheme.name;
  const patient = (data.patient as Row) ?? {};
  const label = PATIENT_CATEGORY_LABELS[patient.patientType as string] ?? titleCase(patient.patientType);
  return label || 'Normal / General Patient';
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
  const [printedAt] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    setTenantName(localStorage.getItem('tenantName') || 'Hospital');
    api(`/billing/invoices/${invoice.id}`)
      .then((res: any) => { if (!cancelled) setData(res.data ?? res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load invoice'); });
    return () => { cancelled = true; };
  }, [invoice.id]);

  const downloadPdf = useCallback(
    async (endpoint: string, defaultName: string) => {
      try {
        const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
        const headers: Record<string, string> = { 'X-HMS-CSRF': '1' };
        if (tenantId) headers['X-Tenant-ID'] = tenantId;
        const res = await fetch(`${API_URL}${endpoint}`, { headers, credentials: 'include' });
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
          <div className="loading">Loading invoice…</div>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tenant = (data.tenant as Row) ?? {};
  const hospitalName = tenant.name || tenantName;
  const patient = (data.patient as Row) ?? {};
  const billedName = data.customerName
    ? data.customerName
    : [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ') || '—';
  const phone = data.customerPhone || patient.mobile || patient.phone || '—';
  const mrn = patient.mrn || null;
  const consultantEnc = data.encounter as Row | null | undefined;
  const consultantUser = (consultantEnc?.doctor as Row | undefined)?.user as Row | undefined;
  const consultant = consultantUser
    ? [consultantUser.firstName, consultantUser.lastName].filter(Boolean).join(' ')
    : '—';
  const consultantSpecialization = (consultantEnc?.doctor as Row | undefined)?.specialization || '';
  const createdByUser = data.createdByUser as Row | null | undefined;
  const createdByName = createdByUser
    ? [createdByUser.firstName, createdByUser.lastName].filter(Boolean).join(' ')
    : '—';

  const items: Row[] = Array.isArray(data.items) ? data.items : [];
  const payments: Row[] = Array.isArray(data.payments) ? data.payments : [];
  const paidAmount = Number(data.paidAmount || 0);
  const totalAmount = Number(data.totalAmount || 0);
  const dueAmount = Number(data.dueAmount || 0);
  const discountAmount = Number(data.discountAmount || 0);
  const taxAmount = Number(data.taxAmount || 0);
  const subtotal = Number(data.subtotal || 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Invoice — {data.invoiceNumber}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="receipt-print">
          <div className="invoice-sheet">
            {/* Hospital masthead / branding */}
            <div className="invoice-masthead">
              <div className="invoice-brand">
                {(tenant.logoUrl || null) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tenant.logoUrl} alt={`${hospitalName} logo`} className="invoice-logo" />
                )}
                <div className="invoice-brand-text">
                  <div className="invoice-hospital">{hospitalName}</div>
                  <div className="invoice-muted">
                    {[tenant.addressLine1, tenant.addressLine2].filter(Boolean).join(', ')}
                  </div>
                  <div className="invoice-muted">
                    {[tenant.city, tenant.district, tenant.province, tenant.country].filter(Boolean).join(', ')}
                  </div>
                  <div className="invoice-muted">
                    {[tenant.phone, tenant.email, tenant.website].filter(Boolean).join('  |  ')}
                  </div>
                </div>
              </div>
            </div>

            {/* Two-column header: patient/billing on left, invoice/hospital on right */}
            <div className="invoice-head">
              <div className="invoice-head-left">
                <div className="inv-section-title">Patient / Billing Details</div>
                <div className="inv-rows">
                  <div className="inv-row">
                    <span className="inv-label">Patient Name</span>
                    <span className="inv-value">
                      {billedName}
                      {mrn ? <span className="inv-sub"> ({mrn})</span> : null}
                    </span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">Age / Gender</span>
                    <span className="inv-value">{ageOf(patient)} / {titleCase(patient.gender)}</span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">Address</span>
                    <span className="inv-value">{addressOf(patient)}</span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">Phone No.</span>
                    <span className="inv-value">{phone}</span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">Consultant</span>
                    <span className="inv-value">
                      {consultant}
                      {consultant !== '—' && consultantSpecialization ? (
                        <span className="inv-sub"> ({consultantSpecialization})</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">Referred By</span>
                    <span className="inv-value">—</span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">Scheme / Category</span>
                    <span className="inv-value">{categoryOf(data)}</span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">User / Created By</span>
                    <span className="inv-value">{createdByName}</span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">Printed Date/Time</span>
                    <span className="inv-value">{formatDateTime(printedAt)}</span>
                  </div>
                </div>
              </div>

              <div className="invoice-head-right">
                <div className="inv-pan-row">
                  <span className="inv-label">Hospital PAN Number</span>
                  <span className="inv-value mono">{tenant.panNumber || '—'}</span>
                </div>
                <div className="invoice-title">INVOICE</div>
                <div className="inv-rows">
                  <div className="inv-row">
                    <span className="inv-label">Invoice No.</span>
                    <span className="inv-value mono">{data.invoiceNumber}</span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">Invoice Date</span>
                    <span className="inv-value">{formatDate(data.issuedDate)}</span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">Type</span>
                    <span className="inv-value">{labelOf(INVOICE_TYPES, data.type)}</span>
                  </div>
                  <div className="inv-row">
                    <span className="inv-label">Status</span>
                    <span className="inv-value">
                      <span className={`badge badge-${data.status === 'PAID' ? 'green' : data.status === 'PARTIAL' ? 'yellow' : data.status === 'CANCELLED' ? 'red' : 'gray'}`}>
                        {data.status}
                      </span>
                    </span>
                  </div>
                </div>
                {tenant.vatNumber ? (
                  <div className="inv-pan-row" style={{ marginTop: 10 }}>
                    <span className="inv-label">VAT Number</span>
                    <span className="inv-value mono">{tenant.vatNumber}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Billing items table */}
            <div className="invoice-table-wrap">
              <table className="table invoice-items">
                <thead>
                  <tr>
                    <th className="inv-col-sn">SN</th>
                    <th>Particulars</th>
                    <th className="inv-col-num">Rate</th>
                    <th className="inv-col-num">Quantity</th>
                    <th className="inv-col-num">Amount</th>
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
                      <td className="inv-col-sn">{i + 1}</td>
                      <td>
                        {it.serviceName}
                        {it.serviceCode ? <span className="inv-sub"> ({it.serviceCode})</span> : null}
                        {it.description ? <div className="inv-sub">{it.description}</div> : null}
                      </td>
                      <td className="inv-col-num mono">{formatMoney(it.rate)}</td>
                      <td className="inv-col-num">{it.quantity}</td>
                      <td className="inv-col-num mono">{formatMoney(it.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="invoice-totals">
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
              <div className="receipt-grand total-row">
                <span>Total</span>
                <span className="mono">{formatMoney(totalAmount)}</span>
              </div>
            </div>

            {payments.length > 0 && (
              <>
                <div className="inv-section-title" style={{ marginTop: 18 }}>
                  Payments
                </div>
                <div className="invoice-table-wrap">
                  <table className="table invoice-items">
                    <thead>
                      <tr>
                        <th>Ref</th>
                        <th>Date</th>
                        <th>Method</th>
                        <th className="inv-col-num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="mono">{p.paymentNumber || p.id.slice(0, 8)}</td>
                          <td>{p.paidAt ? formatDate(p.paidAt) : '—'}</td>
                          <td>{labelOf(PAYMENT_METHODS, p.method)}</td>
                          <td className="inv-col-num mono">{formatMoney(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="invoice-totals">
                  <div className="receipt-total-row">
                    <span>Total paid</span>
                    <span className="mono">{formatMoney(paidAmount)}</span>
                  </div>
                  <div className="receipt-grand total-row">
                    <span>Balance due</span>
                    <span className="mono">{formatMoney(dueAmount)}</span>
                  </div>
                </div>
              </>
            )}

            {data.notes && (
              <div className="invoice-notes">
                <span className="inv-label">Notes</span>
                <div>{data.notes}</div>
              </div>
            )}

            <div className="invoice-footer">
              Thank you for choosing {hospitalName}. Please retain this invoice for your records.
            </div>
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
            Print invoice
          </button>
        </div>
      </div>
    </div>
  );
}