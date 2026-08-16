'use client';

import AuthShell from '@/components/auth/AuthShell';
import Link from 'next/link';
import '../auth.css';

interface Founder {
  name: string;
  role: string;
  display: string;
  intl: string;
  message: string;
}

const FOUNDERS: Founder[] = [
  {
    name: 'Sagar Katwal',
    role: 'Founder',
    display: '9768545542',
    intl: '9779768545542',
    message: 'Hello Sagar, I would like to know more about Swasthya.',
  },
  {
    name: 'Dipson Basnet',
    role: 'Co-Founder',
    display: '9707429360',
    intl: '9779707429360',
    message: 'Hello Dipson, I would like to know more about Swasthya.',
  },
];

function WhatsAppIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function AboutPage() {
  return (
    <AuthShell mode="forgot" wide heading="About Swasthya"
      footer={
        <span>© 2026 Nepluro. All rights reserved.</span>
      }
    >
        <div className="auth-divider" />

        <div className="about-copy">
          <p className="about-lead">
            Swasthya is a modern Hospital Management System designed to simplify
            hospital operations, connect departments, and help healthcare teams
            manage information more efficiently from one unified platform.
          </p>

          <section className="auth-copy-section">
            <h2 className="auth-copy-title">Developed by Nepluro</h2>
            <p className="auth-copy-body">
              This software is proudly developed by Nepluro, a technology and
              digital solutions company focused on building practical, modern
              software experiences.
            </p>
          </section>

          <section className="auth-copy-section">
            <h2 className="auth-copy-title">Founders</h2>
            <div className="about-founders">
              {FOUNDERS.map((f) => (
                <div key={f.name} className="about-card">
                  <div className="about-card-avatar" aria-hidden="true">
                    {f.name.charAt(0)}
                  </div>
                  <div className="about-card-name">{f.name}</div>
                  <div className="about-card-role">{f.role}</div>
                  <div className="about-card-phone">{f.display}</div>
                  <a
                    className="about-wa-btn"
                    href={`https://wa.me/${f.intl}?text=${encodeURIComponent(f.message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Contact ${f.name} on WhatsApp`}
                  >
                    <WhatsAppIcon />
                    Contact on WhatsApp
                  </a>
                </div>
              ))}
            </div>
          </section>

          <section className="auth-copy-section">
            <h2 className="auth-copy-title">Contact</h2>
            <p className="auth-copy-body">
              Need support, have a question, or want to discuss the system?
              Contact our founders directly on WhatsApp.
            </p>
          </section>
        </div>

        <div className="auth-divider" />

        <p className="about-tagline">Built with purpose. Designed for better healthcare operations.</p>

        <Link href="/login" className="auth-back">
          ← Back to sign in
        </Link>
    </AuthShell>
  );
}