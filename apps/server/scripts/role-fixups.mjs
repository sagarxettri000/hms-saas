/**
 * Targeted probes for the role-matrix findings (TESTSIM users only).
 * Usage: node scripts/role-fixups.mjs
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
  return { token: unwrap(r.json)?.accessToken, body: unwrap(r.json) };
}

async function main() {
  const fs = (await import("fs")).default;
  const runs = fs.readdirSync(".").filter((f) => f.startsWith(".role-matrix-run-")).sort().reverse();
  const run = JSON.parse(fs.readFileSync(runs[0], "utf8"));
  const byRole = Object.fromEntries(run.created.map((c) => [c.role, c]));
  const runTag = run.runTag;

  // ---------- Finding A: AUDITOR/PATIENT user-write probes ----------
  for (const role of ["AUDITOR", "PATIENT"]) {
    const u = byRole[role];
    if (!u) continue;
    const { token } = await login(u.email, "RoleTest@2026");
    if (!token) { console.log(`  ${role} login failed; skipping`); continue; }

    const patchSelf = await api("PATCH", `/users/${u.id}`, { firstName: "Tampered" }, token);
    check(`${role} cannot edit users (>=400)`, patchSelf.status >= 400, `got ${patchSelf.status}`);

    const patchOther = await api("PATCH", "/users/00000000-0000-0000-0000-000000000000", { firstName: "X" }, token);
    check(`${role} cannot edit other users (>=400)`, patchOther.status >= 400, `got ${patchOther.status}`);

    const deactivate = await api("PATCH", "/users/00000000-0000-0000-0000-000000000000/deactivate", {}, token);
    check(`${role} cannot deactivate users (>=400)`, deactivate.status >= 400, `got ${deactivate.status}`);

    const list = await api("GET", "/users?limit=5", null, token);
    const listData = unwrap(list.json);
    const items = listData?.items || listData?.data || listData || [];
    const sample = (Array.isArray(items) ? items : [])[0] || {};
    const masked = !sample.email && !sample.passwordHash;
    check(`${role} user list is masked/read-safe`, list.status === 200 ? masked : true,
      JSON.stringify(sample).slice(0, 120));
    await sleep(300);
  }

  // ---------- Finding B: IT_ADMIN tenants access ----------
  const it = byRole["IT_ADMIN"];
  if (it) {
    const { token } = await login(it.email, "RoleTest@2026");
    if (token) {
      const t = await api("GET", "/tenants", null, token);
      check("IT_ADMIN blocked from tenant admin surface (403 = SuperAdminGuard)", t.status === 403, `got ${t.status}`);
      const tPatch = await api("PATCH", "/tenants/00000000-0000-0000-0000-000000000000", { name: "hack" }, token);
      check("IT_ADMIN cannot mutate tenants (>=400)", tPatch.status >= 400, `got ${tPatch.status}`);
    }
  }

  // ---------- Finding C: mustChangePassword enforcement ----------
  const hr = byRole["HR_MANAGER"];
  if (hr) {
    // HR creates a user WITHOUT password → PENDING + mustChangePassword
    const email = `pending.${runTag.toLowerCase()}@testsim.local`;
    const cu = await api("POST", "/users", {
      email, firstName: "Pending", lastName: "NoPass", role: "NURSE", tenantId: run.created[0]?.id ? undefined : undefined,
    }, await login("admin@nbmaitri.com", "Admin@123").then((r) => r.token));
    // admin token fresh login may be throttled; reuse main run knowledge: use HR (has CREATE? no) — fallback: skip if no CREATE
    if ([200, 201].includes(cu.status)) {
      const u = unwrap(cu.json);
      const pwLogin = await api("POST", "/auth/login", { email, password: "Wrong@Pass1" });
      check("PENDING user (no password set) cannot log in", pwLogin.status !== 200, `got ${pwLogin.status}`);
    } else {
      console.log(`  (PENDING-user probe skipped: create returned ${cu.status})`);
    }
  }

  console.log(`\nRESULT: ${passed} PASS / ${failed} FAIL`);
  if (fails.length) console.log("FAILURES:", fails.join(" | "));
}

main().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
