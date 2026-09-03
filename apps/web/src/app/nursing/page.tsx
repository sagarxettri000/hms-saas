'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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
  const [showRecordVitals, setShowRecordVitals] = useState(false);
  const [savingVitals, setSavingVitals] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({
    bloodPressureSystolic: '', bloodPressureDiastolic: '', temperature: '',
    pulse: '', respiratoryRate: '', oxygenSaturation: '', weight: '',
    painScore: '', bloodGlucose: '', notes: '',
  });

  const [notesAdmissionId, setNotesAdmissionId] = useState('');
  const [notesPatientId, setNotesPatientId] = useState('');
  const [notesPatientSearch, setNotesPatientSearch] = useState('');
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteForm, setNoteForm] = useState({ note: '', assessment: '', plan: '' });
  const [savingNote, setSavingNote] = useState(false);

  const [marAdmissionId, setMarAdmissionId] = useState('');
  const [marPatientId, setMarPatientId] = useState('');
  const [marPatientSearch, setMarPatientSearch] = useState('');
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

  const [trackerQuery, setTrackerQuery] = useState('');
  const [trackerFilter, setTrackerFilter] = useState<'all' | 'icu' | 'first3' | 'highrisk' | 'stable'>('all');
  const [trackingEnrich, setTrackingEnrich] = useState<Record<string, { vitals: any[]; meds: any[] }>>({});
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');

  const router = useRouter();

  const gotoQuickAction = (action: 'vitals' | 'notes' | 'medadmin', a: any) => {
    if (action === 'vitals') {
      setPatientId(a.patientId);
      setTab('vitals');
    } else if (action === 'notes') {
      setNotesPatientId(a.patientId);
      setNotesAdmissionId(a.id);
      setTab('notes');
    } else if (action === 'medadmin') {
      setMarPatientId(a.patientId);
      setMarAdmissionId(a.id);
      setTab('medadmin');
    }
  };

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

  const trackingKeyRef = useRef('');

  const trackingEnrichEffect = useCallback(async () => {
    if (admissions.length === 0) {
      setTrackingEnrich({});
      setTrackingLoading(false);
      return;
    }
    const key = admissions.map((a: any) => a.id).join('|');
    if (key === trackingKeyRef.current) return;
    trackingKeyRef.current = key;
    setTrackingLoading(true);
    setTrackingError('');
    const map: Record<string, { vitals: any[]; meds: any[] }> = {};
    await Promise.allSettled(
      admissions.map(async (a: any) => {
        try {
          const [v, m] = await Promise.all([
            api(`/encounters/vitals/patient/${a.patientId}`).catch(() => []),
            api(`/admissions/${a.id}/medications`).catch(() => []),
          ]);
          map[a.id] = { vitals: toList(v), meds: toList(m) };
        } catch {
          map[a.id] = { vitals: [], meds: [] };
        }
      }),
    );
    setTrackingEnrich(map);
    if (Object.keys(map).length === 0 && admissions.length > 0) {
      setTrackingError('Patient clinical data could not be loaded.');
    }
    setTrackingLoading(false);
  }, [admissions]);

  useEffect(() => {
    if (tab === 'tracking') trackingEnrichEffect();
  }, [tab, trackingEnrichEffect]);

  const resetVitalsForm = () => {
    setVitalsForm({ bloodPressureSystolic: '', bloodPressureDiastolic: '', temperature: '', pulse: '', respiratoryRate: '', oxygenSaturation: '', weight: '', painScore: '', bloodGlucose: '', notes: '' });
    setShowRecordVitals(false);
  };

  const submitVitals = async () => {
    if (!patientId) return;
    setSavingVitals(true);
    const payload: any = { patientId };
    Object.entries(vitalsForm).forEach(([k, v]) => {
      if (v !== '' && v != null) payload[k] = k === 'notes' ? v : Number(v);
    });
    try {
      await api('/encounters/vitals', { method: 'POST', body: JSON.stringify(payload) });
      resetVitalsForm();
      loadVitals(patientId);
    } catch {}
    setSavingVitals(false);
  };

  const submitNote = async () => {
    if (!notesAdmissionId || !noteForm.note.trim()) return;
    setSavingNote(true);
    try {
      await api(`/admissions/${notesAdmissionId}/nursing-notes`, {
        method: 'POST',
        body: JSON.stringify({ note: noteForm.note.trim(), assessment: noteForm.assessment.trim() || undefined, plan: noteForm.plan.trim() || undefined }),
      });
      setNoteForm({ note: '', assessment: '', plan: '' });
      loadNotes(notesAdmissionId);
    } catch {}
    setSavingNote(false);
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

  const filterPatientsBy = (q: string) => {
    const term = q.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((p: any) =>
      [p.firstName, p.lastName, p.mrn, p.id]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(term)),
    );
  };

  const notesPatientAdmissions = useMemo(() => {
    if (!notesPatientId) return [];
    return admissions.filter((a: any) => a.patientId === notesPatientId);
  }, [admissions, notesPatientId]);

  const marPatientAdmissions = useMemo(() => {
    if (!marPatientId) return [];
    return admissions.filter((a: any) => a.patientId === marPatientId);
  }, [admissions, marPatientId]);

  const admittedPatientOptions = useMemo(() => {
    const seen = new Set<string>();
    const rows: any[] = [];
    admissions.forEach((a: any) => {
      const pid = a.patientId;
      if (!pid || seen.has(pid)) return;
      seen.add(pid);
      rows.push({
        patientId: pid,
        admissionId: a.id,
        patient: a.patient,
        admissionNumber: a.admissionNumber || a.id.slice(0, 8),
        bedNumber: a.bedAllocations?.[0]?.bed?.bedNumber || '—',
      });
    });
    return rows;
  }, [admissions]);

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

  const vitalOf = (a: any): any => {
    const vit = trackingEnrich[a.id]?.vitals;
    return Array.isArray(vit) ? vit[0] : undefined;
  };

  const medsOf = (a: any): any[] => {
    const m = trackingEnrich[a.id]?.meds;
    return Array.isArray(m) ? m : [];
  };

  const num = (v: any): number | undefined =>
    v === null || v === undefined || v === '' ? undefined : Number(v);

  const isCriticalVitals = (a: any): boolean => {
    const v = vitalOf(a);
    if (!v) return false;
    const hr = num(v.pulse);
    const rr = num(v.respiratoryRate);
    const spo2 = num(v.oxygenSaturation);
    const temp = num(v.temperature);
    if (spo2 !== undefined && spo2 < 90) return true;
    if (hr !== undefined && (hr < 50 || hr > 120)) return true;
    if (rr !== undefined && (rr < 8 || rr > 30)) return true;
    if (temp !== undefined && temp > 39) return true;
    return false;
  };

  const isIcu = (a: any): boolean => wardOf(a).toUpperCase().includes('ICU');

  const categoryOf = (a: any): 'icu' | 'first3' | 'highrisk' | 'stable' => {
    if (isIcu(a)) return 'icu';
    if (daysAdmitted(a) <= 3) return 'first3';
    if (isCriticalVitals(a)) return 'highrisk';
    return 'stable';
  };

  const priorityOf = (a: any): { label: string; color: string; bg: string } => {
    if (isIcu(a) || isCriticalVitals(a)) {
      return { label: 'Critical', color: 'var(--danger)', bg: 'var(--danger-light)' };
    }
    if (daysAdmitted(a) <= 3) {
      return { label: 'High', color: 'var(--warning)', bg: 'var(--warning-light)' };
    }
    return { label: 'Normal', color: 'var(--success)', bg: 'var(--success-light)' };
  };

  const alertsOf = (a: any): string[] => {
    const alerts: string[] = [];
    const bed = a.bedAllocations?.[0]?.bed;
    if (bed?.bedType === 'ISOLATION') alerts.push('Isolation');
    if (isCriticalVitals(a)) alerts.push('Critical vitals');
    return alerts;
  };

  const nextMedOf = (a: any): string => {
    const now = Date.now();
    const next = medsOf(a)
      .filter((m: any) => medStatusGroup(m) === 'DUE' && m.scheduledTime)
      .map((m: any) => ({ m, t: new Date(m.scheduledTime).getTime() }))
      .filter((x: any) => x.t >= now)
      .sort((x: any, y: any) => x.t - y.t)[0];
    if (!next) return '—';
    return `${next.m.medicineName}${next.m.dose ? ` ${next.m.dose}` : ''} · ${formatTime(next.t)}`;
  };

  const lastActivityOf = (a: any): string => {
    const v = vitalOf(a);
    if (v?.recordedAt) return `Vitals ${formatTime(new Date(v.recordedAt).getTime())}`;
    if (a.updatedAt) return `Admission ${formatTime(new Date(a.updatedAt).getTime())}`;
    return '—';
  };

  const lastUpdatedOf = (a: any): string => {
    const v = vitalOf(a);
    if (v?.recordedAt) return formatDateTime(v.recordedAt);
    if (a.updatedAt) return formatDateTime(a.updatedAt);
    return '—';
  };

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

      {patientId && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>Record Vitals</div>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowRecordVitals(!showRecordVitals)}>
              {showRecordVitals ? 'Cancel' : '+ Record Vitals'}
            </button>
          </div>
          {showRecordVitals && (
            <div className="form-grid">
              {[
                { key: 'bloodPressureSystolic', label: 'BP Systolic (mmHg)', placeholder: '120' },
                { key: 'bloodPressureDiastolic', label: 'BP Diastolic (mmHg)', placeholder: '80' },
                { key: 'temperature', label: 'Temperature (°C)', placeholder: '36.8' },
                { key: 'pulse', label: 'Pulse (bpm)', placeholder: '72' },
                { key: 'respiratoryRate', label: 'Resp Rate (/min)', placeholder: '16' },
                { key: 'oxygenSaturation', label: 'SpO₂ (%)', placeholder: '98' },
                { key: 'weight', label: 'Weight (kg)', placeholder: '65' },
                { key: 'painScore', label: 'Pain (0–10)', placeholder: '0' },
                { key: 'bloodGlucose', label: 'Glucose (mg/dL)', placeholder: '100' },
              ].map((f) => (
                <div className="field" key={f.key}>
                  <label className="label">{f.label}</label>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    placeholder={f.placeholder}
                    value={(vitalsForm as any)[f.key]}
                    onChange={(e) => setVitalsForm({ ...vitalsForm, [f.key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="field field-full">
                <label className="label">Notes</label>
                <textarea
                  className="textarea"
                  placeholder="Optional observations..."
                  value={vitalsForm.notes}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
                  style={{ minHeight: 60 }}
                />
              </div>
            </div>
          )}
          {showRecordVitals && (
            <div className="form-actions" style={{ marginTop: 10 }}>
              <button className="btn" onClick={submitVitals} disabled={savingVitals}>
                {savingVitals ? 'Saving...' : 'Save Vitals'}
              </button>
              <button className="btn btn-secondary" onClick={resetVitalsForm}>Cancel</button>
            </div>
          )}
        </div>
      )}

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

  const renderNotes = () => {
    const selectedPt = patients.find((p: any) => p.id === notesPatientId);
    return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Select Patient</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
            <input
              className="input"
              placeholder="Search by name or MRN..."
              value={selectedPt ? notesPatientSearch || patientName(selectedPt) : notesPatientSearch}
              onChange={(e) => {
                setNotesPatientSearch(e.target.value);
                if (notesPatientId) { setNotesPatientId(''); setNotesAdmissionId(''); setNotes([]); }
              }}
              onFocus={(e) => { if (selectedPt) e.target.select(); }}
              style={{ paddingRight: 28 }}
            />
            {notesPatientSearch && (
              <button type="button" onClick={() => { setNotesPatientSearch(''); setNotesPatientId(''); setNotesAdmissionId(''); setNotes([]); }}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
            )}
          </div>
          {selectedPt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{patientName(selectedPt)}</span>
              {selectedPt.mrn && <span style={{ color: 'var(--text-muted)' }}>(MRN {selectedPt.mrn})</span>}
            </div>
          )}
        </div>
        {notesPatientSearch && !notesPatientId && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
            {filterPatientsBy(notesPatientSearch).length === 0 ? (
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>No patients found.</div>
            ) : (
              filterPatientsBy(notesPatientSearch).slice(0, 50).map((p: any) => (
                <button key={p.id} type="button"
                  onClick={() => { setNotesPatientId(p.id); setNotesPatientSearch(''); }}
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
        {!notesPatientSearch && !notesPatientId && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Type a patient name or MRN to search.</div>
        )}
      </div>

      {!notesPatientId && !notesPatientSearch && admittedPatientOptions.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Currently Admitted Patients ({admittedPatientOptions.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {admittedPatientOptions.map((o: any) => (
              <button
                key={o.patientId}
                type="button"
                onClick={() => { setNotesPatientId(o.patientId); setNotesAdmissionId(o.admissionId); setNotesPatientSearch(''); }}
                style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '10px 4px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover, #f1f5f9)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{patientName(o.patient)}</span>
                {o.patient?.mrn && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>MRN {o.patient.mrn}</span>}
                <span className="badge badge-blue" style={{ fontSize: 11 }}>{o.admissionNumber}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>Bed {o.bedNumber}</span>
                <span style={{ fontSize: 12, color: 'var(--primary)' }}>Add note ›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {notesPatientId && (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <select className="input" style={{ maxWidth: 380 }} value={notesAdmissionId} onChange={(e) => setNotesAdmissionId(e.target.value)}>
            <option value="">Choose admission...</option>
            {notesPatientAdmissions.map((a: any) => (
              <option key={a.id} value={a.id}>{a.admissionNumber || a.id.slice(0, 8)} — {a.status}</option>
            ))}
          </select>
          {notesPatientAdmissions.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No active admissions for this patient.</span>
          )}
        </div>
      )}

      {notesAdmissionId && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Add Nursing Note</div>
          <div className="form-grid">
            <div className="field field-full">
              <label className="label">Note *</label>
              <textarea
                className="textarea"
                placeholder="Write the nursing note..."
                value={noteForm.note}
                onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })}
                style={{ minHeight: 80 }}
              />
            </div>
            <div className="field">
              <label className="label">Assessment</label>
              <input className="input" placeholder="Optional assessment" value={noteForm.assessment} onChange={(e) => setNoteForm({ ...noteForm, assessment: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Plan</label>
              <input className="input" placeholder="Optional plan" value={noteForm.plan} onChange={(e) => setNoteForm({ ...noteForm, plan: e.target.value })} />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: 10 }}>
            <button className="btn" disabled={savingNote || !noteForm.note.trim()} onClick={submitNote}>
              {savingNote ? 'Saving...' : 'Save Note'}
            </button>
            <button className="btn btn-secondary" onClick={() => setNoteForm({ note: '', assessment: '', plan: '' })}>Clear</button>
          </div>
        </div>
      )}

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
      {!notesPatientId && <div className="empty">Select a patient to view and add nursing notes.</div>}
      {notesPatientId && !notesAdmissionId && notesPatientAdmissions.length > 0 && <div className="empty">Select an admission to view notes.</div>}
    </div>
    );
  };

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
    const marSelectedPt = patients.find((p: any) => p.id === marPatientId);
    return (
      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Select Patient</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
              <input
                className="input"
                placeholder="Search by name or MRN..."
                value={marSelectedPt ? marPatientSearch || patientName(marSelectedPt) : marPatientSearch}
                onChange={(e) => {
                  setMarPatientSearch(e.target.value);
                  if (marPatientId) { setMarPatientId(''); setMarAdmissionId(''); setMeds([]); }
                }}
                onFocus={(e) => { if (marSelectedPt) e.target.select(); }}
                style={{ paddingRight: 28 }}
              />
              {marPatientSearch && (
                <button type="button" onClick={() => { setMarPatientSearch(''); setMarPatientId(''); setMarAdmissionId(''); setMeds([]); }}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
              )}
            </div>
            {marSelectedPt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{patientName(marSelectedPt)}</span>
                {marSelectedPt.mrn && <span style={{ color: 'var(--text-muted)' }}>(MRN {marSelectedPt.mrn})</span>}
              </div>
            )}
          </div>
          {marPatientSearch && !marPatientId && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
              {filterPatientsBy(marPatientSearch).length === 0 ? (
                <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>No patients found.</div>
              ) : (
                filterPatientsBy(marPatientSearch).slice(0, 50).map((p: any) => (
                  <button key={p.id} type="button"
                    onClick={() => { setMarPatientId(p.id); setMarPatientSearch(''); }}
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
          {!marPatientSearch && !marPatientId && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Type a patient name or MRN to search.</div>
          )}
        </div>

        {!marPatientId && !marPatientSearch && admittedPatientOptions.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">Currently Admitted Patients ({admittedPatientOptions.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {admittedPatientOptions.map((o: any) => (
                <button
                  key={o.patientId}
                  type="button"
                  onClick={() => { setMarPatientId(o.patientId); setMarAdmissionId(o.admissionId); setMarPatientSearch(''); }}
                  style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', padding: '10px 4px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover, #f1f5f9)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{patientName(o.patient)}</span>
                  {o.patient?.mrn && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>MRN {o.patient.mrn}</span>}
                  <span className="badge badge-blue" style={{ fontSize: 11 }}>{o.admissionNumber}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>Bed {o.bedNumber}</span>
                  <span style={{ fontSize: 12, color: 'var(--primary)' }}>View meds ›</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {marPatientId && (
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <select className="input" style={{ maxWidth: 380 }} value={marAdmissionId} onChange={(e) => setMarAdmissionId(e.target.value)}>
              <option value="">Choose admission...</option>
              {marPatientAdmissions.map((a: any) => (
                <option key={a.id} value={a.id}>{a.admissionNumber || a.id.slice(0, 8)} — {a.status}</option>
              ))}
            </select>
            {marPatientAdmissions.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No active admissions for this patient.</span>
            )}
          </div>
        )}

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

        {!marPatientId && !loadingMeds && <div className="empty">Select a patient to view their medication schedule.</div>}
        {marPatientId && !marAdmissionId && marPatientAdmissions.length > 0 && <div className="empty">Select an admission to view medications.</div>}
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

  const renderTracking = () => {
    const term = trackerQuery.trim().toLowerCase();
    const searched = term
      ? trackedPatients.filter((a: any) => {
          const bed = `${a.bedAllocations?.[0]?.bed?.bedNumber || ''} ${wardOf(a)}`;
          const doc = doctorName(a.admittingDoctorId);
          return [patientName(a.patient), a.patient?.mrn, a.patient?.id, a.admissionNumber, bed, doc]
            .filter(Boolean)
            .some((v: string) => String(v).toLowerCase().includes(term));
        })
      : trackedPatients;

    const countOf = (cat: 'icu' | 'first3' | 'highrisk' | 'stable') =>
      searched.filter((a: any) => categoryOf(a) === cat).length;

    const visible =
      trackerFilter === 'all'
        ? searched
        : searched.filter((a: any) => categoryOf(a) === trackerFilter);

    const chips: { key: 'all' | 'icu' | 'first3' | 'highrisk' | 'stable'; label: string; value: number }[] = [
      { key: 'all', label: 'Total', value: searched.length },
      { key: 'icu', label: 'ICU', value: countOf('icu') },
      { key: 'first3', label: 'First 3 Days', value: countOf('first3') },
      { key: 'highrisk', label: 'High Risk', value: countOf('highrisk') },
      { key: 'stable', label: 'Stable', value: countOf('stable') },
    ];

    return (
      <div>
        <div className="toolbar" style={{ flexWrap: 'wrap' }}>
          <input
            className="input"
            type="search"
            placeholder="Search name, MRN, bed, ward, doctor…"
            aria-label="Search patients"
            value={trackerQuery}
            onChange={(e) => setTrackerQuery(e.target.value)}
            style={{ maxWidth: 320, flex: '1 1 220px' }}
          />
          <select
            className="input"
            style={{ maxWidth: 220 }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'ward' | 'date')}
            aria-label="Sort patients"
          >
            <option value="ward">Sort by ward</option>
            <option value="date">Sort by admission date</option>
          </select>
          <span style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--danger)', borderRadius: 2, marginRight: 5 }} />ICU</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--warning)', borderRadius: 2, marginRight: 5 }} />First 3 days</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--danger)', borderRadius: 2, marginRight: 5 }} />Critical</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--success)', borderRadius: 2, marginRight: 5 }} />Stable</span>
          </span>
        </div>

        <div role="group" aria-label="Patient summary" className="stat-grid" style={{ marginBottom: 16 }}>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="stat-card"
              onClick={() => setTrackerFilter(c.key)}
              aria-pressed={trackerFilter === c.key}
              title={`Filter to ${c.label}`}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                border: trackerFilter === c.key ? '2px solid var(--primary)' : '1px solid var(--border)',
              }}
            >
              <div className="stat-label">{c.label}</div>
              <div className="stat-value">{c.value}</div>
            </button>
          ))}
        </div>

        {trackingLoading ? (
          <div className="loading">Loading patient data…</div>
        ) : null}

        {trackingError && (
          <div className="alert" role="alert" style={{ color: 'var(--danger)' }}>{trackingError}</div>
        )}

        {!trackingLoading && trackedPatients.length === 0 ? (
          <div className="empty">No admitted patients to track.</div>
        ) : !trackingLoading && visible.length === 0 ? (
          <div className="empty">No patients match your search or filter.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {visible.map((a) => {
              const u = urgencyOf(a);
              const p = priorityOf(a);
              const days = daysAdmitted(a);
              const cat = categoryOf(a);
              const alerts = alertsOf(a);
              const v = vitalOf(a);
              const mrn = a.patient?.mrn || a.patient?.id || '—';
              const bp = v && (v.bloodPressureSystolic || v.bloodPressureDiastolic)
                ? `${v.bloodPressureSystolic ?? '—'}/${v.bloodPressureDiastolic ?? '—'}`
                : '—';
              const hr = v && v.pulse !== undefined && v.pulse !== null ? String(v.pulse) : '—';
              const spo2 = v && v.oxygenSaturation !== undefined && v.oxygenSaturation !== null
                ? String(v.oxygenSaturation) : '—';
              const temp = v && v.temperature !== undefined && v.temperature !== null
                ? String(v.temperature) : '—';
              const rr = v && v.respiratoryRate !== undefined && v.respiratoryRate !== null
                ? String(v.respiratoryRate) : '—';
              return (
                <div
                  key={a.id}
                  className="card"
                  style={{ boxShadow: 'none', marginBottom: 0, borderLeft: `4px solid ${cat === 'highrisk' ? 'var(--danger)' : u.color}`, background: u.bg }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                    <strong style={{ fontSize: 14.5 }}>{patientName(a.patient)}</strong>
                    <span className={`badge ${statusBadgeTone(a.status)}`}>{String(a.status).replace(/_/g, ' ')}</span>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    <span>MRN {mrn}</span>
                    {a.admissionNumber && <span style={{ marginLeft: 8 }}>Adm {a.admissionNumber}</span>}
                  </div>

                  <div className="quick-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
                    {[
                      ['BP', bp],
                      ['HR', hr],
                      ['SpO₂', spo2],
                    ].map(([l, x]) => (
                      <div key={l} style={{ background: 'var(--surface)', borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{l}</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{x}</div>
                      </div>
                    ))}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Temp / RR</div>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{temp} / {rr}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span className="badge" style={{ background: p.bg, color: p.color }}>{p.label}</span>
                    {alerts.map((al) => (
                      <span key={al} className="badge" style={{ background: '#f59e0b', color: '#fff' }}>{al}</span>
                    ))}
                  </div>

                  <div style={{ fontSize: 12.5, display: 'grid', gap: 3, marginBottom: 8 }}>
                    <span>Bed/Ward: {a.bedAllocations?.[0]?.bed?.bedNumber || '—'} / {wardOf(a)}</span>
                    <span>Doctor: {doctorName(a.admittingDoctorId)}</span>
                    <span>Admitted {formatDate(a.admissionDate)} · Day {days || 1}</span>
                    <span>Next: {nextMedOf(a)}</span>
                    <span>Last activity: {lastActivityOf(a)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>Updated {lastUpdatedOf(a)}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <button type="button" className="btn btn-sm" onClick={() => router.push(`/patients/${a.patientId}`)}>
                      View Patient
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => gotoQuickAction('vitals', a)}>Vitals</button>
                    <button type="button" className="btn btn-sm" onClick={() => gotoQuickAction('notes', a)}>Notes</button>
                    <button type="button" className="btn btn-sm" onClick={() => gotoQuickAction('medadmin', a)}>Med Admin</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

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
