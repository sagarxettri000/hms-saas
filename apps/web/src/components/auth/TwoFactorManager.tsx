'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import TwoFactorSetupForm from '@/components/auth/TwoFactorSetupForm';

export default function TwoFactorManager() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api('/auth/me');
        setEnabled(res.data?.twoFactorEnabled === true);
      } catch {
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });
      setEnabled(false);
      setCode('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disable two-factor authentication';
      setError(/invalid|incorrect|required|enforced|policy/i.test(msg)
        ? msg
        : 'Could not disable 2FA. Check your code and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 20,
        border: '1px solid rgba(85,217,255,0.15)',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.02)',
        padding: 18,
        maxWidth: 560,
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--text, #e2f3ff)' }}>
        Two-factor authentication
      </h2>

      {loading ? (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Checking your security settings…</p>
      ) : enabled ? (
        <>
          <p style={{ fontSize: 13, color: '#4ade80', margin: '4px 0 12px' }}>
            Enabled — your account is protected by an authenticator code.
          </p>
          <form onSubmit={disable} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => { setCode(e.target.value); if (error) setError(null); }}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(85,217,255,0.12)',
                color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 14, letterSpacing: 4,
                outline: 'none', width: 160,
              }}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                border: '1px solid rgba(248,113,113,0.4)', color: '#f87171', background: 'transparent',
                borderRadius: 8, padding: '8px 12px', fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? 'Disabling…' : 'Disable 2FA'}
            </button>
          </form>
          {error && <p style={{ fontSize: 13, color: '#f87171', margin: '8px 0 0' }}>{error}</p>}
        </>
      ) : showSetup ? (
        <TwoFactorSetupForm onEnabled={() => { setShowSetup(false); setEnabled(true); }} />
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: '4px 0 12px' }}>
            Your account is not protected by two-factor authentication. You can enable it with any
            authenticator app (Google Authenticator, Authy, or similar).
          </p>
          <button
            type="button"
            onClick={() => setShowSetup(true)}
            style={{
              background: '#0e7490', color: '#fff', border: 'none', borderRadius: 8,
              padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Enable 2FA
          </button>
        </>
      )}
    </div>
  );
}