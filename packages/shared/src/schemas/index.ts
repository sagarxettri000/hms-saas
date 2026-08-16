import { z } from 'zod';
import {
  UserRole,
  TenantStatus,
  SubscriptionPlan,
  PatientType,
  AppointmentStatus,
  BedStatus,
  AdmissionStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  LabOrderStatus,
  RadiologyOrderStatus,
  OTStatus,
  InventoryTransactionType,
  PurchaseOrderStatus,
  LeaveStatus,
  EnquiryStatus,
  Gender,
  BloodGroup,
  MaritalStatus,
} from '../enums';

export const createTenantSchema = z.object({
  name: z.string().min(2).max(200),
  code: z.string().min(2).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  logoUrl: z.string().url().optional(),
  address: z.object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    district: z.string().min(1),
    province: z.string().min(1),
    country: z.string().min(1),
    postalCode: z.string().optional(),
  }),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().email(),
    website: z.string().url().optional(),
  }),
  panNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  registrationNumber: z.string().optional(),
  timezone: z.string().default('Asia/Kathmandu'),
  currency: z.string().default('NPR'),
  language: z.string().default('en'),
});

export const updateTenantSchema = createTenantSchema.partial();

export const tenantSubscriptionSchema = z.object({
  plan: z.nativeEnum(SubscriptionPlan),
  startDate: z.date(),
  endDate: z.date(),
  trialEndDate: z.date().optional(),
  maxUsers: z.number().int().positive(),
  maxPatients: z.number().int().positive(),
  maxStorage: z.number().int().positive(),
  features: z.array(z.string()),
  price: z.number().nonnegative(),
  billingCycle: z.enum(['monthly', 'quarterly', 'yearly']),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole),
  tenantId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
  mfaCode: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const createPatientSchema = z.object({
  mrn: z.string().optional(),
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.date(),
  gender: z.nativeEnum(Gender),
  bloodGroup: z.nativeEnum(BloodGroup).optional(),
  nationality: z.string().default('Nepali'),
  phone: z.string().optional(),
  mobile: z.string().min(1),
  email: z.string().email().optional(),
  address: z.object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    district: z.string().min(1),
    province: z.string().min(1),
    country: z.string().default('Nepal'),
    postalCode: z.string().optional(),
  }),
  emergencyContact: z.object({
    name: z.string().min(1),
    relationship: z.string().min(1),
    phone: z.string().min(1),
    mobile: z.string().optional(),
  }).optional(),
  guardian: z.object({
    name: z.string().min(1),
    relationship: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email().optional(),
    idType: z.string().optional(),
    idNumber: z.string().optional(),
  }).optional(),
  patientType: z.nativeEnum(PatientType).default(PatientType.GENERAL),
  occupation: z.string().optional(),
  education: z.string().optional(),
  maritalStatus: z.nativeEnum(MaritalStatus).optional(),
  insurance: z.object({
    providerId: z.string(),
    policyNumber: z.string(),
    groupNumber: z.string().optional(),
    memberId: z.string().optional(),
    expiryDate: z.date(),
  }).optional(),
  allergies: z.array(z.string()).default([]),
  chronicConditions: z.array(z.string()).default([]),
  consentGiven: z.boolean().default(false),
  consentDate: z.date().optional(),
});

export const updatePatientSchema = createPatientSchema.partial();

export const patientSearchSchema = z.object({
  query: z.string().optional(),
  mrn: z.string().optional(),
  uid: z.string().optional(),
  name: z.string().optional(),
  mobile: z.string().optional(),
  dateOfBirth: z.date().optional(),
  patientType: z.nativeEnum(PatientType).optional(),
  status: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createAppointmentSchema = z.object({
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  departmentId: z.string().uuid(),
  scheduleId: z.string().uuid().optional(),
  slotId: z.string().uuid().optional(),
  appointmentDate: z.date(),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  type: z.enum(['OPD', 'FOLLOWUP', 'EMERGENCY', 'SPECIAL', 'TELEMEDICINE']),
  reason: z.string().max(500).optional(),
  notes: z.string().optional(),
  isWalkIn: z.boolean().default(false),
  source: z.enum(['ONLINE', 'PHONE', 'WALKIN', 'REFERRAL', 'OTHER']).default('WALKIN'),
});

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z.nativeEnum(AppointmentStatus).optional(),
  checkedInAt: z.date().optional(),
  completedAt: z.date().optional(),
  cancelledAt: z.date().optional(),
  cancellationReason: z.string().optional(),
});

export const appointmentSearchSchema = z.object({
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  date: z.date().optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  type: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});