'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AuthShellProps {
  children: React.ReactNode;
  mode?: 'login' | 'register' | 'forgot';
  wide?: boolean;
  footer?: React.ReactNode;
  heading?: string;
}

export default function AuthShell({ children, mode, wide, footer, heading }: AuthShellProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div className="auth-root">
      <div className="auth-bg-gradient" />
      <div className="auth-bg-glow" />

      <div className="auth-deco auth-deco-tube-1" />
      <div className="auth-deco auth-deco-tube-2" />
      <div className="auth-deco auth-deco-tube-3" />
      <div className="auth-deco auth-deco-tube-4" />
      <div className="auth-deco auth-deco-tube-5" />
      <div className="auth-deco auth-deco-sphere-1" />
      <div className="auth-deco auth-deco-sphere-2" />

      <div className={`auth-card ${visible ? 'auth-card-visible' : ''} ${wide ? 'auth-card-wide' : ''}`}>
        <div className="auth-card-glass" />
        <div className="auth-card-highlight" />

        <div className="auth-card-content">
          <div className="auth-brand">
            <h1 className="auth-brand-name">SWASTHYA</h1>
          </div>

          {heading && <h2 className="auth-heading">{heading}</h2>}

          {children}

          <div className="auth-register-text">
            Don&apos;t have an account yet?{' '}
            <Link href="/register" className="auth-register-link">
              Register for free
            </Link>
          </div>
        </div>
      </div>

      <div className="auth-footer-glass">
        {footer ?? (
          <>
            <span>&copy; Swasthya Hospital Management System</span>
            <span className="auth-footer-links">
              <Link href="/about">About</Link>
            </span>
          </>
        )}
      </div>


    </div>
  );
}
