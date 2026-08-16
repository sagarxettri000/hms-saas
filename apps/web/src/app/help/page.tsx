'use client';

import AuthShell from '@/components/auth/AuthShell';
import Link from 'next/link';
import '../auth.css';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Reset your password',
    body: 'Use “Forgot password?” on the sign-in page to receive a reset link by email. You will be able to set a new password and return to sign in.',
  },
  {
    title: 'Trouble signing in',
    body: 'Confirm your email address matches your account and that your password is entered correctly. After several failed attempts the account is temporarily locked for security — try again shortly.',
  },
  {
    title: 'Create an account',
    body: 'Select “Create account” on the sign-in page. New accounts are reviewed by your organisation administrator before access is granted.',
  },
  {
    title: 'Contact support',
    body: 'For questions about your workspace, users or configurations, reach out to your hospital administrator, or use the organisation contact details shown in your settings.',
  },
];

export default function HelpPage() {
  return (
    <AuthShell mode="forgot" heading="Help">
        <div className="auth-divider" />

        <div className="auth-copy">
          {SECTIONS.map((s) => (
            <section key={s.title} className="auth-copy-section">
              <h2 className="auth-copy-title">{s.title}</h2>
              <p className="auth-copy-body">{s.body}</p>
            </section>
          ))}
        </div>

        <Link href="/login" className="auth-back">
          ← Back to sign in
        </Link>
    </AuthShell>
  );
}