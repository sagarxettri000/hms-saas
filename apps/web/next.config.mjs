import path from 'node:path';
import { fileURLToPath } from 'node:url';

// NEXT_PUBLIC_API_URL (set in Vercel/local .env.local) overrides the local default.
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1')
  .replace(/\/api\/v1\/?$/, '');

const csp = [
  "default-src 'self'",
// Next.js injects inline bootstrapping scripts; the app also sets inline
  // style attributes (`style={{...}}`) extensively, so both need inline.
  // Dev-mode react-refresh uses eval(), so unsafe-eval is dev-only -
  // production keeps the strict script-src.
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'",
  // QR codes (data:) and PDF/blob downloads served via object URLs.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`,
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
  "frame-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../'),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;