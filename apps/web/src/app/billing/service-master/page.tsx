'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/hooks';
import type { ApiResponse, Row } from '@/lib/types';

const SERVICE_TYPES = [
  'FIXED', 'PER_UNIT', 'PER_DAY', 'PER_HOUR', 'PER_VISIT',
  'PER_TEST', 'PER_PROCEDURE', 'PER_ITEM', 'PERCENTAGE', 'VARIABLE',
];

export default function ServiceMasterPage() {
  const [categories, setCategories] = useState<Row[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [services, setServices] = useState<Row[]>([]);
  const [svcLoading, setSvcLoading] = useState(true);
  const [totalServices, setTotalServices] = useState(0);
  const [departments, setDepartments] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [page, setPage] = useState(1);
  const [flash, setFlash] = useState<string | null>(null);

  const [showCatDialog, setShowCatDialog] = useState(false);
  const [editingCat, setEditingCat] = useState<Row | null>(null);
  const [catForm, setCatForm] = useState({ name: '', code: '', description: '', displayOrder: 0 });

  const [showSvcDialog, setShowSvcDialog] = useState(false);
  const [editingSvc, setEditingSvc] = useState<Row | null>(null);
  const emptySvcForm = {
    code: '', name: '', shortName: '', description: '', categoryId: '', departmentId: '',
    serviceType: 'PER_UNIT', unit: '', price: '', taxPercent: '',
    insuranceRate: '', patientRate: '', corporateRate: '', emergencyRate: '', nightRate: '', weekendRate: '',
    taxable: true, requiresDoctor: false, requiresDepartment: false, requiresQuantity: true,
    requiresApproval: false, isPackageService: false, isRoomCharge: false, isPharmacyItem: false,
    isConsumable: false, isInventoryItem: false, displayOrder: 0, isActive: true,
  };
  const [svcForm, setSvcForm] = useState(emptySvcForm);

  useEffect(() => {
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const loadCategories = useCallback(async () => {
    setCatLoading(true);
    try {
      const res: ApiResponse<any> = await api('/billing/service-categories?limit=100');
      const p = res.data as any;
      setCategories(Array.isArray(p) ? p : p.data ?? []);
    } catch { setCategories([]); } finally { setCatLoading(false); }
  }, []);

  const loadServices = useCallback(async () => {
    setSvcLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('page', String(page));
      q.set('limit', '20');
      if (search.trim()) q.set('search', search.trim());
      if (filterCat) q.set('categoryId', filterCat);
      if (filterDept) q.set('departmentId', filterDept);
      const res: ApiResponse<any> = await api(`/billing/services?${q.toString()}`);
      const p = res.data as any;
      setServices(Array.isArray(p) ? p : p.data ?? []);
      setTotalServices(Array.isArray(p) ? p.length : p.total ?? 0);
    } catch { setServices([]); setTotalServices(0); } finally { setSvcLoading(false); }
  }, [page, search, filterCat, filterDept]);

  const loadDepartments = useCallback(async () => {
    try {
      const res: ApiResponse<any> = await api('/departments?limit=500');
      const p = res.data as any;
      setDepartments(Array.isArray(p) ? p : p.data ?? []);
    } catch { setDepartments([]); }
  }, []);

  useEffect(() => { loadCategories(); loadDepartments(); }, [loadCategories, loadDepartments]);
  useEffect(() => { loadServices(); }, [loadServices]);

  const totalPages = Math.max(1, Math.ceil(totalServices / 20));

  async function handleSaveCategory() {
    try {
      const body: any = { name: catForm.name, code: catForm.code, description: catForm.description || undefined, displayOrder: catForm.displayOrder };
      if (editingCat) {
        await api(`/billing/service-categories/${editingCat.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/billing/service-categories', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowCatDialog(false); setEditingCat(null); setCatForm({ name: '', code: '', description: '', displayOrder: 0 });
      loadCategories(); setFlash(editingCat ? 'Category updated' : 'Category created');
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to save category'); }
  }

  async function toggleCategoryActive(cat: Row) {
    try {
      await api(`/billing/service-categories/${cat.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !cat.isActive }) });
      loadCategories(); setFlash('Category updated');
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to update'); }
  }

  async function handleSaveService() {
    try {
      const body: any = {
        code: svcForm.code, name: svcForm.name, shortName: svcForm.shortName || undefined,
        description: svcForm.description || undefined, categoryId: svcForm.categoryId || undefined,
        departmentId: svcForm.departmentId || undefined, serviceType: svcForm.serviceType,
        unit: svcForm.unit || undefined, price: svcForm.price ? Number(svcForm.price) : undefined,
        taxPercent: svcForm.taxPercent ? Number(svcForm.taxPercent) : undefined,
        insuranceRate: svcForm.insuranceRate ? Number(svcForm.insuranceRate) : undefined,
        patientRate: svcForm.patientRate ? Number(svcForm.patientRate) : undefined,
        corporateRate: svcForm.corporateRate ? Number(svcForm.corporateRate) : undefined,
        emergencyRate: svcForm.emergencyRate ? Number(svcForm.emergencyRate) : undefined,
        nightRate: svcForm.nightRate ? Number(svcForm.nightRate) : undefined,
        weekendRate: svcForm.weekendRate ? Number(svcForm.weekendRate) : undefined,
        taxable: svcForm.taxable, requiresDoctor: svcForm.requiresDoctor,
        requiresDepartment: svcForm.requiresDepartment, requiresQuantity: svcForm.requiresQuantity,
        requiresApproval: svcForm.requiresApproval, isPackageService: svcForm.isPackageService,
        isRoomCharge: svcForm.isRoomCharge, isPharmacyItem: svcForm.isPharmacyItem,
        isConsumable: svcForm.isConsumable, isInventoryItem: svcForm.isInventoryItem,
        displayOrder: svcForm.displayOrder, isActive: svcForm.isActive,
      };
      if (editingSvc) {
        await api(`/billing/services/${editingSvc.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await api('/billing/services', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowSvcDialog(false); setEditingSvc(null); setSvcForm(emptySvcForm);
      loadServices(); setFlash(editingSvc ? 'Service updated' : 'Service created');
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to save service'); }
  }

  function openEditCategory(c: Row) {
    setEditingCat(c);
    setCatForm({ name: c.name || '', code: c.code || '', description: c.description || '', displayOrder: c.displayOrder ?? 0 });
    setShowCatDialog(true);
  }

  function openNewCategory() {
    setEditingCat(null); setCatForm({ name: '', code: '', description: '', displayOrder: 0 }); setShowCatDialog(true);
  }

  function openEditService(s: Row) {
    setEditingSvc(s);
    setSvcForm({
      code: s.code || '', name: s.name || '', shortName: s.shortName || '', description: s.description || '',
      categoryId: s.categoryId || '', departmentId: s.departmentId || '', serviceType: s.serviceType || 'PER_UNIT',
      unit: s.unit || '', price: s.price != null ? String(s.price) : '', taxPercent: s.taxPercent != null ? String(s.taxPercent) : '',
      insuranceRate: s.insuranceRate != null ? String(s.insuranceRate) : '', patientRate: s.patientRate != null ? String(s.patientRate) : '',
      corporateRate: s.corporateRate != null ? String(s.corporateRate) : '', emergencyRate: s.emergencyRate != null ? String(s.emergencyRate) : '',
      nightRate: s.nightRate != null ? String(s.nightRate) : '', weekendRate: s.weekendRate != null ? String(s.weekendRate) : '',
      taxable: s.taxable !== false, requiresDoctor: s.requiresDoctor === true, requiresDepartment: s.requiresDepartment === true,
      requiresQuantity: s.requiresQuantity !== false, requiresApproval: s.requiresApproval === true,
      isPackageService: s.isPackageService === true, isRoomCharge: s.isRoomCharge === true,
      isPharmacyItem: s.isPharmacyItem === true, isConsumable: s.isConsumable === true,
      isInventoryItem: s.isInventoryItem === true, displayOrder: s.displayOrder ?? 0, isActive: s.isActive !== false,
    });
    setShowSvcDialog(true);
  }

  function openNewService() {
    setEditingSvc(null); setSvcForm(emptySvcForm); setShowSvcDialog(true);
  }

  function catName(id: string) {
    return categories.find((c) => c.id === id)?.name || '—';
  }
  function deptName(id: string) {
    return departments.find((d) => d.id === id)?.name || '—';
  }

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Service Master</h1>
          <p className="page-subtitle">Manage service categories and billing services</p>
        </div>
      </div>

      {flash && <div className="alert alert-success">{flash}</div>}

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Service Categories</h3>
          <button className="btn btn-sm" onClick={openNewCategory}>+ Add Category</button>
        </div>
        {catLoading ? <div className="loading">Loading...</div> : categories.length === 0 ? (
          <div className="empty"><div className="empty-state">No categories yet.</div></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Services</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td><span className="mono">{c.code}</span></td>
                    <td>{c.name}</td>
                    <td>{c._count?.services ?? c.serviceCount ?? 0}</td>
                    <td><span className={`badge badge-${c.isActive ? 'green' : 'gray'}`}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEditCategory(c)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggleCategoryActive(c)}>
                        {c.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Billing Services</h3>
          <button className="btn btn-sm" onClick={openNewService}>+ Add Service</button>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input search-input" placeholder="Search services..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ flex: '1 1 220px', minWidth: 180 }} />
          <select className="input" value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(1); }} style={{ width: 160 }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input" value={filterDept} onChange={(e) => { setFilterDept(e.target.value); setPage(1); }} style={{ width: 160 }}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        {svcLoading ? <div className="loading">Loading...</div> : services.length === 0 ? (
          <div className="empty"><div className="empty-state">No services found.</div></div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Department</th>
                    <th>Rate</th>
                    <th>Tax %</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.id}>
                      <td><span className="mono">{s.code}</span></td>
                      <td>{s.name}</td>
                      <td>{catName(s.categoryId)}</td>
                      <td>{deptName(s.departmentId)}</td>
                      <td className="mono">{formatMoney(s.price)}</td>
                      <td>{s.taxPercent != null ? `${s.taxPercent}%` : '—'}</td>
                      <td><span className="badge badge-blue">{s.serviceType || '—'}</span></td>
                      <td><span className={`badge badge-${s.isActive !== false ? 'green' : 'gray'}`}>{s.isActive !== false ? 'Active' : 'Inactive'}</span></td>
                      <td><button className="btn btn-sm btn-ghost" onClick={() => openEditService(s)}>Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-wrap" style={{ borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
              <div className="pagination">
                <span>{totalServices} service{totalServices === 1 ? '' : 's'}</span>
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                  <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
                  <span>Page {page} / {totalPages}</span>
                  <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showCatDialog && (
        <div className="modal-backdrop" onClick={() => setShowCatDialog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingCat ? 'Edit Category' : 'New Category'}</h3>
              <button className="modal-close" onClick={() => setShowCatDialog(false)}>×</button>
            </div>
            <div className="form-grid">
              <div className="field"><label className="label">Name *</label><input className="input" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
              <div className="field"><label className="label">Code *</label><input className="input" value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} disabled={!!editingCat} /></div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Description</label><textarea className="input" rows={2} value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} /></div>
              <div className="field"><label className="label">Display Order</label><input className="input" type="number" value={catForm.displayOrder} onChange={(e) => setCatForm({ ...catForm, displayOrder: Number(e.target.value) })} /></div>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowCatDialog(false)}>Cancel</button>
              <button className="btn" onClick={handleSaveCategory} disabled={!catForm.name || !catForm.code}>{editingCat ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {showSvcDialog && (
        <div className="modal-backdrop" onClick={() => setShowSvcDialog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingSvc ? 'Edit Service' : 'New Service'}</h3>
              <button className="modal-close" onClick={() => setShowSvcDialog(false)}>×</button>
            </div>
            <div className="form-grid">
              <div className="field"><label className="label">Code *</label><input className="input" value={svcForm.code} onChange={(e) => setSvcForm({ ...svcForm, code: e.target.value })} disabled={!!editingSvc} /></div>
              <div className="field"><label className="label">Name *</label><input className="input" value={svcForm.name} onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })} /></div>
              <div className="field"><label className="label">Short Name</label><input className="input" value={svcForm.shortName} onChange={(e) => setSvcForm({ ...svcForm, shortName: e.target.value })} /></div>
              <div className="field"><label className="label">Category</label>
                <select className="input" value={svcForm.categoryId} onChange={(e) => setSvcForm({ ...svcForm, categoryId: e.target.value })}>
                  <option value="">None</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field"><label className="label">Department</label>
                <select className="input" value={svcForm.departmentId} onChange={(e) => setSvcForm({ ...svcForm, departmentId: e.target.value })}>
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="field"><label className="label">Service Type</label>
                <select className="input" value={svcForm.serviceType} onChange={(e) => setSvcForm({ ...svcForm, serviceType: e.target.value })}>
                  {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}><label className="label">Description</label><textarea className="input" rows={2} value={svcForm.description} onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })} /></div>
              <div className="field"><label className="label">Price (₹)</label><input className="input" type="number" step="0.01" value={svcForm.price} onChange={(e) => setSvcForm({ ...svcForm, price: e.target.value })} /></div>
              <div className="field"><label className="label">Tax %</label><input className="input" type="number" step="0.01" value={svcForm.taxPercent} onChange={(e) => setSvcForm({ ...svcForm, taxPercent: e.target.value })} /></div>
              <div className="field"><label className="label">Unit</label><input className="input" value={svcForm.unit} onChange={(e) => setSvcForm({ ...svcForm, unit: e.target.value })} placeholder="e.g. per day, per item" /></div>
              <div className="field"><label className="label">Insurance Rate (₹)</label><input className="input" type="number" step="0.01" value={svcForm.insuranceRate} onChange={(e) => setSvcForm({ ...svcForm, insuranceRate: e.target.value })} /></div>
              <div className="field"><label className="label">Patient Rate (₹)</label><input className="input" type="number" step="0.01" value={svcForm.patientRate} onChange={(e) => setSvcForm({ ...svcForm, patientRate: e.target.value })} /></div>
              <div className="field"><label className="label">Corporate Rate (₹)</label><input className="input" type="number" step="0.01" value={svcForm.corporateRate} onChange={(e) => setSvcForm({ ...svcForm, corporateRate: e.target.value })} /></div>
              <div className="field"><label className="label">Emergency Rate (₹)</label><input className="input" type="number" step="0.01" value={svcForm.emergencyRate} onChange={(e) => setSvcForm({ ...svcForm, emergencyRate: e.target.value })} /></div>
              <div className="field"><label className="label">Night Rate (₹)</label><input className="input" type="number" step="0.01" value={svcForm.nightRate} onChange={(e) => setSvcForm({ ...svcForm, nightRate: e.target.value })} /></div>
              <div className="field"><label className="label">Weekend Rate (₹)</label><input className="input" type="number" step="0.01" value={svcForm.weekendRate} onChange={(e) => setSvcForm({ ...svcForm, weekendRate: e.target.value })} /></div>
              <div className="field"><label className="label">Display Order</label><input className="input" type="number" value={svcForm.displayOrder} onChange={(e) => setSvcForm({ ...svcForm, displayOrder: Number(e.target.value) })} /></div>
            </div>
            <div style={{ padding: '0 16px', marginTop: 8 }}>
              <label className="label" style={{ marginBottom: 8, display: 'block' }}>Flags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
                {([
                  ['taxable', 'Taxable'], ['requiresDoctor', 'Requires Doctor'], ['requiresDepartment', 'Requires Department'],
                  ['requiresQuantity', 'Requires Quantity'], ['requiresApproval', 'Requires Approval'],
                  ['isPackageService', 'Package Service'], ['isRoomCharge', 'Room Charge'],
                  ['isPharmacyItem', 'Pharmacy Item'], ['isConsumable', 'Consumable'], ['isInventoryItem', 'Inventory Item'],
                ] as [string, string][]).map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={(svcForm as any)[k]} onChange={(e) => setSvcForm({ ...svcForm, [k]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowSvcDialog(false)}>Cancel</button>
              <button className="btn" onClick={handleSaveService} disabled={!svcForm.code || !svcForm.name}>{editingSvc ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
