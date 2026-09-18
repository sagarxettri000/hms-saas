import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.', '..', '..');

// ---------- collect server routes ----------
const routes = [];
function walk(dir, cb) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', 'dist', '.git', '.freebuff'].includes(e.name)) continue;
      walk(p, cb);
    } else cb(p);
  }
}

const CONTROLLER_RE = /@Controller\(\s*['"]([^'"]*)['"]\s*\)/g;
const ROUTE_RE = /@(Get|Post|Patch|Put|Delete)\(\s*(?:['"]([^'"]*)['"]\s*)?\)/g;

walk(path.join(ROOT, 'apps', 'server', 'src'), (p) => {
  if (!p.endsWith('.controller.ts')) return;
  const src = fs.readFileSync(p, 'utf8');
  const cm = CONTROLLER_RE.exec(src);
  CONTROLLER_RE.lastIndex = 0;
  const base = cm ? cm[1].replace(/\/$/, '') : '';
  let m;
  while ((m = ROUTE_RE.exec(src))) {
    const method = m[1].toUpperCase();
    const sub = m[2] || '';
    routes.push({ method, pattern: `${base}/${sub}`.replace(/\/+$/, ''), file: path.basename(p) });
  }
});

// ---------- collect web api() calls ----------
const webCalls = new Set();
walk(path.join(ROOT, 'apps', 'web', 'src'), (p) => {
  if (!/\.(tsx|ts)$/.test(p)) return;
  const src = fs.readFileSync(p, 'utf8');
  const re = /api\(\s*[`'"]([^`'"]+)[`'"]/g;
  let m;
  while ((m = re.exec(src))) webCalls.add(m[1]);
});

// ---------- collect web pages ----------
const pages = new Set();
walk(path.join(ROOT, 'apps', 'web', 'src', 'app'), (p) => {
  if (p.endsWith('page.tsx')) pages.add('/' + path.relative(path.join(ROOT, 'apps', 'web', 'src', 'app'), p).replace(/\\/g, '/').replace(/\/page\.tsx$/, '').replace(/\[\.\.\..*\]/, '*').replace(/\[([^\]]+)\]/g, ':param'));
});

// ---------- match api calls to routes ----------
function callMatches(call) {
  const clean = call.replace(/\?.*$/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return { ok: true, reason: 'empty' };
  for (const r of routes) {
    const rp = r.pattern.split('/').filter(Boolean);
    if (r.method !== 'GET' && r.method !== 'POST' && r.method !== 'PATCH' && r.method !== 'PUT' && r.method !== 'DELETE') continue;
    if (rp.length !== parts.length) continue;
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      const ps = parts[i];
      const rs = rp[i];
      if (ps.startsWith('${') || ps.startsWith(':') || ps.includes('$')) continue; // dynamic segment: assume match
      if (ps === '*' || rs.startsWith(':')) continue;
      if (ps !== rs) { ok = false; break; }
    }
    if (ok) return { ok: true };
  }
  return { ok: false };
}

console.log('=== API calls with NO matching server route ===');
let missing = 0;
for (const c of [...webCalls].sort()) {
  const res = callMatches(c);
  if (!res.ok) { console.log(`  ${c}`); missing++; }
}
console.log(`  (${missing} unresolved of ${webCalls.size} calls, ${routes.length} routes)`);

console.log('\n=== Sidebar links to pages that do not exist ===');
const appshell = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'src', 'components', 'AppShell.tsx'), 'utf8');
const hrefRe = /href:\s*'([^']+)'/g;
let m2, brokenLinks = 0;
while ((m2 = hrefRe.exec(appshell))) {
  let href = m2[1];
  if (!href.startsWith('/')) continue;
  const clean = href.split('?')[0].split('#')[0];
  if (pages.has(clean) || pages.has(clean.replace(/\/$/, ''))) continue;
  // dynamic template pages count for prefixes
  const covered = [...pages].some((pg) => pg.includes(':param') && clean.startsWith(pg.split(':param')[0].replace(/\/$/, '')));
  if (covered) continue;
  console.log(`  ${href}`);
  brokenLinks++;
}
console.log(`  (${brokenLinks} broken sidebar links)`);

console.log('\n=== Page-level hrefs/links pointing to nonexistent pages ===');
const hrefAllRe = /(?:href=\{?['"`])(\/[^'"`?#]+)/g;
const badHrefs = new Map();
walk(path.join(ROOT, 'apps', 'web', 'src'), (p) => {
  if (!/\.(tsx|ts)$/.test(p)) return;
  const src = fs.readFileSync(p, 'utf8');
  let m3;
  hrefAllRe.lastIndex = 0;
  while ((m3 = hrefAllRe.exec(src))) {
    const href = m3[1];
    if (href.startsWith('/api')) continue;
    const clean = href.split('?')[0];
    if (pages.has(clean)) continue;
    const covered = [...pages].some((pg) => pg.includes(':param') && clean.startsWith(pg.split(':param')[0].replace(/\/$/, '')));
    if (covered) continue;
    if (/^\/(login|logout)/.test(clean) && pages.has('/login')) continue;
    if (!badHrefs.has(href)) badHrefs.set(href, []);
    badHrefs.get(href).push(path.relative(ROOT, p));
  }
});
for (const [href, files] of [...badHrefs.entries()].sort()) {
  console.log(`  ${href}  <- ${[...new Set(files)].join(', ')}`);
}
console.log(`  (${badHrefs.size} distinct unresolved hrefs)`);

console.log('\n=== Server routes with NO web callers (orphans, informational) ===');
const orphans = routes.filter((r) => {
  const segs = r.pattern.split('/').filter(Boolean);
  if (segs.length === 0) return false;
  const head = segs[0];
  return ![...webCalls].some((c) => c.includes(head));
});
console.log(`  (${orphans.length} route groups without web callers)`);
