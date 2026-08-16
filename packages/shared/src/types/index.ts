export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface TenantEntity extends BaseEntity {
  tenantId: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchParams {
  query?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId?: string;
  role: string;
  permissions: string[];
  sessionId: string;
}

export interface SessionData {
  userId: string;
  tenantId?: string;
  role: string;
  permissions: string[];
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
}

export interface FileUpload {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
}

export interface SelectOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface KeyValuePair<K = string, V = unknown> {
  key: K;
  value: V;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  district: string;
  province: string;
  country: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface ContactInfo {
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
}

export interface Name {
  first: string;
  middle?: string;
  last: string;
  prefix?: string;
  suffix?: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  mobile?: string;
  address?: Address;
}

export interface Guardian {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  address?: Address;
  idType?: string;
  idNumber?: string;
}

export interface InsuranceInfo {
  providerId: string;
  policyNumber: string;
  groupNumber?: string;
  memberId?: string;
  expiryDate: Date;
  coverageDetails?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string;
  userRole: string;
  entity: string;
  entityId: string;
  action: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress: string;
  deviceId: string;
  timestamp: Date;
}

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  tenantId?: string;
  plan?: string[];
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceHealth[];
  timestamp: Date;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  lastCheck: Date;
  details?: Record<string, unknown>;
}

export interface UsageMetrics {
  tenantId: string;
  period: string;
  users: number;
  patients: number;
  appointments: number;
  storageUsed: number;
  documents: number;
  apiCalls: number;
}