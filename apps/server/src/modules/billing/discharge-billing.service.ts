import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const MAX_LIMIT = 100;

export interface CreateDischargeBillDto {
  patientId: string;
  admissionId: string;
  encounterId?: string;
  admissionDate?: string;
  dischargeDate?: string;
}

export interface AddManualChargeDto {
  serviceId?: string;
  serviceName: string;
  serviceCode?: string;
  categoryId?: string;
  description?: string;
  quantity: number;
  unitRate: number;
  unit?: string;
  notes?: string;
}

@Injectable()
export class DischargeBillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================
  // Charge Collection
  // ========================

  async collectCharges(
    tenantId: string,
    admissionId: string,
  ): Promise<any[]> {
    const admission = await this.prisma.admission.findFirst({
      where: { id: admissionId, tenantId },
      include: { patient: true },
    });
    if (!admission) throw new NotFoundException("Admission not found");

    const patientId = admission.patientId;
    const admissionDate = admission.admissionDate;
    const dischargeDate = admission.dischargeDate || new Date();

    // a) Find existing unbilled charge transactions
    const existingUnbilled = await this.prisma.chargeTransaction.findMany({
      where: {
        tenantId,
        admissionId,
        billingStatus: "UNBILLED",
        status: { not: "CANCELLED" },
      },
    });

    // Build dedup set from existing non-cancelled charge transactions
    const existingCharges = await this.prisma.chargeTransaction.findMany({
      where: {
        tenantId,
        admissionId,
        status: { not: "CANCELLED" },
      },
      select: {
        sourceModule: true,
        sourceTransactionId: true,
      },
    });
    const dedupSet = new Set(
      existingCharges
        .filter((c) => c.sourceModule && c.sourceTransactionId)
        .map((c) => `${c.sourceModule}:${c.sourceTransactionId}`),
    );

    const toCreate: any[] = [];

    // b) Room charges from BedAllocation
    const bedAllocations = await this.prisma.bedAllocation.findMany({
      where: { tenantId, admissionId },
      include: { bed: true },
    });
    for (const alloc of bedAllocations) {
      const dedupKey = `IPD:${alloc.id}`;
      if (dedupSet.has(dedupKey)) continue;

      const allocStart = new Date(
        Math.max(
          new Date(alloc.allocatedAt).getTime(),
          new Date(admissionDate).getTime(),
        ),
      );
      const allocEnd = new Date(
        Math.min(
          alloc.releasedAt
            ? new Date(alloc.releasedAt).getTime()
            : dischargeDate.getTime(),
          dischargeDate.getTime(),
        ),
      );

      if (allocEnd <= allocStart) continue;

      const billableDays = Math.max(
        1,
        Math.ceil(
          (allocEnd.getTime() - allocStart.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );
      const unitRate = Number(alloc.bed?.ratePerDay || 0);
      const grossAmount = billableDays * unitRate;

      toCreate.push({
        tenantId,
        patientId,
        admissionId,
        encounterId: admission.encounterId,
        sourceModule: "IPD",
        sourceTransactionId: alloc.id,
        serviceDate: allocStart,
        quantity: billableDays,
        unitRate,
        grossAmount,
        netAmount: grossAmount,
        unit: "day",
        createdBy: undefined,
      });
    }

    // Doctor visits from Encounter
    const encounters = await this.prisma.encounter.findMany({
      where: {
        tenantId,
        admission: { id: admissionId },
        doctorId: { not: null },
        type: "IPD",
      },
      include: { doctor: true },
    });
    for (const enc of encounters) {
      const dedupKey = `IPD:${enc.id}`;
      if (dedupSet.has(dedupKey)) continue;

      const doctorProfile = enc.doctorId
        ? await this.prisma.doctorProfile.findFirst({
            where: { id: enc.doctorId, tenantId },
          })
        : null;
      const consultationFee = Number(doctorProfile?.consultationFee || 0);
      if (consultationFee <= 0) continue;

      toCreate.push({
        tenantId,
        patientId,
        admissionId,
        encounterId: enc.id,
        sourceModule: "IPD",
        sourceTransactionId: enc.id,
        serviceDate: enc.createdAt,
        quantity: 1,
        unitRate: consultationFee,
        grossAmount: consultationFee,
        netAmount: consultationFee,
        unit: "visit",
        createdBy: undefined,
      });
    }

    // Lab orders from LabOrderItem
    const labOrders = await this.prisma.labOrder.findMany({
      where: { tenantId, admissionId },
      include: { items: true },
    });
    for (const labOrder of labOrders) {
      for (const item of labOrder.items) {
        const dedupKey = `LAB:${item.id}`;
        if (dedupSet.has(dedupKey)) continue;

        const price = Number(item.price || 0);
        toCreate.push({
          tenantId,
          patientId,
          admissionId,
          encounterId: labOrder.encounterId,
          sourceModule: "LAB",
          sourceTransactionId: item.id,
          serviceDate: labOrder.orderedAt,
          quantity: 1,
          unitRate: price,
          grossAmount: price,
          netAmount: price,
          unit: "test",
          createdBy: undefined,
        });
      }
    }

    // Radiology orders
    const radiologyOrders = await this.prisma.radiologyOrder.findMany({
      where: { tenantId, admissionId },
    });
    const billingServices = await this.prisma.billingService.findMany({
      where: { tenantId, isActive: true },
      include: { category: true },
    });
    const radiologyServiceMap = new Map(
      billingServices
        .filter((s) => s.category?.code === "RADIOLOGY")
        .map((s) => [s.code, s]),
    );
    for (const radOrder of radiologyOrders) {
      const dedupKey = `RADIOLOGY:${radOrder.id}`;
      if (dedupSet.has(dedupKey)) continue;

      // Try to find a matching billing service by modality
      let price = 0;
      const matchedService = Array.from(radiologyServiceMap.values()).find(
        (s) => s.name.toLowerCase().includes(radOrder.modality.toLowerCase()),
      );
      if (matchedService) {
        price = Number(matchedService.price);
      }

      toCreate.push({
        tenantId,
        patientId,
        admissionId,
        encounterId: radOrder.encounterId,
        sourceModule: "RADIOLOGY",
        sourceTransactionId: radOrder.id,
        serviceDate: radOrder.orderedAt,
        quantity: 1,
        unitRate: price,
        grossAmount: price,
        netAmount: price,
        unit: radOrder.modality,
        createdBy: undefined,
      });
    }

    // OT cases
    const otCases = await this.prisma.oTCase.findMany({
      where: { tenantId, admissionId, status: "COMPLETED" },
    });
    for (const otCase of otCases) {
      const dedupKey = `OT:${otCase.id}`;
      if (dedupSet.has(dedupKey)) continue;

      // Use billing service price for OT procedures if available
      const otService = billingServices.find(
        (s) =>
          s.code.toLowerCase() === "OT" ||
          s.name.toLowerCase().includes("operation"),
      );
      const price = otService ? Number(otService.price) : 0;

      toCreate.push({
        tenantId,
        patientId,
        admissionId,
        encounterId: otCase.encounterId,
        sourceModule: "OT",
        sourceTransactionId: otCase.id,
        serviceDate: otCase.createdAt,
        quantity: 1,
        unitRate: price,
        grossAmount: price,
        netAmount: price,
        unit: "procedure",
        createdBy: undefined,
      });
    }

    // Pharmacy invoices
    const pharmacyInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        admissionId,
        type: "PHARMACY",
        status: { not: "CANCELLED" },
      },
      include: { items: true },
    });
    for (const inv of pharmacyInvoices) {
      for (const item of inv.items) {
        const dedupKey = `PHARMACY:${item.id}`;
        if (dedupSet.has(dedupKey)) continue;

        const lineTotal = Number(item.lineTotal) || Number(item.quantity) * Number(item.rate);
        toCreate.push({
          tenantId,
          patientId,
          admissionId,
          encounterId: inv.encounterId,
          sourceModule: "PHARMACY",
          sourceTransactionId: item.id,
          serviceDate: inv.issuedDate,
          quantity: Number(item.quantity),
          unitRate: Number(item.rate),
          grossAmount: lineTotal,
          taxAmount: Number(item.taxAmount || 0),
          netAmount: lineTotal,
          unit: "item",
          createdBy: undefined,
        });
      }
    }

    // Nursing notes
    const nursingNotes = await this.prisma.nursingNote.findMany({
      where: { tenantId, admissionId },
    });
    const nursingService = billingServices.find(
      (s) => s.category?.code === "NURSING",
    );
    const nursingRate = nursingService ? Number(nursingService.price) : 0;
    for (const note of nursingNotes) {
      const dedupKey = `NURSING:${note.id}`;
      if (dedupSet.has(dedupKey)) continue;

      if (nursingRate <= 0) continue;

      toCreate.push({
        tenantId,
        patientId,
        admissionId,
        encounterId: note.encounterId,
        sourceModule: "NURSING",
        sourceTransactionId: note.id,
        serviceDate: note.createdAt,
        quantity: 1,
        unitRate: nursingRate,
        grossAmount: nursingRate,
        netAmount: nursingRate,
        unit: "visit",
        createdBy: undefined,
      });
    }

    // Medication administrations
    const medAdmins = await this.prisma.medicationAdministration.findMany({
      where: { tenantId, admissionId, status: "GIVEN" },
    });
    for (const med of medAdmins) {
      const dedupKey = `PHARMACY:${med.id}`;
      if (dedupSet.has(dedupKey)) continue;

      // Find medicine price
      let price = 0;
      if (med.medicineId) {
        const medicine = await this.prisma.medicine.findFirst({
          where: { id: med.medicineId, tenantId },
        });
        if (medicine) price = Number(medicine.salesRate || 0);
      }

      toCreate.push({
        tenantId,
        patientId,
        admissionId,
        sourceModule: "PHARMACY",
        sourceTransactionId: med.id,
        serviceDate: med.givenTime || med.createdAt,
        quantity: 1,
        unitRate: price,
        grossAmount: price,
        netAmount: price,
        unit: "dose",
        createdBy: undefined,
      });
    }

    // Bulk create charge transactions (skip duplicates via upsert pattern)
    if (toCreate.length > 0) {
      // Filter again just in case of in-memory collisions
      const finalDedup = new Set(
        existingCharges
          .filter((c) => c.sourceModule && c.sourceTransactionId)
          .map((c) => `${c.sourceModule}:${c.sourceTransactionId}`),
      );
      const filtered = toCreate.filter((c) => {
        const key = `${c.sourceModule}:${c.sourceTransactionId}`;
        if (finalDedup.has(key)) return false;
        finalDedup.add(key);
        return true;
      });

      if (filtered.length > 0) {
        await this.prisma.chargeTransaction.createMany({
          data: filtered.map((c) => ({
            tenantId: c.tenantId,
            patientId: c.patientId,
            admissionId: c.admissionId,
            encounterId: c.encounterId || null,
            sourceModule: c.sourceModule,
            sourceTransactionId: c.sourceTransactionId,
            serviceDate: c.serviceDate,
            quantity: c.quantity,
            unitRate: c.unitRate,
            grossAmount: c.grossAmount,
            taxAmount: c.taxAmount || 0,
            netAmount: c.netAmount,
            unit: c.unit,
            billingStatus: "UNBILLED",
          })),
          skipDuplicates: true,
        });
      }
    }

    // Return all unbilled charges
    return this.prisma.chargeTransaction.findMany({
      where: {
        tenantId,
        admissionId,
        billingStatus: "UNBILLED",
        status: { not: "CANCELLED" },
      },
      orderBy: { serviceDate: "asc" },
    });
  }

  // ========================
  // Create Draft Bill
  // ========================

  async createDraftBill(
    tenantId: string,
    dto: CreateDischargeBillDto,
    userId?: string,
  ): Promise<any> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const admission = await this.prisma.admission.findFirst({
      where: { id: dto.admissionId, tenantId },
    });
    if (!admission) throw new NotFoundException("Admission not found");

    // Check for existing draft bill
    const existingDraft = await this.prisma.dischargeBill.findFirst({
      where: {
        tenantId,
        admissionId: dto.admissionId,
        status: "DRAFT",
      },
    });
    if (existingDraft) {
      throw new ConflictException(
        `A draft bill ${existingDraft.billNumber} already exists for this admission`,
      );
    }

    // Collect charges first
    const charges = await this.collectCharges(tenantId, dto.admissionId);
    if (charges.length === 0) {
      throw new BadRequestException(
        "No charges found for this admission. Collect charges first.",
      );
    }

    const billNumber = await this.generateBillNumber(this.prisma, tenantId);
    const admissionDate = dto.admissionDate
      ? new Date(dto.admissionDate)
      : admission.admissionDate;
    const dischargeDate = dto.dischargeDate
      ? new Date(dto.dischargeDate)
      : admission.dischargeDate || new Date();

    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.dischargeBill.create({
        data: {
          tenantId,
          billNumber,
          patientId: dto.patientId,
          admissionId: dto.admissionId,
          encounterId: dto.encounterId || admission.encounterId,
          billDate: new Date(),
          admissionDate,
          dischargeDate,
          status: "DRAFT",
          paymentStatus: "UNPAID",
          dischargeStatus: "BILLING_PENDING",
          createdBy: userId,
          details: {
            create: charges.map((charge) => ({
              tenantId,
              chargeTransactionId: charge.id,
              serviceId: charge.serviceId,
              serviceCode: charge.service?.code,
              serviceName: this.getServiceName(charge),
              categoryId: charge.service?.categoryId,
              sourceModule: charge.sourceModule,
              sourceTransactionId: charge.sourceTransactionId,
              serviceDate: charge.serviceDate,
              quantity: charge.quantity,
              unitRate: charge.unitRate,
              grossAmount: charge.grossAmount,
              tax: charge.taxAmount,
              netAmount: charge.netAmount,
              insuranceAmount: charge.insuranceAmount,
              patientAmount: charge.patientAmount,
            })),
          },
        },
        include: { details: true },
      });

      await this.logAudit(tenantId, userId, "CREATE", "DischargeBill", bill.id, {
        action: "DRAFT_CREATED",
        billNumber,
        chargesCount: charges.length,
      });

      return bill;
    });
  }

  // ========================
  // Add Manual Charge
  // ========================

  async addManualCharge(
    tenantId: string,
    billId: string,
    dto: AddManualChargeDto,
    userId?: string,
  ): Promise<any> {
    const bill = await this.prisma.dischargeBill.findFirst({
      where: { id: billId, tenantId },
    });
    if (!bill) throw new NotFoundException("Discharge bill not found");
    if (bill.status !== "DRAFT")
      throw new ConflictException("Can only add charges to a DRAFT bill");

    const quantity = this.validateMoney(dto.quantity, {
      min: 0.01,
      label: "Quantity",
    });
    const unitRate = this.validateMoney(dto.unitRate, {
      min: 0,
      label: "Unit rate",
    });

    let serviceName = dto.serviceName;
    let serviceId = dto.serviceId;
    let serviceCode = dto.serviceCode;
    let taxPercent = 0;

    if (serviceId) {
      const service = await this.prisma.billingService.findFirst({
        where: { id: serviceId, tenantId },
      });
      if (service) {
        if (!serviceName) serviceName = service.name;
        if (!serviceCode) serviceCode = service.code;
        taxPercent = Number(service.taxPercent || 0);
      }
    }
    if (!serviceName)
      throw new BadRequestException("Service name is required");

    const grossAmount = quantity * unitRate;
    const taxAmount = (grossAmount * taxPercent) / 100;
    const netAmount = grossAmount + taxAmount;

    return this.prisma.dischargeBillDetail.create({
      data: {
        tenantId,
        dischargeBillId: billId,
        serviceId: serviceId || null,
        serviceCode,
        serviceName,
        categoryId: dto.categoryId || null,
        description: dto.description,
        quantity,
        unit: dto.unit || "unit",
        unitRate,
        grossAmount,
        tax: taxAmount,
        insuranceAmount: 0,
        patientAmount: netAmount,
        netAmount,
        manuallyAdded: true,
        notes: dto.notes,
      },
    });
  }

  // ========================
  // Remove Charge from Draft Bill
  // ========================

  async removeCharge(
    tenantId: string,
    billId: string,
    detailId: string,
    userId?: string,
  ): Promise<void> {
    const bill = await this.prisma.dischargeBill.findFirst({
      where: { id: billId, tenantId },
    });
    if (!bill) throw new NotFoundException("Discharge bill not found");
    if (bill.status !== "DRAFT")
      throw new ConflictException("Can only remove charges from a DRAFT bill");

    const detail = await this.prisma.dischargeBillDetail.findFirst({
      where: { id: detailId, tenantId, dischargeBillId: billId },
    });
    if (!detail) throw new NotFoundException("Bill detail not found");

    await this.prisma.dischargeBillDetail.delete({ where: { id: detailId } });

    await this.logAudit(tenantId, userId, "DELETE", "DischargeBillDetail", detailId, {
      action: "CHARGE_REMOVED",
      billId,
      serviceName: detail.serviceName,
    });
  }

  // ========================
  // Apply Discount
  // ========================

  async applyDiscount(
    tenantId: string,
    billId: string,
    dto: { amount: number; reason: string },
    userId?: string,
  ): Promise<any> {
    const bill = await this.prisma.dischargeBill.findFirst({
      where: { id: billId, tenantId },
    });
    if (!bill) throw new NotFoundException("Discharge bill not found");
    if (bill.status !== "DRAFT")
      throw new ConflictException("Can only apply discount to a DRAFT bill");

    const discountAmount = this.validateMoney(dto.amount, {
      min: 0,
      label: "Discount amount",
    });
    if (discountAmount <= 0)
      throw new BadRequestException("Discount amount must be greater than zero");
    if (!dto.reason || !dto.reason.trim())
      throw new BadRequestException("Discount reason is required");

    return this.prisma.dischargeBill.update({
      where: { id: billId },
      data: {
        discount: discountAmount,
        discountReason: dto.reason,
        discountApprovedBy: userId,
      },
    });
  }

  // ========================
  // Finalize Bill
  // ========================

  async finalizeBill(
    tenantId: string,
    billId: string,
    userId?: string,
  ): Promise<any> {
    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.dischargeBill.findFirst({
        where: { id: billId, tenantId },
        include: { details: true },
      });
      if (!bill) throw new NotFoundException("Discharge bill not found");
      if (bill.status !== "DRAFT")
        throw new ConflictException("Only DRAFT bills can be finalized");
      if (bill.details.length === 0)
        throw new BadRequestException(
          "Cannot finalize a bill with no charge details",
        );

      // Server-side recalculation - do NOT trust frontend values
      const subtotal = bill.details.reduce(
        (sum, d) => sum + Number(d.grossAmount),
        0,
      );
      const tax = bill.details.reduce((sum, d) => sum + Number(d.tax), 0);
      const discount = Number(bill.discount || 0);
      const netAmount = subtotal - discount + tax;

      const insuranceAmount = bill.details.reduce(
        (sum, d) => sum + Number(d.insuranceAmount || 0),
        0,
      );
      const corporateAmount = Number(bill.corporateAmount || 0);

      // Advance adjustment from deposits
      const deposits = await tx.deposit.findMany({
        where: {
          tenantId,
          admissionId: bill.admissionId,
          status: { in: ["USED", "PARTIAL"] },
        },
      });
      const advanceAdjustment = deposits.reduce(
        (sum, d) => sum + (Number(d.amount) - Number(d.balance)),
        0,
      );

      const dueAmount = Math.max(
        0,
        netAmount - advanceAdjustment - Number(bill.paidAmount),
      );

      let billNumber = bill.billNumber;
      if (!billNumber || billNumber === "DRAFT") {
        billNumber = await this.generateBillNumber(tx, tenantId);
      }

      // Determine payment status
      let paymentStatus: any = "UNPAID";
      if (Number(bill.paidAmount) >= netAmount) {
        paymentStatus = "PAID";
      } else if (Number(bill.paidAmount) > 0) {
        paymentStatus = "PARTIAL";
      }

      const finalizedBill = await tx.dischargeBill.update({
        where: { id: billId },
        data: {
          billNumber,
          subtotal,
          tax,
          discount,
          netAmount,
          insuranceAmount,
          corporateAmount,
          advanceAdjustment,
          dueAmount,
          paymentStatus,
          status: "FINALIZED",
          finalizedBy: userId,
          finalizedAt: new Date(),
        },
      });

      // Create Invoice for discharge bill (bridge to existing billing/revenue reports)
      const invoiceNumber = await this.generateInvoiceNumber(tx, tenantId);
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          invoiceNumber,
          patientId: bill.patientId,
          admissionId: bill.admissionId,
          type: "DISCHARGE",
          status: dueAmount > 0 ? "PENDING" : "PAID",
          subtotal,
          discountAmount: discount,
          taxAmount: tax,
          totalAmount: netAmount,
          paidAmount: Number(bill.paidAmount) || 0,
          dueAmount,
          isCredit: dueAmount > 0,
          issuedDate: new Date(),
          notes: `Auto-generated from discharge bill ${billNumber}`,
          createdBy: userId,
          items: {
            create: bill.details.map((d) => ({
              tenantId,
              serviceName: d.serviceName,
              serviceCode: d.serviceCode || undefined,
              description: d.description || undefined,
              quantity: Number(d.quantity),
              rate: Number(d.unitRate),
              discountAmount: Number(d.discount || 0),
              taxAmount: Number(d.tax || 0),
              lineTotal: Number(d.netAmount),
              departmentId: undefined,
              serviceId: d.serviceId || undefined,
              referenceType: d.sourceModule || undefined,
              referenceId: d.sourceTransactionId || undefined,
            })),
          },
        },
        include: { items: true },
      });

      // Link invoice to discharge bill
      await tx.dischargeBill.update({
        where: { id: billId },
        data: { invoiceId: invoice.id },
      });

      // Mark all linked ChargeTransactions as BILLED
      const chargeTransactionIds = bill.details
        .map((d) => d.chargeTransactionId)
        .filter(Boolean) as string[];

      if (chargeTransactionIds.length > 0) {
        await tx.chargeTransaction.updateMany({
          where: {
            id: { in: chargeTransactionIds },
            tenantId,
            billingStatus: "UNBILLED",
          },
          data: {
            billingStatus: "BILLED",
            dischargeBillId: billId,
          },
        });
      }

      // Record financial transaction
      const txnNumber = await this.generateFinancialNumber(tx, tenantId);
      await tx.financialTransaction.create({
        data: {
          tenantId,
          txnNumber,
          type: "DISCHARGE_BILL",
          direction: "CREDIT",
          amount: netAmount,
          patientId: bill.patientId,
          referenceType: "discharge_bill",
          referenceId: billId,
          notes: `Discharge bill ${billNumber} finalized`,
          createdBy: userId,
        },
      });

      await this.logAudit(tenantId, userId, "UPDATE", "DischargeBill", billId, {
        action: "FINALIZED",
        billNumber,
        netAmount,
        dueAmount,
        chargesCount: bill.details.length,
      });

      return finalizedBill;
    });
  }

  // ========================
  // Cancel Bill
  // ========================

  async cancelBill(
    tenantId: string,
    billId: string,
    reason: string,
    userId?: string,
  ): Promise<any> {
    const bill = await this.prisma.dischargeBill.findFirst({
      where: { id: billId, tenantId },
    });
    if (!bill) throw new NotFoundException("Discharge bill not found");
    if (bill.status === "CANCELLED")
      throw new ConflictException("Bill is already cancelled");
    if (bill.status === "FINALIZED" && Number(bill.paidAmount) > 0)
      throw new ConflictException(
        "Cannot cancel a finalized bill with payments",
      );

    return this.prisma.$transaction(async (tx) => {
      // Revert charge transactions if finalized
      if (bill.status === "FINALIZED") {
        const details = await tx.dischargeBillDetail.findMany({
          where: { dischargeBillId: billId },
        });
        const chargeIds = details
          .map((d) => d.chargeTransactionId)
          .filter(Boolean) as string[];
        if (chargeIds.length > 0) {
          await tx.chargeTransaction.updateMany({
            where: { id: { in: chargeIds } },
            data: {
              billingStatus: "UNBILLED",
              dischargeBillId: null,
            },
          });
        }

        // Record reversal financial transaction
        const txnNumber = await this.generateFinancialNumber(tx, tenantId);
        await tx.financialTransaction.create({
          data: {
            tenantId,
            txnNumber,
            type: "DISCHARGE_BILL",
            direction: "DEBIT",
            amount: Number(bill.netAmount),
            patientId: bill.patientId,
            referenceType: "discharge_bill",
            referenceId: billId,
            notes: `Discharge bill ${bill.billNumber} cancelled: ${reason}`,
            createdBy: userId,
          },
        });
      }

      const updated = await tx.dischargeBill.update({
        where: { id: billId },
        data: {
          status: "CANCELLED",
          remarks: reason,
        },
      });

      await this.logAudit(tenantId, userId, "UPDATE", "DischargeBill", billId, {
        action: "CANCELLED",
        reason,
      });

      return updated;
    });
  }

  // ========================
  // Get Bill
  // ========================

  async getBill(tenantId: string, billId: string): Promise<any> {
    const bill = await this.prisma.dischargeBill.findFirst({
      where: { id: billId, tenantId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
            phone: true,
            gender: true,
          },
        },
        admission: true,
        details: {
          orderBy: { serviceDate: "asc" },
        },
        chargeTransactions: true,
      },
    });
    if (!bill) throw new NotFoundException("Discharge bill not found");
    return bill;
  }

  // ========================
  // Get Draft Bill for Admission
  // ========================

  async getDraftBill(
    tenantId: string,
    admissionId: string,
  ): Promise<any | null> {
    return this.prisma.dischargeBill.findFirst({
      where: { tenantId, admissionId, status: "DRAFT" },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
          },
        },
        details: {
          orderBy: { serviceDate: "asc" },
        },
      },
    });
  }

  // ========================
  // List Bills
  // ========================

  async findBills(
    tenantId: string,
    params: {
      patientId?: string;
      status?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = Number(params.page) || 1;
    const limit = Math.min(Number(params.limit) || 20, MAX_LIMIT);

    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.billDate = {};
      if (params.from) where.billDate.gte = this.normalizeDate(params.from);
      if (params.to) {
        const to = this.normalizeDate(params.to);
        to.setHours(23, 59, 59, 999);
        where.billDate.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.dischargeBill.findMany({
        where,
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              mrn: true,
            },
          },
          admission: {
            select: { id: true, admissionNumber: true },
          },
        },
        orderBy: { billDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dischargeBill.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ========================
  // Record Payment
  // ========================

  async recordPayment(
    tenantId: string,
    billId: string,
    dto: {
      amount: number;
      method: string;
      referenceNumber?: string;
      notes?: string;
    },
    userId?: string,
  ) {
    const amount = this.validateMoney(dto.amount, {
      min: 0.01,
      label: "Payment amount",
    });

    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.dischargeBill.findFirst({
        where: { id: billId, tenantId },
      });
      if (!bill) throw new NotFoundException("Discharge bill not found");
      if (bill.status !== "FINALIZED")
        throw new ConflictException("Can only pay finalized bills");
      if (Number(bill.dueAmount) <= 0)
        throw new ConflictException("Bill has no outstanding due amount");
      if (amount > Number(bill.dueAmount))
        throw new BadRequestException(
          `Payment exceeds due amount (${Number(bill.dueAmount)})`,
        );

      // Generate payment number
      const paymentNumber = await this.generatePaymentNumber(tx, tenantId);

      // Create payment linked to discharge bill's invoice
      const payment = await tx.payment.create({
        data: {
          tenantId,
          patientId: bill.patientId,
          invoiceId: bill.invoiceId || undefined,
          paymentNumber,
          amount,
          method: (dto.method || "CASH") as any,
          status: "COMPLETED",
          referenceNumber: dto.referenceNumber,
          paidAt: new Date(),
          receivedBy: userId,
          notes: dto.notes || `Payment for discharge bill ${bill.billNumber}`,
          paymentType: "INVOICE",
        },
      });

      const paidAmount = Number(bill.paidAmount) + amount;
      const dueAmount = Math.max(0, Number(bill.netAmount) - paidAmount);

      let paymentStatus: any = "UNPAID";
      if (paidAmount >= Number(bill.netAmount)) {
        paymentStatus = "PAID";
      } else if (paidAmount > 0) {
        paymentStatus = "PARTIAL";
      }

      const updatedBill = await tx.dischargeBill.update({
        where: { id: billId },
        data: {
          paidAmount,
          dueAmount,
          paymentStatus,
        },
      });

      // Sync Invoice paidAmount/dueAmount if linked
      if (bill.invoiceId) {
        await tx.invoice.update({
          where: { id: bill.invoiceId },
          data: {
            paidAmount,
            dueAmount,
            status: dueAmount <= 0 ? "PAID" : "PARTIAL",
          },
        });
      }

      // Record financial transaction
      const txnNumber = await this.generateFinancialNumber(tx, tenantId);
      await tx.financialTransaction.create({
        data: {
          tenantId,
          txnNumber,
          type: "PAYMENT",
          direction: "CREDIT",
          amount,
          patientId: bill.patientId,
          referenceType: "payment",
          referenceId: payment.id,
          method: (dto.method || "CASH") as any,
          notes: `Payment ${paymentNumber} for discharge bill ${bill.billNumber}`,
          createdBy: userId,
        },
      });

      await this.logAudit(tenantId, userId, "CREATE", "Payment", payment.id, {
        action: "DISCHARGE_BILL_PAYMENT",
        billId,
        billNumber: bill.billNumber,
        amount,
        method: dto.method,
      });

      return { payment, bill: updatedBill };
    });
  }

  // ========================
  // Private Helpers
  // ========================

  private getServiceName(charge: any): string {
    if (charge.service?.name) return charge.service.name;
    if (charge.sourceModule === "IPD") return "Room / Consultation";
    if (charge.sourceModule === "LAB") return "Lab Test";
    if (charge.sourceModule === "RADIOLOGY") return "Radiology";
    if (charge.sourceModule === "OT") return "OT Procedure";
    if (charge.sourceModule === "PHARMACY") return "Pharmacy";
    if (charge.sourceModule === "NURSING") return "Nursing";
    return "Service";
  }

  private async calculateBillTotals(
    tenantId: string,
    billId: string,
  ): Promise<{
    subtotal: number;
    tax: number;
    netAmount: number;
    dueAmount: number;
  }> {
    const details = await this.prisma.dischargeBillDetail.findMany({
      where: { tenantId, dischargeBillId: billId },
    });

    const subtotal = details.reduce(
      (sum, d) => sum + Number(d.grossAmount),
      0,
    );
    const tax = details.reduce((sum, d) => sum + Number(d.tax), 0);
    const netAmount = subtotal + tax;

    const bill = await this.prisma.dischargeBill.findFirst({
      where: { id: billId },
    });
    const dueAmount = Math.max(
      0,
      netAmount - Number(bill?.discount || 0) - Number(bill?.paidAmount || 0),
    );

    return { subtotal, tax, netAmount, dueAmount };
  }

  private async generateBillNumber(
    txOrPrisma: any,
    tenantId: string,
  ): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const client = txOrPrisma || this.prisma;
    const latest = await client.dischargeBill.findFirst({
      where: { tenantId, billNumber: { startsWith: `DB-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { billNumber: true },
    });

    let seq = 1;
    if (latest) {
      const parts = latest.billNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `DB-${ymd}-${String(seq).padStart(5, "0")}`;
  }

  private async generatePaymentNumber(
    tx: any,
    tenantId: string,
  ): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await tx.payment.findFirst({
      where: { tenantId, paymentNumber: { startsWith: `PAY-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { paymentNumber: true },
    });

    let seq = 1;
    if (latest) {
      const parts = latest.paymentNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `PAY-${ymd}-${String(seq).padStart(4, "0")}`;
  }

  private async generateFinancialNumber(
    tx: any,
    tenantId: string,
  ): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await tx.financialTransaction.findFirst({
      where: { tenantId, txnNumber: { startsWith: `FT-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { txnNumber: true },
    });

    let seq = 1;
    if (latest) {
      const parts = latest.txnNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `FT-${ymd}-${String(seq).padStart(4, "0")}`;
  }

  private async generateInvoiceNumber(
    tx: any,
    tenantId: string,
  ): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await tx.invoice.findFirst({
      where: { tenantId, invoiceNumber: { startsWith: `INV-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { invoiceNumber: true },
    });

    let seq = 1;
    if (latest) {
      const parts = latest.invoiceNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `INV-${ymd}-${String(seq).padStart(5, "0")}`;
  }

  private validateMoney(
    value: any,
    options: { min?: number; max?: number; required?: boolean; label: string },
  ): number {
    const n = Number(value);
    if (!Number.isFinite(n))
      throw new BadRequestException(`${options.label} must be a valid number`);
    if (
      options.required !== false &&
      (value === undefined || value === null || value === "")
    ) {
      throw new BadRequestException(`${options.label} is required`);
    }
    if (options.min !== undefined && n < options.min)
      throw new BadRequestException(
        `${options.label} must be >= ${options.min}`,
      );
    if (options.max !== undefined && n > options.max)
      throw new BadRequestException(
        `${options.label} must be <= ${options.max}`,
      );
    return n;
  }

  private normalizeDate(input: Date | string): Date {
    if (input instanceof Date) return input;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return new Date(input);
  }

  private async logAudit(
    tenantId: string,
    userId: string | undefined,
    action: string,
    entity: string,
    entityId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    if (!userId) return;
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          entity,
          entityId,
          action: action as any,
          metadata,
        },
      });
    } catch (error) {
      console.warn(`Failed to write audit log: ${error}`);
    }
  }
}
