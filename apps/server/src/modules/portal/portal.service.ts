import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  async lookupByMrn(mrn: string, tenantId: string) {
    if (!mrn || !String(mrn).trim())
      throw new BadRequestException("MRN is required");
    const patient = await this.prisma.patient.findFirst({
      where: { mrn: String(mrn).trim(), tenantId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        mrn: true,
        gender: true,
        tenantId: true,
        tenant: { select: { id: true, name: true } },
      },
    });
    if (!patient)
      throw new NotFoundException("Patient not found with this MRN");
    return patient;
  }

  async getPatientLabs(patientId: string, tenantId: string) {
    return this.prisma.labOrder.findMany({
      where: { patientId, tenantId },
      include: {
        items: {
          select: {
            testName: true,
            result: true,
            resultValue: true,
            unit: true,
            referenceRange: true,
            isAbnormal: true,
            isCritical: true,
          },
        },
      },
      orderBy: { orderedAt: "desc" },
      take: 20,
    });
  }

  async getPatientInvoices(patientId: string, tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { patientId, tenantId },
      include: { items: true, payments: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async getPatientAppointments(patientId: string, tenantId: string) {
    return this.prisma.appointment.findMany({
      where: { patientId, tenantId },
      include: {
        doctor: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { appointmentDate: "desc" },
      take: 20,
    });
  }

  async bookAppointment(
    tenantId: string,
    dto: {
      patientId: string;
      doctorId: string;
      appointmentDate: string;
      type?: string;
      reason?: string;
    },
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id: dto.doctorId, tenantId },
    });
    if (!doctor) throw new NotFoundException("Doctor not found");

    const appointmentDate = new Date(dto.appointmentDate);
    if (isNaN(appointmentDate.getTime()))
      throw new BadRequestException("Invalid appointment date");

    return this.prisma.appointment.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        doctorId: dto.doctorId,
        appointmentDate,
        startTime: appointmentDate.toTimeString().slice(0, 5),
        endTime: new Date(appointmentDate.getTime() + 30 * 60000)
          .toTimeString()
          .slice(0, 5),
        type: (dto.type as any) || "OPD",
        reason: dto.reason,
        status: "REQUESTED",
        source: "ONLINE",
      },
    });
  }
}
