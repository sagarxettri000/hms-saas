// HMS prod bed collapse 90->50. TWO-PHASE guarded atomic.
// Phase 1:  node collapse-prod.cjs             -> dry-run, prints plan, writes NOTHING
// Phase 2:  $env:APPLY="1"; node collapse-prod.cjs -> commits atomically + verifies
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
(async () => {
  const wards = await prisma.$queryRaw`
    SELECT w."id", w."code" FROM "wards" w
    WHERE w."isActive" = TRUE AND w."code" IS NOT NULL
    ORDER BY w."name";`;
  const N = wards.length;
  const base = Math.floor(50 / N);
  const rem = 50 % N;
  const ops = [];
  let kept = 0;
  for (let i = 0; i < N; i++) {
    const w = wards[i];
    const cap = base + (i < rem ? 1 : 0);
    const rows = await prisma.$queryRaw`
      SELECT b."id", b."bedNumber", b."status" FROM "beds" b
      WHERE b."wardId" = ${w.id} AND b."isActive" = TRUE
      ORDER BY (b."bedNumber" ~ '^[0-9]+$') DESC, length(b."bedNumber"), b."bedNumber", b."id";`;
    const keep = rows.slice(0, cap);
    const surplus = rows.slice(cap);
    const occ = surplus.find((r) => r.status === 'OCCUPIED');
    if (occ) throw new Error('REFUSE occupied in surplus: ' + w.code + ' ' + occ.bedNumber);
    keep.forEach((b, j) => {
      const nu = w.code + '-' + (j + 1);
      if (b.bedNumber !== nu) {
        ops.push(prisma.$executeRawUnsafe('UPDATE "beds" SET "bedNumber" = ' + q(nu) + ', "updatedAt" = now() WHERE "id" = ' + q(b.id)));
      }
    });
    surplus.forEach((b) => {
      ops.push(prisma.$executeRawUnsafe('UPDATE "beds" SET "isActive" = FALSE, "status" = \'INACTIVE\', "updatedAt" = now() WHERE "id" = ' + q(b.id)));
    });
    kept += keep.length;
  }
  if (kept !== 50) throw new Error('ABORT kept=' + kept);
  console.log('plan: ' + N + ' wards, kept=' + kept + ', ops=' + ops.length);
  if (!APPLY) { console.log('dry-run — no writes. set APPLY=1 to commit.'); return; }
  await prisma.$transaction(ops);
  const v = await prisma.$queryRaw`
    SELECT count(*) FILTER (WHERE "isActive" = TRUE)::int AS active,
           count(*) FILTER (WHERE "isActive" = TRUE AND "status" = 'OCCUPIED')::int AS occ
    FROM "beds";`;
  console.log('APPLIED ops=' + ops.length + ' verify active=' + v[0].active + ' occ=' + v[0].occ);
})().catch((e) => { console.log('ERR: ' + e.message.split('\n')[0]); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
