'use client';

import { useRef, useState } from 'react';
import { dicomApi } from '@/lib/dicom';
import type { DicomUploadResult } from '@/lib/dicom';

interface DicomUploadProps {
  onDone: (result: DicomUploadResult) => void;
  onClose: () => void;
  defaultRadiologyOrderId?: string | null;
}

export function DicomUploadModal({ onDone, onClose, defaultRadiologyOrderId }: DicomUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [patientId, setPatientId] = useState('');
  const [radiologyOrderId, setRadiologyOrderId] = useState(defaultRadiologyOrderId ?? '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Upload DICOM</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
          <div>
            <label className="label">DICOM file(s)</label>
            <input
              ref={inputRef}
              className="input"
              type="file"
              accept=".dcm,.dicom,application/dicom"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <div className="note" style={{ marginTop: 6 }}>
                {files.length} file{files.length === 1 ? '' : 's'} selected · {(
                  files.reduce((n, f) => n + f.size, 0) / (1024 * 1024)
                ).toFixed(2)} MB
              </div>
            )}
          </div>

          <div>
            <label className="label">Patient link (optional)</label>
            <input
              className="input"
              placeholder="Patient UUID"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Radiology order link (optional)</label>
            <input
              className="input"
              placeholder="Radiology order UUID"
              value={radiologyOrderId}
              onChange={(e) => setRadiologyOrderId(e.target.value)}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}
        </div>

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn"
            style={{ background: 'var(--primary)', color: '#fff' }}
            disabled={!files.length || uploading}
            onClick={async () => {
              setUploading(true);
              setError(null);
              try {
                const result = await dicomApi.upload(files, patientId || undefined, radiologyOrderId || undefined);
                onDone(result);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Upload failed');
              }
              setUploading(false);
            }}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}