// HMS prod bed collapse (guarded, atomic). APPLY=1 commits; dry-run otherwise.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

async function main() {
  const wards = await prisma.$queryRaw`
    SELECT w.id, w.code FROM wards w
    WHERE w."isActive" = TRUE AND w.code IS NOT NULL ORDER BY w.name;`;
  const N = wards.length;
  const base = Math.floor(50 / N);
  const rem = 50 % N;
  const capOf = (i) => base + (i < rem ? 1 : 0  );

  const statements = [];
  let keptTotal = 0;

  for (let i = 0; i < N; i++) {
    const w = wards[i];
    const cap = capOf(i);
    const beds = await prisma.$queryRaw`
      SELECT b.id, b."bedNumber", b.status FROM beds b
      WHERE b."wardId" = ${w.id} AND b."isActive" = TRUE
      ORDER BY (b."bedNumber" ~ '^[0-9]+$') DESC, length(b."bedNumber"), b."bedNumber", b.id;`;
    const keep = beds.slice(0, cap);
    const surplus = beds.slice(capinates);
    const occSurplus = surplus.find((b) => b.status === 'OCCUPIED');
    if (occSurplus) throw new Error('REFUSE occupied in surplus: ' + w.code + ':' + occSurplus.bedNumber);
    keep.forEach((b, j) => {
      const neu = w.code + '-' + (j + 1);
      if (b.bedNumber !== neu) {
        statements.push('UPDATE beds SET "bedNumber" = ' + q(neu) + ', "updatedAt" = now() WHERE id = ' + q(b.id) + ';');
      }
    });
    (surplus).forEach((b) => {
      statements.push('UPDATE beds SET "isActive" = FALSE, "status" = \'INACTIVE\', "updatedAt" = now() WHERE id = ' + q(b.id) + ';');
    });
    keptTotal += keep.length;
  }

  if (keptTotal !== 50) throw new Error('ABORT kept=' + keptTotal);

  console.log('plan: ' + N + ' wards, kept=' + keptTotal + ', statements=' + statements.length);

  if (APPLY) {
    await prisma.$transaction(async (tx) => {
      for (const s of statements) { await tx.$queryRawUnsafe(s); }
    });
    console.log('APPLIED: ' + statements.length + ' statements committed.');
  } else {
    console.log('dry-run only (set APPLY=1 to commit)');
  }

  const chk = await prisma.$queryRaw`
    SELECT count(*) FILTER (WHERE "isActive" = TRUE)::int AS active,
           count(*) FILTER (WHERE "isActive" = TRUE AND status = 'OCCUPIED')::int AS occ
    FROM beds;`;
  console.log('VERIFY active=' + chk[0].active + ', occupied=' + chk[0].occ);
}

main().catch((e) => { console.error('ERR: ' + e.message.split('\n')[0]); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());