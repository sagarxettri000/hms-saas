'use client';

import { useMemo, useState } from 'react';

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

export default function ReportTree({
  categories,
  selectedId,
  onSelect,
  favorites,
  onToggleFavorite,
  recent,
}: {
  categories: TreeCategory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  recent: string[];
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const all = useMemo(() => categories.flatMap((c) => c.reports), [categories]);
  const byId = useMemo(() => {
    const m: Record<string, TreeReport> = {};
    for (const r of all) m[r.id] = r;
    return m;
  }, [all]);

  const query = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!query) return categories;
    return categories
      .map((c) => ({
        ...c,
        reports: c.reports.filter((r) => `${r.number} ${r.name}`.toLowerCase().includes(query)),
      }))
      .filter((c) => c.reports.length > 0);
  }, [categories, query]);

  const recentItems = recent.map((id) => byId[id]).filter(Boolean);
  const favItems = all.filter((r) => favorites.includes(r.id));

  const isOpen = (id: string) => (open[id] === undefined ? id === categories[0]?.id : open[id]);

  function star(id: string) {
    const r = byId[id];
    if (!r) return null;
    const isFav = favorites.includes(id);
    return (
      <button
        className={`report-star ${isFav ? 'on' : ''}`}
        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(id);
        }}
      >
        {isFav ? '★' : '☆'}
      </button>
    );
  }

  function ReportRow({ r, withStar }: { r: TreeReport; withStar?: boolean }) {
    const active = selectedId === r.id;
    return (
      <div
        role="button"
        tabIndex={0}
        className={`report-item ${active ? 'active' : ''}`}
        title={r.description || ''}
        onClick={() => onSelect(r.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(r.id);
          }
        }}
      >
        <span className="report-item-num">{r.number}</span>
        <span className="report-item-name">{r.name}</span>
        {withStar && star(r.id)}
      </div>
    );
  }

  return (
    <div className="report-tree">
      <input
        className="input report-tree-search"
        type="text"
        placeholder="Search reports…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {!query && recentItems.length > 0 && (
        <div className="report-tree-group">
          <div className="report-tree-section">Recent</div>
          {recentItems.slice(0, 8).map((r) => (
            <ReportRow key={r.id} r={r} />
          ))}
        </div>
      )}

      {!query && favItems.length > 0 && (
        <div className="report-tree-group">
          <div className="report-tree-section">Favorites</div>
          {favItems.map((r) => (
            <ReportRow key={r.id} r={r} withStar />
          ))}
        </div>
      )}

      {filtered.map((cat) => (
        <div key={cat.id} className="report-tree-group">
          <button className="report-tree-section report-tree-toggle" onClick={() => setOpen((prev) => ({ ...prev, [cat.id]: !isOpen(cat.id) }))}>
            <span className="report-caret">{isOpen(cat.id) ? '▾' : '▸'}</span>
            {cat.label}
          </button>
          {isOpen(cat.id) &&
            cat.reports.map((r) => (
              <ReportRow key={r.id} r={r} withStar />
            ))}
        </div>
      ))}

      {filtered.length === 0 && <div className="muted report-tree-empty">No reports match “{search}”.</div>}
    </div>
  );
}
