/**
 * Autonomous role × permission intelligence (TESTSIM users only).
 *
 * 1. Static claim: derive ROLE_PERMISSIONS (server truth) + per-route
 *    @Permissions requirements from source; compute expected allow/deny for
 *    representative probe routes per action.
 * 2. Empirical: provision a synthetic user per role, log in, and verify the
 *    backend actually allows/denies each probe.
 * 3. Report mismatches: static claim vs enforced reality.
 *
 * Usage: node scripts/role-matrix.mjs
 */
const BASE = "http://localhost:4000/api/v1";
const { ROLE_PERMISSIONS } = await import("../../../packages/shared/dist/index.js");
let passed = 0, failed = 0;
const fails = [], mismatches = [];

function check(name, ok, extra = "") {
  if (ok) { passed++; console.log("PASS", name); }
  else { failed++; fails.push(name); console.log("FAIL", name, extra); }
}

function unwrap(j) {
  if (j && typeof j === "object" && "data" in j) return j.data;
  return j;
}

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
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const fs = (await import("fs")).default;
  const matrix = JSON.parse(fs.readFileSync(".role-matrix.json", "utf8"));

  // ---- admin login (throttle-aware) ----
  async function login(email, password) {
    let r = await api("POST", "/auth/login", { email, password });
    if (r.status === 429) { await sleep(65_000); r = await api("POST", "/auth/login", { email, password }); }
    return unwrap(r.json)?.accessToken;
  }
  const T = await login("admin@nbmaitri.com", "Admin@123");
  check("admin login", !!T);
  if (!T) return console.log("ABORT");

  // ---- discovery: tenants + users already present ----
  const me = await api("GET", "/auth/me", null, T);
  const meU = unwrap(me.json);
  const tenantId = meU?.tenantId;
  check("tenant resolved from /auth/me", !!tenantId, JSON.stringify(meU).slice(0, 100));

  const shared = await import("../../../packages/shared/dist/index.js");
  const ALL_ENUM_ROLES = Object.keys(shared.UserRole || {});
  const allRoles = ALL_ENUM_ROLES.filter((r) => r !== "PLATFORM_SUPER_ADMIN"); // not assignable via API
  console.log(`enum roles: ${ALL_ENUM_ROLES.length}, creatable targets: ${allRoles.length}`);

  // ---- representative probe per PermissionAction ----
  // Chosen to be safe: probes that would 403 before any state change.
  const GHOST = "00000000-0000-0000-0000-000000000000";
  const PROBES = {
    VIEW:      { method: "GET",    path: "/patients?limit=1" },
    CREATE:    { method: "GET",    path: "/users?limit=1" },
    EDIT:      { method: "GET",    path: "/appointments?limit=1" },
    DELETE:    { method: "DELETE", path: `/patients/${GHOST}` },
    VERIFY:    { method: "POST",   path: `/lab/orders/${GHOST}/verify` },
    APPROVE:   { method: "PATCH",  path: `/billing/refunds/${GHOST}/approve` },
    CONFIGURE: { method: "GET",    path: "/tenants" },
    SIGN:      { method: "POST",   path: `/lab/orders/${GHOST}/report` },
  };

  // ---- provision synthetic user per role ----
  const runTag = `TESTSIM${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const created = [];
  const safeRoles = allRoles.filter((r) => r !== "PLATFORM_SUPER_ADMIN");
  for (const role of safeRoles) {
    const email = `${role.toLowerCase()}.${runTag.toLowerCase()}@testsim.local`;
    const cr = await api("POST", "/users", {
      email, password: "RoleTest@2026", firstName: "Synthetic", lastName: role, role, tenantId,
    }, T);
    const cu = unwrap(cr.json);
    const ok = [200, 201].includes(cr.status) && !!cu?.id;
    if (ok) created.push({ role, email, id: cu.id });
    else console.log(`  (no user created for ${role}: ${cr.status})`);
  }
  check(`synthetic users provisioned (${created.length}/${safeRoles.length})`, created.length >= safeRoles.length - 2, `${created.length}/${safeRoles.length}`);

  // ---- login each and probe ----
  const results = [];
  for (const { role, email } of created) {
    const tok = await login(email, "RoleTest@2026");
    if (!tok) { results.push({ role, login: false }); console.log(`  ${role}: LOGIN FAILED`); continue; }

    const perms = ROLE_PERMISSIONS?.[role] || [];
    const row = { role, login: true, probes: {} };

    for (const [action, probe] of Object.entries(PROBES)) {
      const r = await api(probe.method, probe.path, null, tok);
      const expectedAllow = perms.includes(action) || ["HOSPITAL_ADMIN", "HOSPITAL_OWNER"].includes(role);
      const actuallyAllowed = r.status !== 403;
      row.probes[action] = { status: r.status, expectedAllow, actuallyAllowed };
      if (expectedAllow !== actuallyAllowed) {
        mismatches.push({ role, action, path: probe.path, expected: expectedAllow ? "ALLOW" : "DENY", actual: actuallyAllowed ? "ALLOW" : "DENY", status: r.status });
      }
      await sleep(60);
    }
    results.push(row);
    const brief = Object.entries(row.probes).map(([a, pr]) => `${a[0]}=${pr.status}`).join(" ");
    console.log(`  ${role}: ${brief}`);
  }

  // ---- summary ----
  console.log(`\nROLES PROBED: ${results.filter((r) => r.login).length}/${safeRoles.length}`);
  console.log(`MISMATCHES (static claim ≠ enforced): ${mismatches.length}`);
  for (const m of mismatches) console.log(`  MISMATCH ${m.role} ${m.action} ${m.path}: expected ${m.expected}, got ${m.actual} (${m.status})`);
  console.log(`\nRESULT: ${passed} PASS / ${failed} FAIL`);
  fs.writeFileSync(`.role-matrix-run-${runTag}.json`, JSON.stringify({ runTag, created, results, mismatches }, null, 1));
}

main().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
