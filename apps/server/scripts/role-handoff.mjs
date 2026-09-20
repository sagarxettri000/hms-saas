/**
 * Cross-role handoff chain (TESTSIM users only): one synthetic patient flows
 * through five roles, each acting only within its permission set:
 *
 *   RECEPTIONIST (register) → DOCTOR (encounter+lab order) →
 *   LAB_TECHNICIAN (sample+result) → PHARMACIST (dispense) →
 *   RECEPTIONIST (invoice+payment) → FINANCE_MANAGER (read financials)
 *
 * Verifies chain semantics: each step's artifact is visible to the next role,
 * and each role is DENIED steps outside its permission set.
 *
 * Usage: node scripts/role-handoff.mjs
 */
const BASE = "http://localhost:4000/api/v1";
let passed = 0, failed = 0;
const fails = [];

function check(name, ok, extra = "") {
  if (ok) { passed++; console.log("PASS", name); }
  else { failed++; fails.push(name); console.log("FAIL", name, extra); }
}

function unwrap(j) {
  if (j && typeof j === "object" && "data" in j) return j.data;
  return j;
}

function listOf(j) {
  const u = unwrap(j);
  if (Array.isArray(u)) return u;
  if (Array.isArray(u?.items)) return u.items;
  if (Array.isArray(u?.data)) return u.data;
  return [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, token) {
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
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
      if (attempt === 2) throw e;
      await sleep(3000);
    }
  }
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function login(email, password) {
  let r = await api("POST", "/auth/login", { email, password });
  if (r.status === 429) { await sleep(65_000); r = await api("POST", "/auth/login", { email, password }); }
  return unwrap(r.json)?.accessToken;
}

