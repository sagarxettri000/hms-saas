'use client';

import Link from 'next/link';

const TRUST_POINTS = [
  ['🔒', 'Tenant isolation'],
  ['🛡️', 'Role-based access'],
  ['📋', 'Audit logging'],
];

export default function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-split">
      <aside className="login-brand-panel">
        <div className="login-brand-grid" aria-hidden="true" />
        <div className="login-brand-glow" aria-hidden="true" />

        <div className="login-brand-inner">
          <div className="login-logo">
            <span className="login-logo-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7 4v5c0 4.5-3 8.5-7 9-4-.5-7-4.5-7-9V7l7-4z" />
              </svg>
            </span>
            <span className="login-logo-word">SWASTHYA</span>
          </div>

          <div className="login-headline">
            <h1>Hospital care,<br />managed beautifully.</h1>
            <p>
              One unified platform for clinical workflows, billing, pharmacy,
              and hospital operations — designed to keep your teams connected.
            </p>
          </div>
        </div>

        <div className="login-trust">
          {TRUST_POINTS.map(([icon, label]) => (
            <div key={label} className="login-trust-chip">
              <span className="login-trust-icon" aria-hidden="true">{icon}</span>
              {label}
            </div>
          ))}
        </div>
      </aside>

      <main className="login-form-panel">
        <div className="login-form-card">
          <div className="login-mobile-brand">
            <span className="login-logo-word">SWASTHYA</span>
          </div>

          <div className="login-form-heading">
            <h2>Welcome back</h2>
            <p>Sign in to continue to Swasthya.</p>
          </div>

          {children}
        </div>

        <footer className="login-footer">
          <span>&copy; Swasthya Hospital Management System</span>
          <Link href="/about">About</Link>
        </footer>
      </main>
    </div>
  );
}