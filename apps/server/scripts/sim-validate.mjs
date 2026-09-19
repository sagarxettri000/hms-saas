/**
 * SWASTHYA full-system synthetic validation (TEST_SIM_* data only).
 *
 * Executes real workflows through the real HTTP API and verifies SEMANTIC
 * state — computed financial math, bed occupancy invariants, crossmatch
 * gates, state-machine refusals, authorization denials, duplicate
 * prevention — not just HTTP status codes.
 *
 * Usage: node scripts/sim-validate.mjs
 */
const BASE = "http://localhost:4000/api/v1";
const RUN = `TESTSIM${Date.now().toString(36).toUpperCase()}`;
let passed = 0, failed = 0;
const fails = [], timings = [];

function check(name, ok, extra = "") {
  if (ok) { passed++; console.log("PASS", name); }
  else { failed++; fails.push(name); console.log("FAIL", name, extra); }
}

function unwrap(j) {
  if (j && typeof j === "object" && "data" in j) return j.data;
  return j;
}

// Endpoints wrap inconsistently (some double-wrap data.data); drill to array.
function listOf(j) {
  const u = unwrap(j);
  if (Array.isArray(u)) return u;
  if (Array.isArray(u?.items)) return u.items;
  if (Array.isArray(u?.data)) return u.data;
  return [];
}

