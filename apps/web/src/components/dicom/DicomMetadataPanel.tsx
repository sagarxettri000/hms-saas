import { formatDate, formatDateTime } from '@/lib/hooks';
import type { DicomStudyDetail } from '@/lib/dicom';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.9 }}>
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ color: 'var(--text)' }}>{children || '—'}</div>
    </div>
  );
}

export function DicomMetadataPanel({ study }: { study: DicomStudyDetail }) {
  const p = study.patient;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Patient</div>
        <Row label="Name">
          {p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : null}
        </Row>
        <Row label="MRN">{p?.mrn}</Row>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Study</div>
        <Row label="Study UID"><span className="mono" style={{ fontSize: 11 }}>{study.studyInstanceUid}</span></Row>
        <Row label="Description">{study.studyDescription}</Row>
        <Row label="Accession No.">{study.accessionNumber}</Row>
        <Row label="Modality">{study.modality}</Row>
        <Row label="Body Part">{study.bodyPart}</Row>
        <Row label="Study Date">{formatDate(study.studyDate)}</Row>
        <Row label="Referring Physician">{study.referringPhysician}</Row>
        <Row label="Institution">{study.institutionName}</Row>
        <Row label="Uploaded">{formatDateTime(study.createdAt)}</Row>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Content</div>
        <Row label="Series">{study.series.length}</Row>
        <Row label="Instances">
          {study.series.reduce((n, s) => n + s.instances.length, 0)}
        </Row>
      </div>
    </div>
  );
}