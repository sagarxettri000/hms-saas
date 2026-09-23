/**
 * Removes all FBPROBE free-bed probe artifacts (any run): users' probe
 * patients, admissions, allocations, stays, movements, locations, wards, beds.
 * Idempotent — safe to re-run. Mirrors the proven sim-cleanup pattern
 * (role-cleanup.cjs): cascade-trusted deletes only, scoped by FBPROBE names.
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const probeWards = await prisma.ward.findMany({ where: { name: { contains: "FBPROBE" } }, select: { id: true } });
  const wardIds = probeWards.map((w) => w.id);

  const probeBeds = await prisma.bed.findMany({
    where: { OR: [{ bedNumber: { contains: "FBPROBE" } }, ...(wardIds.length ? [{ wardId: { in: wardIds } }] : [])] },
    select: { id: true },
  });
  const bedIds = probeBeds.map((b) => b.id);

  const probePatients = await prisma.patient.findMany({
    where: { OR: [{ lastName: { startsWith: "PatientA" }, firstName: "FBProbe" }, { lastName: { startsWith: "PatientB" }, firstName: "FBProbe" }] },
    select: { id: true },
  });
  const patientIds = probePatients.map((p) => p.id);

  const admissions = patientIds.length
    ? await prisma.admission.findMany({ where: { patientId: { in: patientIds } }, select: { id: true } })
    : [];
  const admissionIds = admissions.map((a) => a.id);

  const del = async (label, count) => console.log(`${label}: ${count ?? "ok"}`);

  // Children first (all FKs are cascade-trusted in the schema; ordering is
  // belt-and-braces for SQLite-style constraint timing on Postgres).
  if (admissionIds.length) {
    await del("nursingNotes", (await prisma.nursingNote.deleteMany({ where: { admissionId: { in: admissionIds } } })).count);
    await del("medications", (await prisma.medicationAdministration.deleteMany({ where: { admissionId: { in: admissionIds } } })).count);
    await del("bedMovements", (await prisma.bedMovement.deleteMany({ where: { admissionId: { in: admissionIds } } })).count);
    await del("freeBedStays", (await prisma.freeBedAllocation.deleteMany({ where: { admissionId: { in: admissionIds } } })).count);
    await del("bedAllocations", (await prisma.bedAllocation.deleteMany({ where: { admissionId: { in: admissionIds } } })).count);
    await del("patientLocations", (await prisma.patientLocation.deleteMany({ where: { admissionId: { in: admissionIds } } })).count);
    await del("encounters", (await prisma.encounter.deleteMany({ where: { patientId: { in: patientIds } } })).count);
    await del("admissions", (await prisma.admission.deleteMany({ where: { id: { in: admissionIds } } })).count);
    await del("patients", (await prisma.patient.deleteMany({ where: { id: { in: patientIds } } })).count);
  }
  if (bedIds.length) {
    await del("bedMaintenance", (await prisma.bedMaintenance.deleteMany({ where: { bedId: { in: bedIds } } })).count);
    await del("regulatoryEvents(beds)", (await prisma.regulatoryEvent.deleteMany({ where: { entityType: "Bed", entityId: { in: bedIds } } })).count);
    await del("beds", (await prisma.bed.deleteMany({ where: { id: { in: bedIds } } })).count);
  }
  if (wardIds.length) {
    await del("wards", (await prisma.ward.deleteMany({ where: { id: { in: wardIds } } })).count);
  }
  // any leftover regulatory events for probe patients
  if (patientIds.length) {
    await del("regulatoryEvents(patients)", (await prisma.regulatoryEvent.deleteMany({ where: { patientId: { in: patientIds } } })).count);
  }

  // Residue check
  const residue =
    (await prisma.ward.count({ where: { name: { contains: "FBPROBE" } } })) +
    (await prisma.bed.count({ where: { bedNumber: { contains: "FBPROBE" } } })) +
    (await prisma.patient.count({ where: { firstName: "FBProbe" } }));
  console.log(`RESIDUE: ${residue} (expect 0)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("CLEANUP ERROR:", (e.message || "").split("\n")[0]);
    await prisma.$disconnect();
    process.exit(1);
  });
