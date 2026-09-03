'use client';

import { useCallback, useEffect, useState } from 'react';
import ReportTree from '@/components/reports/ReportTree';
import ReportViewer from '@/components/reports/ReportViewer';
import { api } from '@/lib/api';
import './reports.css';

interface TreeReport {
  id: string;
  number: string;
  name: string;
  description: string;
}

interface TreeCategory {
  id: string;
  key: string;
  label: string;
  reports: TreeReport[];
}

function loadList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveList(key: string, list: string[]) {
  localStorage.setItem(key, JSON.stringify(list));
}

export default function ReportsPage() {
  const [categories, setCategories] = useState<TreeCategory[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFavorites(loadList('reportFavorites'));
    setRecent(loadList('reportRecent'));
    api('/reports/analysis')
      .then((res) => {
        const cats = (res?.data?.data ?? res?.data ?? res ?? []) as TreeCategory[];
        setCategories(cats);
        const all = cats.flatMap((c) => c.reports);
        if (all.length > 0) setSelected(all[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reports'))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelected(id);
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 12);
      saveList('reportRecent', next);
      return next;
    });
  }, []);

  const handleToggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveList('reportFavorites', next);
      return next;
    });
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Analysis & Reports</h1>
          <p>Generate reports from live hospital data</p>
        </div>
      </div>

      {error && <div className="banner-danger">{error}</div>}

      {loading ? (
        <div className="card"><div className="loading">Loading reports…</div></div>
      ) : (
        <div className="reports-layout">
          <aside className="reports-sidebar no-print">
            <ReportTree
              categories={categories}
              selectedId={selected}
              onSelect={handleSelect}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              recent={recent}
            />
          </aside>
          <main className="reports-main">
            <ReportViewer reportId={selected} />
          </main>
        </div>
      )}
    </>
  );
}