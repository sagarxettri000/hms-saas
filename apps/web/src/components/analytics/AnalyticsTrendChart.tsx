'use client';

import { useRef, useState } from 'react';
import { formatMoney } from '@/lib/hooks';

export interface TrendPoint {
  date: string;
  revenue: number;
  collection: number;
}

const REVENUE_COLOR = '#2563eb';
const COLLECTION_COLOR = '#16a34a';

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

function fullDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function AnalyticsTrendChart({
  data,
  height = 260,
}: {
  data: TrendPoint[];
  height?: number;
}) {  const width = 820;
  const padL = 58;
  const padR = 18;
  const padT = 18;
  const padB = 30;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const points = (data || [])
    .map((d) => ({
      date: String(d.date || '').slice(0, 10),
      revenue: Number(d.revenue) || 0,
      collection: Number(d.collection) || 0,
    }))
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length === 0) {
    return <p className="empty">No revenue data for this period.</p>;
  }

  const revenue = points.map((p) => p.revenue);
  const collection = points.map((p) => p.collection);
  const max = Math.max(1, ...revenue, ...collection);
  const plotW = width - padL - padR;
  const innerH = height - padT - padB;
  const n = points.length;
  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const xAt = (i: number) => padL + i * stepX;
  const yAt = (v: number) => padT + (1 - v / max) * innerH;
  const line = (arr: number[]) =>
    arr.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
  const area = (arr: number[]) =>
    `${padL},${padT + innerH} ${line(arr)} ${xAt(n - 1)},${padT + innerH}`;

  const totalRevenue = revenue.reduce((s, v) => s + v, 0);
  const totalCollection = collection.reduce((s, v) => s + v, 0);

  const tickCount = Math.min(6, n);
  const tickEvery = n > 1 ? Math.max(1, Math.ceil((n - 1) / Math.max(1, tickCount - 1))) : 1;
  const tickIndexes: number[] = [];
  for (let i = 0; i < n; i++) if (i === n - 1 || i % tickEvery === 0) tickIndexes.push(i);

  function handleMove(e: React.MouseEvent) {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const raw = stepX > 0 ? (x - padL) / stepX : 0;
    const idx = Math.max(0, Math.min(n - 1, Math.round(raw)));
    setHover(idx);
  }

  const active = hover != null && hover >= 0 && hover < n ? points[hover] : null;
  const activeX = hover != null ? xAt(hover) : 0;

  return (
    <div className="analytic-chart">
      <div className="analytic-chart-svg-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label="Revenue and collections trend"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="analyticRevFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={REVENUE_COLOR} stopOpacity="0.18" />
              <stop offset="100%" stopColor={REVENUE_COLOR} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="analyticColFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLLECTION_COLOR} stopOpacity="0.16" />
              <stop offset="100%" stopColor={COLLECTION_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const yy = padT + (1 - f) * innerH;
            return (
              <g key={f}>
                <line x1={padL} y1={yy} x2={width - padR} y2={yy} stroke="#e2e8f0" strokeWidth={1} />
                <text x={padL - 8} y={yy + 4} textAnchor="end" fontSize={11} fill="#64748b">
                  {fmtCompact(max * f)}
                </text>
              </g>
            );
          })}

          {tickIndexes.map((i) => (
            <text
              key={i}
              x={xAt(i)}
              y={height - 9}
              textAnchor="middle"
              fontSize={11}
              fill="#64748b"
            >
              {shortDate(points[i].date)}
            </text>
          ))}

          {n > 1 && (
            <>
              <polygon points={area(collection)} fill="url(#analyticColFill)" />
              <polygon points={area(revenue)} fill="url(#analyticRevFill)" />
              <polyline
                points={line(collection)}
                fill="none"
                stroke={COLLECTION_COLOR}
                strokeWidth={2.2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <polyline
                points={line(revenue)}
                fill="none"
                stroke={REVENUE_COLOR}
                strokeWidth={2.2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}

          {hover != null && (
            <g>
              <line
                x1={activeX}
                y1={padT}
                x2={activeX}
                y2={padT + innerH}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <circle cx={activeX} cy={yAt(revenue[hover])} r={4} fill={REVENUE_COLOR} stroke="#fff" strokeWidth={1.5} />
              <circle cx={activeX} cy={yAt(collection[hover])} r={4} fill={COLLECTION_COLOR} stroke="#fff" strokeWidth={1.5} />
            </g>
          )}
        </svg>

        {active && (
          <div
            className="analytic-chart-tip"
            style={{
              left: `${((activeX / width) * 100).toFixed(2)}%`,
            }}
          >
            <div className="analytic-chart-tip-date">{fullDate(active.date)}</div>
            <div className="analytic-chart-tip-row">
              <span className="analytic-chart-tip-dot" style={{ background: REVENUE_COLOR }} />
              Revenue
              <b>{formatMoney(active.revenue)}</b>
            </div>
            <div className="analytic-chart-tip-row">
              <span className="analytic-chart-tip-dot" style={{ background: COLLECTION_COLOR }} />
              Collections
              <b>{formatMoney(active.collection)}</b>
            </div>
          </div>
        )}
      </div>

      <div className="analytic-chart-legend">
        <span className="analytic-chart-legend-item">
          <span className="analytic-chart-dot" style={{ background: REVENUE_COLOR }} />
          Revenue <b>{formatMoney(totalRevenue)}</b>
        </span>
        <span className="analytic-chart-legend-item">
          <span className="analytic-chart-dot" style={{ background: COLLECTION_COLOR }} />
          Collections <b>{formatMoney(totalCollection)}</b>
        </span>
        <span className="analytic-chart-legend-note">
          Collection rate {totalRevenue > 0 ? Math.round((totalCollection / totalRevenue) * 100) : 0}%
        </span>
      </div>
    </div>
  );
}
