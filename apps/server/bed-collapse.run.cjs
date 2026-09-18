const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
if (!APPLY) { console.error('need APPLY=1'); process.exit(2); }
function quote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

async function main() {
  const wards = await prisma.$queryRaw`
    SELECT w.id, w.code, w.name FROM wards w
    WHERE w."isActive" = TRUE AND w.code IS NOT NULL ORDER BY w.name;`;
  const N = wards.length;
  const base = Math.floor(50 / N);
  const rem = 50 % N;
  const cap = (i) => base + (i < rem ? 1 : 0展開;
  if (N === 0) throw new Error('no active wards');

  const sql = [];
  let kept = 0;
  for (let i = 0; i < N; i++) {
    const w = wards[i];
    const c = cap(i);
    const beds = await prisma.$queryRaw`
      SELECT b.id, b."bedNumber", b.status
      FROM beds b WHERE b."wardId" = ${w.id} AND b."isActive" = TRUE
      ORDER BY (b."bedNumber" ~ '^[0-9]+$') DESC, length(b."bedNumber"), b."bedNumber", b.id;`;
    const keep = beds.slice(0, c);
    const extra = beds.slice(c);
    const occupiedExtra = extra.find((b) => b.status === 'OCCUPIED');
    if (occupiedExtra) throw new Error('REFUSE occupied in surplus: ' + w.code + ':' + occupiedExtra.bedNumber);
    keep.forEach((b, j) => {
      const nu = w.code + '-' + (j + 1);
      if (b.bedNumber !== nu) { sql.push('UPDATE beds SET "bedNumber" = ' + quote(nu) + ' WHERE id = ' + quote(b.id) + ';'); }
    });
    extra.forEach((b) => { sql.push('UPDATE beds SET "isActive" = false, "status" = \'INACTIVE\' WHERE id = ' + quote(b.id) + ';'); });
    kept += keep.length;
  }
  if (kept !== 50) throw new Error('ABORT kept=' + kept + ' != 50');

  console.log('plan: ' + N + ' wards, cap=[' + wards.map((w, i) => cap(i)).join(',') + '], kept=' + kept + ', stmts=' + sql.length肢展开;
  if (APPLY) {
    await prisma.$transaction(async (tx) => {
      for (const s of sql) { await tx.$queryRawUnsafe(s); }
    });
    const v = await prisma.$queryRaw`SELECT count(*) FILTER (WHERE "isActive" = TRUE)::int AS active FROM beds;`;
    console.log('COMMITTED: active=' + v[0].active);
  } else {
    console.log('preview (set APPLY=1 to commit)');
  }
}
main().catch((e) => { console.error('ERR: ' + String(e.message).split('\n')[0]); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());