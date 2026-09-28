'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Loaded on demand so the assistant adds zero cost to the initial HMS bundle
// and never renders on public/auth pages.
const MaitriPanel = dynamic(() => import('./MaitriPanel'), { ssr: false });

/**
 * Maitri Assistant entry point: a compact floating launcher pinned to the
 * lower-right corner of every authenticated HMS screen. Expands into the
 * right-side copilot panel. Public/auth routes never render it.
 */
export default function MaitriAssistant() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isPublicPath, setIsPublicPath] = useState(true);

  useEffect(() => {
    setMounted(true);
    const check = () => {
      const path = window.location.pathname;
      const isPublic =
        path === '/' ||
        ['/login', '/pharmacy-login', '/register', '/forgot-password', '/reset-password', '/select-tenant', '/2fa-setup'].some(
          (p) => path === p || path.startsWith(p + '/'),
        );
      setIsPublicPath(isPublic);
      if (isPublic) setOpen(false);
    };
    check();
    // The AppShell persists across soft navigations; watch for route changes.
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = (...args: any[]) => {
      origPush(...(args as Parameters<typeof origPush>));
      check();
    };
    window.history.replaceState = (...args: any[]) => {
      origReplace(...(args as Parameters<typeof origReplace>));
      check();
    };
    window.addEventListener('popstate', check);
    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      window.removeEventListener('popstate', check);
    };
  }, []);

  if (!mounted || isPublicPath) return null;

  if (open) {
    return <MaitriPanel onClose={() => setOpen(false)} />;
  }

  return (
    <button
      type="button"
      className="maitri-fab"
      onClick={() => setOpen(true)}
      aria-label="Open Maitri Assistant"
      aria-expanded={open}
      title="Maitri Assistant"
    >
      <span className="maitri-fab-spark" aria-hidden="true">✦</span>
      <span className="maitri-fab-label">Maitri AI</span>
    </button>
  );
}
