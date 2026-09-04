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
    ...(options.headers as Record<string, string> | undefined),
  };

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenantId') : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantId && tenantId !== '') headers['X-Tenant-ID'] = tenantId;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry && typeof window !== 'undefined' && !isAuthPath(path)) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      try {
        const r = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (r.ok) {
          const body = await r.json();
          const root = body.data ?? body;
          const newToken = root.accessToken || body.accessToken || body.data?.accessToken;
          if (newToken) {
            localStorage.setItem('accessToken', newToken);
            const newRefresh = root.refreshToken || body.refreshToken || body.data?.refreshToken;
            if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
            return request(path, options, false);
          }
        }
      } catch {
        // fall through to logout
      }
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    if (window.location.pathname !== '/login') window.location.replace('/login');
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }

  return res.json();
}

export function api(path: string, options: RequestInit = {}) {
  return request(path, options);
}
