'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import TwoFactorSetupForm from '@/components/auth/TwoFactorSetupForm';
import '../login/login.css';
import '../auth.css';

export default function TwoFactorSetupPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const t =
        typeof window !== 'undefined'
          ? sessionStorage.getItem('twoFactorSetupToken')
          : null;
      if (t) {
        sessionStorage.removeItem('twoFactorSetupToken');
        setToken(t);
        setReady(true);
        return;
      }
      try {
        await api('/auth/me');
        setToken(null);
        setReady(true);
      } catch {
        router.replace('/login');
      }
    })();
  }, [router]);

  if (!ready) return null;

  return (
    <AuthShell mode="login" heading="Set up two-factor authentication">
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 14 }}>
        Your organisation requires two-factor authentication. Set it up below — you will sign in again right after.
      </p>
      <TwoFactorSetupForm
        bearerToken={token}
        onEnabled={() => router.push('/login?2fa=set')}
      />
      <p className="auth-register-text" style={{ marginTop: 16 }}>
        <Link href="/login" className="auth-register-link">
          Back to login
        </Link>
      </p>
    </AuthShell>
  );
}