/**
 * Post-verification cleanup for the role-intelligence session:
 *   - TESTSIM users  (email endsWith @testsim.local, provisioned by role-matrix.mjs)
 *   - handoff patients (lastName contains TESTSIM, Handoff*, or Fin Probe probes)
 * plus their dependent chains. Mirrors the verified sim-cleanup.cjs deletion
 * order (children first; line-items cascade from their parents).
 * Verifies zero residue. Idempotent.
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PATIENT_WHERE = {
  OR: [
    { lastName: { contains: "TESTSIM" } },
    { firstName: "Handoff" },
    { AND: [{ firstName: "Fin" }, { lastName: "Probe" }] },
  ],
};

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: "@testsim.local" } },
    select: { id: true, email: true },
  });
  console.log(`testsim users found: ${users.length}`);
  const uids = users.map((u) => u.id);

  const patients = await prisma.patient.findMany({ where: PATIENT_WHERE, select: { id: true } });
  console.log(`synthetic patients found: ${patients.length}`);
  const ids = patients.map((p) => p.id);

  const log = (label, r) => console.log(`  ${label}: ${r.count}`);

  if (ids.length) {
    const invs = await prisma.invoice.findMany({ where: { patientId: { in: ids } }, select: { id: true } });
    const invIds = invs.map((i) => i.id);
    const pays = await prisma.payment.findMany({ where: { patientId: { in: ids } }, select: { id: true } });
    const payIds = pays.map((x) => x.id);
    const encs = await prisma.encounter.findMany({ where: { patientId: { in: ids } }, select: { id: true } });
    const encIds = encs.map((e) => e.id);
    const adm = await prisma.admission.findMany({ where: { patientId: { in: ids } }, select: { id: true } });
    const admIds = adm.map((a) => a.id);

    log("notifications", await prisma.notification.deleteMany({
      where: { OR: [{ userId: { in: uids } }, { referenceId: { in: [...payIds, ...invIds] } }] },
    }));
    log("financialTransactions", await prisma.financialTransaction.deleteMany({
      where: { OR: [{ patientId: { in: ids } }, { invoiceId: { in: invIds } }] },
    }));
    log("refunds", await prisma.refund.deleteMany({
      where: { OR: [{ invoiceId: { in: invIds } }, { paymentId: { in: payIds } }, { patientId: { in: ids } }] },
    }));
    log("payments", await prisma.payment.deleteMany({ where: { patientId: { in: ids } } }));
    log("invoices", await prisma.invoice.deleteMany({ where: { patientId: { in: ids } } }));
    log("bedAllocations", await prisma.bedAllocation.deleteMany({ where: { admissionId: { in: admIds } } }));
    log("bedMovements", await prisma.bedMovement.deleteMany({ where: { admissionId: { in: admIds } } }));
    log("admissions", await prisma.admission.deleteMany({ where: { patientId: { in: ids } } }));
    log("labSamples", await prisma.labSample.deleteMany({ where: { labOrder: { patientId: { in: ids } } } }));
    log("labOrders", await prisma.labOrder.deleteMany({ where: { patientId: { in: ids } } }));
    log("prescriptions", await prisma.prescription.deleteMany({ where: { patientId: { in: ids } } }));
    log("vitals", await prisma.vital.deleteMany({ where: { patientId: { in: ids } } }));
    log("encounters", await prisma.encounter.deleteMany({ where: { patientId: { in: ids } } }));
    log("patients", await prisma.patient.deleteMany({ where: { id: { in: ids } } }));
  }

  if (uids.length) {
    log("users", await prisma.user.deleteMany({ where: { id: { in: uids } } }));
  }

  const [u, p] = await Promise.all([
    prisma.user.count({ where: { email: { endsWith: "@testsim.local" } } }),
    prisma.patient.count({ where: PATIENT_WHERE }),
  ]);
  console.log(`RESIDUE users=${u} patients=${p}`);
  if (u + p !== 0) { console.error("RESIDUE REMAINS"); process.exit(1); }
  console.log("cleanup complete — zero residue");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
