'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/hooks';

type Tab = 'summary' | 'vitals' | 'notes' | 'medadmin' | 'handover' | 'tracking' | 'board';

const TABS: { key: Tab; label: string }[] = [
  { key: 'board', label: 'Bed Board' },
  { key: 'summary', label: 'Summary' },
  { key: 'vitals', label: 'Vitals' },
  { key: 'notes', label: 'Notes' },
  { key: 'medadmin', label: 'Med Admin' },
  { key: 'handover', label: 'Shift Handover' },
  { key: 'tracking', label: 'Patient Tracking' },
];

function unwrap(r: any): any {
  return r?.data?.data ?? r?.data ?? r;
}

function toList(r: any): any[] {
  const d = unwrap(r);
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.items)) return d.items;
  return [];
}

function patientName(p: any): string {
  if (!p) return '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.mrn || p.id || '—';
}

function medStatusGroup(m: any): 'DUE' | 'GIVEN' | 'SKIPPED' {
  const st = String(m.status || '').toUpperCase();
  if (st === 'GIVEN') return 'GIVEN';
  if (st === 'MISSED' || st === 'REFUSED' || st === 'HELD') return 'SKIPPED';
  return 'DUE';
}

function daysAdmitted(a: any): number {
  const start = a.admissionDate ? new Date(a.admissionDate).getTime() : Date.now();
  const end = a.dischargeDate ? new Date(a.dischargeDate).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 86400000));
}

const BED_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  OCCUPIED: { bg: '#dc2626', fg: '#fff', label: 'Occupied' },
  AVAILABLE: { bg: '#16a34a', fg: '#fff', label: 'Available' },
  RESERVED: { bg: '#f59e0b', fg: '#fff', label: 'Reserved' },
  CLEANING: { bg: '#94a3b8', fg: '#fff', label: 'Cleaning' },
  MAINTENANCE: { bg: '#64748b', fg: '#fff', label: 'Maintenance' },
  BLOCKED: { bg: '#334155', fg: '#fff', label: 'Blocked' },
};

function bedLabel(s: string): string {
  return BED_STYLE[s]?.label || String(s || 'UNKNOWN').replace(/_/g, ' ');
}

function boardBedBallot(b: any): { bg: string; fg: string } {
  const st = String(b.status || '').toUpperCase();
  if (b.bedType === 'ISOLATION' && st === 'OCCUPIED')
    return { bg: '#7c3aed', fg: '#fff' };
  return BED_STYLE[st] || { bg: '#94a3b8', fg: '#fff' };
}

