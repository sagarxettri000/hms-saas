'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const PROFILE_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: 'name', label: 'Hospital name' },
  { key: 'panNumber', label: 'Hospital PAN number', hint: 'Shown on invoices & receipts. Leave empty to hide it.' },
  { key: 'vatNumber', label: 'VAT number' },
  { key: 'registrationNumber', label: 'Registration number' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'addressLine1', label: 'Address line 1' },
  { key: 'addressLine2', label: 'Address line 2' },
  { key: 'city', label: 'City' },
  { key: 'district', label: 'District' },
  { key: 'province', label: 'Province' },
  { key: 'country', label: 'Country' },
  { key: 'postalCode', label: 'Postal code' },
];

export default function OrgProfile() {
  const [id, setId] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
        let tenant: any = storedId ? await api(`/tenants/${storedId}`) : null;
        if (!tenant) {
          const list = await api('/tenants');
          tenant = Array.isArray(list) ? list[0] : list?.data?.data?.[0] ?? list?.data?.[0] ?? null;
        }
        if (!tenant) throw new Error('No hospital profile was found for your workspace.');
        if (cancelled) return;
        setId(tenant.id);
        const next: Record<string, string> = {};
        for (const f of PROFILE_FIELDS) next[f.key] = tenant[f.key] ?? '';
        setForm(next);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function set(key: string, value: string) {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!id) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload: Record<string, string> = {};
      for (const f of PROFILE_FIELDS) payload[f.key] = (form[f.key] ?? '').trim();
      await api(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      localStorage.setItem('tenantName', payload.name || localStorage.getItem('tenantName') || '');
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Loading hospital profile…</div>;
  if (error && !id) return <div className="alert alert-error">{error}</div>;

  return (
    <form onSubmit={save} className="card" style={{ padding: 20 }}>
      <div className="note" style={{ marginBottom: 14 }}>
        Hospital details shown on invoices and receipts. PAN / VAT (inserted when the invoice is
        opened or downloaded) read straight from this profile, so updating here updates every
        invoice instantly.
      </div>

      <div className="form-grid">
        <div className="field">
          <label className="label">Hospital name</label>
          <input className="input" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Hospital PAN number</label>
          <input
            className="input"
            value={form.panNumber ?? ''}
            onChange={(e) => set('panNumber', e.target.value)}
            placeholder="e.g. 303xxxxxx"
          />
        </div>
        <div className="field">
          <label className="label">VAT number</label>
          <input
            className="input"
            value={form.vatNumber ?? ''}
            onChange={(e) => set('vatNumber', e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Registration number</label>
          <input
            className="input"
            value={form.registrationNumber ?? ''}
            onChange={(e) => set('registrationNumber', e.target.value)}
          />
        </div>
      </div>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field">
          <label className="label">Phone</label>
          <input className="input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Website</label>
          <input className="input" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
        </div>
      </div>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field field-full">
          <label className="label">Address line 1</label>
          <input className="input" value={form.addressLine1 ?? ''} onChange={(e) => set('addressLine1', e.target.value)} />
        </div>
        <div className="field field-full">
          <label className="label">Address line 2</label>
          <input className="input" value={form.addressLine2 ?? ''} onChange={(e) => set('addressLine2', e.target.value)} />
        </div>
        <div className="field">
          <label className="label">City</label>
          <input className="input" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="field">
          <label className="label">District</label>
          <input className="input" value={form.district ?? ''} onChange={(e) => set('district', e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Province</label>
          <input className="input" value={form.province ?? ''} onChange={(e) => set('province', e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Country</label>
          <input className="input" value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Postal code</label>
          <input className="input" value={form.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} />
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div> : null}
      {saved ? (
        <div className="alert" style={{ marginTop: 16, background: 'var(--success-light)', color: 'var(--success)', border: '1px solid #bbf7d0' }}>
          Hospital profile saved. New invoices & receipts will use the updated PAN / VAT.
        </div>
      ) : null}

      <div className="form-actions" style={{ marginTop: 18 }}>
        <button className="btn" type="submit" disabled={saving || !id}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}