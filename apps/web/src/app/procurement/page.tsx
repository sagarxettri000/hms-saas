'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import EntityPage from '@/components/EntityPage';
import { api, unwrap } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/hooks';
import PurchaseOrderReceiptModal from '@/components/PurchaseOrderReceiptModal';
import type { Action, FormField } from '@/lib/types';

type Tab = 'orders' | 'requests' | 'suppliers' | 'items' | 'transfers' | 'receipts';

interface StockTransfer {
  id: string;
  transferredAt: string;
  fromStore: string;
  toStore: string;
  itemName: string;
  quantity: number;
  status: string;
}

export default function ProcurementPage() {
  const [tab, setTab] = useState<Tab>('orders');
  const [refreshKey, setRefreshKey] = useState(0);
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);

  const reloadBase = () => setRefreshKey((k) => k + 1);

  // ---------- Transfers state ----------
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [transferForm, setTransferForm] = useState({
    fromStoreId: '',
    toStoreId: '',
    inventoryItemId: '',
    quantity: '',
  });
  const [fromItems, setFromItems] = useState<any[]>([]);
  const [transferMsg, setTransferMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingTransfer, setSavingTransfer] = useState(false);

  const [grnOrder, setGrnOrder] = useState<any | null>(null);
  const [convertRequest, setConvertRequest] = useState<any | null>(null);
  const [adjustItem, setAdjustItem] = useState<any | null>(null);
  const [poReceipt, setPoReceipt] = useState<any | null>(null);

  const loadTransfers = useCallback(async () => {
    try {
      const r = await api('/procurement/transfers?limit=200');
      const data = unwrap(r);
      const rows = Array.isArray(data) ? data : [];
      setTransfers(
        rows.map((row: any) => ({
          id: row.id,
          transferredAt: row.transferredAt,
          fromStore: row.fromStore,
          toStore: row.toStore,
          itemName: row.itemName,
          quantity: Number(row.quantity) || 0,
          status: row.status,
        })),
      );
    } catch {
      setTransfers([]);
    }
  }, []);

  useEffect(() => {
    api('/procurement/suppliers?limit=500')
      .then((r) => {
        const data = unwrap(r);
        setSuppliers(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    api('/pharmacy/stores')
      .then((r) => {
        const data = unwrap(r);
        setStores(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    loadTransfers();
  }, [loadTransfers]);

  useEffect(() => {
    if (tab === 'transfers') loadTransfers();
  }, [tab, loadTransfers]);

  // Items in the source store for the transfer picker
  useEffect(() => {
    if (tab !== 'transfers' || !transferForm.fromStoreId) {
      setFromItems([]);
      return;
    }
    api(`/pharmacy/inventory?storeId=${transferForm.fromStoreId}&limit=500`)
      .then((r) => {
        const data = unwrap(r);
        setFromItems(Array.isArray(data) ? data : []);
      })
      .catch(() => setFromItems([]));
  }, [tab, transferForm.fromStoreId]);

  // ---------- Actions ----------

  const orderActions: Action[] = [
    {
      label: 'View Document',
      tone: 'ghost',
      skipReload: true,
      onClick: (row) => router.push(`/procurement/po/${row.id}`),
    },
    {
      label: 'Mark Accepted',
      tone: 'primary',
      condition: (r) => ['SENT', 'CONFIRMED'].includes(r.status) && !r.vendorAcceptedBy,
      skipReload: true,
      onClick: async (row) => {
        if (!window.confirm(`Mark PO ${row.poNumber} as accepted by vendor?`)) return;
        await api(`/procurement/purchase-orders/${row.id}/accept`, { method: 'PATCH' });
      },
    },
    {
      label: 'Receipt',
      tone: 'secondary',
      skipReload: true,
      onClick: (row) => setPoReceipt(row),
    },
    {
      label: 'Receive Stock',
      tone: 'primary',
      skipReload: true,
      condition: (r) => !['CANCELLED', 'RECEIVED'].includes(r.status),
      onClick: (row) => setGrnOrder(row),
    },
    {
      label: 'Approve',
      tone: 'secondary',
      condition: (r) => ['DRAFT', 'SENT'].includes(r.status),
      onClick: async (row) => {
        await api(`/procurement/purchase-orders/${row.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'CONFIRMED' }),
        });
      },
    },
    {
      label: 'Cancel',
      tone: 'danger',
      condition: (r) => !['CANCELLED', 'RECEIVED'].includes(r.status),
      onClick: async (row) => {
        await api(`/procurement/purchase-orders/${row.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'CANCELLED' }),
        });
      },
    },
  ];

  const requestActions: Action[] = [
    {
      label: 'Approve',
      tone: 'secondary',
      condition: (r) => ['PENDING', 'DRAFT'].includes(r.status),
      onClick: async (row) => {
        await api(`/procurement/purchase-requests/${row.id}/approve`, {
          method: 'PATCH',
        });
      },
    },
    {
      label: 'Reject',
      tone: 'danger',
      condition: (r) => ['PENDING', 'DRAFT'].includes(r.status),
      onClick: async (row) => {
        const reason = window.prompt('Rejection reason (optional):')?.trim() ?? '';
        await api(`/procurement/purchase-requests/${row.id}/reject`, {
          method: 'PATCH',
          body: JSON.stringify({ reason }),
        });
      },
    },
    {
      label: 'Convert to PO',
      tone: 'primary',
      skipReload: true,
      condition: (r) => r.status === 'APPROVED',
      onClick: (row) => setConvertRequest(row),
    },
  ];

  const itemActions: Action[] = [
    {
      label: 'Adjust Stock',
      tone: 'secondary',
      skipReload: true,
      onClick: (row) => setAdjustItem(row),
    },
  ];

  const inventoryFields: FormField[] = [
    { name: 'name', label: 'Name', required: true },
    { name: 'storeId', label: 'Store', required: true, type: 'select', optionsFrom: { endpoint: '/pharmacy/stores', valueKey: 'id', labelKeys: ['name'] } },
    { name: 'itemType', label: 'Type', type: 'select', options: [{ value: 'SUPPLIES', label: 'SUPPLIES' }, { value: 'EQUIPMENT', label: 'EQUIPMENT' }, { value: 'CONSUMABLE', label: 'CONSUMABLE' }, { value: 'OTHER', label: 'OTHER' }], defaultValue: 'SUPPLIES' },
    { name: 'sku', label: 'SKU / Code' },
    { name: 'unit', label: 'Unit' },
    { name: 'currentStock', label: 'Quantity', type: 'number' },
    { name: 'purchaseRate', label: 'Unit Price', type: 'number' },
    { name: 'salesRate', label: 'Sales Rate', type: 'number' },
    { name: 'reorderLevel', label: 'Reorder Level', type: 'number' },
    { name: 'minStock', label: 'Min Stock', type: 'number' },
    { name: 'maxStock', label: 'Max Stock', type: 'number' },
    { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
    { name: 'batchNumber', label: 'Batch Number' },
    { name: 'location', label: 'Location' },
  ];

  // ---------- Transfer helpers ----------

  const selectedFromItem = fromItems.find(
    (it) => it.id === transferForm.inventoryItemId,
  );

  const addTransfer = async () => {
    setTransferMsg(null);
    if (
      !transferForm.fromStoreId ||
      !transferForm.toStoreId ||
      !transferForm.inventoryItemId
    ) {
      setTransferMsg({ ok: false, text: 'Please choose the source, destination and item.' });
      return;
    }
    if (transferForm.fromStoreId === transferForm.toStoreId) {
      setTransferMsg({ ok: false, text: 'Source and destination stores must be different.' });
      return;
    }
    if (selectedFromItem) {
      const available = Number(selectedFromItem.currentStock) || 0;
      if (Number(transferForm.quantity) > available) {
        setTransferMsg({
          ok: false,
          text: `Only ${available} unit(s) of "${selectedFromItem.name}" are available in the source store.`,
        });
        return;
      }
    }
    setSavingTransfer(true);
    try {
      await api('/procurement/transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromStoreId: transferForm.fromStoreId,
          toStoreId: transferForm.toStoreId,
          inventoryItemId: transferForm.inventoryItemId,
          quantity: Number(transferForm.quantity) || 0,
        }),
      });
      setTransferForm({
        fromStoreId: '',
        toStoreId: '',
        inventoryItemId: '',
        quantity: '',
      });
      setTransferMsg({ ok: true, text: 'Stock transferred successfully.' });
      await loadTransfers();
    } catch (err) {
      setTransferMsg({
        ok: false,
        text: err instanceof Error ? err.message : 'Transfer failed.',
      });
    } finally {
      setSavingTransfer(false);
    }
  };

  const totalMoved = transfers.reduce((sum, t) => sum + (t.quantity || 0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Procurement</h1>
          <p className="page-subtitle">
            Purchase orders, requests, inventory items, transfers and goods receipts
          </p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>Purchase Orders</button>
        <button className={`tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>Purchase Requests</button>
        <button className={`tab ${tab === 'suppliers' ? 'active' : ''}`} onClick={() => setTab('suppliers')}>Suppliers</button>
        <button className={`tab ${tab === 'items' ? 'active' : ''}`} onClick={() => setTab('items')}>Inventory Items</button>
        <button className={`tab ${tab === 'transfers' ? 'active' : ''}`} onClick={() => setTab('transfers')}>Stock Transfers</button>
        <button className={`tab ${tab === 'receipts' ? 'active' : ''}`} onClick={() => setTab('receipts')}>Goods Receipts</button>
      </div>

      {tab === 'orders' && (
        <EntityPage
          key={`orders-${refreshKey}`}
          title="Purchase Orders"
          subtitle="Manage purchase orders from request to receipt"
          endpoint="/procurement/purchase-orders"
          createLabel="New PO"
          actions={orderActions}
          columns={[
            { key: 'poNumber', label: 'PO Number', render: (r) => <span className="mono">{r.poNumber}</span> },
            { key: 'supplier', label: 'Supplier', render: (r) => r.supplier?.name || r.supplierName || '—' },
            { key: 'purchaseRequest', label: 'From Request', render: (r) => (r.purchaseRequest ? <span className="mono">{r.purchaseRequest.requestNumber}</span> : '—') },
            { key: 'status', label: 'Status', badge: true },
            { key: 'items', label: 'Lines', render: (r) => (Array.isArray(r.items) ? r.items.length : r.itemCount ?? '—') },
            { key: 'totalAmount', label: 'Total', render: (r) => formatMoney(r.totalAmount) },
            { key: 'orderDate', label: 'Date', render: (r) => formatDate(r.orderDate) },
          ]}
          fields={[
            { name: 'supplierId', label: 'Supplier', type: 'select', optionsFrom: { endpoint: '/procurement/suppliers', valueKey: 'id', labelKeys: ['name'] } },
            { name: 'poType', label: 'PO Type', type: 'select', options: [{ value: 'STANDARD', label: 'Standard' }, { value: 'EMERGENCY', label: 'Emergency' }, { value: 'CONTRACT', label: 'Contract' }, { value: 'BLANKET', label: 'Blanket' }, { value: 'SERVICE', label: 'Service' }], defaultValue: 'STANDARD' },
            { name: 'storeId', label: 'Receive To Store', type: 'select', optionsFrom: { endpoint: '/pharmacy/stores', valueKey: 'id', labelKeys: ['name'] } },
            { name: 'expectedDate', label: 'Expected Date', type: 'date' },
            { name: 'deliveryAddress', label: 'Delivery Address', full: true },
            { name: 'currency', label: 'Currency', defaultValue: 'NPR' },
            { name: 'validityDays', label: 'Validity (days)', type: 'number' },
            { name: 'paymentTerms', label: 'Payment Terms', full: true },
            { name: 'paymentMethod', label: 'Payment Method', type: 'select', options: [{ value: 'BANK_TRANSFER', label: 'Bank Transfer' }, { value: 'CASH', label: 'Cash' }, { value: 'CHEQUE', label: 'Cheque' }, { value: 'CREDIT', label: 'Credit' }, { value: 'LC', label: 'Letter of Credit' }] },
            { name: 'discountPercent', label: 'Discount %', type: 'number' },
            { name: 'taxPercent', label: 'VAT %', type: 'number' },
            { name: 'tdsPercent', label: 'TDS %', type: 'number' },
            { name: 'freightAmount', label: 'Freight Amount', type: 'number' },
            { name: 'insuranceAmount', label: 'Insurance Amount', type: 'number' },
            { name: 'otherCharges', label: 'Other Charges', type: 'number' },
            { name: 'terms', label: 'Terms', full: true },
            { name: 'notes', label: 'Notes', full: true },
            { name: 'items', label: 'Items', type: 'procItems', priceKey: 'unitPrice', procItemsExtended: true, required: true, full: true, hint: 'Add at least one line item with quantity and unit price. Discount and VAT percentage can be set per line or at the header level.' },
          ]}
        />
      )}

      {tab === 'requests' && (
        <EntityPage
          key={`requests-${refreshKey}`}
          title="Purchase Requests"
          subtitle="Track, approve and convert purchase requests"
          endpoint="/procurement/purchase-requests"
          createLabel="New Request"
          actions={requestActions}
          columns={[
            { key: 'requestNumber', label: 'Request #', render: (r) => <span className="mono">{r.requestNumber || '—'}</span> },
            { key: 'requestedBy', label: 'Requested By', render: (r) => r.requestedBy?.name || [r.requestedBy?.firstName, r.requestedBy?.lastName].filter(Boolean).join(' ') || '—' },
            { key: 'department', label: 'Department', render: (r) => r.department?.name || '—' },
            { key: 'priority', label: 'Priority', badge: true },
            { key: 'status', label: 'Status', badge: true },
            { key: 'items', label: 'Lines', render: (r) => (Array.isArray(r.items) ? r.items.length : r.itemCount ?? '—') },
            { key: 'neededBy', label: 'Needed By', render: (r) => formatDate(r.neededBy || r.requiredDate) },
            { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) },
          ]}
          fields={[
            { name: 'departmentId', label: 'Department', type: 'select', optionsFrom: { endpoint: '/departments', valueKey: 'id', labelKeys: ['name'] } },
            { name: 'priority', label: 'Priority', type: 'select', options: [{ value: 'LOW', label: 'LOW' }, { value: 'NORMAL', label: 'NORMAL' }, { value: 'HIGH', label: 'HIGH' }, { value: 'URGENT', label: 'URGENT' }] },
            { name: 'neededBy', label: 'Needed By', type: 'date' },
            { name: 'justification', label: 'Justification', type: 'textarea', full: true },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
            { name: 'items', label: 'Items', type: 'procItems', priceKey: 'estimatedPrice', required: true, full: true, hint: 'Add at least one line item with an estimated price.' },
          ]}
        />
      )}

      {tab === 'suppliers' && (
        <EntityPage
          key={`suppliers-${refreshKey}`}
          title="Suppliers"
          subtitle="Manage vendor and supplier information"
          endpoint="/procurement/suppliers"
          createLabel="Add Supplier"
          editable
          searchable={false}
          columns={[
            { key: 'code', label: 'Code', render: (r) => <span className="mono">{r.code || '—'}</span> },
            { key: 'name', label: 'Name' },
            { key: 'category', label: 'Category', render: (r) => r.category || '—' },
            { key: 'contactPerson', label: 'Contact', render: (r) => r.contactPerson || '—' },
            { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
            { key: 'email', label: 'Email', render: (r) => r.email || '—' },
            { key: 'panNumber', label: 'PAN', render: (r) => <span className="mono">{r.panNumber || '—'}</span> },
            { key: 'vatNumber', label: 'VAT', render: (r) => <span className="mono">{r.vatNumber || '—'}</span> },
            { key: 'isActive', label: 'Status', badge: true },
          ]}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'code', label: 'Code' },
            { name: 'contactPerson', label: 'Contact Person' },
            { name: 'phone', label: 'Phone' },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'address', label: 'Address', full: true },
            { name: 'billingAddress', label: 'Billing Address', full: true },
            { name: 'shippingAddress', label: 'Shipping Address', full: true },
            { name: 'category', label: 'Category' },
            { name: 'panNumber', label: 'PAN Number' },
            { name: 'vatNumber', label: 'VAT Number' },
            { name: 'registrationNumber', label: 'Registration Number' },
            { name: 'paymentTerms', label: 'Payment Terms' },
            { name: 'bankName', label: 'Bank Name' },
            { name: 'bankAccount', label: 'Bank Account' },
            { name: 'bankBranch', label: 'Bank Branch' },
          ]}
        />
      )}

      {tab === 'items' && (
        <EntityPage
          key={`items-${refreshKey}`}
          title="Inventory Items"
          subtitle="Store-room supplies and equipment across stores (medicines are managed in Pharmacy)"
          endpoint="/pharmacy/inventory"
          createLabel="Add Item"
          editable
          params={{ excludeItemType: 'MEDICINE' }}
          actions={itemActions}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'sku', label: 'SKU', render: (r) => <span className="mono">{r.sku || r.code || '—'}</span> },
            { key: 'itemType', label: 'Type' },
            { key: 'store', label: 'Store', render: (r) => r.store?.name || '—' },
            { key: 'currentStock', label: 'Qty' },
            { key: 'purchaseRate', label: 'Unit Price', render: (r) => formatMoney(r.purchaseRate ?? r.unitPrice) },
            { key: 'reorderLevel', label: 'Reorder' },
            { key: 'expiryDate', label: 'Expiry', render: (r) => (r.expiryDate ? formatDate(r.expiryDate) : '—') },
            { key: 'isActive', label: 'Status', badge: true },
          ]}
          fields={inventoryFields}
        />
      )}

      {tab === 'transfers' && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Total Transfers</div>
              <div className="stat-value">{transfers.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Total Quantity Moved</div>
              <div className="stat-value" style={{ color: 'var(--primary)' }}>{totalMoved.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">This Month</div>
              <div className="stat-value" style={{ color: 'var(--info)' }}>
                {transfers.filter((tr) => tr.transferredAt.slice(0, 7) === new Date().toISOString().slice(0, 7)).length}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Last Transfer</div>
              <div className="stat-value" style={{ fontSize: 18 }}>
                {transfers.length ? formatDate(transfers[0].transferredAt) : '—'}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Transfer Stock</h3>
            <div className="form-grid">
              <div className="field">
                <label className="label">From Store *</label>
                <select
                  className="input"
                  value={transferForm.fromStoreId}
                  onChange={(e) =>
                    setTransferForm({
                      fromStoreId: e.target.value,
                      toStoreId:
                        transferForm.toStoreId === e.target.value ? '' : transferForm.toStoreId,
                      inventoryItemId: '',
                      quantity: '',
                    })
                  }
                >
                  <option value="">— Select source —</option>
                  {stores.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">To Store *</label>
                <select
                  className="input"
                  value={transferForm.toStoreId}
                  onChange={(e) =>
                    setTransferForm({ ...transferForm, toStoreId: e.target.value })
                  }
                >
                  <option value="">— Select destination —</option>
                  {stores
                    .filter((s: any) => s.id !== transferForm.fromStoreId)
                    .map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Item *</label>
                <select
                  className="input"
                  value={transferForm.inventoryItemId}
                  onChange={(e) =>
                    setTransferForm({ ...transferForm, inventoryItemId: e.target.value, quantity: '' })
                  }
                  disabled={!transferForm.fromStoreId}
                >
                  <option value="">— Select item —</option>
                  {fromItems.map((it: any) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({Number(it.currentStock) || 0} available)
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Quantity</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={transferForm.quantity}
                  onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
                />
              </div>
            </div>
            {transferMsg && (
              <div
                className={transferMsg.ok ? 'alert alert-success' : 'alert alert-error'}
                style={{ marginTop: 10 }}
              >
                {transferMsg.text}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-sm" onClick={addTransfer} disabled={savingTransfer}>
                {savingTransfer ? 'Transferring…' : '+ Record Transfer'}
              </button>
            </div>
          </div>

          {transfers.length === 0 ? (
            <div className="empty">No stock transfers recorded yet.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((tr) => (
                    <tr key={tr.id}>
                      <td>{formatDate(tr.transferredAt)}</td>
                      <td><strong>{tr.fromStore}</strong></td>
                      <td><strong>{tr.toStore}</strong></td>
                      <td>{tr.itemName}</td>
                      <td>{tr.quantity}</td>
                      <td>
                        <span className={`badge ${tr.status === 'COMPLETED' ? 'badge-green' : 'badge-gray'}`}>
                          {String(tr.status).replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'receipts' && (
        <EntityPage
          key={`receipts-${refreshKey}`}
          title="Goods Receipts"
          subtitle="Stock-in records received against purchase orders"
          endpoint="/procurement/goods-receipts"
          searchable={false}
          columns={[
            { key: 'grnNumber', label: 'GRN #', render: (r) => <span className="mono">{r.grnNumber}</span> },
            { key: 'receivedDate', label: 'Received', render: (r) => formatDate(r.receivedDate) },
            { key: 'purchaseOrder', label: 'PO', render: (r) => (r.purchaseOrder ? <span className="mono">{r.purchaseOrder.poNumber}</span> : '—') },
            { key: 'supplier', label: 'Supplier', render: (r) => r.supplier?.name || '—' },
            { key: 'store', label: 'Store', render: (r) => r.store?.name || '—' },
            { key: 'invoiceNumber', label: 'Invoice #', render: (r) => r.invoiceNumber || '—' },
            { key: 'items', label: 'Lines', render: (r) => (Array.isArray(r.items) ? r.items.length : r.itemCount ?? '—') },
            { key: 'receivedBy', label: 'Received By', render: (r) => r.receivedBy || '—' },
          ]}
        />
      )}

      {grnOrder && (
        <GoodsReceiptModal
          order={grnOrder}
          stores={stores}
          suppliers={suppliers}
          onClose={() => setGrnOrder(null)}
          onDone={() => {
            setGrnOrder(null);
            reloadBase();
          }}
        />
      )}

      {poReceipt && (
        <PurchaseOrderReceiptModal
          order={poReceipt}
          onClose={() => setPoReceipt(null)}
        />
      )}

      {convertRequest && (
        <ConvertToPoModal
          request={convertRequest}
          stores={stores}
          suppliers={suppliers}
          onClose={() => setConvertRequest(null)}
          onDone={() => {
            setConvertRequest(null);
            reloadBase();
          }}
        />
      )}

      {adjustItem && (
        <AdjustStockModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onDone={() => {
            setAdjustItem(null);
            reloadBase();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Goods Receipt modal — receiving stock against a purchase order
// ---------------------------------------------------------------------------

function GoodsReceiptModal({
  order,
  stores,
  suppliers,
  onClose,
  onDone,
}: {
  order: any;
  stores: any[];
  suppliers: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [storeId, setStoreId] = useState(order.storeId || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<any[]>(() =>
    (order.items || []).map((it: any) => ({
      itemName: it.itemName,
      medicineId: it.medicineId,
      quantity: String(Number(it.quantity) || 1),
      unitPrice: String(Number(it.unitPrice) || 0),
      batchNumber: '',
      expiryDate: '',
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supplier = suppliers.find((s: any) => s.id === order.supplierId);

  function updateLine(index: number, patch: any) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function submit() {
    setError(null);
    if (!storeId) {
      setError('Please choose the receiving store.');
      return;
    }
    const clean = lines
      .filter((l) => l.itemName && String(l.itemName).trim())
      .map((l) => ({
        itemName: String(l.itemName).trim(),
        medicineId: l.medicineId || undefined,
        quantity: Number(l.quantity) > 0 ? Number(l.quantity) : 1,
        unitPrice: Number(l.unitPrice) || 0,
        batchNumber: l.batchNumber.trim() || undefined,
        expiryDate: l.expiryDate || undefined,
      }));
    if (clean.length === 0) {
      setError('Add at least one item to receive.');
      return;
    }
    setSaving(true);
    try {
      await api('/procurement/goods-receipts', {
        method: 'POST',
        body: JSON.stringify({
          purchaseOrderId: order.id,
          supplierId: order.supplierId,
          storeId,
          invoiceNumber: invoiceNumber.trim() || undefined,
          remarks: remarks.trim() || undefined,
          items: clean,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record goods receipt');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Receive Stock — {order.poNumber}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="note" style={{ marginBottom: 12 }}>
          Supplier: {supplier?.name || '—'}
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="label">Receiving Store *</label>
            <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">— Select store —</option>
              {stores.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Invoice Number</label>
            <input className="input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-001" />
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 100 }}>Unit Price</th>
                <th style={{ width: 130 }}>Batch #</th>
                <th style={{ width: 150 }}>Expiry Date</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <strong>{l.itemName}</strong>
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={l.unitPrice}
                      onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={l.batchNumber}
                      onChange={(e) => updateLine(i, { batchNumber: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="date"
                      value={l.expiryDate}
                      onChange={(e) => updateLine(i, { expiryDate: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">Remarks</label>
          <textarea
            className="textarea"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={saving}>
            {saving ? 'Receiving…' : 'Receive Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convert an approved purchase request into a purchase order
// ---------------------------------------------------------------------------

function ConvertToPoModal({
  request,
  stores,
  suppliers,
  onClose,
  onDone,
}: {
  request: any;
  stores: any[];
  suppliers: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSaving(true);
    try {
      await api(`/procurement/purchase-requests/${request.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          supplierId: supplierId || undefined,
          storeId: storeId || undefined,
          expectedDate: expectedDate || undefined,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert request');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Convert to Purchase Order</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="note" style={{ marginBottom: 12 }}>
          {request.requestNumber} — {Array.isArray(request.items) ? request.items.length : 0} line item(s) will be
          carried over with their estimated prices.
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="label">Supplier</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Select supplier —</option>
              {suppliers.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label">Receiving Store</label>
            <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">— Select store —</option>
              {stores.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field field-full">
            <label className="label">Expected Delivery</label>
            <input className="input" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={saving}>
            {saving ? 'Converting…' : 'Convert to PO'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adjust stock for an inventory item
// ---------------------------------------------------------------------------

function AdjustStockModal({
  item,
  onClose,
  onDone,
}: {
  item: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<'RECEIPT' | 'ISSUE' | 'ADJUSTMENT' | 'RETURN' | 'CONSUMPTION' | 'OPENING'>('ADJUSTMENT');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT');
  const [quantity, setQuantity] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setError('Enter a positive quantity.');
      return;
    }
    setSaving(true);
    try {
      await api(`/pharmacy/inventory/${item.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          type,
          quantity: qty,
          direction: type === 'ADJUSTMENT' ? direction : undefined,
          remarks: remarks.trim() || undefined,
        }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust stock');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Adjust Stock — {item.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="note" style={{ marginBottom: 12 }}>
          Current stock: <strong>{Number(item.currentStock) || 0}</strong> in {item.store?.name || 'store'}
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="label">Type</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="RECEIPT">RECEIPT (stock in)</option>
              <option value="ISSUE">ISSUE (stock out)</option>
              <option value="CONSUMPTION">CONSUMPTION (stock out)</option>
              <option value="RETURN">RETURN (stock in)</option>
              <option value="ADJUSTMENT">ADJUSTMENT</option>
              <option value="OPENING">OPENING</option>
            </select>
          </div>
          {type === 'ADJUSTMENT' && (
            <div className="field">
              <label className="label">Direction</label>
              <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as any)}>
                <option value="OUT">OUT (reduce stock)</option>
                <option value="IN">IN (increase stock)</option>
              </select>
            </div>
          )}
          <div className="field">
            <label className="label">Quantity</label>
            <input className="input" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="field field-full">
            <label className="label">Remarks</label>
            <textarea className="textarea" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Apply Adjustment'}
          </button>
        </div>
      </div>
    </div>
  );
}