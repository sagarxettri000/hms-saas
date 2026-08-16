import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding HMS SaaS database...');

  // Clean up demo data first (idempotent)
  await cleanup();

  // Create default plans
  await seedPlans();

  // Create feature flags
  await seedFeatureFlags();

  // Create the Nepal Bharat Maitri Hospital tenant
  const tenant = await seedTenant();

  // Create roles and permissions
  await seedPermissions();

  // Create admin users
  const superAdmin = await seedSuperAdmin();
  const hospitalAdmin = await seedHospitalAdmin(tenant.id);

  // Create departments
  const departments = await seedDepartments(tenant.id);

  // Create doctors
  const doctors = await seedDoctors(tenant.id, departments);

  // Create staff (nurses, receptionists, etc.)
  await seedStaff(tenant.id, departments);

  // Create wards, rooms, beds
  await seedBeds(tenant.id, departments);

  // Create patients
  const patients = await seedPatients(tenant.id);

  // Create appointments
  await seedAppointments(tenant.id, patients, doctors, departments);

  // Create lab tests
  await seedLabTests(tenant.id);

  // Create medicines
  await seedMedicines(tenant.id);

  // Create stores and inventory
  await seedInventory(tenant.id);

  // Create insurance provider
  await seedInsurance(tenant.id);

  // Create membership packages
  await seedMemberships(tenant.id);

  // Create settings
  await seedSettings(tenant.id);

  console.log('✅ Seed completed successfully');
  console.log('----------------------------------------');
  console.log('🔑 Login credentials:');
  console.log(`  Platform Super Admin: superadmin@nbmaitri.com / SuperAdmin@123`);
  console.log(`  Hospital Admin: admin@nbmaitri.com / Admin@123`);
  console.log(`  Doctor: doctor@nbmaitri.com / Doctor@123`);
  console.log('----------------------------------------');
}

async function cleanup() {
  // Delete demo data (keep plans and feature flags for idempotency)
  const demoEmail = '@nbmaitri.com';
  const demoUsers = await prisma.user.findMany({
    where: { email: { contains: demoEmail } },
    select: { id: true },
  });
  const demoUserIds = demoUsers.map((u) => u.id);

  if (demoUserIds.length > 0) {
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: { in: demoUserIds } } }),
      prisma.auditLog.deleteMany({ where: { userId: { in: demoUserIds } } }),
      prisma.availabilitySlot.deleteMany({ where: { doctorId: { contains: 'demo' } } }),
    ]);
  }

  await prisma.appointment.deleteMany();
  await prisma.prescriptionItem.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.vital.deleteMany();
  await prisma.diagnosis.deleteMany();
  await prisma.encounter.deleteMany();
  await prisma.patientAllergy.deleteMany();
  await prisma.patientCondition.deleteMany();
  await prisma.patientDocument.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.store.deleteMany();
  await prisma.medicine.deleteMany();
  await prisma.labTest.deleteMany();
  await prisma.bedMovement.deleteMany();
  await prisma.bedAllocation.deleteMany();
  await prisma.bed.deleteMany();
  await prisma.room.deleteMany();
  await prisma.ward.deleteMany();
  await prisma.doctorSchedule.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.staffProfile.deleteMany();
  await prisma.membershipFamily.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.membershipPackage.deleteMany();
  await prisma.insurancePolicy.deleteMany();
  await prisma.insuranceProvider.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.tenantSetting.deleteMany();
  await prisma.integrationSetting.deleteMany();
  await prisma.tenantFeatureFlag.deleteMany();
  await prisma.department.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: demoEmail } } });
}

async function seedPlans() {
  const plans = [
    {
      name: 'STARTER' as const,
      description: 'For single clinics and small practices',
      price: 5000,
      billingCycle: 'MONTHLY' as const,
      maxUsers: 10,
      maxPatients: 5000,
      maxStorageMB: 2048,
      features: {
        OPD: true,
        appointments: true,
        patients: true,
        basicBilling: true,
        staff: true,
        schedules: true,
        enquiries: true,
      },
    },
    {
      name: 'PROFESSIONAL' as const,
      description: 'For growing hospitals with full modules',
      price: 15000,
      billingCycle: 'MONTHLY' as const,
      maxUsers: 50,
      maxPatients: 50000,
      maxStorageMB: 10240,
      features: {
        OPD: true,
        IPD: true,
        wards: true,
        pharmacy: true,
        lab: true,
        radiology: true,
        finance: true,
        nursing: true,
        analytics: true,
      },
    },
    {
      name: 'ENTERPRISE' as const,
      description: 'For hospital groups and multi-branch organizations',
      price: 50000,
      billingCycle: 'MONTHLY' as const,
      maxUsers: 500,
      maxPatients: 500000,
      maxStorageMB: 51200,
      features: {
        multiHospital: true,
        advancedPermissions: true,
        medicalTourism: true,
        cms: true,
        advancedAnalytics: true,
        customIntegrations: true,
        prioritySupport: true,
      },
    },
    {
      name: 'CUSTOM' as const,
      description: 'Custom plan for enterprise organizations',
      price: 0,
      billingCycle: 'MONTHLY' as const,
      maxUsers: 9999,
      maxPatients: 9999999,
      maxStorageMB: 999999,
      features: {},
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      create: plan,
      update: plan,
    });
  }
  console.log('  ✓ Plans seeded');
}

