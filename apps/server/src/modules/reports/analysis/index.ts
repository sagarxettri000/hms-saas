import type { ExecContext, ExecResult } from "./report.types";
import * as revenue from "./revenue-executors";
import * as statistics from "./statistics-executors";

export type Executor = (ctx: ExecContext) => Promise<ExecResult>;

const revenueExecutors: Record<string, Executor> = {
  "deposit-collections": revenue.depositCollections,
  "credit-sales": revenue.creditSales,
  "free-and-concession": revenue.freeAndConcession,
  "test-price-list": revenue.testPriceList,
  "bill-print": revenue.billPrint,
  "day-wise-collection": revenue.dayWiseCollection,
  "department-wise-revenue": revenue.departmentWiseRevenue,
  "discount-outstanding": revenue.discountOutstanding,
  "doctor-wise-income": revenue.doctorWiseIncome,
  "dept-testwise-revenue": revenue.deptTestwiseRevenue,
  "doctor-vs-dept": revenue.doctorVsDept,
  "ward-vs-dept": revenue.wardVsDept,
  "dept-vs-clinical": revenue.deptVsClinical,
  "account-revenue-tally": revenue.accountRevenueTally,
  "indoor-treatment-summary": revenue.indoorTreatmentSummary,
  "patient-wise-revenue": revenue.patientWiseRevenue,
  "materialized-view": revenue.materializedView,
  "bank-deposit": revenue.bankDeposit,
  "indoor-income": revenue.indoorIncome,
  "outdoor-income": revenue.outdoorIncome,
  "user-wise-collection": revenue.userWiseCollection,
  "revenue-statement": revenue.revenueStatement,
  "service-wise-income": revenue.serviceWiseIncome,
  "srl-report": revenue.srlReport,
  "operation-report": revenue.operationReport,
  "er-revenue": revenue.erRevenue,
};

const statisticsExecutors: Record<string, Executor> = {
  "dept-wise-stats": statistics.deptWiseStats,
  "date-day-wise-stats": statistics.dateDayWiseStats,
  "month-wise-stats": statistics.monthWiseStats,
  "geographical-stats": statistics.geographicalStats,
  "dept-age-classified": statistics.deptAgeClassified,
  "dept-wise-stats-ip": statistics.deptWiseStatsIp,
  "geographical-stats-ip": statistics.geographicalStatsIp,
  "dept-age-classified-ip": statistics.deptAgeClassifiedIp,
  "patient-analysis": statistics.patientAnalysis,
  "er-statistics": statistics.erStatistics,
  "dept-census": statistics.deptCensus,
  "dept-census-new": statistics.deptCensusNew,
  "patient-analysis-doctor": statistics.patientAnalysisDoctor,
  "periodical-inpatient-stats": statistics.periodicalInpatientStats,
  "discharge-record-sheet": statistics.dischargeRecordSheet,
  "patient-detail-opd": statistics.patientDetailOpd,
  "patient-detail-ipd": statistics.patientDetailIpd,
  "bed-occupancy": statistics.bedOccupancy,
  "bed-analysis": statistics.bedAnalysis,
  "service-wise-stats": statistics.serviceWiseStats,
  "monthly-doctor-wise": statistics.monthlyDoctorWise,
  "doc-wise-patient-total": statistics.docWisePatientTotal,
  "age-wise-opd": statistics.ageWiseOpd,
  "doctor-wise-referral": statistics.doctorWiseReferral,
};

const registry: Record<string, Executor> = {
  ...revenueExecutors,
  ...statisticsExecutors,
};

export function getExecutor(source: string): Executor | undefined {
  return registry[source];
}

export const EXECUTOR_COUNT = Object.keys(registry).length;