async function api(method, path, body, token) {
  const t0 = Date.now();
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await fetch(BASE + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      break;
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  timings.push(Date.now() - t0);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const num = (v) => (v === undefined || v === null ? NaN : Number(v));
function pick(obj, re) {
  for (const k of Object.keys(obj || {})) if (re.test(k)) return num(obj[k]);
  return NaN;
}

async function main() {
  // ---------- auth (throttle-aware: 429 → wait one window and retry) ----------
  async function login(email, password) {
    let r = await api("POST", "/auth/login", { email, password });
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 65_000));
      r = await api("POST", "/auth/login", { email, password });
    }
    return unwrap(r.json)?.accessToken;
  }
  const T = await login("admin@nbmaitri.com", "Admin@123");
  check("admin login", !!T, "throttled or invalid");
  if (!T) return console.log("ABORT");

  const TR = await login("staff6@nbmaitri.com", "Staff@123");
  check("reception login", !!TR, "throttled or invalid");

  // ---------- SECURITY ----------
  const noTok = await api("GET", "/patients?limit=1", null, null);
  check("no token → 401", noTok.status === 401, noTok.status);

  const forged = await api("GET", "/patients?limit=1", null,
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + Buffer.from('{"sub":"attacker","tenantId":"x"}').toString("base64url") + ".invalidsig");
  check("forged token → 401", forged.status === 401, forged.status);

  const recDelete = await api("DELETE", "/patients/00000000-0000-0000-0000-000000000000", null, TR);
  check("reception DELETE denied (403)", recDelete.status === 403, recDelete.status);

  const recRead = await api("GET", "/patients?limit=1", null, TR);
  check("reception read allowed (has VIEW)", recRead.status === 200, recRead.status);

  // ---------- PHASE P: registration + duplicate detection ----------
  const phone = `98${RUN.slice(-8)}`;
  const mkP = (first, last, ph, extra = {}) => api("POST", "/patients", {
    firstName: first, lastName: last, mobile: ph, gender: "FEMALE",
    dateOfBirth: "1996-04-12", patientType: "GENERAL",
    addressLine1: "Synthetic Street 1", city: "Kathmandu", ...extra,
  }, T);

  const pa = await mkP("Asha", RUN, phone);
  const A = unwrap(pa.json);
  check("patient A registered", pa.status === 201 && !!A?.id, JSON.stringify(pa.json).slice(0, 140));
  check("patient A has MRN", !!A?.mrn, A?.mrn);

  const dup = await mkP("Asha", RUN, phone);
  check("duplicate registration detected", dup.json?.data?.duplicateDetected === true || dup.json?.duplicateDetected === true,
    JSON.stringify(dup.json).slice(0, 140));

  const patch = await api("PATCH", `/patients/${A.id}`, { phone: `97${RUN.slice(-8)}` }, T);
  check("patient edit", patch.status === 200, patch.status);

  // ---------- PHASE E: encounter ----------
  const docs = await api("GET", "/doctors?limit=1", null, T);
  const doc = listOf(docs.json)[0];
  check("doctor available", !!doc?.id, docs.status);
  if (!doc?.id) return console.log("ABORT: no doctor — cannot continue clinical chain");

  const enc = await api("POST", "/encounters", {
    patientId: A.id, doctorId: doc.id, type: "OPD",
    chiefComplaint: "synthetic febrile illness", vitals: { temperature: 38.6, pulse: 96 },
  }, T);
  const E = unwrap(enc.json);
  check("OPD encounter created", enc.status === 201 && !!E?.id, JSON.stringify(enc.json).slice(0, 300));

  const badEnc = await api("POST", "/encounters", { patientId: "00000000-0000-0000-0000-000000000000", type: "OPD" }, T);
  check("encounter for ghost patient → 404", badEnc.status === 404, badEnc.status);

  // ---------- PHASE L: laboratory lifecycle ----------
  const order = await api("POST", "/lab/orders", {
    patientId: A.id, encounterId: E.id, doctorId: doc.id,
    items: [{ testName: "CBC", price: 350 }, { testName: "LFT", price: 500 }],
  }, T);
  const O = unwrap(order.json);
  check("lab order created", order.status === 201 && !!O?.id, JSON.stringify(order.json).slice(0, 140));
  const item0 = O?.items?.[0];

  const sample = await api("POST", `/lab/orders/${O.id}/sample`, { specimenType: "BLOOD", container: "EDTA" }, T);
  check("sample collected", [200, 201].includes(sample.status), sample.status);

  const result = await api("PATCH", `/lab/orders/${O.id}/items/${item0.id}/result`, {
    result: "Hb 9.8 g/dL", resultValue: 9.8, unit: "g/dL", isAbnormal: true, isCritical: true,
  }, T);
  check("result entered (critical flagged)", [200, 201].includes(result.status),
    JSON.stringify(result.json).slice(0, 120));

  const verify = await api("POST", `/lab/orders/${O.id}/verify`, {}, T);
  check("results verified", [200, 201].includes(verify.status), verify.status);

  const approve = await api("POST", `/lab/orders/${O.id}/approve`, {}, T);
  check("results approved", [200, 201].includes(approve.status), approve.status);

  // ---------- PHASE RX: prescription + dispensing ----------
  const rx = await api("POST", "/encounters/prescriptions", {
    patientId: A.id, encounterId: E.id,
    items: [{ medicineName: "Paracetamol", dosage: "500mg", frequency: "TDS", quantity: 9 }],
  }, T);
  const RX = unwrap(rx.json);
  check("prescription created", rx.status === 201 && !!RX?.id, JSON.stringify(rx.json).slice(0, 140));

  const stores = await api("GET", "/pharmacy/stores", null, T);
  const store = listOf(stores.json)[0];
  if (store?.id) {
    const disp = await api("POST", "/pharmacy/dispense", {
      patientId: A.id, storeId: store.id, paymentMethod: "CASH",
      items: [{ medicineName: "Paracetamol", quantity: 9, unitPrice: 2.5 }],
    }, T);
    check("pharmacy dispense", [200, 201].includes(disp.status), JSON.stringify(disp.json).slice(0, 140));
  } else {
    console.log("SKIP dispense — no store configured");
  }

  // ---------- PHASE INV: billing math (computed independently) ----------
  const items = [
    { serviceName: "Consultation", quantity: 1, rate: 500, doctorId: doc.id },
    { serviceName: "CBC", quantity: 1, rate: 350 },
  ];
  const expectedTotal = 850;
  const idemKey = `${RUN}-INV-1`;
  const inv = await api("POST", "/billing/invoices", {
    patientId: A.id, type: "OPD", items, idempotencyKey: idemKey,
  }, T);
  const INV = unwrap(inv.json);
  check("invoice created", inv.status === 201 && !!INV?.id, JSON.stringify(inv.json).slice(0, 160));
  const total = pick(INV, /^(totalAmount|grandTotal|netTotal|netAmount|total)$/i);
  check("invoice total == 850 (independent math)", total === expectedTotal, `got ${total}`);

  const inv2 = await api("POST", "/billing/invoices", {
    patientId: A.id, type: "OPD", items, idempotencyKey: idemKey,
  }, T);
  const INV2 = unwrap(inv2.json);
  check("idempotent invoice re-request → same invoice", INV2?.id === INV.id, `${INV2?.id} vs ${INV.id}`);

  const pay = await api("POST", "/billing/payments", { invoiceId: INV.id, amount: 400, method: "CASH" }, T);
  const PAY = unwrap(pay.json);
  check("payment posted", pay.status === 201 && !!PAY?.id, JSON.stringify(pay.json).slice(0, 140));

  const over = await api("POST", "/billing/payments", { invoiceId: INV.id, amount: 999999, method: "CASH" }, T);
  check("overpayment refused (>=400)", [400, 409].includes(over.status), over.status);

  const invAfter = await api("GET", `/billing/invoices/${INV.id}`, null, T);
  const IA = unwrap(invAfter.json);
  const balance = pick(IA, /^(dueAmount|balanceDue|balance)$/i);
  const paid = pick(IA, /^(paidAmount|amountPaid|paid)$/i);
  check("invoice balance == 450 after 400 payment", balance === 450, `got ${balance}`);
  check("invoice paid amount == 400", paid === 400, `got ${paid}`);

  // Two-phase refund: REQUESTED → approve posts the balance effect.
  const refund = await api("POST", "/billing/refunds", { invoiceId: INV.id, paymentId: PAY.id, amount: 100, reason: `${RUN} synthetic refund` }, T);
  const REF = unwrap(refund.json);
  check("refund requested (two-phase)", [200, 201].includes(refund.status) && REF?.status === "REQUESTED", JSON.stringify(refund.json).slice(0, 140));

  const refApprove = await api("PATCH", `/billing/refunds/${REF.id}/approve`, {}, T);
  check("refund approved", [200, 201].includes(refApprove.status), JSON.stringify(refApprove.json).slice(0, 160));

  const refAgain = await api("PATCH", `/billing/refunds/${REF.id}/approve`, {}, T);
  check("double refund approval refused (409)", refAgain.status === 409, refAgain.status);

  const invAfterRefund = await api("GET", `/billing/invoices/${INV.id}`, null, T);
  const balance2 = pick(unwrap(invAfterRefund.json), /^(dueAmount|balanceDue|balance)$/i);
  check("balance == 550 after 100 refund", balance2 === 550, `got ${balance2}`);

  // ---------- PHASE B: bed lifecycle + single-occupant invariant ----------
  const pb = await mkP("Bikash", RUN, `97${RUN.slice(-7)}1`);
  const B = unwrap(pb.json);
  const pc = await mkP("Chandra", RUN, `97${RUN.slice(-7)}2`);
  const C = unwrap(pc.json);
  check("patients B & C registered", pb.status === 201 && pc.status === 201, `${pb.status}/${pc.status}`);

  const admB = await api("POST", "/admissions", { patientId: B.id, admissionType: "IPD", provisionalDiagnosis: "synthetic admission" }, T);
  const AB = unwrap(admB.json);
  const admC = await api("POST", "/admissions", { patientId: C.id, admissionType: "IPD" }, T);
  const AC = unwrap(admC.json);
  check("admissions B & C created", admB.status === 201 && admC.status === 201, `${admB.status}/${admC.status}`);

  const beds = await api("GET", "/bed-management/beds?status=AVAILABLE&limit=5", null, T);
  const bedList = listOf(beds.json);
  const bed1 = bedList[0], bed2 = bedList[1];
  check("2 free beds found", !!bed1?.id && !!bed2?.id, `got ${bedList.length}`);

  if (bed1?.id && bed2?.id && AB?.id && AC?.id) {
    const alloc1 = await api("POST", "/bed-management/allocate", { bedId: bed1.id, admissionId: AB.id }, T);
    check("bed1 allocated to B", [200, 201].includes(alloc1.status), JSON.stringify(alloc1.json).slice(0, 140));

    const bed1After = await api("GET", `/bed-management/beds/${bed1.id}`, null, T);
    check("bed1 now OCCUPIED", (unwrap(bed1After.json)?.status || bed1After.json?.data?.status) === "OCCUPIED", JSON.stringify(bed1After.json).slice(0, 100));

    const doubleAlloc = await api("POST", "/bed-management/allocate", { bedId: bed1.id, admissionId: AC.id }, T);
    check("double allocation refused (>=400)", [400, 409].includes(doubleAlloc.status), doubleAlloc.status);

    const xfer = await api("POST", "/bed-management/transfer", { admissionId: AB.id, toBedId: bed2.id, reason: "synthetic transfer" }, T);
    check("transfer B → bed2", [200, 201].includes(xfer.status), JSON.stringify(xfer.json).slice(0, 140));

    const bed1X = await api("GET", `/bed-management/beds/${bed1.id}`, null, T);
    const bed2X = await api("GET", `/bed-management/beds/${bed2.id}`, null, T);
    // Housekeeping flow: vacated bed enters CLEANING before returning to service.
    check("bed1 released (CLEANING/AVAILABLE) after transfer", ["CLEANING", "AVAILABLE"].includes(unwrap(bed1X.json)?.status || bed1X.json?.data?.status), JSON.stringify(bed1X.json).slice(0, 100));
    check("bed2 occupied by B", (unwrap(bed2X.json)?.status || bed2X.json?.data?.status) === "OCCUPIED", JSON.stringify(bed2X.json).slice(0, 100));

    const dealloc = await api("POST", `/bed-management/deallocate/${bed2.id}`, {}, T);
    check("bed2 deallocated", [200, 201].includes(dealloc.status), dealloc.status);
  } else {
    console.log("SKIP bed phase — insufficient beds/admissions");
  }

  // ---------- PHASE BL: blood crossmatch gate ----------
  const unitO = await api("POST", "/blood-bank/units", {
    bloodGroup: "O-", component: "PACKED_RBC",
    expiryDate: new Date(Date.now() + 21 * 86400000).toISOString(),
    testResults: { hiv: "NEGATIVE", hbsAg: "NEGATIVE" }, tested: true,
  }, T);
  const UO = unwrap(unitO.json);
  check("O- unit registered", unitO.status === 201 && !!UO?.id, JSON.stringify(unitO.json).slice(0, 120));

  const xmOk = await api("POST", "/interop/blood/crossmatch", {
    patientId: A.id, unitId: UO.id, patientGroup: "O-", result: "COMPATIBLE", method: "ELISA",
  }, T);
  check("compatible crossmatch recorded", xmOk.status === 201, xmOk.status);

  const issue = await api("PATCH", `/blood-bank/units/${UO.id}/issue`, { issuedTo: A.id }, T);
  check("unit issued after compatible crossmatch", issue.status === 200, issue.status);

  const unitAB = await api("POST", "/blood-bank/units", {
    bloodGroup: "AB-", component: "PACKED_RBC",
    expiryDate: new Date(Date.now() + 21 * 86400000).toISOString(),
    testResults: { hiv: "NEGATIVE" }, tested: true,
  }, T);
  const UAB = unwrap(unitAB.json);

  const xmBad = await api("POST", "/interop/blood/crossmatch", {
    patientId: A.id, unitId: UAB.id, patientGroup: "O-", result: "INCOMPATIBLE", method: "ELISA",
  }, T);
  const issueBad = await api("PATCH", `/blood-bank/units/${UAB.id}/issue`, { issuedTo: A.id }, T);
  check("incompatible crossmatch + issue refused (>=400)", xmBad.status >= 400 || issueBad.status >= 400,
    `xm ${xmBad.status}/issue ${issueBad.status}`);

  // ---------- PHASE APP: appointments (run-unique minute to avoid the
  // legitimate double-booking 409 across runs) ----------
  const minute = String(parseInt(RUN.slice(-4), 36) % 60).padStart(2, "0");
  const appt = await api("POST", "/appointments", {
    patientId: A.id, doctorId: doc.id,
    appointmentDate: new Date().toISOString().slice(0, 10), startTime: `16:${minute}`,
  }, T);
  const AP = unwrap(appt.json);
  check("appointment booked", appt.status === 201 && !!AP?.id, JSON.stringify(appt.json).slice(0, 160));

  const badTime = await api("POST", "/appointments", {
    patientId: A.id, doctorId: doc.id,
    appointmentDate: new Date().toISOString().slice(0, 10), startTime: "18:00", endTime: "17:00",
  }, T);
  check("appointment end<=start refused (400)", badTime.status === 400, badTime.status);

  // ---------- PHASE STATE: encounter completion ----------
  const complete = await api("PATCH", `/encounters/${E.id}/complete`, {}, T);
  check("encounter completed", [200, 201].includes(complete.status), complete.status);

  // ---------- PHASE CONC: parallel registrations ----------
  const conc = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    mkP(`Conc${i}`, RUN, `98${String(90000000 + i + parseInt(RUN.slice(-4), 36) % 1000000).slice(0, 8)}`)));
  const okConc = conc.filter(r => r.status === 201);
  const ids = new Set(okConc.map(r => unwrap(r.json)?.id));
  check("12/12 concurrent registrations succeed", okConc.length === 12, `${okConc.length}/12`);
  check("all concurrent patients unique ids", ids.size === 12, `${ids.size}/12`);

  // ---------- perf summary ----------
  timings.sort((a, b) => a - b);
  const p50 = timings[Math.floor(timings.length / 2)];
  const p95 = timings[Math.floor(timings.length * 0.95)];
  const avg = Math.round(timings.reduce((s, t) => s + t, 0) / timings.length);
  console.log(`\nPERF requests=${timings.length} p50=${p50}ms p95=${p95}ms avg=${avg}ms`);

  console.log(`\nRESULT: ${passed} PASS / ${failed} FAIL — run marker ${RUN}`);
  if (fails.length) console.log("FAILURES:", fails.join(" | "));
  (await import("fs")).default.writeFileSync(`.sim-run-${RUN}.json`, JSON.stringify({ run: RUN, passed, failed, fails, A, E, O, RX, INV, PAY, AP, doc, conc: [...ids] }, null, 1));
}

main().catch((e) => { console.error("HARNESS CRASH:", e.message); process.exit(1); });
