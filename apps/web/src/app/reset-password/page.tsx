'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import { AuthField, AuthButton, AuthError, AuthMessage } from '@/components/auth/controls';
import '../auth.css';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token');
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setMessage('Password reset successfully. Redirecting to sign in...');
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      setError(
        typeof window !== 'undefined' && !navigator.onLine
          ? 'Unable to connect. Please try again.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="forgot" heading="Set a new password">
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <AuthField
            id="password"
            label="New password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <AuthField
            id="confirmPassword"
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />

          {message && <AuthMessage message={message} />}
          {error && <AuthError message={error} />}

          <AuthButton loading={loading} loadingText="Resetting…">
            Reset password
          </AuthButton>
        </form>

        <Link href="/login" className="auth-back">
          ← Back to sign in
        </Link>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#5f6b7a' }}>
        Loading…
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}