async function main() {
  const fs = (await import("fs")).default;
  const runs = fs.readdirSync(".").filter((f) => f.startsWith(".role-matrix-run-")).sort().reverse();
  const run = JSON.parse(fs.readFileSync(runs[0], "utf8"));
  const byRole = Object.fromEntries(run.created.map((c) => [c.role, c]));
  const tok = {};
  for (const role of ["RECEPTIONIST", "DOCTOR", "LAB_TECHNICIAN", "PHARMACIST", "FINANCE_MANAGER"]) {
    tok[role] = byRole[role] ? await login(byRole[role].email, "RoleTest@2026") : null;
    if (!tok[role]) console.log(`  (no ${role} token — steps will be skipped)`);
  }
  const T = await login("admin@nbmaitri.com", "Admin@123");
  if (!T) return console.log("ABORT: no admin");

  const docs = await api("GET", "/doctors?limit=1", null, T);
  const doc = listOf(docs.json)[0];
  if (!doc?.id) return console.log("ABORT: no doctor profile");

  // ---- Step 1: RECEPTIONIST registers the patient ----
  const RUN = run.runTag;
  const reg = await api("POST", "/patients", {
    firstName: "Handoff", lastName: RUN, mobile: `98${Date.now().toString().slice(-8)}`,
    gender: "MALE", patientType: "GENERAL",
  }, tok.RECEPTIONIST);
  const P = unwrap(reg.json);
  check("1. receptionist registers patient", reg.status === 201 && !!P?.id, JSON.stringify(reg.json).slice(0, 140));

  // receptionist cannot start an encounter (clinical boundary)
  const recEnc = await api("POST", "/encounters", { patientId: P.id, doctorId: doc.id, type: "OPD" }, tok.RECEPTIONIST);
  check("1b. receptionist blocked from creating encounters", recEnc.status === 403, `got ${recEnc.status}`);

  // ---- Step 2: DOCTOR opens encounter + orders lab ----
  const enc = await api("POST", "/encounters", {
    patientId: P.id, doctorId: doc.id, type: "OPD",
    chiefComplaint: "handoff synthetic complaint", vitals: { temperature: 37.8, pulse: 88 },
  }, tok.DOCTOR);
  const E = unwrap(enc.json);
  check("2. doctor creates encounter", enc.status === 201 && !!E?.id, JSON.stringify(enc.json).slice(0, 160));

  const order = await api("POST", "/lab/orders", {
    patientId: P.id, encounterId: E.id, doctorId: doc.id,
    items: [{ testName: "CBC", price: 350 }],
  }, tok.DOCTOR);
  const O = unwrap(order.json);
  check("2b. doctor orders lab test", order.status === 201 && !!O?.id, JSON.stringify(order.json).slice(0, 140));

  // doctor cannot dispense (pharmacy boundary)
  const docDisp = await api("POST", "/pharmacy/dispense", {
    patientId: P.id, storeId: "00000000-0000-0000-0000-000000000000",
    items: [{ medicineName: "X", quantity: 1 }],
  }, tok.DOCTOR);
  check("2c. doctor blocked from dispensing", docDisp.status === 403, `got ${docDisp.status}`);

  // doctor sees own patient in encounter list (visibility)
  const docEncs = await api("GET", `/encounters/doctor/${doc.id}`, null, tok.DOCTOR);
  const docSees = listOf(docEncs.json).some((e) => e.id === E.id);
  check("2d. doctor sees own encounter", docEncs.status === 200 && docSees, `status ${docEncs.status}`);

  // ---- Step 3: LAB_TECHNICIAN collects sample + enters result ----
  const sample = await api("POST", `/lab/orders/${O.id}/sample`, { specimenType: "BLOOD", container: "EDTA" }, tok.LAB_TECHNICIAN);
  check("3. lab tech collects sample", [200, 201].includes(sample.status), `got ${sample.status}`);

  const item0 = O.items?.[0];
  const result = await api("PATCH", `/lab/orders/${O.id}/items/${item0.id}/result`, {
    result: "Hb 13.2 g/dL", resultValue: 13.2, unit: "g/dL",
  }, tok.LAB_TECHNICIAN);
  check("3b. lab tech enters result", [200, 201].includes(result.status), `got ${result.status}`);

  // lab tech cannot create prescriptions (clinical boundary)
  const labRx = await api("POST", "/encounters/prescriptions", {
    patientId: P.id, items: [{ medicineName: "X" }],
  }, tok.LAB_TECHNICIAN);
  check("3c. lab tech blocked from prescribing", labRx.status === 403, `got ${labRx.status}`);

  // ---- Step 4: PHARMACIST dispenses ----
  const stores = await api("GET", "/pharmacy/stores", null, tok.PHARMACIST);
  const store = listOf(stores.json)[0];
  if (store?.id) {
    const disp = await api("POST", "/pharmacy/dispense", {
      patientId: P.id, storeId: store.id, paymentMethod: "CASH",
      items: [{ medicineName: "Paracetamol", quantity: 6, unitPrice: 2 }],
    }, tok.PHARMACIST);
    check("4. pharmacist dispenses", [200, 201].includes(disp.status), JSON.stringify(disp.json).slice(0, 140));

    const labDisp = await api("POST", "/pharmacy/dispense", {
      patientId: P.id, storeId: store.id, items: [{ medicineName: "X", quantity: 1 }],
    }, tok.LAB_TECHNICIAN);
    check("4b. lab tech blocked from dispensing", labDisp.status === 403, `got ${labDisp.status}`);
  } else {
    console.log("SKIP 4 — no store configured");
  }

  // ---- Step 5: RECEPTIONIST bills + takes payment ----
  const inv = await api("POST", "/billing/invoices", {
    patientId: P.id, type: "OPD",
    items: [{ serviceName: "Consultation", quantity: 1, rate: 500 }, { serviceName: "CBC", quantity: 1, rate: 350 }],
    idempotencyKey: `${RUN}-HANDOFF-${Date.now()}`,
  }, tok.RECEPTIONIST);
  const INV = unwrap(inv.json);
  check("5. receptionist creates invoice", inv.status === 201 && !!INV?.id, JSON.stringify(inv.json).slice(0, 160));
  const total = Number(INV?.totalAmount ?? INV?.total ?? INV?.netAmount);
  check("5b. invoice total == 850 (independent math)", total === 850, `got ${total}`);

  const pay = await api("POST", "/billing/payments", { invoiceId: INV.id, amount: 850, method: "CASH" }, tok.RECEPTIONIST);
  check("5c. receptionist records payment", pay.status === 201, JSON.stringify(pay.json).slice(0, 120));

  // receptionist cannot approve refunds (finance boundary)
  const recRefund = await api("POST", "/billing/refunds", {
    invoiceId: INV.id, amount: 10, reason: "handoff probe",
  }, tok.RECEPTIONIST);
  const REF = unwrap(recRefund.json);
  check("5d. receptionist CAN request refund (holds CREATE)", recRefund.status === 201, `got ${recRefund.status}`);

  const selfApprove = await api("PATCH", `/billing/refunds/${REF.id}/approve`, {}, tok.RECEPTIONIST);
  check("5e. receptionist CANNOT approve own refund (separation of duties)", selfApprove.status === 403, `got ${selfApprove.status}`);

  const otherApprove = await api("PATCH", `/billing/refunds/${REF.id}/approve`, {}, T);
  check("5f. admin approves the refund", [200, 201].includes(otherApprove.status), `got ${otherApprove.status}`);
  const reApprove = await api("PATCH", `/billing/refunds/${REF.id}/approve`, {}, T);
  check("5g. double-approval refused (409)", reApprove.status === 409, `got ${reApprove.status}`);

  // ---- Step 6: FINANCE_MANAGER reads financials ----
  const finInv = await api("GET", `/billing/invoices/${INV.id}`, null, tok.FINANCE_MANAGER);
  const FV = unwrap(finInv.json);
  check("6. finance sees invoice", finInv.status === 200 && !!FV?.id, `got ${finInv.status}`);
  // Oracle: 850 paid in, approved 10 refund posts out => net paid 840, due reopened to 10.
  const paid = Number(FV?.paidAmount);
  const due = Number(FV?.dueAmount);
  check("6b. finance sees paid == 840 (850 - 10 refund)", paid === 840, `got ${paid}`);
  check("6b2. dueAmount reopened to 10 by refund", due === 10, `got ${due}`);

  // finance cannot create patients (reception boundary)
  const finReg = await api("POST", "/patients", {
    firstName: "Fin", lastName: "Probe", mobile: `97${Date.now().toString().slice(-8)}`,
  }, tok.FINANCE_MANAGER);
  // FINANCE_MANAGER has CREATE per matrix — this is ALLOWED; assert only non-500
  check("6c. finance patient-create is authorized-or-denied cleanly (no 500)", finReg.status !== 500, `got ${finReg.status}`);

  console.log(`\nRESULT: ${passed} PASS / ${failed} FAIL`);
  if (fails.length) console.log("FAILURES:", fails.join(" | "));
  fs.writeFileSync(`.handoff-${RUN}.json`, JSON.stringify({ run: RUN, patient: P?.id, encounter: E?.id, order: O?.id, invoice: INV?.id }, null, 1));
}

main().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