async function seedFeatureFlags() {
  const flags = [
    { key: 'telemedicine', name: 'Telemedicine', description: 'Virtual consultations', defaultEnabled: false },
    { key: 'medical_tourism', name: 'Medical Tourism', description: 'International patient services', defaultEnabled: false },
    { key: 'blood_bank', name: 'Blood Bank', description: 'Blood bank management module', defaultEnabled: false },
    { key: 'ot_management', name: 'OT Management', description: 'Operation theatre management', defaultEnabled: true },
    { key: 'icu_management', name: 'ICU Management', description: 'Intensive care unit module', defaultEnabled: true },
    { key: 'insurance', name: 'Insurance', description: 'Insurance and TPA management', defaultEnabled: true },
    { key: 'cms_blog', name: 'CMS / Blog', description: 'Content management system', defaultEnabled: false },
    { key: 'advanced_analytics', name: 'Advanced Analytics', description: 'Executive analytics and reporting', defaultEnabled: true },
    { key: 'mobile_apps', name: 'Mobile Apps', description: 'Patient, doctor and management mobile apps', defaultEnabled: false },
    { key: 'pharmacy', name: 'Pharmacy', description: 'Pharmacy management module', defaultEnabled: true },
    { key: 'laboratory', name: 'Laboratory', description: 'Lab information system', defaultEnabled: true },
    { key: 'radiology', name: 'Radiology', description: 'Radiology information system', defaultEnabled: true },
    { key: 'ipd_nursing', name: 'IPD / Nursing', description: 'Inpatient and nursing module', defaultEnabled: true },
    { key: 'accounting', name: 'Accounting', description: 'Full accounting module', defaultEnabled: true },
    { key: 'hrms', name: 'HRMS', description: 'HR management system', defaultEnabled: true },
    { key: 'crm', name: 'CRM', description: 'Enquiry and CRM module', defaultEnabled: true },
  ];

  for (const flag of flags) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: flag,
      update: flag,
    });
  }
  console.log('  ✓ Feature flags seeded');
}

async function seedTenant() {
  const existing = await prisma.tenant.findUnique({
    where: { code: 'NBM' },
  });

  if (existing) return existing;

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Nepal Bharat Maitri Hospital',
      code: 'NBM',
      description: 'Primary reference implementation - Multi-speciality hospital in Kathmandu',
      status: 'ACTIVE',
      timezone: 'Asia/Kathmandu',
      currency: 'NPR',
      language: 'en',
      addressLine1: 'Mitrapark, Chabahil',
      city: 'Kathmandu',
      district: 'Kathmandu',
      province: 'Bagmati',
      country: 'Nepal',
      postalCode: '44600',
      phone: '+977-1-4812345',
      email: 'info@nbmaitri.com',
      website: 'https://nbmaitri.com',
      panNumber: '601234567',
      vatNumber: '401234567',
      registrationNumber: 'HOSP-0001',
    },
  });

  // Enable feature flags for demo tenant
  const flags = await prisma.featureFlag.findMany();
  for (const flag of flags) {
    await prisma.tenantFeatureFlag.upsert({
      where: { tenantId_flagId: { tenantId: tenant.id, flagId: flag.id } },
      create: { tenantId: tenant.id, flagId: flag.id, enabled: true },
      update: { enabled: true },
    });
  }

  // Create subscription
  const enterprisePlan = await prisma.plan.findUnique({ where: { name: 'ENTERPRISE' } });
  if (enterprisePlan) {
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: enterprisePlan.id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        price: 50000,
        billingCycle: 'MONTHLY',
        autoRenew: true,
      },
    });
  }

  // Create main branch
  await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Nepal Bharat Maitri Hospital - Main Branch',
      code: 'MAIN',
      address: 'Mitrapark, Chabahil',
      city: 'Kathmandu',
      phone: '+977-1-4812345',
      email: 'info@nbmaitri.com',
    },
  });

  console.log('  ✓ Tenant created: Nepal Bharat Maitri Hospital');
  return tenant;
}

