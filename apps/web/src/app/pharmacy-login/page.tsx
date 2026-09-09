'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import {
  AuthField,
  AuthButton,
  AuthError,
} from '@/components/auth/controls';
import '../auth.css';

export default function PharmacyLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const emailError =
    emailTouched && email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? 'Please enter a valid email address.'
      : null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password.trim() === '') {
      setPasswordTouched(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, rememberMe: true }),
      });
      const role = res.data.user.role;
      if (role !== 'PHARMACIST') {
        setError('Only pharmacy staff can sign in here.');
        return;
      }
      localStorage.setItem('role', role);
      localStorage.setItem(
        'userName',
        `${res.data.user.firstName} ${res.data.user.lastName}`,
      );
      if (res.data.user.tenantId) {
        localStorage.setItem('tenantId', res.data.user.tenantId);
        localStorage.setItem('tenantName', res.data.user.tenant?.name || 'Workspace');
      }
      if (res.data.user.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(
        typeof window !== 'undefined' && !navigator.onLine
          ? 'Unable to connect. Please try again.'
          : msg === 'Unauthorized' || /incorrect|invalid|Unauthorized/i.test(msg)
            ? 'Email or password is incorrect.'
            : /network|fetch|connect|ECONN|Failed to fetch/i.test(msg)
              ? 'Unable to connect. Please try again.'
              : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="login" heading="Pharmacy Login">
      <form className="auth-form" onSubmit={handleLogin} noValidate>
        <AuthField
          id="email"
          label="Pharmacy Email"
          type="email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (emailTouched) setEmailTouched(true);
          }}
          onBlurHandled={() => setEmailTouched(true)}
          error={emailError}
          autoComplete="email"
          placeholder="pharmacist@hospital.com"
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          onBlurHandled={() => setPasswordTouched(true)}
          error={passwordTouched && password.trim() === '' ? 'Password is required.' : null}
          autoComplete="current-password"
        />

        <div style={{ marginTop: '-4px' }}>
          <Link href="/forgot-password" className="auth-link">
            Forgot Password?
          </Link>
        </div>

        {error && <AuthError message={error} />}

        <AuthButton loading={loading} loadingText="Signing in…">
          Sign in to pharmacy
        </AuthButton>
      </form>

      <p className="auth-register-text" style={{ marginTop: 16 }}>
        <Link href="/login" className="auth-register-link">
          Back to staff login
        </Link>
      </p>
    </AuthShell>
  );
}