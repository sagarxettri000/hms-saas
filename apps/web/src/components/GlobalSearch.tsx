'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Result {
  kind: 'Patient' | 'Doctor';
  id: string;
  label: string;
  sub: string;
  href: string;
}

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const [patRes, docRes] = await Promise.all([
          api(`/patients?search=${encodeURIComponent(term)}&limit=6`),
          api(`/doctors?search=${encodeURIComponent(term)}&limit=4`),
        ]);
        if (!active) return;
        const list = (r: any) => (Array.isArray(r?.data) ? r.data : r?.data?.data ?? []);
        const patients: Result[] = (list(patRes) as any[]).map((p) => ({
          kind: 'Patient',
          id: p.id,
          label: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '),
          sub: `${p.mrn || ''} · ${p.mobile || ''} · ${p.patientType || ''}`.replace(/^ · /, ''),
          href: `/patients/${p.id}`,
        }));
        const doctors: Result[] = (list(docRes) as any[]).map((d) => ({
          kind: 'Doctor',
          id: d.id,
          label: [d.user?.firstName, d.user?.lastName, d.firstName, d.lastName].filter(Boolean).join(' '),
          sub: `${d.specialization || ''} · ${d.department?.name || ''}`.replace(/^ · /, ''),
          href: `/doctors/${d.id}`,
        }));
        setResults([...patients, ...doctors]);
        setOpen(true);
      } catch {
        if (active) {
          setResults([]);
          setOpen(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  function go(r: Result) {
    setOpen(false);
    setQ('');
    router.push(r.href);
  }

  return (
    <div className="global-search" ref={boxRef}>
      <input
        className="input search-input"
        placeholder="Search patients, doctors…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (!e.target.value.trim()) setOpen(false);
        }}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && q.trim().length >= 2 && (
        <div className="global-search-results">
          {loading && <div className="search-hint">Searching…</div>}
          {!loading && !results.length && <div className="search-hint">No results found.</div>}
          {results.map((r) => (
            <button key={r.kind + r.id} className="search-result" onClick={() => go(r)}>
              <span className={`badge badge-${r.kind === 'Patient' ? 'blue' : 'purple'}`}>{r.kind}</span>
              <span>
                <strong>{r.label}</strong>
                <span className="search-sub">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
