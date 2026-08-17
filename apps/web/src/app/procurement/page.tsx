'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/hooks';
import ModulePage from '@/components/ModulePage';

type Tab = 'suppliers' | 'orders' | 'receipts';

export default function ProcurementPage() {
  const [activeTab, setActiveTab] = useState<Tab>('suppliers');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const tabBtn = (key: Tab, label: string) => (
    <button className="btn btn-sm" style={{ background: activeTab === key ? 'var(--primary)' : 'var(--bg-secondary)', color: activeTab === key ? '#fff' : undefined }} onClick={() => { setActiveTab(key); setDetailId(null); setDetail(null); }}>{label}</button>
  );

  useEffect(() => {
    api('/procurement/suppliers?limit=500').then((r) => setSuppliers(r?.data?.data ?? r?.data ?? [])).catch(() => {});
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailId(id);
    setLoadingDetail(true);
    try {
      const r = await api(`/procurement/purchase-orders/${id}`);
      setDetail(r?.data ?? r);
    } catch { setDetail(null); }
    setLoadingDetail(false);
  }, []);

  const updatePOStatus = async (id: string, status: string) => {
    try {
      await api(`/procurement/purchase-orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      loadDetail(id);
    } catch {}
  };

  if (detailId) {
    if (loadingDetail) return <div className="loading">Loading purchase order...</div>;
    if (!detail) return <div className="error-msg">Order not found</div>;

    const statusTones: Record<string, string> = {
      DRAFT: 'var(--muted)', SENT: 'var(--info)', CONFIRMED: 'var(--warning)',
      PARTIAL_RECEIVED: 'var(--primary)', RECEIVED: 'var(--success)', INVOICED: 'var(--success)', CANCELLED: 'var(--danger)',
    };

    return (
      <div style={{ padding: '0 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-sm btn-ghost" onClick={() => { setDetailId(null); setDetail(null); }}>← Back</button>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>PO {detail.poNumber}</h1>
            </div>
          </div>
          <span className="badge" style={{ background: statusTones[detail.status] || 'var(--muted)', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>{detail.status?.replace(/_/g, ' ')}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Order Info</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              <div>Supplier: {detail.supplier?.name || '—'}</div>
              <div>Store: {detail.store?.name || '—'}</div>
              <div>Order Date: {formatDateTime(detail.orderDate)}</div>
              {detail.expectedDate && <div>Expected: {formatDateTime(detail.expectedDate)}</div>}
              <div>Total: Rs. {Number(detail.totalAmount || 0).toLocaleString()}</div>
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Actions</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {detail.status === 'DRAFT' && <button className="btn btn-sm" style={{ background: 'var(--info)', color: '#fff' }} onClick={() => updatePOStatus(detail.id, 'SENT')}>Send</button>}
              {detail.status === 'SENT' && <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff' }} onClick={() => updatePOStatus(detail.id, 'CONFIRMED')}>Confirm</button>}
              {detail.status === 'CONFIRMED' && <button className="btn btn-sm" style={{ background: 'var(--success)', color: '#fff' }} onClick={() => updatePOStatus(detail.id, 'RECEIVED')}>Mark Received</button>}
              {detail.status !== 'CANCELLED' && detail.status !== 'RECEIVED' && detail.status !== 'INVOICED' && (
                <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => updatePOStatus(detail.id, 'CANCELLED')}>Cancel</button>
              )}
            </div>
            {detail.terms && <div style={{ marginTop: 12, fontSize: 12 }}><strong>Terms:</strong> {detail.terms}</div>}
            {detail.notes && <div style={{ marginTop: 4, fontSize: 12 }}><strong>Notes:</strong> {detail.notes}</div>}
          </div>
        </div>

        {detail.items && detail.items.length > 0 && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Order Items</div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Received</th></tr>
                </thead>
                <tbody>
                  {detail.items.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.itemName}</td>
                      <td>{item.quantity}</td>
                      <td>Rs. {Number(item.unitPrice).toLocaleString()}</td>
                      <td>Rs. {Number(item.totalPrice).toLocaleString()}</td>
                      <td>{Number(item.receivedQuantity || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tabBtn('suppliers', 'Suppliers')}
        {tabBtn('orders', 'Purchase Orders')}
        {tabBtn('receipts', 'Goods Receipts')}
      </div>

      {activeTab === 'suppliers' && (
        <ModulePage
          title="Suppliers"
          subtitle="Manage vendors and suppliers"
          endpoint="/procurement/suppliers"
          createLabel="Add supplier"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'contactPerson', label: 'Contact Person', render: (r) => r.contactPerson || '—' },
            { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
            { key: 'email', label: 'Email', render: (r) => r.email || '—' },
            { key: 'panNumber', label: 'PAN', render: (r) => <span className="mono">{r.panNumber || '—'}</span> },
            { key: 'isActive', label: 'Status', badge: true },
          ]}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'contactPerson', label: 'Contact Person' },
            { name: 'phone', label: 'Phone' },
            { name: 'email', label: 'Email' },
            { name: 'address', label: 'Address', full: true },
            { name: 'panNumber', label: 'PAN Number' },
          ]}
        />
      )}

      {activeTab === 'orders' && (
        <ModulePage
          title="Purchase Orders"
          subtitle="Manage purchase orders"
          endpoint="/procurement/purchase-orders"
          createLabel="New PO"
          columns={[
            { key: 'poNumber', label: 'PO Number', render: (r) => <span className="mono">{r.poNumber}</span> },
            { key: 'supplier', label: 'Supplier', render: (r) => r.supplier?.name || '—' },
            { key: 'status', label: 'Status', badge: true },
            { key: 'totalAmount', label: 'Total', render: (r) => `Rs. ${Number(r.totalAmount || 0).toLocaleString()}` },
            { key: 'orderDate', label: 'Date', render: (r) => formatDateTime(r.orderDate) },
          ]}
          fields={[
            { name: 'supplierId', label: 'Supplier', type: 'select', options: suppliers.map((s: any) => ({ value: s.id, label: s.name })) },
            { name: 'expectedDate', label: 'Expected Date', type: 'date' },
            { name: 'deliveryAddress', label: 'Delivery Address', full: true },
            { name: 'terms', label: 'Terms', full: true },
            { name: 'notes', label: 'Notes', full: true },
            { name: 'items', label: 'Items', type: 'json', required: true, full: true, hint: '[{itemName, quantity, unitPrice, medicineId?}]' },
          ]}
          actions={[{ label: 'View', onClick: (r) => loadDetail(r.id) }]}
        />
      )}

      {activeTab === 'receipts' && (
        <ModulePage
          title="Goods Receipts"
          subtitle="Track received goods"
          endpoint="/procurement/goods-receipts"
          createLabel="New receipt"
          columns={[
            { key: 'grnNumber', label: 'GRN Number', render: (r) => <span className="mono">{r.grnNumber}</span> },
            { key: 'purchaseOrder', label: 'PO', render: (r) => r.purchaseOrder?.poNumber || '—' },
            { key: 'invoiceNumber', label: 'Invoice', render: (r) => r.invoiceNumber || '—' },
            { key: 'receivedDate', label: 'Received', render: (r) => formatDateTime(r.receivedDate) },
          ]}
          fields={[
            { name: 'purchaseOrderId', label: 'Purchase Order', type: 'select', options: [] },
            { name: 'supplierId', label: 'Supplier', type: 'select', options: suppliers.map((s: any) => ({ value: s.id, label: s.name })) },
            { name: 'invoiceNumber', label: 'Invoice Number' },
            { name: 'remarks', label: 'Remarks', full: true },
            { name: 'items', label: 'Items', type: 'json', required: true, full: true, hint: '[{itemName, quantity, unitPrice, batchNumber?, expiryDate?, medicineId?}]' },
          ]}
        />
      )}
    </>
  );
}
