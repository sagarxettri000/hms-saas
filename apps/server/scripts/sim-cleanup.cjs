/**
 * Cleanup for sim-validate runs — deletes every TEST_SIM-marked patient and
 * all dependent synthetic rows in FK-safe order, then verifies zero residue.
 * Usage: node -r dotenv/config scripts/sim-cleanup.mjs
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  // Synthetic patients: lastName TESTSIM* (harness) or repro names.
  const patients = await p.patient.findMany({
    where: { OR: [{ lastName: { startsWith: "TESTSIM" } }, { firstName: "Repro" }] },
    select: { id: true, firstName: true, lastName: true },
  });
  const ids = patients.map((x) => x.id);
  console.log(`synthetic patients: ${ids.length}`);

  if (ids.length === 0) return console.log("nothing to clean");

  // Blood units via crossmatch records of these patients
  const xms = await p.bloodCrossmatch.findMany({ where: { patientId: { in: ids } }, select: { id: true, unitId: true } });
  const unitIds = [...new Set(xms.map((x) => x.unitId).filter(Boolean))];
  console.log(`crossmatches: ${xms.length}, units: ${unitIds.length}`);

  const invoices = await p.invoice.findMany({ where: { patientId: { in: ids } }, select: { id: true } });
  const invIds = invoices.map((x) => x.id);

  const adm = await p.admission.findMany({ where: { patientId: { in: ids } }, select: { id: true } });
  const admIds = adm.map((x) => x.id);

  const encs = await p.encounter.findMany({ where: { patientId: { in: ids } }, select: { id: true } });
  const encIds = encs.map((x) => x.id);

  const orders = await p.labOrder.findMany({ where: { patientId: { in: ids } }, select: { id: true } });
  const orderIds = orders.map((x) => x.id);

  const pays = await p.payment.findMany({ where: { patientId: { in: ids } }, select: { id: true } });
  const payIds = pays.map((x) => x.id);

  // 1. notifications referencing synthetic payments/refunds/prescriptions
  const n1 = await p.notification.deleteMany({ where: { referenceId: { in: [...payIds, ...invIds] } } });
  console.log("notifications:", n1.count);

  // 2. financial transactions
  const ft = await p.financialTransaction.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { invoiceId: { in: invIds } }] } });
  console.log("financialTransactions:", ft.count);

  // 3. refunds (by invoice + by payment)
  const rf = await p.refund.deleteMany({ where: { OR: [{ invoiceId: { in: invIds } }, { paymentId: { in: payIds } }, { patientId: { in: ids } }] } });
  console.log("refunds:", rf.count);

  // 4. payments
  const py = await p.payment.deleteMany({ where: { patientId: { in: ids } } });
  console.log("payments:", py.count);

  // 5. pharmacy sales
  
  // 6. invoices
  const iv = await p.invoice.deleteMany({ where: { patientId: { in: ids } } });
  console.log("invoices:", iv.count);

  // 7. appointments
  const ap = await p.appointment.deleteMany({ where: { patientId: { in: ids } } });
  console.log("appointments:", ap.count);

  // 8. bed allocations + movements, then admissions
  const ba = await p.bedAllocation.deleteMany({ where: { admissionId: { in: admIds } } });
  const bm = await p.bedMovement.deleteMany({ where: { admissionId: { in: admIds } } });
  const ad = await p.admission.deleteMany({ where: { patientId: { in: ids } } });
  console.log(`bedAllocations: ${ba.count}, bedMovements: ${bm.count}, admissions: ${ad.count}`);

  // 9. lab samples/items then orders
  const ls = await p.labSample.deleteMany({ where: { labOrderId: { in: orderIds } } });
  const lo = await p.labOrder.deleteMany({ where: { patientId: { in: ids } } });
  console.log(`labSamples: ${ls.count}, labOrders: ${lo.count}`);

  // 10. prescriptions
  const pr = await p.prescription.deleteMany({ where: { patientId: { in: ids } } });
  console.log("prescriptions:", pr.count);

  // 11. vitals + encounters
  let vt = { count: 0 };
  if (p.vital) { vt = await p.vital.deleteMany({ where: { patientId: { in: ids } } }); }
  const en = await p.encounter.deleteMany({ where: { patientId: { in: ids } } });
  console.log(`vitals: ${vt.count}, encounters: ${en.count}`);

  // 12. crossmatches + blood units
  const xmD = await p.bloodCrossmatch.deleteMany({ where: { patientId: { in: ids } } });
  const buD = unitIds.length ? await p.bloodUnit.deleteMany({ where: { id: { in: unitIds } } }) : { count: 0 };
  console.log(`crossmatches: ${xmD.count}, bloodUnits: ${buD.count}`);

  // 13. patients
  const paD = await p.patient.deleteMany({ where: { id: { in: ids } } });
  console.log("patients deleted:", paD.count);

  // ---- residue verification ----
  const residue = await p.patient.count({ where: { OR: [{ lastName: { startsWith: "TESTSIM" } }, { firstName: "Repro" }] } });
  const orphanUnits = unitIds.length ? await p.bloodUnit.count({ where: { id: { in: unitIds } } }) : 0;
  const orphanEnc = await p.encounter.count({ where: { patientId: { in: ids } } });
  const orphanInv = await p.invoice.count({ where: { patientId: { in: ids } } });
  console.log(`\nRESIDUE CHECK — patients: ${residue}, units: ${orphanUnits}, encounters: ${orphanEnc}, invoices: ${orphanInv}`);
  console.log(residue === 0 && orphanUnits === 0 && orphanEnc === 0 && orphanInv === 0 ? "CLEAN ✔" : "RESIDUE REMAINS ✘");
}

main()
  .catch((e) => { console.error("CLEANUP ERROR:", e.message); process.exit(1); })
  .finally(() => p.$disconnect());
