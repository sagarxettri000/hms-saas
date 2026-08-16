'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const PROVIDERS: {
  provider: string;
  name: string;
  description: string;
  fields: { key: string; label: string; secret?: boolean; hint?: string }[];
}[] = [
  {
    provider: 'SMTP_EMAIL',
    name: 'Email (SMTP)',
    description: 'Send transactional emails (invoices, reports, alerts).',
    fields: [
      { key: 'host', label: 'SMTP host', hint: 'e.g. smtp.example.com' },
      { key: 'port', label: 'Port', hint: 'e.g. 587' },
      { key: 'user', label: 'Username' },
      { key: 'password', label: 'Password', secret: true },
      { key: 'fromEmail', label: 'From email' },
      { key: 'fromName', label: 'From name' },
      { key: 'secure', label: 'Use TLS', hint: 'true or false' },
    ],
  },
  {
    provider: 'SMS_GATEWAY',
    name: 'SMS',
    description: 'Send SMS notifications to patients and staff.',
    fields: [
      { key: 'provider', label: 'Gateway provider', hint: 'e.g. twilio, msg91, bulkSms' },
      { key: 'apiKey', label: 'API key', secret: true },
      { key: 'apiSecret', label: 'API secret', secret: true },
      { key: 'senderId', label: 'Sender ID' },
    ],
  },
  {
    provider: 'OBJECT_STORAGE',
    name: 'Object storage',
    description: 'Store uploads (scans, reports, receipts).',
    fields: [
      { key: 'provider', label: 'Provider', hint: 'e.g. s3, wasabi, backblaze' },
      { key: 'endpoint', label: 'Endpoint URL' },
      { key: 'bucket', label: 'Bucket' },
      { key: 'region', label: 'Region' },
      { key: 'accessKeyId', label: 'Access key ID', secret: true },
      { key: 'secretAccessKey', label: 'Secret access key', secret: true },
    ],
  },
  {
    provider: 'FHIR',
    name: 'FHIR interoperability',
    description: 'Expose HL7 FHIR resources for external systems.',
    fields: [
      { key: 'baseUrl', label: 'Base URL', hint: 'Public URL of the FHIR endpoint' },
      { key: 'authToken', label: 'Auth token', secret: true },
    ],
  },
];

function mask(value: string): string {
  if (!value) return '';
  return value.length <= 4 ? '••••' : '••••••••' + value.slice(-4);
}

function ConfigForm({
  provider,
  config,
  onSave,
  onCancel,
}: {
  provider: string;
  config: Record<string, any>;
  onSave: (config: Record<string, any>) => Promise<void>;
  onCancel: () => void;
}) {
  const meta = PROVIDERS.find((p) => p.provider === provider);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of meta?.fields || []) {
      const v = config?.[f.key];
      init[f.key] = v === undefined || v === null ? '' : String(v);
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const out: Record<string, any> = {};
      for (const f of meta?.fields || []) {
        const raw = values[f.key] || '';
        if (f.secret && raw.startsWith('••••')) continue;
        if (f.key === 'secure') {
          out[f.key] = raw === 'true';
        } else if (f.key === 'port') {
          out[f.key] = raw ? Number(raw) : undefined;
        } else {
          out[f.key] = raw || undefined;
        }
      }
      await onSave(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" style={{ padding: 16, marginTop: 12 }} onSubmit={submit}>
      <h4 className="card-title" style={{ marginTop: 0 }}>
        Configure {meta?.name || provider}
      </h4>
      <div className="form-grid">
        {meta?.fields.map((f) => (
          <div key={f.key} className="field">
            <label className="label" htmlFor={`${provider}-${f.key}`}>{f.label}</label>
            <input
              id={`${provider}-${f.key}`}
              className="input"
              type={f.secret ? 'password' : 'text'}
              placeholder={f.secret && config?.[f.key] ? mask(String(config[f.key])) : ''}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
            {f.hint && <span className="note">{f.hint}</span>}
          </div>
        ))}
      </div>
      {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="form-actions" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn" disabled={saving}>
          {saving ? 'Saving…' : 'Save config'}
        </button>
      </div>
    </form>
  );
}

export default function IntegrationSettings() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    api('/settings/integrations')
      .then((res) => {
        const data = res?.data ?? res;
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(item: any, enabled: boolean) {
    setError(null);
    try {
      await api(`/settings/integrations/${item.provider}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled, config: item.config ?? {} }),
      });
      setItems((prev) =>
        prev.map((i) => (i.provider === item.provider ? { ...i, enabled } : i)),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function saveConfig(item: any, config: Record<string, any>) {
    await api(`/settings/integrations/${item.provider}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: item.enabled, config }),
    });
    setItems((prev) =>
      prev.map((i) => (i.provider === item.provider ? { ...i, config } : i)),
    );
    setEditing(null);
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const known = items.filter((i) => PROVIDERS.some((p) => p.provider === i.provider));
  const custom = items.filter((i) => !PROVIDERS.some((p) => p.provider === i.provider));

  return (
    <div>
      {known.length === 0 && custom.length === 0 && <div className="empty">No integrations configured.</div>}

      {PROVIDERS.map((meta) => {
        const item = items.find((i) => i.provider === meta.provider);
        const configured = Boolean(item?.config && Object.keys(item.config).length);
        return (
          <div key={meta.provider} className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div className="row-between">
              <div>
                <strong>{meta.name}</strong>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{meta.description}</div>
                {configured && (
                  <span className="badge badge-green" style={{ marginTop: 6 }}>
                    Configured
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(editing === meta.provider ? null : meta.provider)}>
                  {editing === meta.provider ? 'Close' : 'Configure'}
                </button>
                <button
                  className={item?.enabled ? 'btn btn-sm' : 'btn btn-secondary btn-sm'}
                  onClick={() => toggle(item ?? { provider: meta.provider, config: {} }, !item?.enabled)}
                >
                  {item?.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
            {editing === meta.provider && (
              <ConfigForm
                provider={meta.provider}
                config={item?.config ?? {}}
                onSave={(config) => saveConfig(item ?? { provider: meta.provider, config: {}, enabled: false }, config)}
                onCancel={() => setEditing(null)}
              />
            )}
          </div>
        );
      })}

      {custom.length > 0 && (
        <div className="card" style={{ padding: 14 }}>
          <h4 className="card-title" style={{ marginTop: 0 }}>Other providers</h4>
          {custom.map((item) => (
            <div key={item.provider} className="row-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <strong>{item.provider}</strong>
              </div>
              <button
                className={item.enabled ? 'btn btn-sm' : 'btn btn-secondary btn-sm'}
                onClick={() => toggle(item, !item.enabled)}
              >
                {item.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
