'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/hooks';
import { GENDERS } from '@/lib/options';

type Tab = 'directory' | 'schedule' | 'patients' | 'alerts';

const TABS: { key: Tab; label: string }[] = [
  { key: 'directory', label: 'Directory' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'patients', label: 'My Patients' },
  { key: 'alerts', label: 'Clinical Alerts' },
];

const ADMIN_ROLES = ['HOSPITAL_ADMIN', 'HOSPITAL_OWNER', 'PLATFORM_SUPER_ADMIN', 'IT_ADMIN'];

const START_HOUR = 8;
const END_HOUR = 18;
const SLOT_H = 48;
const SLOT_GAP = 4;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DRUG_INTERACTIONS = [
  { a: 'Aspirin', b: 'Warfarin', severity: 'HIGH', note: 'Significantly increased risk of bleeding' },
  { a: 'Ibuprofen', b: 'Warfarin', severity: 'HIGH', note: 'Increased risk of gastrointestinal bleeding' },
  { a: 'Clopidogrel', b: 'Omeprazole', severity: 'MODERATE', note: 'Reduced antiplatelet effectiveness of clopidogrel' },
  { a: 'Digoxin', b: 'Furosemide', severity: 'MODERATE', note: 'Diuretic-induced hypokalemia raises digoxin toxicity risk' },
  { a: 'Lisinopril', b: 'Spironolactone', severity: 'MODERATE', note: 'Risk of hyperkalemia' },
  { a: 'Simvastatin', b: 'Clarithromycin', severity: 'HIGH', note: 'Risk of myopathy and rhabdomyolysis' },
  { a: 'Ciprofloxacin', b: 'Theophylline', severity: 'HIGH', note: 'Elevated theophylline levels, toxicity risk' },
  { a: 'Sertraline', b: 'Tramadol', severity: 'HIGH', note: 'Risk of serotonin syndrome' },
  { a: 'Metformin', b: 'Prednisolone', severity: 'MODERATE', note: 'Steroids raise blood glucose and reduce metformin control' },
];

const REVIEWED_LAB_STATUSES = ['APPROVED', 'VERIFIED', 'COMPLETED', 'REPORTED', 'CANCELLED'];
const SIGNED_RX_STATUSES = ['APPROVED', 'DISPENSED'];

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

