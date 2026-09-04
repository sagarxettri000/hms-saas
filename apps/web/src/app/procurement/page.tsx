'use client';

import { useEffect, useState } from 'react';
import EntityPage from '@/components/EntityPage';
import { api, unwrap } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/hooks';

type Tab = 'orders' | 'requests' | 'items' | 'transfers' | 'expiry';

interface StockTransfer {
  id: string;
  date: string;
  fromStore: string;
  toStore: string;
  item: string;
  quantity: number;
  status: string;
}

interface ExpiryEntry {
  expiryDate: string;
  removed: boolean;
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const EXPIRY_WINDOW_DAYS = 30;

export default function ProcurementPage() {
  const [tab, setTab] = useState<Tab>('orders');
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [transferForm, setTransferForm] = useState({ fromStore: '', toStore: '', item: '', quantity: '' });

  const [expiryItems, setExpiryItems] = useState<any[]>([]);
  const [loadingExpiry, setLoadingExpiry] = useState(false);
  const [expiryMap, setExpiryMap] = useState<Record<string, ExpiryEntry>>({});

  useEffect(() => {
    api('/procurement/suppliers?limit=500')
      .then((r) => {
        const data = unwrap(r);
        setSuppliers(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    api('/procurement/transfers?limit=200')
      .then((r) => {
        const data = unwrap(r);
        const rows = Array.isArray(data) ? data : [];
        setTransfers(
          rows.map((row: any) => ({
            id: row.id,
            date: row.transferredAt,
            fromStore: row.fromStore,
            toStore: row.toStore,
            item: row.itemName,
            quantity: Number(row.quantity) || 0,
            status: row.status,
          }))
        );
      })
      .catch(() => setTransfers([]));
    setExpiryMap(readLS<Record<string, ExpiryEntry>>('item_expiry_dates', {}));
  }, []);

  useEffect(() => {
    if (tab !== 'expiry') return;
    setLoadingExpiry(true);
    api('/pharmacy/inventory?limit=200')
      .then((r) => {
        const data = unwrap(r);
        setExpiryItems(Array.isArray(data) ? data : []);
      })
      .catch(() => setExpiryItems([]));
    setLoadingExpiry(false);
  }, [tab]);

  const addTransfer = () => {
    if (!transferForm.fromStore.trim() || !transferForm.toStore.trim() || !transferForm.item.trim()) return;
    api('/procurement/transfers', {
      method: 'POST',
      body: JSON.stringify({
        fromStore: transferForm.fromStore,
        toStore: transferForm.toStore,
        itemName: transferForm.item,
        quantity: Number(transferForm.quantity) || 0,
      }),
    })
      .then(() => {
        setTransferForm({ fromStore: '', toStore: '', item: '', quantity: '' });
        return api('/procurement/transfers?limit=200').then((r) => {
          const data = unwrap(r);
          const rows = Array.isArray(data) ? data : [];
          setTransfers(
            rows.map((row: any) => ({
              id: row.id,
              date: row.transferredAt,
              fromStore: row.fromStore,
              toStore: row.toStore,
              item: row.itemName,
              quantity: Number(row.quantity) || 0,
              status: row.status,
            }))
          );
        });
      })
      .catch(() => {});
  };

  const totalMoved = transfers.reduce((sum, t) => sum + (t.quantity || 0), 0);

  const todayMs = new Date().toISOString().slice(0, 10);
  const expiryRows = expiryItems
    .map((item: any) => {
      const entry = expiryMap[item.id];
      const raw = entry?.expiryDate || item.expiryDate || '';
      let state: 'expired' | 'expiring' | 'safe' | 'none' = 'none';
      if (raw) {
        const diffDays = Math.round((new Date(raw).getTime() - new Date(todayMs).getTime()) / 86400000);
        if (diffDays < 0) state = 'expired';
        else if (diffDays <= EXPIRY_WINDOW_DAYS) state = 'expiring';
        else state = 'safe';
      }
      return { ...item, effectiveExpiry: raw, state };
    })
    .sort((a, b) => {
      if (!a.effectiveExpiry) return 1;
      if (!b.effectiveExpiry) return -1;
      return a.effectiveExpiry.localeCompare(b.effectiveExpiry);
    });

  const expiredCount = expiryRows.filter((r) => r.state === 'expired').length;
  const expiringCount = expiryRows.filter((r) => r.state === 'expiring').length;
  const safeCount = expiryRows.filter((r) => r.state === 'safe').length;

  const setItemExpiry = (id: string, value: string) => {
    const next: Record<string, ExpiryEntry> = {
      ...expiryMap,
      [id]: { expiryDate: value, removed: expiryMap[id]?.removed ?? false },
    };
    setExpiryMap(next);
    writeLS('item_expiry_dates', next);
  };

  const markRemoved = (id: string) => {
    const next: Record<string, ExpiryEntry> = {
      ...expiryMap,
      [id]: { expiryDate: expiryMap[id]?.expiryDate ?? '', removed: true },
    };
    setExpiryMap(next);
    writeLS('item_expiry_dates', next);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Procurement</h1>
          <p className="page-subtitle">Purchase orders, requests, inventory items, transfers and expiry tracking</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>Purchase Orders</button>
        <button className={`tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>Purchase Requests</button>
        <button className={`tab ${tab === 'items' ? 'active' : ''}`} onClick={() => setTab('items')}>Inventory Items</button>
        <button className={`tab ${tab === 'transfers' ? 'active' : ''}`} onClick={() => setTab('transfers')}>Stock Transfers</button>
        <button className={`tab ${tab === 'expiry' ? 'active' : ''}`} onClick={() => setTab('expiry')}>Expiry Tracking</button>
      </div>

      {tab === 'orders' && (
        <EntityPage
          title="Purchase Orders"
          subtitle="Manage purchase orders"
          endpoint="/procurement/purchase-orders"
          createLabel="New PO"
          columns={[
            { key: 'poNumber', label: 'PO Number', render: (r) => <span className="mono">{r.poNumber}</span> },
            { key: 'supplier', label: 'Supplier', render: (r) => r.supplier?.name || '—' },
            { key: 'status', label: 'Status', badge: true },
            { key: 'totalAmount', label: 'Total', render: (r) => formatMoney(r.totalAmount) },
            { key: 'orderDate', label: 'Date', render: (r) => formatDate(r.orderDate) },
          ]}
          fields={[
            { name: 'supplierId', label: 'Supplier', type: 'select', options: suppliers.map((s: any) => ({ value: s.id, label: s.name })) },
            { name: 'expectedDate', label: 'Expected Date', type: 'date' },
            { name: 'deliveryAddress', label: 'Delivery Address', full: true },
            { name: 'terms', label: 'Terms', full: true },
            { name: 'notes', label: 'Notes', full: true },
            { name: 'items', label: 'Items', type: 'json', required: true, full: true, hint: '[{itemName, quantity, unitPrice, medicineId?}]' },
          ]}
        />
      )}

      {tab === 'requests' && (
        <EntityPage
          title="Purchase Requests"
          subtitle="Track and approve purchase requests"
          endpoint="/procurement/purchase-requests"
          createLabel="New request"
          columns={[
            { key: 'requestNumber', label: 'Request #', render: (r) => <span className="mono">{r.requestNumber || '—'}</span> },
            { key: 'requestedBy', label: 'Requested By', render: (r) => r.requestedBy?.name || [r.requestedBy?.firstName, r.requestedBy?.lastName].filter(Boolean).join(' ') || '—' },
            { key: 'department', label: 'Department', render: (r) => r.department?.name || '—' },
            { key: 'status', label: 'Status', badge: true },
            { key: 'neededBy', label: 'Needed By', render: (r) => formatDate(r.neededBy || r.requiredDate) },
            { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) },
          ]}
          fields={[
            { name: 'departmentId', label: 'Department', type: 'select', optionsFrom: { valueKey: 'id', labelKeys: ['name'], endpoint: '/departments' } },
            { name: 'neededBy', label: 'Needed By', type: 'date' },
            { name: 'priority', label: 'Priority', type: 'select', options: [{ value: 'LOW', label: 'LOW' }, { value: 'NORMAL', label: 'NORMAL' }, { value: 'HIGH', label: 'HIGH' }, { value: 'URGENT', label: 'URGENT' }] },
            { name: 'justification', label: 'Justification', type: 'textarea', full: true },
            { name: 'notes', label: 'Notes', type: 'textarea', full: true },
          ]}
        />
      )}

      {tab === 'items' && (
        <EntityPage
          title="Inventory Items"
          subtitle="Manage procurement catalog and stock"
          endpoint="/pharmacy/inventory"
          createLabel="Add item"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'sku', label: 'SKU', render: (r) => <span className="mono">{r.sku || r.code || '—'}</span> },
            { key: 'itemType', label: 'Type', render: (r) => r.itemType || '—' },
            { key: 'store', label: 'Store', render: (r) => r.store?.name || '—' },
            { key: 'currentStock', label: 'Qty', render: (r) => r.currentStock ?? r.quantity ?? '—' },
            { key: 'purchaseRate', label: 'Unit Price', render: (r) => formatMoney(r.purchaseRate ?? r.unitPrice) },
            { key: 'reorderLevel', label: 'Reorder', render: (r) => r.reorderLevel ?? '—' },
            { key: 'isActive', label: 'Status', badge: true },
          ]}
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'storeId', label: 'Store', required: true, type: 'select', optionsFrom: { endpoint: '/pharmacy/stores', valueKey: 'id', labelKeys: ['name'] } },
            { name: 'itemType', label: 'Type', type: 'select', options: [{ value: 'MEDICINE', label: 'MEDICINE' }, { value: 'SUPPLIES', label: 'SUPPLIES' }, { value: 'EQUIPMENT', label: 'EQUIPMENT' }, { value: 'CONSUMABLE', label: 'CONSUMABLE' }, { value: 'OTHER', label: 'OTHER' }] },
            { name: 'sku', label: 'SKU / Code' },
            { name: 'unit', label: 'Unit' },
            { name: 'currentStock', label: 'Quantity', type: 'number' },
            { name: 'purchaseRate', label: 'Unit Price', type: 'number' },
            { name: 'reorderLevel', label: 'Reorder Level', type: 'number' },
            { name: 'location', label: 'Location' },
          ]}
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
                {transfers.filter((tr) => tr.date.slice(0, 7) === new Date().toISOString().slice(0, 7)).length}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Last Transfer</div>
              <div className="stat-value" style={{ fontSize: 18 }}>
                {transfers.length ? formatDate(transfers[transfers.length - 1].date) : '—'}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Transfer Stock</h3>
            <div className="form-grid">
              <div className="field">
                <label className="label">From Store *</label>
                <input className="input" value={transferForm.fromStore} onChange={(e) => setTransferForm({ ...transferForm, fromStore: e.target.value })} placeholder="e.g. Main Store" />
              </div>
              <div className="field">
                <label className="label">To Store *</label>
                <input className="input" value={transferForm.toStore} onChange={(e) => setTransferForm({ ...transferForm, toStore: e.target.value })} placeholder="e.g. Pharmacy Store" />
              </div>
              <div className="field">
                <label className="label">Item *</label>
                <input className="input" value={transferForm.item} onChange={(e) => setTransferForm({ ...transferForm, item: e.target.value })} placeholder="Item name or SKU" />
              </div>
              <div className="field">
                <label className="label">Quantity</label>
                <input className="input" type="number" min="1" value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-sm" onClick={addTransfer}>+ Record Transfer</button>
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
                  {[...transfers].reverse().map((tr) => (
                    <tr key={tr.id}>
                      <td>{formatDate(tr.date)}</td>
                      <td><strong>{tr.fromStore}</strong></td>
                      <td><strong>{tr.toStore}</strong></td>
                      <td>{tr.item}</td>
                      <td>{tr.quantity}</td>
                      <td><span className="badge badge-green">{tr.status.replace(/_/g, ' ')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'expiry' && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Tracked Items</div>
              <div className="stat-value">{expiryRows.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Expired</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{expiredCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Expiring ({EXPIRY_WINDOW_DAYS}d)</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{expiringCount}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Safe</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{safeCount}</div>
            </div>
          </div>

          {loadingExpiry ? (
            <div className="loading">Loading inventory items...</div>
          ) : expiryRows.length === 0 ? (
            <div className="empty">No inventory items found.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Expiry Date</th>
                    <th>Status</th>
                    <th>Value</th>
                    <th style={{ width: 1 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryRows.map((item) => {
                    const removed = expiryMap[item.id]?.removed ?? false;
                    return (
                      <tr key={item.id} style={removed ? { opacity: 0.5 } : undefined}>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.category || '—'}</td>
                        <td>
                          <input
                            className="input"
                            type="date"
                            style={{ maxWidth: 170 }}
                            value={item.effectiveExpiry}
                            onChange={(e) => setItemExpiry(item.id, e.target.value)}
                          />
                        </td>
                        <td>
                          {removed ? (
                            <span className="badge badge-gray">REMOVED</span>
                          ) : item.state === 'expired' ? (
                            <span className="badge badge-red">EXPIRED</span>
                          ) : item.state === 'expiring' ? (
                            <span className="badge badge-yellow">EXPIRING SOON</span>
                          ) : item.state === 'safe' ? (
                            <span className="badge badge-green">SAFE</span>
                          ) : (
                            <span className="badge badge-gray">NO DATE</span>
                          )}
                        </td>
                        <td>{item.unitPrice != null ? formatMoney(Number(item.unitPrice) * Number(item.quantity ?? 0)) : formatMoney(item.unitPrice)}</td>
                        <td>
                          {!removed && (
                            <button className="btn btn-sm btn-secondary" onClick={() => markRemoved(item.id)}>Mark Removed</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}