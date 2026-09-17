'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ModulePage from '@/components/ModulePage';
import { api } from '@/lib/api';
import { BLOOD_GROUPS, GENDERS, MARITAL_STATUS, PATIENT_TYPES } from '@/lib/options';

const REGISTRATION_ROLES = [
  'RECEPTIONIST',
  'RECEPTION_SUPERVISOR',
  'HOSPITAL_ADMIN',
  'HOSPITAL_OWNER',
  'PLATFORM_SUPER_ADMIN',
  'IT_ADMIN',
];

function CsvImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; error: string }[] } | null>(null);

  const COLUMN_MAP: Record<string, string> = {
    'first name': 'firstName', 'firstname': 'firstName', 'first_name': 'firstName',
    'middle name': 'middleName', 'middlename': 'middleName', 'middle_name': 'middleName',
    'last name': 'lastName', 'lastname': 'lastName', 'last_name': 'lastName',
    'date of birth': 'dateOfBirth', 'dob': 'dateOfBirth', 'dateofbirth': 'dateOfBirth', 'birth_date': 'dateOfBirth',
    'gender': 'gender', 'sex': 'gender',
    'blood group': 'bloodGroup', 'bloodgroup': 'bloodGroup', 'blood_group': 'bloodGroup',
    'phone': 'phone', 'telephone': 'phone',
    'mobile': 'mobile', 'cell': 'mobile', 'cellphone': 'mobile',
    'email': 'email',
    'address': 'addressLine1', 'address line 1': 'addressLine1', 'addressline1': 'addressLine1', 'address_line_1': 'addressLine1',
    'address line 2': 'addressLine2', 'addressline2': 'addressLine2', 'address_line_2': 'addressLine2',
    'city': 'city', 'district': 'district', 'province': 'province', 'state': 'province',
    'country': 'country', 'nationality': 'nationality',
    'postal code': 'postalCode', 'postalcode': 'postalCode', 'postal_code': 'postalCode', 'zip': 'postalCode', 'pincode': 'postalCode',
    'emergency contact': 'emergencyContactName', 'emergency_name': 'emergencyContactName', 'emergency contact name': 'emergencyContactName',
    'emergency relation': 'emergencyContactRelationship', 'emergency relationship': 'emergencyContactRelationship',
    'emergency mobile': 'emergencyContactMobile', 'emergency phone': 'emergencyContactPhone',
    'occupation': 'occupation', 'education': 'education',
    'marital status': 'maritalStatus', 'maritalstatus': 'maritalStatus', 'marital_status': 'maritalStatus',
    'national id': 'nationalId', 'nationalid': 'nationalId', 'national_id': 'nationalId', 'citizenship': 'nationalId',
    'passport': 'passportNumber', 'passport number': 'passportNumber', 'passportnumber': 'passportNumber',
    'patient type': 'patientType', 'patienttype': 'patientType', 'patient_type': 'patientType',
    'religion': 'religion',
  };

  function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
    const clean = text.replace(/^\uFEFF/, '');
    const lines: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (ch === '"') {
        if (inQuotes && clean[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && clean[i + 1] === '\n') i++;
        lines.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) lines.push(current);

    if (lines.length < 2) return { headers: [], rows: [] };

    const rawHeaders = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const mappedHeaders = rawHeaders.map((h) => COLUMN_MAP[h.toLowerCase()] || h);

    const data: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals: string[] = [];
      let val = '';
      let inQ = false;
      for (let j = 0; j < lines[i].length; j++) {
        const ch = lines[i][j];
        if (ch === '"') {
          if (inQ && lines[i][j + 1] === '"') { val += '"'; j++; }
          else { inQ = !inQ; }
        } else if (ch === ',' && !inQ) {
          vals.push(val);
          val = '';
        } else {
          val += ch;
        }
      }
      vals.push(val);

      const row: Record<string, string> = {};
      mappedHeaders.forEach((h, idx) => { row[h] = (vals[idx] || '').replace(/^"|"$/g, '').trim(); });
      const hasData = Object.values(row).some((v) => v.length > 0);
      if (hasData) data.push(row);
    }

    return { headers: mappedHeaders, rows: data };
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
    };
    reader.readAsText(f);
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const res: any = await api('/patients/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      const data = res?.data?.data ?? res?.data ?? res;
      setResult(data);
      if (data?.imported > 0) onDone();
    } catch (err: any) {
      setResult({ imported: 0, errors: [{ row: 0, error: err.message || 'Import failed' }] });
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const csv = 'firstName,lastName,gender,dateOfBirth,mobile,email,city,district,province,country,nationality,patientType\nRam,Sharma,MALE,1990-05-15,9841234567,ram@test.com,Kathmandu,Kathmandu,Bagmati,Nepal,Nepali,GENERAL\nSita,Thapa,FEMALE,1985-08-20,9851234567,sita@test.com,Pokhara,Kaski,Gandaki,Nepal,Nepali,GENERAL';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'patient-import-template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '85vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Import Patients from CSV</h2>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 18 }}>×</button>
        </div>

        {!result ? (
          <>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{ flex: 1 }} />
              <button className="btn btn-secondary" onClick={downloadTemplate} style={{ whiteSpace: 'nowrap' }}>
                Download Template
              </button>
            </div>

            {file && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                {file.name} — {rows.length} rows detected
              </p>
            )}

            {headers.length > 0 && rows.length > 0 && (
              <>
                <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Preview (first 5 of {rows.length} rows):
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, i) => (
                        <tr key={i}>{headers.map((h) => <td key={h}>{row[h] || '—'}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                  <button className="btn" onClick={handleImport} disabled={importing}>
                    {importing ? 'Importing...' : `Import ${rows.length} Patients`}
                  </button>
                </div>
              </>
            )}

            {rows.length === 0 && file && (
              <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: 'var(--amber-bg, #fffbeb)', border: '1px solid var(--amber, #f59e0b)', fontSize: 13, color: '#92400e' }}>
                No valid rows found. Make sure your CSV has a header row and comma-separated values.
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div style={{
              padding: 16, borderRadius: 8,
              background: result.imported > 0 ? 'var(--green-bg, #f0fdf4)' : 'var(--red-bg, #fef2f2)',
              border: `1px solid ${result.imported > 0 ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)'}`,
            }}>
              <p style={{ fontWeight: 600, margin: '0 0 4px' }}>
                {result.imported} patient{result.imported !== 1 ? 's' : ''} imported successfully
              </p>
              {result.errors.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                    {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} failed:
                  </p>
                  {result.errors.slice(0, 10).map((err, i) => (
                    <p key={i} style={{ fontSize: 12, margin: 0, color: 'var(--red, #ef4444)' }}>
                      Row {err.row}: {err.error}
                    </p>
                  ))}
                  {result.errors.length > 10 && (
                    <p style={{ fontSize: 12, margin: '4px 0 0', color: 'var(--text-muted)' }}>
                      ...and {result.errors.length - 10} more errors
                    </p>
                  )}
                </div>
              )}
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { setResult(null); setFile(null); setRows([]); setHeaders([]); onClose(); }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PatientsPage() {
  const router = useRouter();
  const [showImport, setShowImport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [role, setRole] = useState('');

  useEffect(() => {
    setRole(localStorage.getItem('role') || '');
  }, []);

  const canRegister = REGISTRATION_ROLES.includes(role);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <>
      <ModulePage
        key={refreshKey}
        title="Patients"
        subtitle="Patient registry & master index"
        endpoint="/patients"
        createLabel="Register patient"
        createRoles={REGISTRATION_ROLES}
        headerActions={(load) => (
          <>
            {canRegister && (
              <>
                <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
                  Import CSV
                </button>
                <button className="btn btn-secondary" onClick={() => router.push('/patients/follow-ups')}>
                  Follow Up
                </button>
              </>
            )}
          </>
        )}
        columns={[
          { key: 'mrn', label: 'MRN', render: (r) => <span className="mono">{r.mrn}</span> },
          {
            key: 'name',
            label: 'Name',
            render: (r) => [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' '),
          },
          { key: 'gender', label: 'Gender', badge: (v) => (v === 'FEMALE' ? 'purple' : 'blue') },
          { key: 'age', label: 'Age' },
          { key: 'mobile', label: 'Mobile' },
          { key: 'patientType', label: 'Type', badge: true },
          { key: 'status', label: 'Status', badge: true },
        ]}
        detailHref={(r) => `/patients/${r.id}`}
        fields={[
          { name: 'firstName', label: 'First name', required: true },
          { name: 'middleName', label: 'Middle name' },
          { name: 'lastName', label: 'Last name', required: true },
          { name: 'age', label: 'Age (years)', type: 'number' },
          { name: 'gender', label: 'Gender', type: 'select', options: GENDERS },
          { name: 'bloodGroup', label: 'Blood group', type: 'select', options: BLOOD_GROUPS },
          { name: 'maritalStatus', label: 'Marital status', type: 'select', options: MARITAL_STATUS },
          { name: 'patientType', label: 'Patient type', type: 'select', options: PATIENT_TYPES, defaultValue: 'GENERAL' },
          { name: 'mobile', label: 'Mobile' },
          { name: 'phone', label: 'Phone' },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'nationality', label: 'Nationality' },
          { name: 'nationalId', label: 'National ID' },
          { name: 'addressLine1', label: 'Address line 1' },
          { name: 'city', label: 'City' },
          { name: 'district', label: 'District' },
          { name: 'province', label: 'Province' },
          { name: 'country', label: 'Country' },
          { name: 'emergencyContactName', label: 'Emergency contact' },
          { name: 'emergencyContactRelationship', label: 'Emergency relation' },
          { name: 'emergencyContactMobile', label: 'Emergency mobile' },
          { name: 'occupation', label: 'Occupation' },
          {
            name: 'allergies',
            label: 'Allergies',
            type: 'allergies',
            full: true,
          },
        ]}
      />
      <CsvImportModal open={showImport} onClose={() => setShowImport(false)} onDone={refresh} />
    </>
  );
}
