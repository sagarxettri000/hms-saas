'use client';

import type { CSSProperties, ReactNode } from 'react';
import { formatMoney } from '@/lib/hooks';

const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export function toneColor(tone?: string): string {
  switch (tone) {
    case 'green':
      return '#16a34a';
    case 'purple':
      return '#8b5cf6';
    case 'amber':
      return '#f59e0b';
    case 'red':
      return '#ef4444';
    case 'gray':
      return '#94a3b8';
    default:
      return '#2563eb';
  }
}

export function IconTile({
  glyph,
  tone = 'blue',
  size = 36,
}: {
  glyph?: string;
  tone?: string;
  size?: number;
}) {
  const t = ['blue', 'green', 'purple', 'amber', 'red', 'gray'].includes(tone || '') ? tone : 'blue';
  return (
    <span
      className={`dash-icon-tile dash-tone-${t}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
    >
      {glyph || '•'}
    </span>
  );
}

export function deltaOf(current: number, previous: number): { pct: number; up: boolean; flat: boolean } {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) {
    if (c === 0) return { pct: 0, up: false, flat: true };
    return { pct: 100, up: true, flat: false };
  }
  const pct = ((c - p) / p) * 100;
  return { pct, up: pct >= 0, flat: Math.abs(pct) < 0.05 };
}

export function DeltaText({
  delta,
  money,
}: {
  delta: { pct: number; up: boolean; flat: boolean };
  money?: boolean;
}) {
  if (delta.flat) return <span className="dash-delta dash-delta-flat">even vs yesterday</span>;
  const arrow = delta.up ? '▲' : '▼';
  return (
    <span className={`dash-delta ${delta.up ? 'dash-delta-up' : 'dash-delta-down'}`}>
      {arrow} {money ? `${delta.up ? '+' : '−'}${Math.abs(delta.pct).toFixed(0)}%` : `${Math.abs(delta.pct).toFixed(1)}%`}{' '}
      <span className="dash-delta-label">vs yesterday</span>
    </span>
  );
}

export function Sparkline({
  values,
  color = '#2563eb',
  height = 34,
  width = 120,
}: {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  const nums = (values || []).map((v) => Number(v) || 0).filter((v) => isFinite(v));
  if (nums.length === 0) return <div style={{ height }} />;
  const padded = nums.length === 1 ? [nums[0], nums[0]] : nums;
  const min = Math.min(...padded);
  const max = Math.max(...padded);
  const range = max - min || 1;
  const last = padded.length - 1;
  const pts = padded.map((v, i) => {
    const x = (i / last) * (width - 6) + 3;
    const y = height - 3 - ((v - min) / range) * (height - 7);
    return [x.toFixed(1), y.toFixed(1)];
  });
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${pts[0][0]},${height} ${line} ${pts[last][0]},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000000) return (n / 10000000).toFixed(1).replace(/\.0$/, '') + ' Cr';
  if (abs >= 100000) return (n / 100000).toFixed(1).replace(/\.0$/, '') + ' L';
  if (abs >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n * 100) / 100);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TrendChart({
  data,
  height = 190,
}: {
  data: { date: string; revenue: number; collection: number }[];
  height?: number;
}) {
  const width = 640;
  const padL = 52;
  const padR = 14;
  const padT = 16;
  const padB = 26;

  const byDate = new Map<string, { revenue: number; collection: number }>();
  for (const d of data || []) {
    const key = String(d.date || '').slice(0, 10);
    if (!key) continue;
    const cur = byDate.get(key) || { revenue: 0, collection: 0 };
    cur.revenue += Number(d.revenue) || 0;
    cur.collection += Number(d.collection) || 0;
    byDate.set(key, cur);
  }
  const days = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30);

  const labels = days.map(([k]) => k);
  const revenue = days.map(([, v]) => v.revenue);
  const collection = days.map(([, v]) => v.collection);

  if (labels.length === 0) {
    return <p className="empty">No revenue data yet.</p>;
  }

  const hasRevenue = revenue.some((v) => v > 0);
  const hasCollection = collection.some((v) => v > 0);
  const max = Math.max(1, ...(hasRevenue ? revenue : []), ...(hasCollection ? collection : []));
  const plotW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = labels.length;
  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const y = (v: number) => padT + (1 - v / max) * innerH;
  const pt = (arr: number[]) => arr.map((v, i) => `${padL + i * stepX},${y(v)}`).join(' ');

  const tickCount = Math.min(6, n);
  const tickEvery = n > 1 ? Math.max(1, Math.ceil((n - 1) / (tickCount - 1))) : 1;
  const tickIndexes: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1 || i % tickEvery === 0) tickIndexes.push(i);
  }

  return (
    <div className="dash-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label="Revenue and collections over the last 30 days"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const yy = padT + (1 - f) * innerH;
          return (
            <g key={f}>
              <line x1={padL} y1={yy} x2={width - padR} y2={yy} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padL - 6} y={yy + 4} textAnchor="end" fontSize={10} fill="#64748b">
                {fmtCompact(max * f)}
              </text>
            </g>
          );
        })}
        {tickIndexes.map((i) => (
          <text key={i} x={padL + i * stepX} y={height - 8} textAnchor="middle" fontSize={10} fill="#64748b">
            {shortDate(labels[i])}
          </text>
        ))}
        {n > 1 && (
          <>
            {hasCollection && (
              <polyline points={pt(collection)} fill="none" stroke={PALETTE[1]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}
            {hasRevenue && (
              <polyline points={pt(revenue)} fill="none" stroke={PALETTE[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}
          </>
        )}
        {n === 1 && (
          <>
            {hasRevenue && <circle cx={padL} cy={y(revenue[0])} r={3} fill={PALETTE[0]} />}
            {hasCollection && <circle cx={padL} cy={y(collection[0])} r={3} fill={PALETTE[1]} />}
          </>
        )}
      </svg>
      <div className="dash-chart-legend">
        <span className="dash-chart-legend-item">
          <span className="dash-chart-dot" style={{ background: PALETTE[0] }} />
          Revenue
        </span>
        {hasCollection && (
          <span className="dash-chart-legend-item">
            <span className="dash-chart-dot" style={{ background: PALETTE[1] }} />
            Collections
          </span>
        )}
      </div>
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

export function BarList({ data, money = true }: { data: BarDatum[]; money?: boolean }) {
  const items = (data || []).filter((d) => d && d.label);
  const max = Math.max(1, ...items.map((d) => Math.abs(Number(d.value) || 0)));
  if (items.length === 0) return <p className="empty">No data yet.</p>;
  return (
    <div className="dash-bars">
      {items.map((d, i) => {
        const v = Number(d.value) || 0;
        const pct = max > 0 ? Math.abs(v / max) * 100 : 0;
        return (
          <div key={`${d.label}-${i}`} className="dash-bar-row">
            <span className="dash-bar-label" title={d.label}>
              {d.label}
            </span>
            <span className="dash-bar-track">
              <span
                className="dash-bar-fill"
                style={{
                  width: pct === 0 ? 0 : `${Math.max(3, pct)}%`,
                  background: d.color || PALETTE[i % PALETTE.length],
                }}
              />
            </span>
            <span className="dash-bar-value">{money ? formatMoney(v) : v.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface LeaderRow {
  label: string;
  sublabel?: string;
  value: string;
  tone?: string;
}

export function Leaderboard({ rows, empty = 'No data yet.' }: { rows: LeaderRow[]; empty?: string }) {
  if (!rows || rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="dash-leader">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="dash-leader-row">
          <span className="dash-rank">{i + 1}</span>
          <div className="dash-leader-main">
            <span className="dash-leader-label" title={r.label}>
              {r.label}
            </span>
            {r.sublabel && <span className="dash-leader-sub">{r.sublabel}</span>}
          </div>
          <span className={`dash-leader-value ${r.tone ? `dash-tone-text-${r.tone}` : ''}`}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function StockHealth({
  pct,
  low = 0,
  out = 0,
  expiring = 0,
  total = 0,
}: {
  pct: number;
  low?: number;
  out?: number;
  expiring?: number;
  total?: number;
}) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  const color = p >= 75 ? '#16a34a' : p >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div>
      <div className="dash-health-head">
        <span className="dash-health-pct">{Math.round(p)}%</span>
        <span className="muted">healthy of {total || '—'} items</span>
      </div>
      <div className="dash-bar-track-lg">
        <span className="dash-bar-fill" style={{ width: `${p}%`, background: color }} />
      </div>
      <div className="dash-health-stats">
        {low > 0 && <span className="dash-health-chip warn">Low {low}</span>}
        {out > 0 && <span className="dash-health-chip danger">Out {out}</span>}
        {expiring > 0 && <span className="dash-health-chip amber">Expiring {expiring}</span>}
        {(low <= 0 && out <= 0 && expiring <= 0) || (total === 0 && low <= 0 && out <= 0 && expiring <= 0) ? (
          <span className="dash-health-chip ok">All good</span>
        ) : null}
      </div>
    </div>
  );
}

export function OccupancyBar({
  occupied,
  total,
  pct,
}: {
  occupied: number;
  total: number;
  pct: number;
}) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  const color = p >= 90 ? '#ef4444' : p >= 70 ? '#f59e0b' : '#16a34a';
  return (
    <div>
      <div className="dash-health-head">
        <span className="dash-health-pct">{Math.round(p)}%</span>
        <span className="muted">
          {occupied} of {total} beds occupied
        </span>
      </div>
      <div className="dash-bar-track-lg">
        <span className="dash-bar-fill" style={{ width: `${p}%`, background: color }} />
      </div>
    </div>
  );
}

export function LabPipeline({
  pending = 0,
  collected = 0,
  completed = 0,
  total = 0,
}: {
  pending?: number;
  collected?: number;
  completed?: number;
  total?: number;
}) {
  const parts = [
    { label: 'Pending', value: Number(pending) || 0, color: '#f59e0b' },
    { label: 'Collected', value: Number(collected) || 0, color: '#2563eb' },
    { label: 'Completed', value: Number(completed) || 0, color: '#16a34a' },
  ];
  const max = Math.max(1, Number(total) || 0);
  const sum = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div className="dash-stack">
        {parts.map((p) => (
          <span
            key={p.label}
            className="dash-stack-seg"
            style={{ width: `${(p.value / max) * 100}%`, background: p.color }}
            title={`${p.label}: ${p.value}`}
          />
        ))}
      </div>
      <div className="dash-stack-legend">
        {parts.map((p, i) => (
          <span key={p.label} className="dash-stack-item">
            <span className="dash-stack-dot" style={{ background: p.color }} />
            {p.label} {p.value}
          </span>
        ))}
        {sum === 0 && <span className="muted">No orders today</span>}
      </div>
    </div>
  );
}

export function WidgetCard({
  title,
  action,
  children,
  style,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={`card dash-card ${className || ''}`} style={style}>
      <div className="dash-card-head">
        <span className="card-title" style={{ marginBottom: 0 }}>
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

export function DashboardSkeletons({ stats = 6, cards = 2 }: { stats?: number; cards?: number }) {
  return (
    <>
      <div className="dash-stat-grid">
        {Array.from({ length: stats }).map((_, i) => (
          <div key={i} className="card dash-skel" style={{ height: 96 }} />
        ))}
      </div>
      <div className="dash-widget-grid" style={{ marginTop: 20 }}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card dash-skel" style={{ height: 230 }} />
        ))}
      </div>
    </>
  );
}