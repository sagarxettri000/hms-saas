import type { DicomSeriesListItem, DicomInstanceListItem } from '@/lib/dicom';

interface SeriesNavigatorProps {
  series: (DicomSeriesListItem & { instances: DicomInstanceListItem[] })[];
  activeInstanceId: string | null;
  onSelect: (instanceId: string) => void;
}

function instanceLabel(i: DicomInstanceListItem): string {
  if (i.instanceNumber != null) return `#${i.instanceNumber}`;
  return `#${i.sopInstanceUid.slice(-8)}`;
}

function dimensions(i: DicomInstanceListItem): string {
  if (i.rows && i.columns) return `${i.columns}×${i.rows}`;
  return i.transferSyntax ? '—' : '—';
}

export function DicomSeriesNavigator({ series, activeInstanceId, onSelect }: SeriesNavigatorProps) {
  if (!series.length) {
    return <div className="empty" style={{ margin: 8 }}>No series found</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {series.map((s) => (
        <div key={s.id} className="card" style={{ padding: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
            {s.modality ? <span className="badge badge-gray" style={{ marginRight: 6 }}>{s.modality}</span> : null}
            Series {s.seriesNumber ?? '—'}
          </div>
          {s.seriesDescription && <div className="note" style={{ marginBottom: 6 }}>{s.seriesDescription}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {s.instances.map((i) => (
              <button
                key={i.id}
                className={`btn btn-sm ${activeInstanceId === i.id ? '' : 'btn-ghost'}`}
                style={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  width: '100%',
                  background: activeInstanceId === i.id ? 'var(--primary)' : undefined,
                  color: activeInstanceId === i.id ? '#fff' : undefined,
                }}
                onClick={() => onSelect(i.id)}
              >
                <span style={{ flex: 1 }}>Image {instanceLabel(i)}</span>
                <span style={{ opacity: 0.8, fontSize: 11 }}>{dimensions(i)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}