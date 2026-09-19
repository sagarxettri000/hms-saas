import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Ensure the demo RADIOLOGIST login exists in the connected database.
 * Additive + idempotent (upsert semantics) so it is safe to run against
 * the deployed production database: `npm run seed:radiologist`.
 *
 * Creates (if missing): user radiologist@nbmaitri.com (RADIOLOGIST),
 * staffProfile (Radiology) and doctorProfile (Diagnostic Radiology).
 */
const prisma = new PrismaClient();

async function main() {
  const tenant =
    (await prisma.tenant.findUnique({ where: { code: 'NBM' } })) ||
    (await prisma.tenant.findFirst());
  if (!tenant) {
    throw new Error('No tenant found. Run `npm run db:seed` locally first.');
  }

  const dept =
    (await prisma.department.findFirst({
      where: { tenantId: tenant.id, name: { contains: 'Radiology' } },
    })) ||
    (await prisma.department.findFirst({ where: { tenantId: tenant.id } }));
  if (!dept) {
    throw new Error('No department found for the tenant.');
  }

  const email = 'radiologist@nbmaitri.com';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('radiologist@nbmaitri.com already exists — nothing to do.');
    return;
  }

  const passwordHash = await bcrypt.hash('Radiologist@123', 12);
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash,
      firstName: 'Rajan',
      lastName: 'Shrestha',
      role: 'RADIOLOGIST',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      mustChangePassword: false,
      staffProfile: {
        create: {
          tenantId: tenant.id,
          employeeCode: 'RAD-002',
          designation: 'RADIOLOGIST',
          employmentStatus: 'ACTIVE',
          departmentId: dept.id,
          joiningDate: new Date('2023-04-01'),
        },
      },
      doctorProfile: {
        create: {
          tenantId: tenant.id,
          departmentId: dept.id,
          specialization: 'Diagnostic Radiology',
          qualification: 'MD (Radiology)',
          licenseNumber: 'NMC-9001',
          consultationFee: 600,
          experienceYears: 12,
        },
      },
    },
    include: { doctorProfile: true },
  });

  if (user.doctorProfile) {
    for (let day = 0; day < 6; day++) {
      await prisma.doctorSchedule.create({
        data: {
          tenantId: tenant.id,
          doctorId: user.doctorProfile.id,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 15,
          breakStart: '13:00',
          breakEnd: '14:00',
        },
      });
    }
  }

  console.log('Created radiologist@nbmaitri.com / Radiologist@123 (role RADIOLOGIST).');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());