async function seedPermissions() {
  const actions = [
    'VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'REJECT',
    'PRINT', 'EXPORT', 'REFUND', 'DISCOUNT', 'SETTLE', 'ADMINISTER',
    'VERIFY', 'SIGN', 'CONFIGURE',
  ];

  for (const action of actions) {
    await prisma.permission.upsert({
      where: { name: action as any },
      create: { name: action as any },
      update: {},
    });
  }

  const roles = [
    { name: 'PLATFORM_SUPER_ADMIN', permissions: actions },
    { name: 'HOSPITAL_ADMIN', permissions: actions },
    { name: 'HOSPITAL_OWNER', permissions: actions },
    { name: 'DEPARTMENT_HEAD', permissions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY', 'SIGN'] },
    { name: 'RECEPTIONIST', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'EXPORT', 'SETTLE', 'REFUND', 'APPROVE', 'REJECT', 'VERIFY'] },
    { name: 'RECEPTION_SUPERVISOR', permissions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'DISCOUNT'] },
    { name: 'DOCTOR', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'EXPORT', 'SIGN', 'VERIFY'] },
    { name: 'NURSE', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'] },
    { name: 'WARD_INCHARGE', permissions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY'] },
    { name: 'LAB_TECHNICIAN', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'] },
    { name: 'PATHOLOGIST', permissions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY', 'SIGN'] },
    { name: 'RADIOLOGIST', permissions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY', 'SIGN'] },
    { name: 'RADIOLOGY_TECHNICIAN', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'] },
    { name: 'PHARMACIST', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'EXPORT', 'VERIFY'] },
    { name: 'FINANCE_MANAGER', permissions: actions },
    { name: 'INSURANCE_OFFICER', permissions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY'] },
    { name: 'HR_MANAGER', permissions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'ADMINISTER'] },
    { name: 'INVENTORY_MANAGER', permissions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY'] },
    { name: 'STORE_KEEPER', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'] },
    { name: 'PURCHASE_OFFICER', permissions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY'] },
    { name: 'OT_TECHNICIAN', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'] },
    { name: 'OT_NURSE', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'] },
    { name: 'ANESTHETIST', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY', 'SIGN'] },
    { name: 'ICU_STAFF', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'] },
    { name: 'EMERGENCY_STAFF', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'] },
    { name: 'AMBULANCE_STAFF', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT'] },
    { name: 'BLOOD_BANK_STAFF', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'VERIFY'] },
    { name: 'BIOMEDICAL_ENGINEER', permissions: ['VIEW', 'CREATE', 'EDIT', 'PRINT', 'EXPORT'] },
    { name: 'IT_ADMIN', permissions: ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ADMINISTER', 'CONFIGURE'] },
    { name: 'QUALITY_MANAGER', permissions: ['VIEW', 'CREATE', 'EDIT', 'APPROVE', 'REJECT', 'PRINT', 'EXPORT', 'VERIFY'] },
    { name: 'AUDITOR', permissions: ['VIEW', 'PRINT', 'EXPORT'] },
    { name: 'PATIENT', permissions: ['VIEW', 'PRINT'] },
  ];

  for (const role of roles) {
    const roleRecord = await prisma.role.upsert({
      where: { name: role.name as any },
      create: { name: role.name as any, description: `${role.name} role`, isSystem: true },
      update: { description: `${role.name} role` },
    });

    const permissionRecords = await prisma.permission.findMany({
      where: { name: { in: role.permissions as any } },
    });

    for (const permission of permissionRecords) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: roleRecord.id, permissionId: permission.id } },
        create: { roleId: roleRecord.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  console.log('  ✓ Roles and permissions seeded');
}

async function seedSuperAdmin() {
  const email = 'superadmin@nbmaitri.com';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash('SuperAdmin@123', 12);

  return prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'Platform',
      lastName: 'Super Admin',
      role: 'PLATFORM_SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });
}

async function seedHospitalAdmin(tenantId: string) {
  const email = 'admin@nbmaitri.com';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash('Admin@123', 12);

  return prisma.user.create({
    data: {
      tenantId,
      email,
      passwordHash,
      firstName: 'Hospital',
      lastName: 'Administrator',
      role: 'HOSPITAL_ADMIN',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      staffProfile: {
        create: {
          tenantId,
          employeeCode: 'EMP-0001',
          designation: 'Hospital Administrator',
          employmentStatus: 'ACTIVE',
          joiningDate: new Date('2020-01-01'),
        },
      },
    },
  });
}

async function seedDepartments(tenantId: string) {
  const deptNames = [
    'Emergency',
    'General Medicine',
    'General Surgery',
    'Neurosurgery',
    'Orthopedics',
    'Pediatrics',
    'Gynecology',
    'Radiology',
    'Laboratory',
    'Pharmacy',
    'ICU',
    'NICU',
    'OT',
    'Physiotherapy',
    'Administration',
    'Accounts',
    'HR',
  ];

  const departments: Record<string, string> = {};

  for (const name of deptNames) {
    const dept = await prisma.department.create({
      data: {
        tenantId,
        name,
        code: name.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
      },
    });
    departments[name] = dept.id;
  }

  console.log(`  ✓ ${deptNames.length} departments seeded`);
  return departments;
}

async function seedDoctors(tenantId: string, departments: Record<string, string>) {
  const doctorData = [
    { firstName: 'Ram', lastName: 'Shrestha', specialization: 'Internal Medicine', dept: 'General Medicine', fee: 500, exp: 15 },
    { firstName: 'Sita', lastName: 'Adhikari', specialization: 'Pediatrics', dept: 'Pediatrics', fee: 400, exp: 12 },
    { firstName: 'Hari', lastName: 'Bhandari', specialization: 'General Surgery', dept: 'General Surgery', fee: 600, exp: 18 },
    { firstName: 'Mina', lastName: 'KC', specialization: 'Obstetrics & Gynecology', dept: 'Gynecology', fee: 550, exp: 14 },
    { firstName: 'Krishna', lastName: 'Maharjan', specialization: 'Orthopedics', dept: 'Orthopedics', fee: 600, exp: 16 },
    { firstName: 'Gita', lastName: 'Poudel', specialization: 'Radiology', dept: 'Radiology', fee: 500, exp: 11 },
    { firstName: 'Bishnu', lastName: 'Thapa', specialization: 'Neurosurgery', dept: 'Neurosurgery', fee: 1000, exp: 20 },
    { firstName: 'Sunita', lastName: 'Gautam', specialization: 'Emergency Medicine', dept: 'Emergency', fee: 450, exp: 10 },
    { firstName: 'Prakash', lastName: 'Lama', specialization: 'Cardiology', dept: 'General Medicine', fee: 800, exp: 17 },
    { firstName: 'Nisha', lastName: 'Rai', specialization: 'Physiotherapy', dept: 'Physiotherapy', fee: 350, exp: 8 },
  ];

  const doctors: Record<string, string> = {};

  for (let i = 0; i < doctorData.length; i++) {
    const d = doctorData[i];
    const email = `doctor${i + 1}@nbmaitri.com`;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const profile = await prisma.doctorProfile.findUnique({ where: { userId: existing.id } });
      if (profile) {
        doctors[d.firstName] = profile.id;
        continue;
      }
    }

    const passwordHash = await bcrypt.hash('Doctor@123', 12);
    const user = await prisma.user.create({
      data: {
        tenantId,
        email,
        passwordHash,
        firstName: d.firstName,
        lastName: d.lastName,
        role: 'DOCTOR',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
      },
    });

    const profile = await prisma.doctorProfile.create({
      data: {
        tenantId,
        userId: user.id,
        departmentId: departments[d.dept],
        specialization: d.specialization,
        qualification: 'MD, MBBS',
        licenseNumber: `NMC-${1000 + i}`,
        consultationFee: d.fee,
        experienceYears: d.exp,
      },
    });

    // Create weekly schedule
    for (let day = 0; day < 6; day++) {
      await prisma.doctorSchedule.create({
        data: {
          tenantId,
          doctorId: profile.id,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 15,
          breakStart: '13:00',
          breakEnd: '14:00',
        },
      });
    }

    doctors[d.firstName] = profile.id;
  }

  console.log(`  ✓ ${doctorData.length} doctors seeded`);
  return doctors;
}

async function seedStaff(tenantId: string, departments: Record<string, string>) {
  const staffData = [
    { firstName: 'Rita', lastName: 'Sharma', role: 'NURSE', dept: 'General Medicine', code: 'N-001' },
    { firstName: 'Kavita', lastName: 'Yadav', role: 'NURSE', dept: 'ICU', code: 'N-002' },
    { firstName: 'Suresh', lastName: 'Tamang', role: 'LAB_TECHNICIAN', dept: 'Laboratory', code: 'L-001' },
    { firstName: 'Deepa', lastName: 'Magar', role: 'RADIOLOGY_TECHNICIAN', dept: 'Radiology', code: 'R-001' },
    { firstName: 'Anil', lastName: 'Pun', role: 'PHARMACIST', dept: 'Pharmacy', code: 'P-001' },
    { firstName: 'Manisha', lastName: 'Karki', role: 'RECEPTIONIST', dept: 'Administration', code: 'F-001' },
    { firstName: 'Rajesh', lastName: 'Bogati', role: 'RECEPTIONIST', dept: 'Administration', code: 'F-002' },
    { firstName: 'Sandhya', lastName: 'Dahal', role: 'RECEPTIONIST', dept: 'Administration', code: 'F-003' },
    { firstName: 'Umesh', lastName: 'Shahi', role: 'RECEPTIONIST', dept: 'Administration', code: 'F-004' },
    { firstName: 'Pratima', lastName: 'Gurung', role: 'WARD_INCHARGE', dept: 'General Medicine', code: 'W-001' },
    { firstName: 'Dipesh', lastName: 'Kandel', role: 'EMERGENCY_STAFF', dept: 'Emergency', code: 'E-001' },
    { firstName: 'Sarita', lastName: 'Bhatta', role: 'HR_MANAGER', dept: 'HR', code: 'HR-001' },
  ];

  for (let i = 0; i < staffData.length; i++) {
    const s = staffData[i];
    const email = `staff${i + 1}@nbmaitri.com`;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) continue;

    const passwordHash = await bcrypt.hash('Staff@123', 12);
    await prisma.user.create({
      data: {
        tenantId,
        email,
        passwordHash,
        firstName: s.firstName,
        lastName: s.lastName,
        role: s.role as UserRole,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        staffProfile: {
          create: {
            tenantId,
            employeeCode: s.code,
            designation: s.role,
            employmentStatus: 'ACTIVE',
            departmentId: departments[s.dept],
            joiningDate: new Date('2022-01-01'),
          },
        },
      },
    });
  }

  console.log(`  ✓ ${staffData.length} staff seeded`);
}

async function seedBeds(tenantId: string, departments: Record<string, string>) {
  const wardConfig = [
    { name: 'General Medicine Ward', dept: 'General Medicine', rooms: 4, bedsPerRoom: 4, rate: 1000 },
    { name: 'General Surgery Ward', dept: 'General Surgery', rooms: 4, bedsPerRoom: 4, rate: 1000 },
    { name: 'Pediatrics Ward', dept: 'Pediatrics', rooms: 3, bedsPerRoom: 4, rate: 800 },
    { name: 'Gynecology Ward', dept: 'Gynecology', rooms: 3, bedsPerRoom: 4, rate: 900 },
    { name: 'Orthopedics Ward', dept: 'Orthopedics', rooms: 3, bedsPerRoom: 4, rate: 1000 },
    { name: 'ICU', dept: 'ICU', rooms: 1, bedsPerRoom: 8, rate: 5000 },
    { name: 'NICU', dept: 'NICU', rooms: 1, bedsPerRoom: 6, rate: 4500 },
    { name: 'Emergency Ward', dept: 'Emergency', rooms: 2, bedsPerRoom: 4, rate: 1200 },
  ];

  for (const wc of wardConfig) {
    const ward = await prisma.ward.create({
      data: {
        tenantId,
        departmentId: departments[wc.dept],
        name: wc.name,
        code: wc.name.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
      },
    });

    for (let r = 1; r <= wc.rooms; r++) {
      const room = await prisma.room.create({
        data: {
          tenantId,
          wardId: ward.id,
          name: `${wc.name} Room ${r}`,
          roomNumber: `${String(r).padStart(2, '0')}`,
          roomType: wc.name.includes('ICU') ? 'ICU' : wc.name.includes('Emergency') ? 'EMERGENCY' : 'WARD',
          capacity: wc.bedsPerRoom,
          ratePerDay: wc.rate,
        },
      });

      for (let b = 1; b <= wc.bedsPerRoom; b++) {
        await prisma.bed.create({
          data: {
            tenantId,
            wardId: ward.id,
            roomId: room.id,
            bedNumber: `B-${r}${String(b).padStart(2, '0')}`,
            ratePerDay: wc.rate,
            status: 'AVAILABLE',
          },
        });
      }
    }
  }

  console.log('  ✓ Wards, rooms, beds seeded');
}

async function seedPatients(tenantId: string) {
  const patients = [
    { firstName: 'Hari', lastName: 'Sharma', gender: 'MALE', mobile: '9801234561', age: 45, city: 'Kathmandu', district: 'Kathmandu' },
    { firstName: 'Gita', lastName: 'Tamang', gender: 'FEMALE', mobile: '9801234562', age: 32, city: 'Bhaktapur', district: 'Bhaktapur' },
    { firstName: 'Bikash', lastName: 'Gurung', gender: 'MALE', mobile: '9801234563', age: 28, city: 'Lalitpur', district: 'Lalitpur' },
    { firstName: 'Sunita', lastName: 'Karki', gender: 'FEMALE', mobile: '9801234564', age: 55, city: 'Kathmandu', district: 'Kathmandu' },
    { firstName: 'Ram', lastName: 'Magar', gender: 'MALE', mobile: '9801234565', age: 60, city: 'Kathmandu', district: 'Kathmandu' },
    { firstName: 'Pooja', lastName: 'Rai', gender: 'FEMALE', mobile: '9801234566', age: 24, city: 'Lalitpur', district: 'Lalitpur' },
    { firstName: 'Krishna', lastName: 'Thapa', gender: 'MALE', mobile: '9801234567', age: 50, city: 'Bhaktapur', district: 'Bhaktapur' },
    { firstName: 'Anita', lastName: 'Shrestha', gender: 'FEMALE', mobile: '9801234568', age: 38, city: 'Kathmandu', district: 'Kathmandu' },
    { firstName: 'Deepak', lastName: 'Lama', gender: 'MALE', mobile: '9801234569', age: 42, city: 'Kathmandu', district: 'Kathmandu' },
    { firstName: 'Srijana', lastName: 'Basnet', gender: 'FEMALE', mobile: '9801234570', age: 29, city: 'Lalitpur', district: 'Lalitpur' },
  ];

  const createdPatients: string[] = [];

  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const mrn = `NBM-${year}${month}-${String(i + 1).padStart(4, '0')}`;

    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn,
        uid: `UID-${100000 + i}`,
        firstName: p.firstName,
        lastName: p.lastName,
        gender: p.gender as any,
        age: p.age,
        mobile: p.mobile,
        nationality: 'Nepali',
        city: p.city,
        district: p.district,
        province: 'Bagmati',
        country: 'Nepal',
        patientType: 'GENERAL',
        status: 'INACTIVE',
        consentGiven: true,
        consentDate: new Date(),
      },
    });

    // Add a few allergies for some patients
    if (i % 3 === 0) {
      await prisma.patientAllergy.create({
        data: {
          tenantId,
          patientId: patient.id,
          allergen: i % 2 === 0 ? 'Penicillin' : 'Aspirin',
          severity: 'MODERATE',
          reaction: 'Skin rash',
        },
      });
    }

    createdPatients.push(patient.id);
  }

  console.log(`  ✓ ${createdPatients.length} patients seeded`);
  return createdPatients;
}

async function seedAppointments(tenantId: string, patientIds: string[], doctors: Record<string, string>, departments: Record<string, string>) {
  const today = new Date();
  const doctorNames = Object.keys(doctors);

  for (let i = 0; i < 15; i++) {
    const doctorName = doctorNames[i % doctorNames.length];
    const doctorId = doctors[doctorName];
    const patientId = patientIds[i % patientIds.length];

    const date = new Date(today);
    date.setDate(date.getDate() + (i % 7) - 2);

    const startHour = 9 + (i % 7);
    const startTime = `${String(startHour).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}`;
    const endTime = `${String(startHour).padStart(2, '0')}:${String(((i * 5) % 60) + 15).padStart(2, '0')}`;

    const statuses = ['CONFIRMED', 'CHECKED_IN', 'WAITING', 'COMPLETED', 'IN_CONSULTATION'];
    const status = statuses[i % statuses.length];

    await prisma.appointment.create({
      data: {
        tenantId,
        patientId,
        doctorId,
        departmentId: departments['General Medicine'],
        appointmentDate: date,
        startTime,
        endTime,
        type: 'OPD',
        status: status as any,
        source: 'WALKIN',
        reason: 'General consultation',
        tokenNumber: String((i % 10) + 1).padStart(2, '0'),
      },
    });
  }

  console.log('  ✓ Appointments seeded');
}

async function seedLabTests(tenantId: string) {
  const tests = [
    { name: 'Complete Blood Count', code: 'CBC', category: 'Hematology', specimen: 'Whole Blood', price: 500, discipline: 'HEMATOLOGY', refRange: 'Varies by component', turnaround: 120 },
    { name: 'Blood Sugar (Fasting)', code: 'BSF', category: 'Biochemistry', specimen: 'Serum', price: 200, discipline: 'BIOCHEMISTRY', refRange: '70-100 mg/dL', turnaround: 60 },
    { name: 'Lipid Profile', code: 'LIPID', category: 'Biochemistry', specimen: 'Serum', price: 800, discipline: 'BIOCHEMISTRY', refRange: 'Varies by component', turnaround: 180 },
    { name: 'Liver Function Test', code: 'LFT', category: 'Biochemistry', specimen: 'Serum', price: 700, discipline: 'BIOCHEMISTRY', refRange: 'Varies by component', turnaround: 180 },
    { name: 'Kidney Function Test', code: 'KFT', category: 'Biochemistry', specimen: 'Serum', price: 700, discipline: 'BIOCHEMISTRY', refRange: 'Varies by component', turnaround: 180 },
    { name: 'Thyroid Function Test', code: 'TFT', category: 'Immunology', specimen: 'Serum', price: 900, discipline: 'IMMUNOLOGY', refRange: 'Varies by component', turnaround: 240 },
    { name: 'Urine Analysis', code: 'UA', category: 'Biochemistry', specimen: 'Urine', price: 300, discipline: 'BIOCHEMISTRY', refRange: 'Varies', turnaround: 90 },
    { name: 'Blood Group & Rh', code: 'BG', category: 'Hematology', specimen: 'Whole Blood', price: 250, discipline: 'HEMATOLOGY', refRange: 'A/B/AB/O +/-', turnaround: 45 },
    { name: 'Dengue NS1 Antigen', code: 'DENGUE', category: 'Immunology', specimen: 'Serum', price: 1200, discipline: 'IMMUNOLOGY', refRange: 'Negative', turnaround: 180 },
    { name: 'Typhoid (Widal Test)', code: 'WIDAL', category: 'Immunology', specimen: 'Serum', price: 400, discipline: 'IMMUNOLOGY', refRange: 'Negative (Titer < 1:80)', turnaround: 120 },
    { name: 'Malaria (RDT)', code: 'MALARIA', category: 'Hematology', specimen: 'Whole Blood', price: 350, discipline: 'HEMATOLOGY', refRange: 'Negative', turnaround: 60 },
    { name: 'CRP', code: 'CRP', category: 'Immunology', specimen: 'Serum', price: 500, discipline: 'IMMUNOLOGY', refRange: '< 6 mg/L', turnaround: 120 },
    { name: 'HbA1c', code: 'HBA1C', category: 'Biochemistry', specimen: 'Whole Blood', price: 600, discipline: 'BIOCHEMISTRY', refRange: '4.0-5.6%', turnaround: 120 },
    { name: 'Electrolytes', code: 'ELEC', category: 'Biochemistry', specimen: 'Serum', price: 450, discipline: 'BIOCHEMISTRY', refRange: 'Na 135-145, K 3.5-5.0', turnaround: 120 },
    { name: 'X-Ray Chest PA', code: 'XRC', category: 'Radiology', specimen: 'N/A', price: 800, discipline: 'RADIOLOGY', refRange: 'Normal', turnaround: 60 },
  ];

  for (const test of tests) {
    await prisma.labTest.upsert({
      where: { id: `${tenantId}-${test.code}` },
      create: {
        id: `${tenantId}-${test.code}`,
        tenantId,
        name: test.name,
        code: test.code,
        category: test.category,
        specimenType: test.specimen,
        price: test.price,
        discipline: test.discipline,
        referenceRange: test.refRange,
        turnaroundTime: test.turnaround,
      },
      update: {},
    });
  }

  console.log(`  ✓ ${tests.length} lab tests seeded`);
}

async function seedMedicines(tenantId: string) {
  const medicines = [
    { name: 'Paracetamol 500mg', generic: 'Paracetamol', category: 'Analgesic', brand: 'Calpol', form: 'TABLET', rate: 2, sales: 3.5 },
    { name: 'Amoxicillin 500mg', generic: 'Amoxicillin', category: 'Antibiotic', brand: 'Amoxil', form: 'CAPSULE', rate: 15, sales: 25 },
    { name: 'Azithromycin 500mg', generic: 'Azithromycin', category: 'Antibiotic', brand: 'Zithromax', form: 'TABLET', rate: 85, sales: 110 },
    { name: 'Omeprazole 20mg', generic: 'Omeprazole', category: 'PPI', brand: 'Omez', form: 'CAPSULE', rate: 8, sales: 12 },
    { name: 'Metformin 500mg', generic: 'Metformin', category: 'Antidiabetic', brand: 'Glycomet', form: 'TABLET', rate: 4, sales: 6.5 },
    { name: 'Amlodipine 5mg', generic: 'Amlodipine', category: 'Antihypertensive', brand: 'Amlong', form: 'TABLET', rate: 6, sales: 9 },
    { name: 'Cetirizine 10mg', generic: 'Cetirizine', category: 'Antihistamine', brand: 'Zyrtec', form: 'TABLET', rate: 2, sales: 3.5 },
    { name: 'Ibuprofen 400mg', generic: 'Ibuprofen', category: 'NSAID', brand: 'Brufen', form: 'TABLET', rate: 5, sales: 8 },
    { name: 'ORS Sachet', generic: 'Oral Rehydration Salts', category: 'Electrolyte', brand: 'Ostocal', form: 'SACHET', rate: 25, sales: 35 },
    { name: 'Vitamin D3 60000IU', generic: 'Cholecalciferol', category: 'Vitamin', brand: 'D-KEP', form: 'CAPSULE', rate: 60, sales: 90 },
  ];

  for (const med of medicines) {
    await prisma.medicine.upsert({
      where: { barcode: `${tenantId}-${med.generic.replace(/\s+/g, '-').toLowerCase()}` },
      create: {
        tenantId,
        name: med.name,
        genericName: med.generic,
        brandName: med.brand,
        category: med.category,
        form: med.form,
        purchaseRate: med.rate,
        salesRate: med.sales,
        reorderLevel: 50,
        barcode: `${tenantId}-${med.generic.replace(/\s+/g, '-').toLowerCase()}`,
      },
      update: {},
    });
  }

  console.log(`  ✓ ${medicines.length} medicines seeded`);
}

async function seedInventory(tenantId: string) {
  // Main store
  const store = await prisma.store.create({
    data: {
      tenantId,
      name: 'Main Pharmacy Store',
      code: 'PHARMA',
      type: 'PHARMACY',
      location: 'Ground Floor',
    },
  });

  const medicines = await prisma.medicine.findMany({ where: { tenantId } });

  for (let i = 0; i < medicines.length; i++) {
    const med = medicines[i];
    await prisma.inventoryItem.create({
      data: {
        tenantId,
        medicineId: med.id,
        storeId: store.id,
        name: med.name,
        itemType: 'MEDICINE',
        unit: med.form,
        currentStock: 200 + i * 25,
        minStock: 50,
        reorderLevel: 50,
        purchaseRate: med.purchaseRate,
        salesRate: med.salesRate,
        expiryDate: new Date(Date.now() + (90 + i * 15) * 24 * 60 * 60 * 1000),
        batchNumber: `B${new Date().getFullYear()}-${String(100 + i)}`,
        location: `Shelf-${i + 1}`,
      },
    });
  }

  console.log('  ✓ Inventory seeded');
}

async function seedInsurance(tenantId: string) {
  const providers = [
    { name: 'Social Security Fund (Nepal)', code: 'SSF', type: 'NATIONAL' },
    { name: 'Health Insurance Board', code: 'HIB', type: 'NATIONAL' },
    { name: 'National Life Insurance', code: 'NLIC', type: 'PRIVATE' },
    { name: 'MetLife Nepal', code: 'MET', type: 'PRIVATE' },
    { name: 'United Insurance', code: 'UNITED', type: 'PRIVATE' },
  ];

  for (const p of providers) {
    await prisma.insuranceProvider.create({
      data: { tenantId, name: p.name, code: p.code, type: p.type, isActive: true },
    });
  }

  console.log(`  ✓ ${providers.length} insurance providers seeded`);
}

async function seedMemberships(tenantId: string) {
  const packages = [
    { name: 'Silver Family Package', price: 15000, durationDays: 365, discountPercent: 5 },
    { name: 'Gold Family Package', price: 30000, durationDays: 365, discountPercent: 10 },
    { name: 'Platinum Package', price: 60000, durationDays: 365, discountPercent: 15 },
    { name: 'Senior Citizen Package', price: 10000, durationDays: 365, discountPercent: 10 },
    { name: 'Corporate Package', price: 0, durationDays: 365, discountPercent: 12 },
  ];

  for (const p of packages) {
    await prisma.membershipPackage.create({
      data: {
        tenantId,
        name: p.name,
        price: p.price,
        durationDays: p.durationDays,
        discountPercent: p.discountPercent,
        benefits: { doctorFee: 'Discounted', lab: '10% off', pharmacy: '5% off' },
      },
    });
  }

  console.log(`  ✓ ${packages.length} membership packages seeded`);
}

async function seedSettings(tenantId: string) {
  const settings = [
    {
      key: 'hospital_profile',
      value: {
        name: 'Nepal Bharat Maitri Hospital',
        tagline: 'Sewa Nai Dharma',
        address: 'Mitrapark, Chabahil, Kathmandu',
        phone: '+977-1-4812345',
        email: 'info@nbmaitri.com',
      },
    },
    {
      key: 'billing',
      value: {
        currency: 'NPR',
        symbol: 'रू',
        invoicePrefix: 'INV',
        receiptPrefix: 'RCT',
        defaultTaxPercent: 0,
        taxLabel: 'VAT',
      },
    },
    {
      key: 'appointments',
      value: {
        defaultSlotDuration: 15,
        reminderHours: 24,
        allowOnlineBooking: true,
        allowSameDayBooking: true,
      },
    },
    {
      key: 'patient_sticker',
      value: {
        width: 90,
        height: 50,
        includeBarcode: true,
        includeQrCode: true,
        fields: ['mrn', 'name', 'age', 'gender', 'bloodGroup', 'mobile', 'address'],
      },
    },
    {
      key: 'invoice_format',
      value: {
        showVAT: true,
        showPAN: true,
        showHospitalLogo: true,
        footer: 'Thank you for choosing Nepal Bharat Maitri Hospital',
      },
    },
    {
      key: 'notifications',
      value: {
        appointmentReminders: true,
        followUpReminders: true,
        labResults: true,
        lowStockAlerts: true,
      },
    },
  ];

  for (const setting of settings) {
    await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: setting.key } },
      create: { tenantId, key: setting.key, value: setting.value as any },
      update: { value: setting.value as any },
    });
  }

  console.log(`  ✓ ${settings.length} tenant settings seeded`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });