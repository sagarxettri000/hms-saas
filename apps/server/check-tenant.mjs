import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const t = await p.tenant.findFirst({ select: { id: true, name: true, panNumber: true, vatNumber: true, registrationNumber: true } });
console.log(JSON.stringify(t, null, 1));
await p.$disconnect();
