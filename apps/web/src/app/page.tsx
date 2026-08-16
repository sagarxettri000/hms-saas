'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    router.replace(token ? '/dashboard' : '/login');
  }, [router]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#020a1a', color: 'rgba(255,255,255,0.5)' }}>
      <p>Loading…</p>
    </div>
  );
}