function personName(p: any): string {
  if (!p) return '—';
  if (p.user) return [p.user.firstName, p.user.lastName].filter(Boolean).join(' ') || '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || '—';
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const diff = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toMinutes(t?: string): number {
  if (!t) return 0;
  const parts = String(t).split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

function fmtClock(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function fmtHourLabel(h: number): string {
  return fmtClock(h * 60);
}

function medicineNames(item: any): string[] {
  return [item?.medicineName, item?.genericName, item?.brandName].filter(Boolean).map((n: string) => n.toLowerCase());
}

export default function DoctorsPage() {
  const [role, setRole] = useState('');
  const [tab, setTab] = useState<Tab>('directory');

  const [doctors, setDoctors] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [docSearch, setDocSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [savingDoctor, setSavingDoctor] = useState(false);
  const [addError, setAddError] = useState('');
  const [docForm, setDocForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', gender: 'MALE', departmentId: '',
    specialization: '', qualification: '', licenseNumber: '', consultationFee: '', experienceYears: '', bio: '',
  });

  const [schedules, setSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [schedDoctor, setSchedDoctor] = useState('');
  const [now, setNow] = useState<Date>(() => new Date());

  const [me, setMe] = useState<any>(null);
  const [myEncounters, setMyEncounters] = useState<any[]>([]);
  const [myFollowUps, setMyFollowUps] = useState<any[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [histPatient, setHistPatient] = useState<{ id: string; name: string } | null>(null);
  const [histVitals, setHistVitals] = useState<any[]>([]);
  const [histRx, setHistRx] = useState<any[]>([]);
  const [histLabs, setHistLabs] = useState<any[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);

  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  useEffect(() => {
    setRole(localStorage.getItem('role') || '');
  }, []);

  const loadDoctors = useCallback(async () => {
    setLoadingDoctors(true);
    try {
      setDoctors(toList(await api('/doctors?limit=200')));
    } catch {
      setDoctors([]);
    }
    setLoadingDoctors(false);
  }, []);

  const loadSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      setSchedules(toList(await api('/doctors/schedules')).filter((s: any) => s.isActive !== false));
    } catch {
      setSchedules([]);
    }
    setLoadingSchedules(false);
  }, []);

  useEffect(() => {
    loadDoctors();
    api('/departments?limit=200').then((r) => setDepartments(toList(r))).catch(() => {});
  }, [loadDoctors]);

  useEffect(() => {
    if (tab === 'schedule') {
      loadSchedules();
      const t = setInterval(() => setNow(new Date()), 60000);
      return () => clearInterval(t);
    }
    if (tab === 'alerts') {
      setLoadingAlerts(true);
      Promise.allSettled([api('/encounters/prescriptions?limit=50'), api('/lab/orders?limit=50')])
        .then(([rx, labs]) => {
          setPrescriptions(rx.status === 'fulfilled' ? toList(rx.value) : []);
          setLabOrders(labs.status === 'fulfilled' ? toList(labs.value) : []);
        })
        .finally(() => setLoadingAlerts(false));
    }
    if (tab === 'patients' && role === 'DOCTOR') {
      setLoadingPatients(true);
      (async () => {
        const [m, enc] = await Promise.allSettled([api('/auth/me'), api('/encounters?limit=50')]);
        const meData = m.status === 'fulfilled' ? unwrap(m.value) : null;
        setMe(meData);
        setMyEncounters(enc.status === 'fulfilled' ? toList(enc.value) : []);
        const profileId = meData?.doctorProfile?.id;
        if (profileId) {
          try {
            const fuRes: any = await api(`/follow-ups?doctorId=${profileId}&limit=200`);
            const payload = fuRes?.data?.data ?? fuRes?.data ?? fuRes;
            setMyFollowUps(Array.isArray(payload) ? payload : payload?.data ?? []);
          } catch {
            setMyFollowUps([]);
          }
        } else {
          setMyFollowUps([]);
        }
        setLoadingPatients(false);
      })();
    }
  }, [tab, role, loadSchedules]);

  const filteredDoctors = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) =>
      [personName(d), d.specialization, d.department?.name, d.user?.email]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q)),
    );
  }, [doctors, docSearch]);

  const docStats = useMemo(() => {
    const active = doctors.filter((d) => d.isActive !== false).length;
    const fees = doctors.map((d) => Number(d.consultationFee) || 0).filter((f) => f > 0);
    const avgFee = fees.length ? Math.round(fees.reduce((a, b) => a + b, 0) / fees.length) : 0;
    const depts = new Set(doctors.map((d) => d.department?.name || d.departmentId).filter(Boolean));
    return { total: doctors.length, active, avgFee, depts: depts.size };
  }, [doctors]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
    [weekStart],
  );

  const visibleSchedules = useMemo(
    () => (schedDoctor ? schedules.filter((s) => s.doctorId === schedDoctor) : schedules),
    [schedules, schedDoctor],
  );

  const blocksFor = (day: Date, hour: number) => {
    const dow = day.getDay();
    const hStart = hour * 60;
    const hEnd = hStart + 60;
    return visibleSchedules.filter((s) => {
      if (Number(s.dayOfWeek) !== dow) return false;
      const sStart = toMinutes(s.startTime);
      const sEnd = toMinutes(s.endTime);
      return sStart < hEnd && sEnd > hStart;
    });
  };

  const today = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowTop =
    ((nowMins - START_HOUR * 60) / 60) * (SLOT_H + SLOT_GAP);

  const schedStats = useMemo(() => {
    const todayDow = today.getDay();
    const onDuty = new Set(
      visibleSchedules.filter((s) => Number(s.dayOfWeek) === todayDow).map((s) => s.doctorId),
    );
    let busiestDay = '—';
    let busiestCount = 0;
    for (let dow = 0; dow < 7; dow++) {
      const c = visibleSchedules.filter((s) => Number(s.dayOfWeek) === dow).length;
      if (c > busiestCount) {
        busiestCount = c;
        busiestDay = DAY_LABELS[(dow + 6) % 7];
      }
    }
    const totalBlocks = visibleSchedules.length;
    return { shifts: totalBlocks, onDuty: onDuty.size, busiestDay };
  }, [visibleSchedules]);

  const myPatientRows = useMemo(() => {
    const profileId = me?.doctorProfile?.id;
    if (!profileId && !me?.id) return [];
    const mine = myEncounters.filter(
      (e) => (profileId && e.doctorId === profileId) || (me?.id && e.doctorUserId === me.id),
    );
    const activeFuByPatient = new Map<string, any>();
    myFollowUps
      .filter((f) => f.status === 'PENDING' || f.status === 'IN_PROGRESS')
      .forEach((f) => {
        if (f.patientId) activeFuByPatient.set(f.patientId, f);
      });
    const map = new Map<string, any>();
    mine.forEach((e) => {
      const pid = e.patientId;
      const cur = map.get(pid);
      const ts = e.createdAt ? new Date(e.createdAt).getTime() : 0;
      if (!cur) {
        map.set(pid, {
          patientId: pid,
          name: personName(e.patient),
          mrn: e.patient?.mrn || '—',
          lastTs: ts,
          lastVisit: e.createdAt,
          type: e.type,
          status: e.status,
          activeFu: activeFuByPatient.get(pid) || null,
        });
      } else {
        if (ts > cur.lastTs) {
          cur.lastTs = ts;
          cur.lastVisit = e.createdAt;
          cur.type = e.type;
          cur.status = e.status;
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs);
  }, [me, myEncounters, myFollowUps]);

  const openHistory = async (row: any) => {
    setHistPatient({ id: row.patientId, name: row.name });
    setHistOpen(true);
    setLoadingHist(true);
    setHistVitals([]);
    setHistRx([]);
    setHistLabs([]);
    const [v, rx, labs] = await Promise.allSettled([
      api(`/encounters/vitals/patient/${row.patientId}`),
      api(`/encounters/prescriptions/patient/${row.patientId}`),
      api(`/lab/orders?patientId=${row.patientId}&limit=20`),
    ]);
    setHistVitals(v.status === 'fulfilled' ? toList(v.value) : []);
    setHistRx(rx.status === 'fulfilled' ? toList(rx.value) : []);
    setHistLabs(labs.status === 'fulfilled' ? toList(labs.value) : []);
    setLoadingHist(false);
  };

  const interactions = useMemo(() => {
    const found: { rx: any; pair: (typeof DRUG_INTERACTIONS)[number] }[] = [];
    prescriptions.forEach((rx) => {
      const names = (rx.items || []).flatMap(medicineNames);
      if (!names.length) return;
      DRUG_INTERACTIONS.forEach((pair) => {
        const hasA = names.some((n: string) => n.includes(pair.a.toLowerCase()));
        const hasB = names.some((n: string) => n.includes(pair.b.toLowerCase()));
        if (hasA && hasB) found.push({ rx, pair });
      });
    });
    return found;
  }, [prescriptions]);

  const pendingSignatures = useMemo(
    () =>
      prescriptions.filter((p) => {
        const st = String(p.status || '').toUpperCase();
        return !p.signedAt && !SIGNED_RX_STATUSES.includes(st);
      }),
    [prescriptions],
  );

  const criticalLabs = useMemo(
    () =>
      labOrders.flatMap((o) =>
        (o.items || [])
          .filter((it: any) => it.isCritical && !REVIEWED_LAB_STATUSES.includes(String(o.status || '').toUpperCase()))
          .map((it: any) => ({ item: it, order: o })),
      ),
    [labOrders],
  );

  const submitDoctor = async () => {
    if (!docForm.firstName.trim() || !docForm.lastName.trim() || !docForm.email.trim()) {
      setAddError('First name, last name and email are required.');
      return;
    }
    setSavingDoctor(true);
    setAddError('');
    try {
      await api('/doctors', {
        method: 'POST',
        body: JSON.stringify({
          firstName: docForm.firstName,
          lastName: docForm.lastName,
          email: docForm.email,
          phone: docForm.phone || undefined,
          gender: docForm.gender,
          departmentId: docForm.departmentId || undefined,
          specialization: docForm.specialization || undefined,
          qualification: docForm.qualification || undefined,
          licenseNumber: docForm.licenseNumber || undefined,
          consultationFee: docForm.consultationFee ? parseFloat(docForm.consultationFee) : undefined,
          experienceYears: docForm.experienceYears ? parseInt(docForm.experienceYears) : undefined,
          bio: docForm.bio || undefined,
        }),
      });
      setShowAdd(false);
      setDocForm({
        firstName: '', lastName: '', email: '', phone: '', gender: 'MALE', departmentId: '',
        specialization: '', qualification: '', licenseNumber: '', consultationFee: '', experienceYears: '', bio: '',
      });
      loadDoctors();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to create doctor');
    }
    setSavingDoctor(false);
  };

  const renderDirectory = () => (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total Doctors</div>
          <div className="stat-value">{docStats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{docStats.active}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Consultation Fee</div>
          <div className="stat-value">{docStats.avgFee ? formatMoney(docStats.avgFee) : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Departments Covered</div>
          <div className="stat-value">{docStats.depts}</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input search-input"
          placeholder="Search doctors…"
          value={docSearch}
          onChange={(e) => setDocSearch(e.target.value)}
        />
        <button className="btn btn-secondary btn-sm" onClick={() => setDocSearch('')}>Clear</button>
        {ADMIN_ROLES.includes(role) && (
          <button className="btn btn-sm" onClick={() => setShowAdd(true)}>Add doctor</button>
        )}
      </div>

      {loadingDoctors ? (
        <div className="loading">Loading doctors…</div>
      ) : filteredDoctors.length === 0 ? (
        <div className="empty">No doctors found.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Specialization</th>
                <th>Department</th>
                <th>Consultation fee</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredDoctors.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/doctors/${d.id}`} style={{ fontWeight: 600, color: 'var(--primary)' }}>
                      {personName(d)}
                    </Link>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.user?.email}</div>
                  </td>
                  <td>{d.specialization || '—'}</td>
                  <td>{d.department?.name || d.departmentId || '—'}</td>
                  <td>{formatMoney(d.consultationFee)}</td>
                  <td>
                    <span className={`badge ${d.isActive !== false ? 'badge-green' : 'badge-gray'}`}>
                      {d.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderSchedule = () => (
    <div>
      <div className="toolbar">
        <select className="input" style={{ maxWidth: 260 }} value={schedDoctor} onChange={(e) => setSchedDoctor(e.target.value)}>
          <option value="">All doctors</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{personName(d)}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}>‹ Prev</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setWeekStart(mondayOf(new Date()))}>This week</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}>Next ›</button>
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {formatDate(weekStart)} – {formatDate(weekDays[6])}
        </span>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Weekly Shift Blocks</div>
          <div className="stat-value">{schedStats.shifts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">On Duty Today</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{schedStats.onDuty}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Busiest Day</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{schedStats.busiestDay}</div>
        </div>
      </div>

      {loadingSchedules ? (
        <div className="loading">Loading schedule…</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 920 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, minmax(0, 1fr))', gap: 6 }}>
              <div />
              {weekDays.map((d, i) => {
                const isToday = sameDay(d, today);
                return (
                  <div
                    key={i}
                    style={{
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 13,
                      padding: '6px 0',
                      borderRadius: 6,
                      background: isToday ? 'var(--primary-light)' : 'transparent',
                      color: isToday ? 'var(--primary-dark)' : 'var(--text)',
                    }}
                  >
                    {DAY_LABELS[i]} {d.getDate()}
                    {isToday && <div style={{ fontSize: 10, fontWeight: 600 }}>TODAY</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, minmax(0, 1fr))', gap: 6, marginTop: 6 }}>
              <div>
                {HOURS.map((h) => (
                  <div key={h} style={{ height: SLOT_H, marginBottom: SLOT_GAP, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', paddingRight: 8 }}>
                    {fmtHourLabel(h)}
                  </div>
                ))}
              </div>
              {weekDays.map((day, di) => {
                const isToday = sameDay(day, today);
                const showLine = isToday && nowMins >= START_HOUR * 60 && nowMins <= END_HOUR * 60;
                return (
                  <div key={di} style={{ position: 'relative' }}>
                    {HOURS.map((h) => {
                      const blocks = blocksFor(day, h);
                      const slotStart = h * 60;
                      const n = Math.max(1, blocks.length);
                      return (
                        <div key={h} style={{ height: SLOT_H, marginBottom: SLOT_GAP, position: 'relative' }}>
                          {blocks.length === 0 ? (
                            <div style={{ position: 'absolute', inset: 0, border: '1px dashed var(--border)', borderRadius: 4, background: isToday ? 'rgba(59,130,246,0.03)' : 'transparent' }} />
                          ) : (
                            blocks.map((b, bi) => {
                              const bStart = Math.max(toMinutes(b.startTime), slotStart);
                              const bEnd = Math.min(toMinutes(b.endTime), slotStart + 60);
                              const top = ((bStart - slotStart) / 60) * SLOT_H;
                              const height = Math.max(4, ((Math.max(bEnd, bStart + 1) - bStart) / 60) * SLOT_H);
                              return (
                                <div
                                  key={b.id || bi}
                                  title={`${personName(b.doctor)} ${b.startTime}-${b.endTime}`}
                                  style={{
                                    position: 'absolute',
                                    top,
                                    height,
                                    left: `calc(${(bi * 100) / n}% + 1px)`,
                                    width: `calc(${100 / n}% - 2px)`,
                                    background: 'var(--primary-light)',
                                    borderLeft: '3px solid var(--primary)',
                                    borderRadius: 4,
                                    padding: '3px 6px',
                                    fontSize: 10.5,
                                    lineHeight: 1.3,
                                    color: 'var(--primary-dark)',
                                    overflow: 'hidden',
                                    boxSizing: 'border-box',
                                    zIndex: bi + 1,
                                  }}
                                >
                                  <strong>{personName(b.doctor)}</strong>
                                  <div>{b.startTime}–{b.endTime}{b.breakStart ? ' · break' : ''}</div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      );
                    })}
                    {showLine && (
                      <div style={{ position: 'absolute', left: 0, right: 0, top: nowTop, zIndex: 5, pointerEvents: 'none' }}>
                        <div style={{ borderTop: '2px solid var(--danger)', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: -2, top: -5, width: 8, height: 8, borderRadius: 4, background: 'var(--danger)' }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'var(--primary-light)', borderLeft: '3px solid var(--primary)', verticalAlign: '-1px', marginRight: 6 }} />Scheduled</span>
            <span><span style={{ display: 'inline-block', width: 12, height: 12, border: '1px dashed var(--border-strong)', verticalAlign: '-1px', marginRight: 6 }} />Free</span>
          </div>
        </div>
      )}
      {!loadingSchedules && schedules.length === 0 && (
        <div className="empty">No doctor schedules configured.</div>
      )}
    </div>
  );

  const renderPatients = () => {
    if (role !== 'DOCTOR') {
      return <div className="empty">My Patients is available for doctor accounts only.</div>;
    }
    return (
      <div>
        {loadingPatients ? (
          <div className="loading">Loading patients…</div>
        ) : myPatientRows.length === 0 ? (
          <div className="empty">No encounters found for your account.</div>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-label">My Patients</div>
                <div className="stat-value">{myPatientRows.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Active Follow-ups</div>
                <div className="stat-value" style={{ color: 'var(--primary)' }}>
                  {myPatientRows.filter((r) => r.activeFu).length}
                </div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient Name</th>
                    <th>MRN</th>
                    <th>Last Visit</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Follow-up</th>
                    <th style={{ width: 1 }}>History</th>
                  </tr>
                </thead>
                <tbody>
                  {myPatientRows.map((r) => (
                    <tr key={r.patientId} className="row-clickable" onClick={() => openHistory(r)}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td>{r.mrn}</td>
                      <td>{r.lastVisit ? formatDateTime(r.lastVisit) : '—'}</td>
                      <td>{r.type || '—'}</td>
                      <td>
                        <span className={`badge ${String(r.status) === 'ACTIVE' ? 'badge-green' : 'badge-gray'}`}>
                          {String(r.status || '—').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        {r.activeFu ? (
                          <span className={`badge badge-${r.activeFu.status === 'IN_PROGRESS' ? 'primary' : 'warning'}`}>
                            {r.activeFu.status === 'IN_PROGRESS' ? 'In progress' : 'Pending'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); openHistory(r); }}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {histOpen && histPatient && (
          <div className="modal-backdrop" onClick={() => setHistOpen(false)}>
            <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">History — {histPatient.name}</h3>
                <button className="modal-close" onClick={() => setHistOpen(false)}>×</button>
              </div>
              {loadingHist ? (
                <div className="loading">Loading history…</div>
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <div className="card-title">Recent Vitals</div>
                    {histVitals.length === 0 ? (
                      <div className="muted" style={{ fontSize: 13 }}>No vitals recorded.</div>
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr><th>Recorded</th><th>BP</th><th>Pulse</th><th>Temp</th><th>SpO2</th></tr>
                          </thead>
                          <tbody>
                            {histVitals.slice(0, 5).map((v: any) => (
                              <tr key={v.id}>
                                <td style={{ fontSize: 12 }}>{formatDateTime(v.recordedAt)}</td>
                                <td>{v.bloodPressureSystolic && v.bloodPressureDiastolic ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}` : '—'}</td>
                                <td>{v.pulse ?? '—'}</td>
                                <td>{v.temperature ?? '—'}</td>
                                <td>{v.oxygenSaturation != null ? `${v.oxygenSaturation}%` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="card-title">Recent Prescriptions</div>
                    {histRx.length === 0 ? (
                      <div className="muted" style={{ fontSize: 13 }}>No prescriptions found.</div>
                    ) : (
                      histRx.slice(0, 5).map((rx: any) => (
                        <div key={rx.id} className="card" style={{ boxShadow: 'none', marginBottom: 8, padding: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <strong style={{ fontSize: 13 }}>{formatDate(rx.createdAt)}</strong>
                            <span className={`badge ${String(rx.status).toUpperCase() === 'DRAFT' ? 'badge-yellow' : 'badge-green'}`}>
                              {String(rx.status).replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div style={{ fontSize: 13 }}>
                            {(rx.items || []).map((it: any) => it.medicineName).filter(Boolean).join(', ') || '—'}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <div className="card-title">Recent Lab Orders</div>
                    {histLabs.length === 0 ? (
                      <div className="muted" style={{ fontSize: 13 }}>No lab orders found.</div>
                    ) : (
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr><th>Order</th><th>Tests</th><th>Date</th><th>Status</th></tr>
                          </thead>
                          <tbody>
                            {histLabs.slice(0, 5).map((o: any) => (
                              <tr key={o.id}>
                                <td style={{ fontWeight: 600 }}>{o.orderNumber}</td>
                                <td style={{ fontSize: 12 }}>
                                  {(o.items || []).map((it: any) => it.testName).filter(Boolean).join(', ') || '—'}
                                  {(o.items || []).some((it: any) => it.isCritical) && (
                                    <span className="badge badge-red" style={{ marginLeft: 6 }}>CRITICAL</span>
                                  )}
                                </td>
                                <td style={{ fontSize: 12 }}>{formatDate(o.orderedAt)}</td>
                                <td>
                                  <span className="badge badge-blue">{String(o.status).replace(/_/g, ' ')}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAlerts = () => (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Interaction Warnings</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{interactions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Signatures</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{pendingSignatures.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Critical Lab Results</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{criticalLabs.length}</div>
        </div>
      </div>

      {loadingAlerts && <div className="loading">Loading clinical alerts…</div>}

      {!loadingAlerts && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card">
            <div className="card-title">Drug Interaction Warnings</div>
            {interactions.length === 0 ? (
              <div className="empty">No known drug interactions detected in recent prescriptions.</div>
            ) : (
              interactions.map(({ rx, pair }, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span className={`badge ${pair.severity === 'HIGH' ? 'badge-red' : 'badge-yellow'}`}>{pair.severity}</span>
                  <strong style={{ fontSize: 13.5 }}>{pair.a} + {pair.b}</strong>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{pair.note}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    Rx for {personName(rx.patient)} · {formatDate(rx.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="card-title">Pending Prescription Signatures</div>
            {pendingSignatures.length === 0 ? (
              <div className="empty">All prescriptions are signed.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Patient</th><th>Prescriber</th><th>Medicines</th><th>Date</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {pendingSignatures.map((rx) => (
                      <tr key={rx.id}>
                        <td style={{ fontWeight: 600 }}>{personName(rx.patient)}</td>
                        <td>{personName(rx.doctor)}</td>
                        <td style={{ fontSize: 12 }}>
                          {(rx.items || []).map((it: any) => it.medicineName).filter(Boolean).join(', ') || '—'}
                        </td>
                        <td>{formatDateTime(rx.createdAt)}</td>
                        <td><span className="badge badge-yellow">{String(rx.status).replace(/_/g, ' ')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Critical Lab Results Awaiting Review</div>
            {criticalLabs.length === 0 ? (
              <div className="empty">No critical lab results awaiting review.</div>
            ) : (
              criticalLabs.map(({ item, order }, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span className="badge badge-red">CRITICAL</span>
                  <strong style={{ fontSize: 13.5 }}>{item.testName}</strong>
                  {item.result && <span style={{ fontSize: 13 }}>Result: {item.result}{item.unit ? ` ${item.unit}` : ''}</span>}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {order.orderNumber} · {personName(order.patient)} · {formatDateTime(order.orderedAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Doctors</h1>
          <p className="page-subtitle">Directory, schedules, patient panels and clinical safety alerts</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'directory' && renderDirectory()}
      {tab === 'schedule' && renderSchedule()}
      {tab === 'patients' && renderPatients()}
      {tab === 'alerts' && renderAlerts()}

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Add Doctor</h3>
            {addError && <div className="alert alert-error">{addError}</div>}
            <form onSubmit={(e) => { e.preventDefault(); submitDoctor(); }}>
              <div className="form-grid">
                <div className="field">
                  <label className="label">First name *</label>
                  <input className="input" value={docForm.firstName} onChange={(e) => setDocForm({ ...docForm, firstName: e.target.value })} required />
                </div>
                <div className="field">
                  <label className="label">Last name *</label>
                  <input className="input" value={docForm.lastName} onChange={(e) => setDocForm({ ...docForm, lastName: e.target.value })} required />
                </div>
                <div className="field">
                  <label className="label">Email *</label>
                  <input className="input" type="email" value={docForm.email} onChange={(e) => setDocForm({ ...docForm, email: e.target.value })} required />
                </div>
                <div className="field">
                  <label className="label">Phone</label>
                  <input className="input" value={docForm.phone} onChange={(e) => setDocForm({ ...docForm, phone: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">Gender</label>
                  <select className="input" value={docForm.gender} onChange={(e) => setDocForm({ ...docForm, gender: e.target.value })}>
                    {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Department</label>
                  <select className="input" value={docForm.departmentId} onChange={(e) => setDocForm({ ...docForm, departmentId: e.target.value })}>
                    <option value="">-- Select department --</option>
                    {departments.map((dep: any) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Specialization</label>
                  <input className="input" value={docForm.specialization} onChange={(e) => setDocForm({ ...docForm, specialization: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">Qualification</label>
                  <input className="input" value={docForm.qualification} onChange={(e) => setDocForm({ ...docForm, qualification: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">License number</label>
                  <input className="input" value={docForm.licenseNumber} onChange={(e) => setDocForm({ ...docForm, licenseNumber: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">Consultation fee (NPR)</label>
                  <input className="input" type="number" value={docForm.consultationFee} onChange={(e) => setDocForm({ ...docForm, consultationFee: e.target.value })} />
                </div>
                <div className="field">
                  <label className="label">Experience (years)</label>
                  <input className="input" type="number" value={docForm.experienceYears} onChange={(e) => setDocForm({ ...docForm, experienceYears: e.target.value })} />
                </div>
                <div className="field field-full">
                  <label className="label">Bio</label>
                  <textarea className="textarea" value={docForm.bio} onChange={(e) => setDocForm({ ...docForm, bio: e.target.value })} />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={savingDoctor}>{savingDoctor ? 'Saving…' : 'Add doctor'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
