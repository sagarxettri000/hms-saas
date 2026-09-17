'use client';

import { useMemo } from 'react';
import { code128Runs } from '@/lib/code128';

/**
 * Inline Code128-B barcode rendered as SVG. Deterministic from `value`, so
 * the same bill always renders the same scannable barcode (the value itself
 * is the invoice's server-assigned unique barcode).
 */
export default function Barcode({ value, height = 44 }: { value: string; height?: number }) {
  const runs = useMemo(() => code128Runs(value), [value]);
  if (!runs) return null;
  const moduleW = 1.6;
  const totalW = runs.reduce((a, b) => a + b, 0) * moduleW + 8; // + quiet zone

  const bars: { x: number; w: number }[] = [];
  let x = 4;
  let inSymbol = 0;
  for (const w of runs) {
    if (inSymbol % 2 === 0) bars.push({ x, w: w * moduleW });
    inSymbol++;
    x += w * moduleW;
    if (inSymbol === 11) inSymbol = 0; // every symbol is exactly 11 modules
  }

  return (
    <svg
      role="img"
      aria-label={`Barcode ${value}`}
      style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}
      width={totalW}
      height={height + 12}
      viewBox={`0 0 ${totalW} ${height + 12}`}
    >
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
      <text x={totalW / 2} y={height + 11} textAnchor="middle" fontSize="9" fill="#333" fontFamily="monospace">
        {value}
      </text>
    </svg>
  );
}
