export type DicomTool = 'wwwc' | 'pan' | 'zoom';

interface DicomToolbarProps {
  activeTool: DicomTool;
  onToolChange: (t: DicomTool) => void;
  invert: boolean;
  onToggleInvert: () => void;
  onReset: () => void;
  onFit: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  position: string;
  total: number;
  loading: boolean;
}

const TOOLS: { key: DicomTool; label: string; title: string }[] = [
  { key: 'wwwc', label: 'Window/Level', title: 'Left-drag adjusts window/level' },
  { key: 'pan', label: 'Pan', title: 'Left-drag pans; right-drag also pans' },
  { key: 'zoom', label: 'Zoom', title: 'Left-drag zooms; wheel always zooms' },
];

export function DicomToolbar(props: DicomToolbarProps) {
  return (
    <div className="toolbar" style={{ flexWrap: 'wrap', gap: 6 }}>
      {TOOLS.map((t) => (
        <button
          key={t.key}
          title={t.title}
          className={`btn btn-sm ${props.activeTool === t.key ? '' : 'btn-secondary'}`}
          style={props.activeTool === t.key ? { background: 'var(--primary)', color: '#fff' } : undefined}
          onClick={() => props.onToolChange(t.key)}
        >
          {t.label}
        </button>
      ))}

      <span style={{ width: 1, height: 26, background: 'var(--border)', alignSelf: 'center' }} />

      <button
        className="btn btn-sm"
        style={props.invert ? { background: 'var(--primary)', color: '#fff' } : undefined}
        onClick={props.onToggleInvert}
        title="Invert grayscale"
      >
        Invert
      </button>
      <button className="btn btn-sm btn-secondary" onClick={props.onReset} title="Reset viewport">Reset</button>
      <button className="btn btn-sm btn-secondary" onClick={props.onFit} title="Fit image to window">Fit</button>

      <span style={{ width: 1, height: 26, background: 'var(--border)', alignSelf: 'center' }} />

      <button className="btn btn-sm btn-secondary" disabled={!props.canPrev} onClick={props.onPrev}>‹ Prev</button>
      <span className="note" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>
        Image {props.position} / {props.total}
      </span>
      <button className="btn btn-sm btn-secondary" disabled={!props.canNext} onClick={props.onNext}>Next ›</button>

      {props.loading && <span className="note" style={{ alignSelf: 'center' }}>Loading…</span>}
    </div>
  );
}