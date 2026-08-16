'use client';

const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

interface ChartSeries {
  key: string;
  label: string;
}

function TrendChart({
  labels,
  seriesData,
  series,
}: {
  labels: string[];
  seriesData: Record<string, number[]>;
  series: ChartSeries[];
}) {
  const width = 720;
  const height = 240;
  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 28;
  const n = Math.max(labels.length, 1);
  const max = Math.max(1, ...series.flatMap((s) => seriesData[s.key] || []));
  const stepX = n > 1 ? (width - padL - padR) / (n - 1) : 0;
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB);

  const paths = series.map((s, si) => {
    const pts = (seriesData[s.key] || []).map((v, i) => `${padL + i * stepX},${y(v)}`).join(' ');
    return {
      color: PALETTE[si % PALETTE.length],
      label: s.label,
      path: pts ? <polyline points={pts} fill="none" stroke={PALETTE[si % PALETTE.length]} strokeWidth={2} strokeLinejoin="round" /> : null,
    };
  });

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const yy = padT + (1 - f) * (height - padT - padB);
    return (
      <g key={f}>
        <line x1={padL} y1={yy} x2={width - padR} y2={yy} stroke="#e2e8f0" strokeWidth={1} />
        <text x={padL - 6} y={yy + 4} textAnchor="end" fontSize={10} fill="#64748b">
          {Math.round(max * f)}
        </text>
      </g>
    );
  });

  const tickLabels = labels.map((lb, i) => {
    const x = padL + i * stepX;
    const label = String(lb || '');
    return (
      <text key={i} x={x} y={height - 8} textAnchor="middle" fontSize={10} fill="#64748b">
        {label.length > 12 ? label.slice(0, 12) + '…' : label}
      </text>
    );
  });

  return (
    <div className="report-chart">
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
        {gridLines}
        {paths.map((p, i) => p.path && <g key={i}>{p.path}</g>)}
        {paths.length === 1 &&
          (seriesData[series[0].key] || []).map((v, i) => (
            <circle key={i} cx={padL + i * stepX} cy={y(v)} r={3} fill={paths[0].color} />
          ))}
        {tickLabels}
      </svg>
      {paths.length > 1 && (
        <div className="chart-legend">
          {paths.map((p, i) => (
            <span key={i} className="chart-legend-item">
              <span className="chart-dot" style={{ background: p.color }} />
              {p.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BarChart({
  labels,
  seriesData,
  series,
}: {
  labels: string[];
  seriesData: Record<string, number[]>;
  series: ChartSeries[];
}) {
  const values = series.flatMap((s) => seriesData[s.key] || []);
  const max = Math.max(1, ...values);
  return (
    <div className="report-chart">
      {labels.map((lb, i) => (
        <div key={i} className="chart-bar-row">
          <div className="chart-bar-label" title={String(lb || '')}>
            {String(lb || '—')}
          </div>
          <div className="chart-bar-track">
            {series.map((s, si) => {
              const v = Number(seriesData[s.key]?.[i]) || 0;
              if (!v) return null;
              return (
                <div
                  key={s.key}
                  className="chart-bar-fill"
                  style={{
                    width: `${(v / max) * 100}%`,
                    background: PALETTE[si % PALETTE.length],
                  }}
                  title={`${s.label}: ${v}`}
                />
              );
            })}
          </div>
          <div className="chart-bar-value">{values.length > 0 ? seriesData[series[0].key]?.[i] ?? '—' : '—'}</div>
        </div>
      ))}
      {labels.length === 0 && <p className="muted">No chart data.</p>}
    </div>
  );
}

export default function ReportChart({
  type,
  labels,
  seriesData,
  series,
}: {
  type: string;
  labels: string[];
  seriesData: Record<string, number[]>;
  series: ChartSeries[];
}) {
  if (type === 'trend' || type === 'line') {
    return <TrendChart labels={labels} seriesData={seriesData} series={series} />;
  }
  return <BarChart labels={labels} seriesData={seriesData} series={series} />;
}
