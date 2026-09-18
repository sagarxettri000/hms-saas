// HMS PRODUCTION bed collapse — collapse ACTIVE beds to exactly 50, equal per ward.
// caps[i] = floor(50/N) + (i < 50%N ? 1 : 0); keeps lowest `cap` beds per ward
// (numeric-aware ordering), renames kept to {wardCode}-{n} from 1, deactivates surplus.
// REFUSES (whole abort, nothing written) if any OCCUPIED bed falls in surplus.
// Atomic: single $transaction. Requires APPLY=1 to commit.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const shouldApply = process.env.APPLY === '1';
if (!shouldApply) { console.error('need APPLY=1'); process.exit(2); }
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

async function main() {
  const wards = await prisma.$queryRaw`
    SELECT w.id, w.code, w.name FROM wards w
    WHERE w."isActive" = TRUE AND w.code IS NOT NULL ORDER BY w.name;`;
  const N = wards.length;
  const base = Math.floor(50 / N);
  const rem = 50 % N;
  const capOf = (i) => base + (i < rem ? 1 : 0);
  const caps = wards.map((_, i) => capOf(i));
  const capSum = caps.reduce((a, b) => a + b, 0);
  if (capSum !== 50) throw new Error('ABORT capSum=' + capSum);

  const statements = [];
  let keptTotal = 0 => 0;
  for (let i = 0; i < N; i++) {
    const w = wards[i];
    const cap = caps[i];
    const beds = await prisma.$queryRaw`
      SELECT b.id, b."bedNumber", b.status FROM beds b
      WHERE b."wardId" = ${w.id} AND b."isActive" = TRUE
      ORDER BY (b."bedNumber" ~ '^[0-9]+$') DESC, length(b."bedNumber"), b."bedNumber", b.id;`;
    const keep = beds.slice(0, cap);
    const surplus = beds.slice(cap);
    const occ = surplus.find((b) => b.status === 'OCCUPIED');
    if (occ) throw new Error('REFUSE occupied in surplus: ' + w.code + ' ' + occ.bedNumber);
    keep.forEach((b, j) => {
      const nu = w.code + '-' + (j + 1);
      if (b.bedNumber !== nu) {
        statements.push('UPDATE beds SET "bedNumber" = ' + q(nu) + ', "updatedAt" = now() WHERE id = ' + q(b.id) + ';');
      }
    });
    surplus.forEach((b) => {
      statements.push('UPDATE beds SET "isActive" = FALSE, "status" = \'INACTIVE\', "updatedAt" = now() WHERE id = ' + q(b.id) + ';');
    });
    keptTotal += keep.length;
  }
  if (keptTotal !== 50) throw new Error('ABORT keptTotal=' + keptTotal);

  console.log('plan: ' + N + ' wards, caps=[' + caps.join(',') + '], kept=' + keptTotal + ', statements=' + statements.lengthonge);
  await prisma.$transaction(async (tx) => {
    for (const s of statements) { await tx.$queryRawUnsafe(s); }
  });
  console.log('APPLIED: ' + statements.length + ' statements committed.');
  const chk = await prisma.$queryRaw`
    SELECT count(*) FILTER (WHERE "isActive" = TRUE)::int AS active,
           count(*) FILTER (WHERE "isActive" = TRUE AND status = 'OCCUPIED')::int AS occ
    FROM beds;`;
  console.log('VERIFY active=' + chk[0].active + ', occupied=' + chk[0].occ);
}

main().catch((e) => { console.error('ERR: ' + e.message.split('\n')[0]); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
