'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';

export default function SelectTenantPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    api('/tenants?limit=100')
      .then((res: any) => {
        const data = res?.data;
        setTenants(Array.isArray(data) ? data : data?.data ?? []);
      })
      .catch((err) => setError(err?.message || 'Failed to load tenants'))
      .finally(() => setLoading(false));
  }, [router]);

  function select(tenantId: string) {
    localStorage.setItem('tenantId', tenantId);
    router.push('/dashboard');
  }

  return (
    <AuthShell mode="login" heading="Select a Hospital">
      {loading && <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Loading...</p>}
      {error && <p style={{ textAlign: 'center', color: '#f87171', fontSize: 13 }}>{error}</p>}

      {!loading && !error && tenants.length === 0 && (
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>No hospitals found.</p>
      )}

      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        {tenants.map((t) => (
          <button
            key={t.id}
            onClick={() => select(t.id)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid rgba(85,217,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              cursor: 'pointer',
              color: '#fff',
              fontSize: 14,
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
          >
            <div style={{ fontWeight: 600 }}>{t.name}</div>
            {t.subdomain && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{t.subdomain}</div>
            )}
          </button>
        ))}
      </div>
    </AuthShell>
  );
}