export default function NursingPage() {
  const [tab, setTab] = useState<Tab>('board');

  const [patients, setPatients] = useState<any[]>([]);
  const [admissions, setAdmissions] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);

  const [patientId, setPatientId] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [vitals, setVitals] = useState<any[]>([]);
  const [loadingVitals, setLoadingVitals] = useState(false);

  const [notesAdmissionId, setNotesAdmissionId] = useState('');
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const [marAdmissionId, setMarAdmissionId] = useState('');
  const [meds, setMeds] = useState<any[]>([]);
  const [loadingMeds, setLoadingMeds] = useState(false);

  const [tasks, setTasks] = useState<any[]>([]);
  const [latestVitalMap, setLatestVitalMap] = useState<Record<string, string>>({});
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [handoverWardId, setHandoverWardId] = useState('');
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [handoverNotes, setHandoverNotes] = useState('');
  const [handovers, setHandovers] = useState<any[]>([]);
  const [handoverSavedMsg, setHandoverSavedMsg] = useState('');

  const [sortBy, setSortBy] = useState<'ward' | 'date'>('ward');

  const [board, setBoard] = useState<any>(null);
  const [boardWard, setBoardWard] = useState<string>('all');
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [boardMsg, setBoardMsg] = useState('');

  const loadBoard = useCallback(async () => {
    setLoadingBoard(true);
    try {
      const r = await api('/bed-management/board');
      const d = unwrap(r);
      setBoard(typeof d?.summary === 'object' ? d : { summary: {}, wards: [] });
    } catch (e: any) {
      setBoardMsg(e?.message || 'Failed to load bed board');
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'board') loadBoard();
  }, [tab, loadBoard]);

  const updateBedStatus = useCallback(async (bedId: string, status: string) => {
    setBoardMsg('');
    try {
      await api(`/bed-management/beds/${bedId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await loadBoard();
    } catch (e: any) {
      setBoardMsg(e?.message || 'Failed to update bed status');
    }
  }, [loadBoard]);

  const deallocateBed = useCallback(async (bedId: string) => {
    setBoardMsg('');
    try {
      await api(`/bed-management/deallocate/${bedId}`, { method: 'POST' });
      await loadBoard();
    } catch (e: any) {
      setBoardMsg(e?.message || 'Failed to release bed');
    }
  }, [loadBoard]);

  const loadCore = useCallback(async () => {
    const [p, a, w, d] = await Promise.allSettled([
      api('/patients?limit=500'),
      api('/admissions?limit=100&status=ADMITTED'),
      api('/bed-management/wards?limit=200'),
      api('/doctors?limit=200'),
    ]);
    setPatients(p.status === 'fulfilled' ? toList(p.value) : []);
    setAdmissions(a.status === 'fulfilled' ? toList(a.value) : []);
    setWards(w.status === 'fulfilled' ? toList(w.value) : []);
    setDoctors(d.status === 'fulfilled' ? toList(d.value) : []);
  }, []);

  useEffect(() => {
    loadCore();
    api('/nursing-handovers?limit=200')
      .then((r) => {
        const rows = toList(r);
        setHandovers(
          rows.map((row: any) => ({
            id: row.id,
            wardId: row.wardId,
            wardName: row.wardName,
            shiftDate: row.shiftDate,
            notes: row.notes,
            savedAt: row.createdAt,
          })),
        );
      })
      .catch(() => {});
  }, [loadCore]);

  const wardOf = useCallback(
    (a: any): string => {
      const bed = a.bedAllocations?.[0]?.bed;
      if (!bed) return 'Unassigned';
      const ward = wards.find((w) => w.id === bed.wardId);
      return ward?.name || bed.ward?.name || 'Unassigned';
    },
    [wards],
  );

  const doctorName = useCallback(
    (id?: string): string => {
      if (!id) return '—';
      const doc = doctors.find((d) => d.id === id);
      return doc ? patientName(doc.user) || patientName(doc) : 'Unknown';
    },
    [doctors],
  );

  const loadVitals = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoadingVitals(true);
    try {
      setVitals(toList(await api(`/encounters/vitals/patient/${pid}`)));
    } catch {
      setVitals([]);
    }
    setLoadingVitals(false);
  }, []);

  const loadNotes = useCallback(async (admId: string) => {
    if (!admId) return;
    setLoadingNotes(true);
    try {
      setNotes(toList(await api(`/admissions/${admId}/nursing-notes`)));
    } catch {
      setNotes([]);
    }
    setLoadingNotes(false);
  }, []);

  const loadMeds = useCallback(async (admId: string) => {
    if (!admId) return;
    setLoadingMeds(true);
    try {
      setMeds(toList(await api(`/admissions/${admId}/medications`)));
    } catch {
      setMeds([]);
    }
    setLoadingMeds(false);
  }, []);

  useEffect(() => {
    if ((tab === 'vitals' || tab === 'summary') && patientId) loadVitals(patientId);
  }, [tab, patientId, loadVitals]);

  useEffect(() => {
    if (tab === 'notes' && notesAdmissionId) loadNotes(notesAdmissionId);
  }, [tab, notesAdmissionId, loadNotes]);

  useEffect(() => {
    if (tab === 'medadmin' && marAdmissionId) loadMeds(marAdmissionId);
  }, [tab, marAdmissionId, loadMeds]);

  useEffect(() => {
    if (tab !== 'summary' || admissions.length === 0) return;
    let active = true;
    setLoadingTasks(true);
    const sample = admissions.slice(0, 10);
    Promise.allSettled(
      sample.map((a) =>
        Promise.all([
          api(`/admissions/${a.id}/medications`).catch(() => []),
          api(`/admissions/${a.id}/nursing-notes`).catch(() => []),
          api(`/encounters/vitals/patient/${a.patientId}`).catch(() => []),
        ]),
      ),
    ).then((results) => {
      if (!active) return;
      const built: any[] = [];
      const vitalMap: Record<string, string> = {};
      results.forEach((res, i) => {
        if (res.status !== 'fulfilled') return;
        const a = sample[i];
        const [medsR, notesR, vitalsR] = res.value as [any, any, any];
        const medList = Array.isArray(medsR) ? medsR : toList(medsR);
        const noteList = Array.isArray(notesR) ? notesR : toList(notesR);
        const vitalList = Array.isArray(vitalsR) ? vitalsR : toList(vitalsR);
        const label = patientName(a.patient);
        const loc = `${wardOf(a)} · ${a.bedAllocations?.[0]?.bed?.bedNumber || 'No bed'}`;
        medList
          .filter((m: any) => medStatusGroup(m) === 'DUE')
          .forEach((m: any) => {
            const due = m.scheduledTime ? new Date(m.scheduledTime) : null;
            const overdue = due ? due.getTime() < Date.now() : false;
            built.push({
              id: `med-${m.id}`,
              type: 'MEDS DUE',
              tone: overdue ? 'badge-red' : 'badge-yellow',
              patient: label,
              location: loc,
              admissionId: a.id,
              detail: `${m.medicineName} ${m.dose}${due ? ` · scheduled ${formatDateTime(due)}` : ''}${overdue ? ' (overdue)' : ''}`,
            });
          });
        if (noteList.length === 0) {
          built.push({
            id: `note-${a.id}`,
            type: 'NOTES PENDING',
            tone: 'badge-gray',
            patient: label,
            location: loc,
            admissionId: a.id,
            detail: 'No nursing note recorded yet',
          });
        }
        const lastVital = vitalList[0]?.recordedAt ? new Date(vitalList[0].recordedAt) : null;
        if (lastVital) vitalMap[a.id] = lastVital.toISOString();
        const hoursSince = lastVital ? (Date.now() - lastVital.getTime()) / 3600000 : Infinity;
        if (hoursSince >= 8) {
          built.push({
            id: `vital-${a.id}`,
            type: 'VITALS DUE',
            tone: hoursSince === Infinity ? 'badge-yellow' : 'badge-yellow',
            patient: label,
            location: loc,
            admissionId: a.id,
            detail:
              hoursSince === Infinity
                ? 'No vitals recorded this admission'
                : `Last recorded ${Math.floor(hoursSince)}h ago`,
          });
        }
      });
      setTasks(built);
      setLatestVitalMap(vitalMap);
      setLoadingTasks(false);
    });
    return () => {
      active = false;
    };
  }, [tab, admissions, wardOf]);

  const recordVital = async (data: any) => {
    await api('/encounters/vitals', { method: 'POST', body: JSON.stringify(data) }).catch(() => {});
    if (patientId) loadVitals(patientId);
  };

  const addNote = async (data: any) => {
    if (!notesAdmissionId) return;
    await api(`/admissions/${notesAdmissionId}/nursing-notes`, { method: 'POST', body: JSON.stringify(data) }).catch(() => {});
    loadNotes(notesAdmissionId);
  };

  const administerMed = async (medId: string) => {
    if (!marAdmissionId) return;
    await api(`/admissions/${marAdmissionId}/medications/${medId}/administer`, {
      method: 'POST',
      body: JSON.stringify({ status: 'GIVEN', givenTime: new Date().toISOString() }),
    }).catch(() => {});
    loadMeds(marAdmissionId);
  };

  const saveHandover = async () => {
    const wardName = wards.find((w) => w.id === handoverWardId)?.name || '';
    await api('/nursing-handovers', {
      method: 'POST',
      body: JSON.stringify({
        wardId: handoverWardId,
        wardName,
        shiftDate,
        notes: handoverNotes,
      }),
    }).catch(() => {});
    const rows = toList(await api('/nursing-handovers?limit=200').catch(() => []));
    setHandovers(
      rows.map((row: any) => ({
        id: row.id,
        wardId: row.wardId,
        wardName: row.wardName,
        shiftDate: row.shiftDate,
        notes: row.notes,
        savedAt: row.createdAt,
      })),
    );
    setHandoverNotes('');
    setHandoverSavedMsg(`Handover saved for ${wardName} (${shiftDate}).`);
    setTimeout(() => setHandoverSavedMsg(''), 4000);
  };

  const wardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    admissions.forEach((a) => {
      const name = wardOf(a);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((x, y) => y[1] - x[1]);
  }, [admissions, wardOf]);

  const handoverPatients = useMemo(() => {
    const wardName = wards.find((w) => w.id === handoverWardId)?.name;
    if (!wardName) return [];
    return admissions.filter((a) => wardOf(a) === wardName);
  }, [handoverWardId, wards, admissions, wardOf]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p: any) =>
      [p.firstName, p.lastName, p.mrn, p.id]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q)),
    );
  }, [patients, patientSearch]);

  const trackedPatients = useMemo(() => {
    const rows = [...admissions];
    if (sortBy === 'ward') rows.sort((a, b) => wardOf(a).localeCompare(wardOf(b)));
    else rows.sort((a, b) => new Date(b.admissionDate).getTime() - new Date(a.admissionDate).getTime());
    return rows;
  }, [admissions, sortBy, wardOf]);

  const urgencyOf = (a: any): { color: string; bg: string; label: string } => {
    const ward = wardOf(a).toUpperCase();
    if (ward.includes('ICU')) return { color: 'var(--danger)', bg: 'var(--danger-light)', label: 'ICU' };
    if (daysAdmitted(a) <= 3) return { color: 'var(--warning)', bg: 'var(--warning-light)', label: 'NEW' };
    return { color: 'var(--success)', bg: 'var(--success-light)', label: 'STABLE' };
  };

  const statusBadgeTone = (s: string) =>
    ({ ADMITTED: 'badge-blue', TRANSFERRED: 'badge-purple', PENDING: 'badge-yellow' }[String(s).toUpperCase()] || 'badge-gray');

  const renderSummary = () => (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Admitted Patients</div>
          <div className="stat-value">{admissions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Wards Occupied</div>
          <div className="stat-value" style={{ color: 'var(--primary)' }}>{wardCounts.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Tasks</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{tasks.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overdue Meds</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>
            {tasks.filter((t) => t.type === 'MEDS DUE' && t.tone === 'badge-red').length}
          </div>
        </div>
      </div>

      {wardCounts.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 12px' }}>Ward-wise Census</h2>
          <div className="stat-grid">
            {wardCounts.map(([name, count]) => (
              <div key={name} className="stat-card">
                <div className="stat-label">{name}</div>
                <div className="stat-value">{count}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Pending Tasks</div>
        {loadingTasks ? (
          <div className="loading">Computing tasks…</div>
        ) : tasks.length === 0 ? (
          <div className="empty">No pending tasks for recent admissions.</div>
        ) : (
          tasks.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span className={`badge ${t.tone}`}>{t.type}</span>
              <strong style={{ fontSize: 13.5 }}>{t.patient}</strong>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.location}</span>
              <span style={{ fontSize: 13 }}>{t.detail}</span>
            </div>
          ))
        )}
        {!loadingTasks && tasks.length > 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Based on the 10 most recent admissions.
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 12px' }}>Quick Patient Grid</h2>
      {admissions.length === 0 ? (
        <div className="empty">No admitted patients.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {admissions.map((a) => {
            const lastIso = latestVitalMap[a.id];
            const nextVitals = lastIso
              ? formatDateTime(new Date(new Date(lastIso).getTime() + 8 * 3600000))
              : 'Check now';
            return (
              <div key={a.id} className="card" style={{ boxShadow: 'none', marginBottom: 0 }}>
                <strong style={{ fontSize: 14 }}>{patientName(a.patient)}</strong>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'grid', gap: 2, marginTop: 6 }}>
                  <span>Bed: {a.bedAllocations?.[0]?.bed?.bedNumber || '—'}</span>
                  <span>Ward: {wardOf(a)}</span>
                  <span>Next vitals: {nextVitals}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderVitalsChart = () => {
    const chartData = [...vitals].slice(0, 5).reverse();
    if (chartData.length === 0) return null;
    const maxPulse = Math.max(120, ...chartData.map((v) => Number(v.pulse) || 0));
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Heart Rate Trend (last 5 readings)</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 150 }}>
          {chartData.map((v) => {
            const p = Number(v.pulse) || 0;
            const pct = p > 0 ? Math.round((p / maxPulse) * 100) : 2;
            const color = p > 100 ? 'var(--danger)' : p > 0 && p < 60 ? 'var(--warning)' : 'var(--primary)';
            return (
              <div key={v.id} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{p || '—'}</span>
                <div style={{ width: '65%', height: `${pct}%`, background: color, borderRadius: '4px 4px 0 0', minHeight: 3 }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {v.recordedAt ? new Date(v.recordedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderVitals = () => {
    const selectedPatient = patients.find((p: any) => p.id === patientId);
    return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Select Patient</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
            <input
              className="input"
              placeholder="Search by name or MRN..."
              value={selectedPatient ? patientSearch || patientName(selectedPatient) : patientSearch}
              onChange={(e) => {
                setPatientSearch(e.target.value);
                if (patientId) { setPatientId(''); setVitals([]); }
              }}
              onFocus={(e) => { if (selectedPatient) e.target.select(); }}
              style={{ paddingRight: 28 }}
            />
            {patientSearch && (
              <button
                type="button"
                onClick={() => { setPatientSearch(''); setPatientId(''); setVitals([]); }}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>
          {selectedPatient && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{patientName(selectedPatient)}</span>
              {selectedPatient.mrn && <span style={{ color: 'var(--text-muted)' }}>(MRN {selectedPatient.mrn})</span>}
            </div>
          )}
        </div>
        {patientSearch && !patientId && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
            {filteredPatients.length === 0 ? (
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>No patients found.</div>
            ) : (
              filteredPatients.slice(0, 50).map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setPatientId(p.id); setPatientSearch(''); }}
                  style={{ display: 'flex', gap: 10, width: '100%', padding: '8px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover, #f1f5f9)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 600 }}>{patientName(p)}</span>
                  {p.mrn && <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>MRN {p.mrn}</span>}
                </button>
              ))
            )}
          </div>
        )}
        {!patientSearch && !patientId && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Type a patient name or MRN to search, then select from the results.
          </div>
        )}
      </div>

      {patientId && renderVitalsChart()}
      {loadingVitals && <div className="loading">Loading vitals...</div>}
      {vitals.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>BP</th>
                <th>Temp</th>
                <th>Pulse</th>
                <th>Resp</th>
                <th>SpO2</th>
                <th>Weight</th>
                <th>Pain</th>
                <th>Glucose</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {vitals.slice(0, 10).map((v: any) => (
                <tr key={v.id}>
                  <td style={{ fontSize: 12 }}>{formatDateTime(v.recordedAt)}</td>
                  <td>{v.bloodPressureSystolic && v.bloodPressureDiastolic ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}` : '—'}</td>
                  <td>{v.temperature ?? '—'}</td>
                  <td>{v.pulse ?? '—'}</td>
                  <td>{v.respiratoryRate ?? '—'}</td>
                  <td>{v.oxygenSaturation != null ? `${v.oxygenSaturation}%` : '—'}</td>
                  <td>{v.weight ? `${v.weight} kg` : '—'}</td>
                  <td>{v.painScore ?? '—'}</td>
                  <td>{v.bloodGlucose ?? '—'}</td>
                  <td style={{ fontSize: 12, maxWidth: 150 }}>{v.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loadingVitals && patientId && vitals.length === 0 && (
        <div className="empty">No vital records found for this patient.</div>
      )}
    </div>
    );
  };

  const renderNotes = () => (
    <div>
      <div className="toolbar">
        <select className="input" style={{ maxWidth: 340 }} value={notesAdmissionId} onChange={(e) => setNotesAdmissionId(e.target.value)}>
          <option value="">Choose admission...</option>
          {admissions.map((a: any) => (
            <option key={a.id} value={a.id}>{a.admissionNumber} — {patientName(a.patient)}</option>
          ))}
        </select>
      </div>

      {loadingNotes && <div className="loading">Loading notes...</div>}
      {notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notes.map((n: any) => (
            <div key={n.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Nursing Note</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDateTime(n.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>{n.note}</div>
              {n.assessment && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}><strong>Assessment:</strong> {n.assessment}</div>}
              {n.plan && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}><strong>Plan:</strong> {n.plan}</div>}
            </div>
          ))}
        </div>
      )}
      {!loadingNotes && notesAdmissionId && notes.length === 0 && (
        <div className="empty">No nursing notes for this admission.</div>
      )}
      {!notesAdmissionId && <div className="empty">Select an admission to view and add nursing notes.</div>}
    </div>
  );

  const renderMedAdmin = () => {
    const dayStartMins = 0;
    const trackPct = (iso?: string) => {
      if (!iso) return null;
      const d = new Date(iso);
      const mins = d.getHours() * 60 + d.getMinutes();
      return Math.min(98, Math.max(dayStartMins, (mins / 1440) * 100));
    };
    const groupColor: Record<string, string> = {
      DUE: 'var(--warning)',
      GIVEN: 'var(--success)',
      SKIPPED: 'var(--danger)',
    };
    return (
      <div>
        <div className="toolbar">
          <select className="input" style={{ maxWidth: 340 }} value={marAdmissionId} onChange={(e) => setMarAdmissionId(e.target.value)}>
            <option value="">Choose admission...</option>
            {admissions.map((a: any) => (
              <option key={a.id} value={a.id}>{a.admissionNumber} — {patientName(a.patient)}</option>
            ))}
          </select>
        </div>

        {loadingMeds && <div className="loading">Loading medications...</div>}

        {!loadingMeds && marAdmissionId && meds.length === 0 && (
          <div className="empty">No medications scheduled for this admission.</div>
        )}

        {meds.length > 0 && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title">Medication Timeline (24h)</div>
              {meds.map((m: any) => {
                const grp = medStatusGroup(m);
                const left = trackPct(m.scheduledTime);
                return (
                  <div key={`tl-${m.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ width: 170, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.medicineName} {m.dose}
                    </span>
                    <div style={{ flex: 1, position: 'relative', height: 14, background: '#f1f5f9', borderRadius: 7 }}>
                      {left != null && (
                        <div
                          title={`${formatDateTime(m.scheduledTime)} · ${grp}`}
                          style={{
                            position: 'absolute',
                            left: `${left}%`,
                            top: 0,
                            bottom: 0,
                            width: '5%',
                            minWidth: 10,
                            background: groupColor[grp],
                            borderRadius: 7,
                          }}
                        />
                      )}
                    </div>
                    <span style={{ width: 46, textAlign: 'right', fontSize: 11, color: 'var(--text-muted)' }}>
                      {m.scheduledTime ? new Date(m.scheduledTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', paddingLeft: 180, paddingRight: 56 }}>
                <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Dosage</th>
                    <th>Route</th>
                    <th>Scheduled Time</th>
                    <th>Status</th>
                    <th style={{ width: 1 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...meds]
                    .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
                    .map((m: any) => {
                      const grp = medStatusGroup(m);
                      return (
                        <tr key={m.id}>
                          <td style={{ fontWeight: 600 }}>{m.medicineName}</td>
                          <td>{m.dose}</td>
                          <td>{m.route || '—'}</td>
                          <td style={{ fontSize: 12 }}>{formatDateTime(m.scheduledTime)}</td>
                          <td>
                            <span className="badge" style={{ background: groupColor[grp], color: grp === 'DUE' ? '#92400e' : undefined }}>
                              {grp}
                            </span>
                            {grp !== 'GIVEN' && m.givenTime && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>given {formatDateTime(m.givenTime)}</span>
                            )}
                          </td>
                          <td>
                            {grp === 'DUE' && (
                              <button className="btn btn-sm" onClick={() => administerMed(m.id)}>Give</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!marAdmissionId && !loadingMeds && <div className="empty">Select an admitted patient to view their medication schedule.</div>}
      </div>
    );
  };

  const renderHandover = () => {
    const previous = [...handovers].reverse();
    return (
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Create Shift Handover</div>
          {handoverSavedMsg && <div className="alert alert-success">{handoverSavedMsg}</div>}
          <div className="form-grid">
            <div className="field">
              <label className="label">Ward *</label>
              <select className="input" value={handoverWardId} onChange={(e) => setHandoverWardId(e.target.value)}>
                <option value="">-- Select ward --</option>
                {wards.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Ward Name (auto)</label>
              <input className="input" readOnly value={wards.find((w) => w.id === handoverWardId)?.name || ''} placeholder="Select a ward" />
            </div>
            <div className="field">
              <label className="label">Shift Date *</label>
              <input className="input" type="date" value={shiftDate} onChange={(e) => setShiftDate(e.target.value)} />
            </div>
            <div className="field field-full">
              <label className="label">Handover Notes</label>
              <textarea
                className="textarea"
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                placeholder="Critical events, pending investigations, watch points for the incoming shift..."
                style={{ minHeight: 90 }}
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn" disabled={!handoverWardId} onClick={saveHandover}>Save Handover</button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Patient Summary — {wards.find((w) => w.id === handoverWardId)?.name || 'Select a ward'}</div>
          {!handoverWardId ? (
            <div className="empty">Select a ward to see its patients.</div>
          ) : handoverPatients.length === 0 ? (
            <div className="empty">No admitted patients in this ward.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Bed</th>
                    <th>Diagnosis</th>
                    <th>Key Concerns</th>
                    <th>Pending Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {handoverPatients.map((a) => {
                    const diagnosis =
                      a.provisionalDiagnosis || a.primaryDiagnosis || a.finalDiagnosis || '—';
                    const concern =
                      String(a.admissionType).toUpperCase() === 'EMERGENCY'
                        ? 'Emergency admission'
                        : String(a.admissionType).toUpperCase() === 'TRANSFER'
                          ? 'Recent transfer'
                          : 'None flagged';
                    const pt = tasks.filter((t) => t.admissionId === a.id);
                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{patientName(a.patient)}</td>
                        <td>{a.bedAllocations?.[0]?.bed?.bedNumber || '—'}</td>
                        <td style={{ fontSize: 13 }}>{diagnosis}</td>
                        <td style={{ fontSize: 13 }}>{concern}</td>
                        <td style={{ fontSize: 13 }}>{pt.length ? `${pt.length} pending` : 'None'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Previous Handovers</div>
          {previous.length === 0 ? (
            <div className="empty">No saved handovers yet.</div>
          ) : (
            previous.map((h: any) => (
              <div key={h.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <span className="badge badge-blue">{h.wardName || h.wardId}</span>
                  <strong style={{ fontSize: 13 }}>{h.shiftDate}</strong>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>saved {formatDateTime(h.savedAt)}</span>
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{h.notes || '—'}</div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderTracking = () => (
    <div>
      <div className="toolbar">
        <select className="input" style={{ maxWidth: 220 }} value={sortBy} onChange={(e) => setSortBy(e.target.value as 'ward' | 'date')}>
          <option value="ward">Sort by ward</option>
          <option value="date">Sort by admission date</option>
        </select>
        <span style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--danger)', borderRadius: 2, marginRight: 5 }} />ICU</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--warning)', borderRadius: 2, marginRight: 5 }} />First 3 days</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--success)', borderRadius: 2, marginRight: 5 }} />Stable</span>
        </span>
      </div>

      {trackedPatients.length === 0 ? (
        <div className="empty">No admitted patients to track.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {trackedPatients.map((a) => {
            const u = urgencyOf(a);
            const days = daysAdmitted(a);
            return (
              <div
                key={a.id}
                className="card"
                style={{ boxShadow: 'none', marginBottom: 0, borderLeft: `4px solid ${u.color}`, background: u.bg }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ fontSize: 14.5 }}>{patientName(a.patient)}</strong>
                  <span className={`badge ${statusBadgeTone(a.status)}`}>{String(a.status).replace(/_/g, ' ')}</span>
                </div>
                <div style={{ fontSize: 12.5, display: 'grid', gap: 3 }}>
                  <span>Bed/Ward: {a.bedAllocations?.[0]?.bed?.bedNumber || '—'} / {wardOf(a)}</span>
                  <span>Admitted: {formatDate(a.admissionDate)}</span>
                  <span>Days admitted: {days}</span>
                  <span>Doctor: {doctorName(a.admittingDoctorId)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderBoard = () => {
    const summary = board?.summary || {};
    const wards = Array.isArray(board?.wards) ? board.wards : [];
    const filtered = summary ? wards : [];
    const visible = boardWard === 'all' ? filtered : filtered.filter((w: any) => w.id === boardWard);
    const statCards = [
      { label: 'Total Beds', value: summary.total ?? 0, tone: 'blue' },
      { label: 'Available', value: summary.available ?? 0, tone: 'green' },
      { label: 'Occupied', value: summary.occupied ?? 0, tone: 'red' },
      { label: 'Cleaning', value: summary.cleaning ?? 0, tone: 'gray' },
      { label: 'Reserved', value: summary.reserved ?? 0, tone: 'amber' },
      { label: 'Isolation', value: summary.isolation ?? 0, tone: 'purple' },
    ];
    const statTone: Record<string, string> = {
      blue: 'stat-blue',
      green: 'stat-green',
      red: 'stat-red',
      amber: 'stat-amber',
      gray: '',
      purple: 'stat-purple',
    };

    const renderBed = (b: any) => {
      const occ = b.allocations?.[0]?.admission;
      const st = String(b.status || '').toUpperCase();
      const { bg, fg } = boardBedBallot(b);
      const isIsolation = b.bedType === 'ISOLATION';
      return (
        <div
          key={b.id}
          style={{
            border: `1px solid ${isIsolation ? '#7c3aed' : 'var(--border)'}`,
            borderRadius: 10,
            padding: 10,
            background: st === 'OCCUPIED' ? bg : 'var(--surface)',
            color: st === 'OCCUPIED' ? fg : 'inherit',
            minHeight: 118,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 15 }}>{b.bedNumber}</strong>
            <span
              className="badge"
              style={{
                background: st === 'OCCUPIED' ? 'rgba(255,255,255,0.22)' : 'var(--border)',
                color: st === 'OCCUPIED' ? '#fff' : 'inherit',
                fontSize: 10.5,
              }}
            >
              {bedLabel(st)}
            </span>
          </div>
          {isIsolation && (
            <span
              className="badge"
              style={{ background: '#7c3aed', color: '#fff', fontSize: 10, width: 'fit-content' }}
            >
              ISOLATION
            </span>
          )}
          {occ ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>
                {patientName(occ.patient)}
              </div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>
                {occ.admissionNumber} · MRN {occ.patient?.mrn || '—'}
              </div>
              {occ.primaryDiagnosis && (
                <div style={{ fontSize: 11, opacity: 0.9, fontStyle: 'italic' }}>
                  {occ.primaryDiagnosis}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.7 }}>No patient</div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 'auto', flexWrap: 'wrap' }}>
            {st === 'OCCUPIED' ? (
              <button className="btn btn-sm btn-secondary" style={{ fontSize: 11, flex: 1 }} onClick={() => deallocateBed(b.id)}>
                Release / Discharge
              </button>
            ) : (
              <>
                <button
                  className="btn btn-sm"
                  style={{ fontSize: 11, flex: 1, background: '#16a34a', borderColor: '#16a34a' }}
                  disabled={st === 'AVAILABLE' || st === 'OCCUPIED'}
                  onClick={() => updateBedStatus(b.id, 'AVAILABLE')}
                >
                  Mark Available
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  style={{ fontSize: 11, flex: 1 }}
                  disabled={st === 'CLEANING'}
                  onClick={() => updateBedStatus(b.id, 'CLEANING')}
                >
                  Cleaning
                </button>
              </>
            )}
          </div>
        </div>
      );
    };

    return (
      <div>
        {boardMsg && <div className="banner-danger">{boardMsg}</div>}

        <div className="stat-grid" style={{ marginBottom: 20 }}>
          {statCards.map((c) => (
            <div className="stat-card" key={c.label}>
              <div className="stat-label">{c.label}</div>
              <div className={`stat-value ${statTone[c.tone]}`}>{c.value}</div>
            </div>
          ))}
        </div>

        <div className="toolbar">
          <select className="input" style={{ maxWidth: 260 }} value={boardWard} onChange={(e) => setBoardWard(e.target.value)}>
            <option value="all">All wards</option>
            {filtered.map((w: any) => (
              <option key={w.id} value={w.id}>
                {w.name} — {w.totalBeds} beds ({w.occupied} occ)
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={loadBoard} disabled={loadingBoard}>
            Refresh
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Occupancy {summary.occupancyRate ?? 0}%
          </span>
        </div>

        {loadingBoard ? (
          <div className="loading">Loading bed board…</div>
        ) : visible.length === 0 ? (
          <div className="empty">No wards or beds configured for your facility.</div>
        ) : (
          visible.map((w: any) => {
            const rooms = Array.isArray(w.rooms) ? w.rooms : [];
            const unassigned = Array.isArray(w.unassignedBeds) ? w.unassignedBeds : [];
            return (
              <div className="card" key={w.id} style={{ marginBottom: 18 }}>
                <div className="row-between" style={{ marginBottom: 12 }}>
                  <div>
                    <span className="card-title">{w.name}</span>
                    {w.department && (
                      <span className="badge badge-blue" style={{ marginLeft: 8 }}>{w.department}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {w.totalBeds} beds · {w.occupied} occupied ({w.floor != null ? `Floor ${w.floor}` : w.code || ''})
                  </span>
                </div>

                {rooms.length === 0 && unassigned.length === 0 ? (
                  <div className="empty">No beds configured in this ward.</div>
                ) : (
                  rooms.map((r: any) => (
                    <div key={r.id} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>
                        {r.name || r.roomNumber || 'Room'}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                        {r.beds.map(renderBed)}
                      </div>
                    </div>
                  ))
                )}

                {unassigned.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>
                      Other beds
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                      {unassigned.map(renderBed)}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Nursing</h1>
          <p className="page-subtitle">Census, vitals, notes, medication administration and shift handover</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'board' && renderBoard()}
      {tab === 'summary' && renderSummary()}
      {tab === 'vitals' && renderVitals()}
      {tab === 'notes' && renderNotes()}
      {tab === 'medadmin' && renderMedAdmin()}
      {tab === 'handover' && renderHandover()}
      {tab === 'tracking' && renderTracking()}
    </AppShell>
  );
}
