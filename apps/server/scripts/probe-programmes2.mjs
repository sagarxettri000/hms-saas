/**
 * Live E2E probe — Hospital Standards / Government Programme / Operational
 * Resilience gaps: unified programme ledger (#24/#36), operational MSS
 * compliance (#4.1), disaster deferred transactions (#12/#37/#43-S4).
 * Read-only checks: no; creates marked probe records via the real API.
 */
const BASE = "http://localhost:4000/api/v1";
let passed = 0;
let failed = 0;
const fails = [];

function check(name, ok, extra = "") {
  if (ok) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    fails.push(name);
    console.log("FAIL", name, extra);
  }
}

function unwrap(j) {
  if (j && typeof j === "object" && "data" in j) return j.data;
  return j;
}

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

async function main() {
  // ---- login (paced: the login throttle is aggressive) ----
  const login = await api("POST", "/auth/login", {
    email: "admin@nbmaitri.com",
    password: "Admin@123",
  });
  const token = unwrap(login.json)?.accessToken;
  check("admin login", !!token, login.status);
  if (!token) return console.log("ABORT: no token");

  // ---- §24/§36 programme ledger lifecycle ----
  const open = await api("POST", "/regulatory/programme-ledger", {
    programme: "PROBE_AAMA",
    programmeVersion: "probe-v1",
    benefitType: "DELIVERY_INCENTIVE",
    approvedAmount: 5000,
  }, token);
  const led = unwrap(open.json);
  check("ledger open (remaining=approved)", open.status === 201 && Number(led?.remainingAmount) === 5000, JSON.stringify(open.json).slice(0, 150));

  const util = await api("POST", `/regulatory/programme-ledger/${led.id}/utilize`, {
    amount: 3000,
    serviceRef: "probe-enc-1",
  }, token);
  check("utilize 3000 (remaining 2000)", util.status === 201 && Number(unwrap(util.json)?.remainingAmount) === 2000, JSON.stringify(util.json).slice(0, 150));

  const overUtil = await api("POST", `/regulatory/programme-ledger/${led.id}/utilize`, { amount: 9999 }, token);
  check("over-utilization refused (§36)", overUtil.status === 409, `got ${overUtil.status}`);

  const claim = await api("POST", `/regulatory/programme-ledger/${led.id}/claim`, {
    amount: 3000,
    governmentReference: "PROBE-CLAIM-1",
  }, token);
  check("claim ≤ utilized ok", claim.status === 201, `got ${claim.status}`);

  const overClaim = await api("POST", `/regulatory/programme-ledger/${led.id}/claim`, { amount: 1 }, token);
  check("claim > utilized refused (§36)", overClaim.status === 409, `got ${overClaim.status}`);

  const pay = await api("POST", `/regulatory/programme-ledger/${led.id}/pay`, { amount: 2000 }, token);
  check("partial pay 2000", pay.status === 201 && Number(unwrap(pay.json)?.paidAmount) === 2000, JSON.stringify(pay.json).slice(0, 150));

  const overPay = await api(  "POST", `/regulatory/programme-ledger/${led.id}/pay`, { amount: 2000 }, token);
  check("pay > claimed refused (§36)", overPay.status === 409, `got ${overPay.status}`);

  const rev = await api("POST", `/regulatory/programme-ledger/${led.id}/reverse`, {
    amount: 500,
    reason: "probe duplicate utilization",
  }, token);
  check("authorized reversal adjusts remaining", rev.status === 201 && Number(unwrap(rev.json)?.remainingAmount) === 2500, JSON.stringify(rev.json).slice(0, 150));

  const revNoReason = await api("POST", `/regulatory/programme-ledger/${led.id}/reverse`, { amount: 10, reason: "" }, token);
  check("reversal without reason refused", revNoReason.status === 409, `got ${revNoReason.status}`);

  // ---- §4.1 operational MSS compliance ----
  const tagSet = await api("POST", "/regulatory/mss/sets", {
    setName: `PROBE MSS ${Date.now()}`,
    facilityLevel: "PRIMARY",
    declaredCount: 3,
    authority: "MoHP (probe)",
    standards: [
      { standardCode: "PROBE-STAFF-01", standardName: "Staffing adequacy", domain: "GOVERNANCE", scoringMethod: "OPERATIONAL:staffing", isMandatory: true, evidenceRequired: false },
      { standardCode: "PROBE-MED-02", standardName: "Medicine availability", domain: "SUPPORT", scoringMethod: "OPERATIONAL:medicine_availability", isMandatory: true, evidenceRequired: false },
      { standardCode: "PROBE-MAN-03", standardName: "Fire drill log", domain: "SUPPORT", scoringMethod: "MANUAL_DRILL", isMandatory: false, evidenceRequired: true },
    ],
  }, token);
  check("operational-tagged MSS set published", tagSet.status === 201, JSON.stringify(tagSet.json).slice(0, 150));

  const derived = await api("GET", "/regulatory/mss/operational-compliance?facilityLevel=PRIMARY", null, token);
  const d = unwrap(derived.json);
  check("operational signals derived", derived.status === 200 && !!d?.signals?.staffing, JSON.stringify(derived.json).slice(0, 200));
  check("only OPERATIONAL-tagged standards derived", Array.isArray(d?.derived) && d.derived.length >= 2, `got ${d?.derived?.length}`);
  check("signals carry thresholds (rule-driven)", typeof d?.signals?.staffing?.threshold === "number", JSON.stringify(d?.signals?.staffing));

  // ---- §12/§37/§43-S4 disaster deferred transactions ----
  const act = await api("POST", "/regulatory/disaster/activate", {
    mode: "MASS_CASUALTY_MODE",
    incidentName: `Probe Incident ${Date.now()}`,
    incidentType: "BUS_CRASH",
    activatedBy: "probe",
  }, token);
  const activation = unwrap(act.json);
  check("disaster activated", act.status === 201 && !!activation?.id, JSON.stringify(act.json).slice(0, 150));

  const def = await api("POST", `/regulatory/disaster/${activation.id}/deferred`, {
    tempPatientId: `MC-${Date.now()}`,
    serviceCode: "SUTURING",
    description: "laceration repair",
    quantity: 1,
    clinicianRef: "probe-doc-1",
    location: "Triage Green",
    amount: 1500,
  }, token);
  const dtx = unwrap(def.json);
  check("deferred service captured without billing", def.status === 201 && dtx?.status === "PENDING", JSON.stringify(def.json).slice(0, 150));

  const def2 = await api("POST", `/regulatory/disaster/${activation.id}/deferred`, {
    tempPatientId: `MC-${Date.now()}-b`,
    serviceCode: "XRAY_WRIST",
    quantity: 1,
  }, token);
  const dtx2 = unwrap(def2.json);
  check("second deferred service captured", def2.status === 201 && !!dtx2?.id, `got ${def2.status}`);

  const summ = await api("GET", "/regulatory/disaster/deferred", null, token);
  const s = unwrap(summ.json);
  check("deferred summary lists pending", summ.status === 200 && (s?.pending || []).some((p) => p.id === dtx.id), JSON.stringify(summ.json).slice(0, 200));

  const reRec = await api("POST", "/regulatory/disaster/deferred/reconcile", {
    transactionIds: [dtx.id, dtx2.id],
    encounterId: "probe-enc-0001",
    invoiceId: "probe-inv-0001",
  }, token);
  check("reconciled into encounter (idempotent gate)", reRec.status === 201 && unwrap(reRec.json)?.reconciled === 2, JSON.stringify(reRec.json).slice(0, 150));

  const reAgain = await api("POST", "/regulatory/disaster/deferred/reconcile", {
    transactionIds: [dtx.id],
    encounterId: "probe-enc-0001",
  }, token);
  check("re-reconciliation refused (no silent duplicates)", reAgain.status === 409, `got ${reAgain.status}`);

  const wo = await api("POST", `/regulatory/disaster/deferred/${dtx.id}/write-off`, {
    reason: "probe: unrecoverable after reconciliation attempt",
  }, token);
  check("write-off of reconciled refused", wo.status === 409, `got ${wo.status}`);

  const standDown = await api("POST", `/regulatory/disaster/${activation.id}/deactivate`, {}, token);
  check("incident stood down", standDown.status < 300, `got ${standDown.status}`);

  const defAfter = await api("POST", `/regulatory/disaster/${activation.id}/deferred`, {
    tempPatientId: "MC-after",
    serviceCode: "LATE_SVC",
  }, token);
  check("capture refused after stand-down", defAfter.status === 409, `got ${defAfter.status}`);

  console.log(`\n${passed} pass, ${failed} fail`);
  if (fails.length) {
    console.log("FAILURES:", fails.join(" | "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("PROBE CRASH:", e.message);
  process.exit(1);
});
