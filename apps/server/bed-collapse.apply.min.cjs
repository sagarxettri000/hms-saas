const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';
if (!APPLY) { console.error('set APPLY=1'); process.exit(2); }

function q(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

async function main() {
  const apply = prisma.$transaction(async (tx) => {
    const wards = await tx.$queryRaw`
      SELECT w.id, w.code, w.name FROM wards w
      WHERE w."isActive" = TRUE AND w."code" IS NOT NULL ORDER BY w.name;`;
    const N = wards.length;
    const base = Math.floor(50 / N);
    const rem = 50 % N;
    const capOf = (i) => base + (i < rem ? 1 : 0hed;

    let keptTotal = 0;
    for (let i = 0; i < N; i++) {
      const w = wards[i];
      const cap = capOf(i);
      const beds = await tx.$queryRaw`
        SELECT b.id, b."bedNumber", b.status FROM beds b
        WHERE b."wardId" = ${w.id} AND b."isActive" = TRUE
        ORDER BY (b."bedNumber" ~ '^[0-9]+$') DESC, length(b."bedNumber"), b."bedNumber", b.id;`;
      const keep = beds.slice(0, cap);
      const surplus = beds.slice(cap);
      const occSurplus = surplus.find((b) => b.status === 'OCCUPIED');
      if (occSurplus) {
        console.error('REFUSE occupied in surplus: ' + w.code + ' ' + occSurplus.bedNumber);
        throw new Error('REFUSE-ABORT');
      }
      keep.forEach((b, j) => {
        const neu = w.code + '-' + (j + 1);
        if (b.bedNumber !== neu) {
          await tx.$queryRawUnsafe('UPDATE beds SET "bedNumber" = ' + q(neu) + ', "updatedAt" = now() WHERE id = ' + q(b.id));
        }
      });
      surplus.forEach(async (b) => {
        await tx.$queryRawUnsafe('UPDATE beds SET "isActive" = FALSE, "status" = \'INACTIVE\', "updatedAt" = now() WHERE id = ' + q(b.id));
      });
      keptTotal = keptTotal + keep.length;
    }
    if (keptTotal !== 50) throw new Error('ABORT keptTotal=' + keptTotal);
    console.log('COMMIT keptTotal=' + keptTotal);
  });

  const result = await prisma.$transaction(apply);
  const chk = await prisma.$queryRaw`
    SELECT count(*) FILTER (WHERE "isActive" = TRUE)::int AS active,
           count(*) FILTER (WHERE "isActive" = TRUE AND status = 'OCCUPIED')::int AS occupied
    FROM beds;`;
  console.log('VERIFY active=' + chk[0].active + ' occupied=' + chk[0].occupied);
}

main().catch((e) => {
  console.error('ERR: ' + e.message.split('\n')[0]);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
