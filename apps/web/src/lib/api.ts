export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://hms-saas-api-production.up.railway.app/api/v1';

const AUTH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function isAuthPath(path: string): boolean {
  return AUTH_PATHS.some((p) => path.startsWith(p));
}

async function request(path: string, options: RequestInit = {}, retry = true): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-HMS-CSRF': '1',
    ...(options.headers as Record<string, string> | undefined),
  };

  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
  if (tenantId && tenantId !== '') headers['X-Tenant-ID'] = tenantId;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });

  if (res.status === 401 && retry && typeof window !== 'undefined' && !isAuthPath(path)) {
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-HMS-CSRF': '1' },
        body: JSON.stringify({}),
      });
      if (r.ok) {
        return request(path, options, false);
      }
    } catch {
      // fall through to logout
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    const sessionRole =
      typeof window !== 'undefined' ? localStorage.getItem('role') : null;
    const target =
      sessionRole === 'PHARMACIST' ? '/pharmacy-login' : '/login';
    if (window.location.pathname !== target) window.location.replace(target);
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body.message || `Request failed (${res.status})`);
    err.statusCode = res.status;
    err.code = body?.code;
    err.warnings = Array.isArray(body?.warnings) ? body.warnings : undefined;
    throw err;
  }

  return res.json();
}

export function api(path: string, options: RequestInit = {}) {
  return request(path, options);
}

// Response-unwrapping helpers shared across pages. `api()` returns the full
// JSON body; endpoints wrap payloads as `{ data: { data, total } }`, `{ data }`
// or return the value directly. These helpers normalise those shapes.

export function unwrap(r: any): any {
  return r?.data?.data ?? r?.data ?? r;
}

export function listOf(r: any): any[] {
  const u = unwrap(r);
  if (Array.isArray(u)) return u;
  if (Array.isArray(u?.data)) return u.data;
  if (Array.isArray(u?.items)) return u.items;
  return [];
}

export function objOf(r: any): any {
  const u = unwrap(r);
  return u && typeof u === 'object' && !Array.isArray(u) ? u : {};
}

export function safe<T>(p: Promise<T>): Promise<T | null> {
  return p.catch(() => null);
}

export function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
