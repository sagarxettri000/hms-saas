export type ReportCategoryId = "REVENUE" | "STATISTICS" | "FRACTION";

export type ReportAudience = "FINANCE" | "CLINICAL" | "ALL";

export type ColumnType = "money" | "number" | "date" | "string";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
  align?: "left" | "right";
  total?: boolean;
}

export type FilterKind =
  | "fromDate"
  | "toDate"
  | "date"
  | "month"
  | "year"
  | "financialYear"
  | "department"
  | "doctor"
  | "ward"
  | "patient"
  | "userId"
  | "cashier"
  | "branch"
  | "service"
  | "test"
  | "account"
  | "paymentMode"
  | "gender"
  | "ageGroup"
  | "type"
  | "status"
  | "bed"
  | "admissionType"
  | "search";

export interface ReportCard {
  label: string;
  value: string | number;
  tone?: string;
}

export interface ReportChartSeries {
  key: string;
  label: string;
}

export interface ReportChart {
  type: "bar" | "line" | "pie" | "donut" | "trend";
  labelsKey: string;
  series: ReportChartSeries[];
}

export interface ReportDefinition {
  id: string;
  number: string;
  name: string;
  category: ReportCategoryId;
  description: string;
  filters: FilterKind[];
  columns: ReportColumn[];
  cards?: ReportCard[];
  chart?: ReportChart;
  source: string;
  audience: ReportAudience;
}

export interface ReportCategory {
  id: ReportCategoryId;
  key: string;
  label: string;
  reports: ReportDefinition[];
}

export interface ResolvedFilters {
  from?: Date;
  to?: Date;
  month?: number;
  year?: number;
  departmentId?: string;
  doctorId?: string;
  wardId?: string;
  patientId?: string;
  userId?: string;
  branchId?: string;
  serviceId?: string;
  test?: string;
  accountId?: string;
  paymentMode?: string;
  gender?: string;
  ageGroup?: string;
  type?: string;
  status?: string;
  bedId?: string;
  admissionType?: string;
  search?: string;
  all?: Record<string, any>;
}

export interface PrismaModel {
  findMany: (...args: any[]) => Promise<any[]>;
  findUnique: (...args: any[]) => Promise<any>;
  findFirst: (...args: any[]) => Promise<any>;
  count: (...args: any[]) => Promise<number>;
  groupBy: (...args: any[]) => Promise<any[]>;
  aggregate: (...args: any[]) => Promise<any>;
  create: (...args: any[]) => Promise<any>;
  update: (...args: any[]) => Promise<any>;
}

export type PrismaLike = Record<string, PrismaModel>;

export interface ExecContext {
  prisma: PrismaLike;
  tenantId: string;
  filters: ResolvedFilters;
}

export interface ExecResult {
  rows: Record<string, any>[];
  totals?: Record<string, number>;
  cards?: ReportCard[];
  chart?: ReportChart | null;
  columns?: ReportColumn[];
  views?: { name: string; description: string; rows: number }[];
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface ReportMeta {
  generatedAt: string;
  filters: Record<string, string>;
  hospital: {
    name: string;
    address: string;
    city: string;
  };
  user: string;
}

export interface GeneratedReport {
  report: {
    id: string;
    number: string;
    name: string;
    category: ReportCategoryId;
    description: string;
  };
  meta: ReportMeta;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  totals: Record<string, number>;
  cards: ReportCard[];
  chart: (ReportChart & { labels: string[]; seriesData: Record<string, number[]> }) | null;
  count: number;
  views?: { name: string; description: string; rows: number }[];
}
