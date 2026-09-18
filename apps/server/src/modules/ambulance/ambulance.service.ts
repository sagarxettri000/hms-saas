import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateVehicleDto {
  callSign: string;
  type?: string;
  status?: string;
  driverName: string;
  currentLocation?: string;
}

export interface UpdateVehicleDto extends Partial<CreateVehicleDto> {}

export interface CreateCallDto {
  callerName: string;
  callerPhone: string;
  patientName: string;
  location: string;
  complaint?: string;
  priority?: string;
}

export interface UpdateCallDto {
  status?: string;
  vehicleId?: string;
}

const CALL_FLOW: Record<string, string[]> = {
  PENDING: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["EN_ROUTE", "CANCELLED"],
  EN_ROUTE: ["ARRIVED", "CANCELLED"],
  ARRIVED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class AmbulanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Vehicles ----------

  async findVehicles(tenantId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 100);
    const search = query.search?.toString().trim();

    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (search) {
      where.OR = [
        { callSign: { contains: search, mode: "insensitive" } },
        { driverName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.ambulanceVehicle.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ambulanceVehicle.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findVehicleById(tenantId: string, id: string) {
    const vehicle = await this.prisma.ambulanceVehicle.findFirst({
      where: { id, tenantId },
    });
    if (!vehicle) throw new NotFoundException("Ambulance vehicle not found");
    return vehicle;
  }

  async createVehicle(tenantId: string, dto: CreateVehicleDto) {
    if (!dto.callSign?.trim() || !dto.driverName?.trim())
      throw new BadRequestException("Call sign and driver name are required");
    return this.prisma.ambulanceVehicle.create({
      data: {
        tenantId,
        callSign: dto.callSign,
        type: dto.type || "BASIC",
        status: dto.status || "AVAILABLE",
        driverName: dto.driverName,
        currentLocation: dto.currentLocation || null,
      },
    });
  }

  async updateVehicle(tenantId: string, id: string, dto: UpdateVehicleDto) {
    await this.findVehicleById(tenantId, id);
    const { tenantId: _t, ...clean } = dto as any;
    return this.prisma.ambulanceVehicle.update({
      where: { id },
      data: clean,
    });
  }

  async setVehicleStatus(
    tenantId: string,
    id: string,
    status: string,
    currentLocation?: string,
  ) {
    await this.findVehicleById(tenantId, id);
    return this.prisma.ambulanceVehicle.update({
      where: { id },
      data: { status, ...(currentLocation ? { currentLocation } : {}) },
    });
  }

  async deleteVehicle(tenantId: string, id: string) {
    await this.findVehicleById(tenantId, id);
    const linked = await this.prisma.ambulanceCall.count({
      where: {
        vehicleId: id,
        status: { in: ["DISPATCHED", "EN_ROUTE", "ARRIVED"] },
      },
    });
    if (linked > 0)
      throw new BadRequestException(
        "Vehicle is assigned to active calls and cannot be deleted",
      );
    await this.prisma.ambulanceVehicle.delete({ where: { id } });
    return { success: true };
  }

  // ---------- Calls ----------

  async findCalls(tenantId: string, query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 100);
    const search = query.search?.toString().trim();
    const status = query.status?.toString();

    const where: any = { tenantId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { patientName: { contains: search, mode: "insensitive" } },
        { callerName: { contains: search, mode: "insensitive" } },
        { callerPhone: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
        { complaint: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.ambulanceCall.findMany({
        where,
        include: {
          vehicle: { select: { id: true, callSign: true } },
        },
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ambulanceCall.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findCallById(tenantId: string, id: string) {
    const call = await this.prisma.ambulanceCall.findFirst({
      where: { id, tenantId },
      include: {
        vehicle: { select: { id: true, callSign: true } },
      },
    });
    if (!call) throw new NotFoundException("Ambulance call not found");
    return call;
  }

  async createCall(tenantId: string, dto: CreateCallDto) {
    if (!dto.patientName?.trim() || !dto.location?.trim())
      throw new BadRequestException(
        "Patient name and pickup location are required",
      );
    return this.prisma.ambulanceCall.create({
      data: {
        tenantId,
        callerName: dto.callerName,
        callerPhone: dto.callerPhone,
        patientName: dto.patientName,
        location: dto.location,
        complaint: dto.complaint || null,
        priority: dto.priority || "URGENT",
        status: "PENDING",
        history: [{ status: "PENDING", at: new Date().toISOString() }] as any,
      },
      include: {
        vehicle: { select: { id: true, callSign: true } },
      },
    });
  }

  async dispatchCall(tenantId: string, id: string) {
    const call = await this.findCallById(tenantId, id);
    if (call.status !== "PENDING")
      throw new BadRequestException("Only pending calls can be dispatched");

    const vehicle = await this.prisma.ambulanceVehicle.findFirst({
      where: { tenantId, status: "AVAILABLE" },
      orderBy: { createdAt: "asc" },
    });
    if (!vehicle)
      throw new BadRequestException(
        "No ambulances available. Free a vehicle first.",
      );

    const at = new Date().toISOString();
    const history = Array.isArray(call.history ?? null)
      ? (call.history as any[])
      : [];
    const updated = await this.prisma.ambulanceCall.update({
      where: { id },
      data: {
        status: "DISPATCHED",
        dispatchedAt: new Date(),
        vehicleId: vehicle.id,
        history: [...history, { status: "DISPATCHED", at }] as any,
      },
      include: {
        vehicle: { select: { id: true, callSign: true } },
      },
    });
    await this.prisma.ambulanceVehicle.update({
      where: { id: vehicle.id },
      data: {
        status: "IN_SERVICE",
        currentLocation: `Dispatched to ${call.location}`,
      },
    });
    return updated;
  }

  async advanceCall(
    tenantId: string,
    id: string,
    target: "EN_ROUTE" | "ARRIVED" | "COMPLETED",
  ) {
    const call = await this.findCallById(tenantId, id);
    const allowed = CALL_FLOW[call.status] || [];
    if (!allowed.includes(target))
      throw new BadRequestException(
        `Cannot move a ${call.status} call to ${target}`,
      );

    const at = new Date().toISOString();
    const history = Array.isArray(call.history ?? null)
      ? (call.history as any[])
      : [];

    if (target === "ARRIVED" && call.vehicleId) {
      await this.prisma.ambulanceVehicle.update({
        where: { id: call.vehicleId },
        data: { currentLocation: `On scene: ${call.location}` },
      });
    }

    if (target === "COMPLETED" && call.vehicleId) {
      await this.prisma.ambulanceVehicle.update({
        where: { id: call.vehicleId },
        data: { status: "AVAILABLE", currentLocation: "Hospital Bay 1" },
      });
    }

    return this.prisma.ambulanceCall.update({
      where: { id },
      data: {
        status: target,
        history: [...history, { status: target, at }] as any,
      },
      include: {
        vehicle: { select: { id: true, callSign: true } },
      },
    });
  }

  async cancelCall(tenantId: string, id: string) {
    const call = await this.findCallById(tenantId, id);
    if (!["PENDING", "DISPATCHED", "EN_ROUTE"].includes(call.status))
      throw new BadRequestException(
        `A ${call.status} call cannot be cancelled`,
      );

    const at = new Date().toISOString();
    const history = Array.isArray(call.history ?? null)
      ? (call.history as any[])
      : [];

    if (call.vehicleId && call.status !== "PENDING") {
      await this.prisma.ambulanceVehicle.update({
        where: { id: call.vehicleId },
        data: { status: "AVAILABLE", currentLocation: "Hospital Bay 1" },
      });
    }

    return this.prisma.ambulanceCall.update({
      where: { id },
      data: {
        status: "CANCELLED",
        history: [...history, { status: "CANCELLED", at }] as any,
      },
      include: {
        vehicle: { select: { id: true, callSign: true } },
      },
    });
  }

  async deleteCall(tenantId: string, id: string) {
    await this.findCallById(tenantId, id);
    await this.prisma.ambulanceCall.delete({ where: { id } });
    return { success: true };
  }
}
