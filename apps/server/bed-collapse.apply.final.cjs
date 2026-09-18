// HMS bed-collapse APPLY (PRODUCTION, public proxy). Guards: refuses if an
// OCCUPIED bed lands in surplus; keptTotal must equal 50; atomic transaction.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
if (process.env.APPLY !== '1') { console.error('must set APPLY=1'); process.exit(2); }
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
(async () => {
  const wards = await prisma.$queryRaw`
    SELECT w.id, w.code, w.name FROM wards w
    WHERE w."isActive" = TRUE AND w.code IS NOT NULL ORDER BY w.name;`;
  const N = wards.length; const base = Math.floor(50 / N); const rem = 50 % N;
  const cap = (i) => base + (i < rem ? 1 : 0);
  const sql = []; let kept = 0;
  for (let i = 0; i < N; i++) {
    const w = wards[i]; const c = cap(i);
    const beds = await prisma.$queryRaw`
      SELECT b.id, b."bedNumber", b.status FROM beds b
      WHERE b."wardId" = ${w.id} AND b."isActive" = TRUE
      ORDER BY (b."bedNumber" ~ '^[0-9]+$') DESC, length(b."bedNumber"), b."bedNumber", b.id;`;
    const keep = beds.slice(0, c); const surplus = beds.slice(c);
    const occ = surplus.find((b) => b.status === 'OCCUPIED');
    if (occ) throw new Error('REFUSE occupied in surplus: ' + w.code + ' ' + occ.bedNumber);
    keep.forEach((b, j) => {
      const nu = w.code + '-' + (j + 1);
      if (b.bedNumber !== nu) sql.push('UPDATE beds SET "bedNumber" = ' + q(nu) + ' WHERE id = ' + q(b.id) + ';');
    });
    surplus.forEach((b) => { sql.push('UPDATE beds SET "isActive" = FALSE, "status" = \'INACTIVE\' WHERE id = ' + q(b.id) + ';'); });
    kept += keep.length;
  }
  if (kept !== 50) throw new Error('ABORT kept=' + kept);
  console.log('plan: ' + N + ' wards, cap=[' + wards.map((_, i) => cap(i)).join(',') + '], kept=' + kept + ', statements=' + sql.length);
  await prisma.$transaction(async (tx) => { for (const s of sql) { await tx.$queryRawUnsafe(s); } });
  console.log('APPLIED: ' + sql.length + ' statements committed.');
  const v = await prisma.$queryRaw`
    SELECT count(*) FILTER (WHERE "isActive" = TRUE)::int AS a,
           count(*) FILTER (WHERE "isActive" = TRUE AND status = 'OCCUPIED')::int AS o FROM beds;`;
  console.log('VERIFY: active=' + v[0].a + ', occupied=' + v[0].o);
})().catch((e) => { console.error(e.message.split('\n')[0]); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());