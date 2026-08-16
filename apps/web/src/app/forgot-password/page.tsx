'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import { AuthField, AuthButton, AuthError, AuthMessage } from '@/components/auth/controls';
import '../auth.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const emailError =
    touched && email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? 'Please enter a valid email address.'
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (emailError) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      if (
        res.data.resetUrl &&
        process.env.NODE_ENV !== 'production' &&
        process.env.NEXT_PUBLIC_DEV_RESET_URL === 'true'
      ) {
        setMessage(`Development mode: reset link generated. ${res.data.resetUrl}`);
      } else {
        setMessage(res.data.message || 'If the email exists, a reset link will be sent.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
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
    <AuthShell mode="forgot" heading="Reset Password">

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <AuthField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          onBlurHandled={() => setTouched(true)}
          error={emailError}
          autoComplete="email"
          placeholder="username@gmail.com"
        />

        {message && <AuthMessage message={message} />}
        {error && <AuthError message={error} />}

        <AuthButton loading={loading} loadingText="Sending…">
          Send reset link
        </AuthButton>
      </form>

      <Link href="/login" className="auth-back">
        ← Back to sign in
      </Link>
    </AuthShell>
  );
}
