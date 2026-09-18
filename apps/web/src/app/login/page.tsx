'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import LoginShell from '@/components/auth/LoginShell';
import {
  AuthField,
  AuthButton,
  AuthError,
  AuthMessage,
} from '@/components/auth/controls';
import './login.css';
import '../auth.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeStep, setCodeStep] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('2fa') === 'set') {
      setMessage('Two-factor authentication is enabled. Sign in with your authenticator code.');
    }
  }, []);

  const emailError =
    emailTouched && email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? 'Please enter a valid email address.'
      : null;
  const passwordError =
    passwordTouched && password.trim() === ''
      ? 'Password is required.'
      : null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password.trim() === '') {
      setPasswordTouched(true);
      return;
    }
    if (codeStep && !/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          rememberMe: true,
          twoFactorCode: codeStep ? code.trim() : undefined,
        }),
      });

      if (res.data.mustSetupTwoFactor && res.data.twoFactorSetupToken) {
        sessionStorage.setItem('twoFactorSetupToken', res.data.twoFactorSetupToken);
        router.push(`/2fa-setup?email=${encodeURIComponent(email)}`);
        return;
      }

      if (res.data.twoFactorRequired) {
        setCodeStep(true);
        return;
      }

      localStorage.setItem('role', res.data.user.role);
      localStorage.setItem(
        'userName',
        `${res.data.user.firstName} ${res.data.user.lastName}`,
      );
      if (res.data.user.tenantId) {
        localStorage.setItem('tenantId', res.data.user.tenantId);
      }

      if (!res.data.user.tenantId) {
        try {
          const tenantRes = await api('/tenants?limit=1');
          const tenantList = tenantRes?.data?.data ?? (Array.isArray(tenantRes?.data) ? tenantRes.data : []);
          if (tenantList.length > 0) {
            localStorage.setItem('tenantId', tenantList[0].id);
            localStorage.setItem('tenantName', tenantList[0].name);
          }
        } catch {}
      }
      if (res.data.user.mustChangePassword) {
        router.push('/change-password');
      } else if (res.data.user.role === 'EMERGENCY_STAFF') {
        // ER staff live in the Emergency workspace, not the general dashboard.
        router.push('/emergency?tab=dashboard');
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
    <LoginShell>
      <form className="auth-form" onSubmit={handleLogin} noValidate>
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (emailTouched) setEmailTouched(true);
          }}
          onBlurHandled={() => setEmailTouched(true)}
          error={emailError}
          autoComplete="email"
          placeholder="username@gmail.com"
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          onBlurHandled={() => setPasswordTouched(true)}
          error={passwordError}
          autoComplete="current-password"
        />

        {codeStep && (
          <AuthField
            id="code"
            label="Authenticator code"
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(v) => { setCode(v); if (error) setError(null); }}
            error={null}
            autoComplete="one-time-code"
            placeholder="6-digit code"
          />
        )}

        {!codeStep && (
          <div style={{ marginTop: '-4px' }}>
            <Link href="/forgot-password" className="auth-link">
              Forgot Password?
            </Link>
          </div>
        )}

        {message && <AuthMessage message={message} />}
        {error && <AuthError message={error} />}

        <AuthButton loading={loading} loadingText="Signing in…">
          Sign in
        </AuthButton>
      </form>
    </LoginShell>
  );
}
