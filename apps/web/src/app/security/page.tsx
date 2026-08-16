'use client';

import AuthShell from '@/components/auth/AuthShell';
import Link from 'next/link';
import '../auth.css';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Secure sign-in',
    body: 'Passwords are stored as strong hashes and never exposed to the interface. Sessions use short-lived access tokens alongside opaque refresh tokens that rotate on refresh.',
  },
  {
    title: 'Tenant isolation',
    body: 'Every record is scoped to its organisation workspace. Requests are validated against your tenant on the server — data from one hospital can never be read by another.',
  },
  {
    title: 'Role-based access',
    body: 'Feature access is controlled by role and permission. The interface hides what your role cannot use, and the server independently enforces every permission check.',
  },
  {
    title: 'Account protection',
    body: 'Repeated failed sign-in attempts trigger automatic account locking. Session activity and authentication events are written to an audit log for review.',
  },
];

export default function SecurityPage() {
  return (
    <AuthShell mode="forgot" heading="Security">
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