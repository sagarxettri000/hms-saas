import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ReportsService } from "../reports/reports.service";
import { buildPdf, toCsv } from "./pdf.util";

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  async patientsCsv(tenantId: string): Promise<string> {
    const patients = await this.prisma.patient.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const rows = [
      [
        "MRN",
        "Name",
        "Gender",
        "Date of Birth",
        "Phone",
        "Email",
        "Address",
        "Status",
      ],
      ...patients.map((p) => [
        p.mrn,
        [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "),
        p.gender || "",
        p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : "",
        p.mobile || p.phone || "",
        p.email || "",
        [p.addressLine1, p.city, p.district].filter(Boolean).join(", "),
        p.status,
      ]),
    ];
    return toCsv(rows);
  }

  async invoicesCsv(
    tenantId: string,
    params: { from?: string; to?: string } = {},
  ): Promise<string> {
    const range = {
      from: undefined as Date | undefined,
      to: undefined as Date | undefined,
    };
    if (params.from) range.from = new Date(params.from);
    if (params.to) {
      const d = new Date(params.to);
      d.setHours(23, 59, 59, 999);
      range.to = d;
    }
    const where: any = { tenantId, type: { notIn: ["PHARMACY", "EMERGENCY"] as any } };
    if (range.from || range.to) where.issuedDate = {};
    if (range.from) where.issuedDate.gte = range.from;
    if (range.to) where.issuedDate.lte = range.to;

    const invoices = await this.prisma.invoice.findMany({
      where,
      orderBy: { issuedDate: "desc" },
      take: 5000,
      include: {
        patient: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
          },
        },
      },
    });
    const rows = [
      [
        "Invoice No",
        "Patient",
        "MRN",
        "Issued",
        "Total",
        "Paid",
        "Due",
        "Status",
      ],
      ...invoices.map((i) => [
        i.invoiceNumber,
        i.patient
          ? [i.patient.firstName, i.patient.middleName, i.patient.lastName]
              .filter(Boolean)
              .join(" ")
          : "",
        i.patient ? i.patient.mrn : "",
        i.issuedDate ? i.issuedDate.toISOString().slice(0, 10) : "",
        i.totalAmount.toString(),
        i.paidAmount.toString(),
        i.dueAmount ? i.dueAmount.toString() : "",
        i.status,
      ]),
    ];
    return toCsv(rows);
  }

  async labResultsCsv(tenantId: string): Promise<string> {
    const items = await this.prisma.labOrderItem.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: {
        labOrder: {
          select: {
            orderNumber: true,
            patient: {
              select: {
                firstName: true,
                middleName: true,
                lastName: true,
                mrn: true,
              },
            },
          },
        },
      },
    });
    const rows = [
      [
        "Order No",
        "MRN",
        "Patient",
        "Test",
        "Result",
        "Value",
        "Unit",
        "Reference Range",
        "Abnormal",
      ],
      ...items.map((i) => [
        i.labOrder.orderNumber,
        i.labOrder.patient.mrn,
        [
          i.labOrder.patient.firstName,
          i.labOrder.patient.middleName,
          i.labOrder.patient.lastName,
        ]
          .filter(Boolean)
          .join(" "),
        i.testName,
        i.result || "",
        i.resultValue !== null && i.resultValue !== undefined
          ? i.resultValue.toString()
          : "",
        i.unit || "",
        i.referenceRange || "",
        i.isAbnormal ? "YES" : "",
      ]),
    ];
    return toCsv(rows);
  }

  async prescriptionsCsv(tenantId: string): Promise<string> {
    const prescriptions = await this.prisma.prescription.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: {
        patient: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
          },
        },
        items: true,
      },
    });
    const rows = [
      [
        "Prescription",
        "MRN",
        "Patient",
        "Medication",
        "Dosage",
        "Frequency",
        "Duration",
        "Status",
      ],
    ];
    for (const p of prescriptions) {
      const name = p.patient
        ? [p.patient.firstName, p.patient.middleName, p.patient.lastName]
            .filter(Boolean)
            .join(" ")
        : "";
      if (p.items && p.items.length) {
        for (const item of p.items as any[]) {
          rows.push([
            p.id,
            p.patient ? p.patient.mrn : "",
            name,
            item.medicineName || item.medicineId || "",
            item.dosage || "",
            item.frequency || "",
            item.duration || "",
            p.status,
          ]);
        }
      } else {
        rows.push([
          p.id,
          p.patient ? p.patient.mrn : "",
          name,
          "",
          "",
          "",
          "",
          p.status,
        ]);
      }
    }
    return toCsv(rows);
  }

  private async revenuePdfData(
    tenantId: string,
    params: { from?: string; to?: string },
  ) {
    const summary = await this.reports.getSummary(tenantId, params);
    const byStatus = await this.reports.revenueByStatus(tenantId, params);
    const dateLabel =
      params.from || params.to
        ? `${params.from || "start"} to ${params.to || "today"}`
        : "All time";
    return { summary, byStatus, dateLabel };
  }

  private async workloadPdfData(
    tenantId: string,
    params: { from?: string; to?: string },
  ) {
    const workload = await this.reports.doctorWorkload(tenantId, params);
    const dateLabel =
      params.from || params.to
        ? `${params.from || "start"} to ${params.to || "today"}`
        : "All time";
    return { workload, dateLabel };
  }

  async revenuePdf(
    tenantId: string,
    params: { from?: string; to?: string },
  ): Promise<Buffer> {
    const { summary, byStatus, dateLabel } = await this.revenuePdfData(
      tenantId,
      params,
    );
    const rows = byStatus.map((r) => [
      r.status,
      r.count.toString(),
      r.amount.toFixed(2),
      r.collected.toFixed(2),
      (r.amount - r.collected).toFixed(2),
    ]);
    return buildPdf({
      title: "Revenue Summary",
      subtitle: `Period: ${dateLabel}  |  Total Revenue: ${summary.totalRevenue.toFixed(2)}  |  Collected: ${summary.collected.toFixed(2)}  |  Outstanding: ${summary.outstanding.toFixed(2)}`,
      columns: [
        { title: "Status", width: 3 },
        { title: "Invoices", width: 2 },
        { title: "Total Amount", width: 3, align: "right" },
        { title: "Collected", width: 3, align: "right" },
        { title: "Outstanding", width: 3, align: "right" },
      ],
      rows,
    });
  }

  async doctorWorkloadPdf(
    tenantId: string,
    params: { from?: string; to?: string },
  ): Promise<Buffer> {
    const { workload, dateLabel } = await this.workloadPdfData(
      tenantId,
      params,
    );
    return buildPdf({
      title: "Doctor Workload",
      subtitle: `Period: ${dateLabel}`,
      columns: [
        { title: "Doctor", width: 4 },
        { title: "Appointments", width: 2, align: "right" },
      ],
      rows: workload.map((w) => [w.name, w.count.toString()]),
    });
  }
}
