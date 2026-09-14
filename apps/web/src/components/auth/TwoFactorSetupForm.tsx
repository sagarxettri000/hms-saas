'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import QRCode from 'qrcode';

export default function TwoFactorSetupForm({
  bearerToken,
  onEnabled,
  variant = 'dark',
}: {
  bearerToken?: string | null;
  onEnabled: () => void;
  variant?: 'light' | 'dark';
}) {
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const authHeaders: Record<string, string> | undefined = bearerToken
    ? { Authorization: `Bearer ${bearerToken}` }
    : undefined;

  const light = variant === 'light';
  const c = light
    ? {
        body: 'var(--text-muted)',
        faint: 'var(--text-muted)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        keyText: 'var(--primary-dark)',
        keyBg: 'var(--primary-light)',
        inputBg: 'var(--bg)',
        inputBorder: 'var(--border-strong)',
        inputText: 'var(--text)',
        buttonBg: 'var(--primary)',
      }
    : {
        body: 'rgba(255,255,255,0.65)',
        faint: 'rgba(255,255,255,0.4)',
        danger: '#f87171',
        success: '#4ade80',
        keyText: '#55d9ff',
        keyBg: 'rgba(85,217,255,0.08)',
        inputBg: 'rgba(255,255,255,0.06)',
        inputBorder: 'rgba(85,217,255,0.12)',
        inputText: '#fff',
        buttonBg: '#0e7490',
      };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/auth/2fa/setup', {
          method: 'POST',
          body: JSON.stringify({}),
          headers: authHeaders,
        });
        if (cancelled) return;
        const root = res?.data ?? res;
        setSecret(root.secret ?? null);
        setOtpauthUrl(root.otpauthUrl ?? null);
        if (root.otpauthUrl) {
          const url = await QRCode.toDataURL(root.otpauthUrl, { width: 220, margin: 1 });
          if (!cancelled) setQrDataUrl(url);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to start setup');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setEnabling(true);
    setError(null);
    try {
      await api('/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
        headers: authHeaders,
      });
      setSuccess('Two-factor authentication is now enabled for your account.');
      setTimeout(onEnabled, 900);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to verify code';
      setError(/invalid|incorrect|not set/i.test(msg) ? 'The code is incorrect or has expired. Try again.' : msg);
    } finally {
      setEnabling(false);
    }
  }

  if (loading) {
    return <p style={{ textAlign: 'center', color: c.faint, fontSize: 13 }}>Preparing setup...</p>;
  }

  if (error && !secret) {
    return <p style={{ textAlign: 'center', color: c.danger, fontSize: 13 }}>{error}</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <p style={{ color: c.body, fontSize: 13, lineHeight: 1.6, textAlign: 'center', maxWidth: 420 }}>
        Scan the QR code with your authenticator app (Google Authenticator, Authy, or similar). If you cannot scan, enter
        the setup key manually. Then enter the 6-digit code to confirm.
      </p>

      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt="2FA setup QR code"
          style={{ width: 220, height: 220, borderRadius: 10, background: '#fff', padding: 8 }}
        />
      )}

      {secret && (
        <div>
          <div style={{ fontSize: 11, color: c.faint, textAlign: 'center', marginBottom: 4 }}>
            Manual setup key
          </div>
          <code
            style={{
              fontSize: 13, color: c.keyText, background: c.keyBg,
              padding: '6px 10px', borderRadius: 8, wordBreak: 'break-all',
            }}
          >
            {secret}
          </code>
        </div>
      )}

      <form onSubmit={enable} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 340 }}>
        <input
          inputMode="numeric"
          maxLength={6}
          placeholder="6-digit code"
          value={code}
          onChange={(e) => { setCode(e.target.value); if (error) setError(null); }}
          style={{
            background: c.inputBg, border: `1px solid ${c.inputBorder}`, color: c.inputText,
            borderRadius: 8, padding: '10px 12px', fontSize: 14, textAlign: 'center', letterSpacing: 4,
            outline: 'none',
          }}
        />

        {error && <p style={{ color: c.danger, fontSize: 13, textAlign: 'center', margin: 0 }}>{error}</p>}
        {success && <p style={{ color: c.success, fontSize: 13, textAlign: 'center', margin: 0 }}>{success}</p>}

        <button
          type="submit"
          disabled={enabling}
          style={{
            background: c.buttonBg, color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px', fontSize: 14, fontWeight: 600, cursor: enabling ? 'default' : 'pointer', opacity: enabling ? 0.6 : 1,
          }}
        >
          {enabling ? 'Verifying…' : 'Enable 2FA'}
        </button>
      </form>
    </div>
  );
}