import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LaboratoryService } from "./laboratory.service";
import { buildFlowCytometryReportPdf } from "./flow-cytometry-report-pdf";
import {
  FLOW_CYTOMETRY_DISCIPLINE,
  FLOW_INSTRUMENTS,
  FLOW_MARKERS,
  FLOW_PANELS,
  FLOW_PANELS_BY_CODE,
} from "./flow-cytometry-catalog";

export interface CreateFlowOrderDto {
  patientId: string;
  encounterId?: string;
  admissionId?: string;
  doctorId?: string;
  panelCode: string;
  isStat?: boolean;
  isEmergency?: boolean;
  clinicalNote?: string;
}

export interface FlowListParams {
  status?: string;
  patientId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface StartStudyDto {
  sampleId?: string;
  instrumentId?: string;
  notes?: string;
}

export interface AddRunDto {
  instrumentId?: string;
  acquisitionStatus?: string;
  numberOfEvents?: number;
  numberOfParameters?: number;
  qcStatus?: string;
  qcNote?: string;
  compensationStatus?: string;
  notes?: string;
}

export interface AddPopulationDto {
  name: string;
  parentId?: string;
  sortOrder?: number;
}

export interface UpdatePopulationDto {
  name?: string;
  percentage?: number | null;
  absoluteCount?: number | null;
  countUnit?: string;
  qualitative?: string;
  status?: string;
  notes?: string;
}

export interface SetMarkerResultDto {
  markerId: string;
  percentage?: number | null;
  absoluteCount?: number | null;
  mfi?: number | null;
  unit?: string;
  valueText?: string;
  isAbnormal?: boolean | null;
  isCritical?: boolean | null;
  notes?: string;
}

export interface SubmitResultsDto {
  resultSummary?: string;
  gatingStrategy?: string;
}

const IMMUTABLE_STATUSES = ["VERIFIED", "APPROVED", "REPORTED"];
const BLOCKED_STATUSES = ["REJECTED", "CANCELLED"];

@Injectable()
export class FlowCytometryService {
  private readonly logger = new Logger(FlowCytometryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly laboratory: LaboratoryService,
  ) {}

  // ---------- Catalog ----------

  async ensureCatalog(tenantId: string) {
    const existingTests = await this.prisma.labTest.findMany({
      where: {
        tenantId,
        discipline: FLOW_CYTOMETRY_DISCIPLINE,
        code: { in: FLOW_PANELS.map((p) => p.code) },
      },
      select: { code: true },
    });
    const haveTests = new Set(existingTests.map((t) => t.code));

    const existingMarkers = await this.prisma.flowMarker.findMany({
      where: { tenantId, code: { in: FLOW_MARKERS.map((m) => m.code) } },
      select: { code: true },
    });
    const haveMarkers = new Set(existingMarkers.map((m) => m.code));

    await this.prisma.$transaction(async (tx) => {
      for (const panel of FLOW_PANELS) {
        if (!haveTests.has(panel.code)) {
          await tx.labTest.create({
            data: {
              tenantId,
              name: panel.name,
              code: panel.code,
              category: panel.category,
              specimenType: panel.specimenType,
              container: panel.container,
              unit: null,
              price: panel.price,
              discipline: FLOW_CYTOMETRY_DISCIPLINE,
              method: "Flow cytometry - multicolor",
              precision: null,
              resultType: "TEXT",
              referenceRanges: null,
              sortOrder: FLOW_PANELS.indexOf(panel),
              turnaroundTime: panel.turnaroundTime,
              status: "ACTIVE",
              isActive: true,
            } as any,
          });
        }
      }

      for (const panel of FLOW_PANELS) {
        const test = await tx.labTest.findFirst({
          where: { tenantId, code: panel.code, discipline: FLOW_CYTOMETRY_DISCIPLINE },
          select: { id: true },
        });
        if (!test) continue;
        const existing = await tx.labTestPanel.findFirst({
          where: { tenantId, code: panel.code },
          select: { id: true },
        });
        if (!existing) {
          await tx.labTestPanel.create({
            data: {
              tenantId,
              name: panel.name,
              code: panel.code,
              category: panel.category,
              specimenType: panel.specimenType,
              container: panel.container,
              description: panel.description,
              price: panel.price,
              isActive: true,
              labTestId: test.id,
            } as any,
          });
        }
      }

      for (const marker of FLOW_MARKERS) {
        if (haveMarkers.has(marker.code)) continue;
        await tx.flowMarker.create({
          data: {
            tenantId,
            name: marker.name,
            code: marker.code,
            category: marker.category,
            sortOrder: FLOW_MARKERS.indexOf(marker),
            isActive: true,
          } as any,
        });
      }

      for (const panel of FLOW_PANELS) {
        const panelRow = await tx.labTestPanel.findFirst({
          where: { tenantId, code: panel.code },
          select: { id: true },
        });
        if (!panelRow) continue;
        for (const def of panel.markers) {
          const markerRow = await tx.flowMarker.findFirst({
            where: { tenantId, code: def.markerCode },
            select: { id: true },
          });
          if (!markerRow) continue;
          const existing = await tx.flowPanelMarker.findFirst({
            where: { tenantId, panelId: panelRow.id, markerId: markerRow.id },
            select: { id: true },
          });
          if (!existing) {
            await tx.flowPanelMarker.create({
              data: {
                tenantId,
                panelId: panelRow.id,
                markerId: markerRow.id,
                fluorochrome: def.fluorochrome,
                sortOrder: def.sortOrder,
              } as any,
            });
          }
        }
      }

      for (const instrument of FLOW_INSTRUMENTS) {
        const existing = await tx.flowInstrument.findFirst({
          where: { tenantId, name: instrument.name },
          select: { id: true },
        });
        if (!existing) {
          await tx.flowInstrument.create({
            data: {
              tenantId,
              name: instrument.name,
              platform: instrument.platform,
              manufacturer: instrument.manufacturer,
              model: instrument.model,
              channels: instrument.channels,
              parameters: instrument.channels,
              location: instrument.location,
              status: "ACTIVE",
            } as any,
          });
        }
      }
    });

    return this.findCatalog(tenantId);
  }

  async findCatalog(tenantId: string) {
    if (!tenantId) {
      return { panels: [], markers: [], instruments: [] };
    }

    const [panels, markers, instruments] = await Promise.all([
      this.prisma.labTestPanel.findMany({
        where: { tenantId, isActive: true, code: { in: FLOW_PANELS.map((p) => p.code) } },
        include: {
          flowPanelMarkers: {
            orderBy: { sortOrder: "asc" },
            include: { marker: true },
          },
          labTest: { select: { id: true, name: true, code: true, turnaroundTime: true, status: true } },
        },
        orderBy: { code: "asc" },
      }),
      this.prisma.flowMarker.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.flowInstrument.findMany({
        where: { tenantId, status: { not: "RETIRED" } },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      panels: panels.map((panel: any) => ({
        id: panel.id,
        code: panel.code,
        name: panel.name,
        price: Number(panel.price),
        specimenType: panel.specimenType,
        container: panel.container,
        description: panel.description,
        turnaroundTime: panel.labTest?.turnaroundTime ?? undefined,
        markers: (panel.flowPanelMarkers || []).map((pm: any) => ({
          marker: {
            id: pm.marker.id,
            code: pm.marker.code,
            name: pm.marker.name,
            category: pm.marker.category,
          },
          fluorochrome: pm.fluorochrome,
          sortOrder: pm.sortOrder,
        })),
      })),
      markers: markers.map((m: any) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        category: m.category,
      })),
      instruments: instruments.map((i: any) => ({
        id: i.id,
        name: i.name,
        platform: i.platform,
        manufacturer: i.manufacturer,
        model: i.model,
        channels: i.channels,
        location: i.location,
        status: i.status,
      })),
    };
  }

  // ---------- Orders ----------

  async createOrder(tenantId: string, dto: CreateFlowOrderDto, userId?: string) {
    const panelDef = FLOW_PANELS_BY_CODE[dto.panelCode];
    if (!panelDef) {
      throw new BadRequestException(`Unknown flow cytometry panel: ${dto.panelCode}`);
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, tenantId, deletedAt: null },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: { id: dto.encounterId, tenantId },
        select: { id: true, patientId: true },
      });
      if (!encounter) throw new NotFoundException("Encounter not found");
      if (encounter.patientId !== dto.patientId) {
        throw new BadRequestException("Encounter does not belong to this patient");
      }
    }

    if (dto.doctorId) {
      const doctor = await this.prisma.doctorProfile.findFirst({
        where: { id: dto.doctorId, tenantId },
        select: { id: true },
      });
      if (!doctor) throw new NotFoundException("Doctor not found");
    }

    const test = await this.prisma.labTest.findFirst({
      where: { tenantId, code: dto.panelCode, discipline: FLOW_CYTOMETRY_DISCIPLINE },
      select: { id: true },
    });
    if (!test) {
      await this.ensureCatalog(tenantId);
    }
    const testRow = test ?? (await this.prisma.labTest.findFirst({
      where: { tenantId, code: dto.panelCode, discipline: FLOW_CYTOMETRY_DISCIPLINE },
      select: { id: true },
    }));
    if (!testRow) {
      throw new BadRequestException("Flow cytometry panel catalogue not initialised");
    }

    const orderNumber = await this.generateOrderNumber(tenantId);

    const order = await this.prisma.labOrder.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        admissionId: dto.admissionId,
        doctorId: dto.doctorId,
        orderNumber,
        isStat: dto.isStat || false,
        isEmergency: dto.isEmergency || false,
        clinicalNote: dto.clinicalNote,
        items: {
          create: {
            tenantId,
            labTestId: testRow.id,
            testName: panelDef.name,
            price: panelDef.price,
            method: "Flow cytometry - multicolor",
            resultType: "TEXT",
          },
        },
      } as any,
      include: { items: true },
    });

    await this.logAudit(tenantId, userId, "CREATE", "LabOrder", order.id, {
      module: "FLOW_CYTOMETRY",
      panel: dto.panelCode,
    });

    return order;
  }

  async findOrders(tenantId: string, params: FlowListParams) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;

    const where: any = { tenantId };
    if (params.patientId) where.patientId = params.patientId;
    if (params.status) where.status = params.status;

    const andClauses: any[] = [
      {
        items: {
          some: { labTest: { discipline: FLOW_CYTOMETRY_DISCIPLINE } },
        },
      },
    ];
    if (params.search) {
      andClauses.push({ orderNumber: { contains: params.search, mode: "insensitive" } });
    }
    if (params.from || params.to) {
      const range: any = {};
      if (params.from) range.gte = new Date(params.from);
      if (params.to) {
        const to = new Date(params.to);
        to.setHours(23, 59, 59, 999);
        range.lte = to;
      }
      andClauses.push({ orderedAt: range });
    }
    where.AND = andClauses;

    const [data, total] = await Promise.all([
      this.prisma.labOrder.findMany({
        where,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
          items: {
            where: { labTest: { discipline: FLOW_CYTOMETRY_DISCIPLINE } },
            include: { flowStudy: { include: { panel: true } } },
          },
          samples: true,
        },
        orderBy: { orderedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.labOrder.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOrderById(tenantId: string, id: string) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
            hospitalNumber: true,
            gender: true,
            dateOfBirth: true,
            age: true,
          },
        },
        encounter: true,
        items: {
          include: {
            labTest: { select: { id: true, code: true, discipline: true, unit: true } },
            flowStudy: true,
          },
        },
        samples: true,
      },
    });
    if (!order) throw new NotFoundException("Lab order not found");

    return { ...order, flowStudies: await this.listStudiesForOrder(order) };
  }

  // ---------- Studies ----------

  private async listStudiesForOrder(order: any) {
    const items = order.items || [];
    const flowItems = items.filter((it: any) => it.flowStudy);
    if (flowItems.length === 0) return [];
    const studies = await this.prisma.flowCytometryStudy.findMany({
      where: { tenantId: order.tenantId, labOrderId: order.id },
      include: {
        panel: { include: { flowPanelMarkers: { orderBy: { sortOrder: "asc" }, include: { marker: true } } } },
        runs: { orderBy: { createdAt: "desc" }, include: { instrument: { select: { id: true, name: true } } } },
        populations: {
          orderBy: { sortOrder: "asc" },
          include: { markerResults: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return studies.map((s) => this.serializeStudy(s));
  }

  async startStudy(tenantId: string, orderId: string, dto: StartStudyDto, userId?: string) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id: orderId, tenantId },
      include: {
        items: {
          where: { labTest: { discipline: FLOW_CYTOMETRY_DISCIPLINE } },
          include: { labTest: true },
        },
        samples: true,
      },
    });
    if (!order) throw new NotFoundException("Lab order not found");
    const item = (order.items || [])[0];
    if (!item) throw new BadRequestException("Order has no flow cytometry item");

    if (BLOCKED_STATUSES.includes(order.status as string)) {
      throw new BadRequestException(`Cannot start a study on a ${(order.status as string).toLowerCase()} order`);
    }

    if (dto.instrumentId) {
      const instrument = await this.prisma.flowInstrument.findFirst({
        where: { id: dto.instrumentId, tenantId },
        select: { id: true },
      });
      if (!instrument) throw new NotFoundException("Instrument not found");
    }

    const existing = await this.prisma.flowCytometryStudy.findFirst({
      where: { tenantId, labOrderItemId: item.id },
      select: { id: true },
    });
    if (existing) throw new BadRequestException("Study already started for this order");

    const panel = await this.prisma.labTestPanel.findFirst({
      where: { tenantId, labTestId: item.labTestId! },
      select: { id: true },
    });
    if (!panel) throw new BadRequestException("Panel not found for order item");

    if (dto.sampleId) {
      const sample = await this.prisma.labSample.findFirst({
        where: { id: dto.sampleId, tenantId, labOrderId: orderId },
        select: { id: true },
      });
      if (!sample) throw new NotFoundException("Sample not found");
    }

    const study = await this.prisma.flowCytometryStudy.create({
      data: {
        tenantId,
        labOrderId: order.id,
        labOrderItemId: item.id,
        panelId: panel.id,
        sampleId: dto.sampleId || null,
        runs: {
          create: {
            tenantId,
            instrumentId: dto.instrumentId || null,
            operatorId: userId || null,
            startedAt: new Date(),
            acquisitionStatus: "PENDING",
            qcStatus: "NOT_RUN",
            compensationStatus: "NOT_APPLIED",
            notes: dto.notes,
          } as any,
        },
      } as any,
      include: { panel: true, runs: true, populations: true },
    });

    await this.prisma.labOrder.update({
      where: { id: orderId },
      data: { status: "PROCESSING", processedAt: new Date() },
    }).catch((err) => this.logger.warn("lab order status update failed", err));

    await this.logAudit(tenantId, userId, "CREATE", "FlowCytometryStudy", study.id, {
      action: "FLOW_STUDY_STARTED",
      orderId,
    });

    return this.findStudy(tenantId, study.id);
  }

  async findStudy(tenantId: string, studyId: string) {
    const study = await this.prisma.flowCytometryStudy.findFirst({
      where: { id: studyId, tenantId },
      include: {
        labOrder: {
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                middleName: true,
                lastName: true,
                mrn: true,
                hospitalNumber: true,
                gender: true,
                dateOfBirth: true,
                age: true,
              },
            },
            items: true,
            samples: true,
          },
        },
        sample: true,
        panel: {
          include: { flowPanelMarkers: { orderBy: { sortOrder: "asc" }, include: { marker: true } } },
        },
        runs: { orderBy: { createdAt: "desc" } },
        populations: {
          orderBy: { sortOrder: "asc" },
          include: {
            markerResults: { include: { marker: true } },
            children: { orderBy: { sortOrder: "asc" } },
          },
        },
        analyses: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!study) throw new NotFoundException("Flow cytometry study not found");

    return {
      ...study,
      resultSummary: study.resultSummary,
      gatingStrategy: study.gatingStrategy,
      populations: this.serializePopulations(study.populations),
    };
  }

  async addRun(tenantId: string, studyId: string, dto: AddRunDto, userId?: string) {
    const study = await this.prisma.flowCytometryStudy.findFirst({
      where: { id: studyId, tenantId },
      select: { id: true, labOrder: { select: { status: true } } },
    });
    if (!study) throw new NotFoundException("Flow cytometry study not found");
    const orderStatus = (study as any).labOrder?.status as string;
    if (BLOCKED_STATUSES.includes(orderStatus)) {
      throw new BadRequestException("Cannot add runs to a cancelled/rejected order");
    }

    const run = await this.prisma.flowRun.create({
      data: {
        tenantId,
        studyId,
        instrumentId: dto.instrumentId || null,
        operatorId: userId || null,
        startedAt: new Date(),
        acquisitionStatus: dto.acquisitionStatus || "PENDING",
        numberOfEvents: dto.numberOfEvents,
        numberOfParameters: dto.numberOfParameters,
        qcStatus: dto.qcStatus || "NOT_RUN",
        qcNote: dto.qcNote,
        compensationStatus: dto.compensationStatus || "NOT_APPLIED",
        notes: dto.notes,
      } as any,
    });

    await this.logAudit(tenantId, userId, "CREATE", "FlowRun", run.id, {
      action: "FLOW_RUN_ADDED",
      studyId,
    });

    return run;
  }

  async addPopulation(tenantId: string, studyId: string, dto: AddPopulationDto, userId?: string) {
    const study = await this.prisma.flowCytometryStudy.findFirst({
      where: { id: studyId, tenantId },
      select: { id: true, labOrder: { select: { status: true } } },
    });
    if (!study) throw new NotFoundException("Flow cytometry study not found");
    const orderStatus = (study as any).labOrder?.status as string;
    if (IMMUTABLE_STATUSES.includes(orderStatus)) {
      throw new BadRequestException("Study results are finalized for this order");
    }
    if (BLOCKED_STATUSES.includes(orderStatus)) {
      throw new BadRequestException("Cannot edit populations on a cancelled/rejected order");
    }

    if (dto.parentId) {
      const parent = await this.prisma.flowPopulation.findFirst({
        where: { id: dto.parentId, tenantId, studyId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException("Parent population not found");
    }

    let sortOrder = dto.sortOrder;
    if (sortOrder == null) {
      const max = await this.prisma.flowPopulation.findFirst({
        where: { tenantId, studyId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      sortOrder = (max?.sortOrder ?? 0) + 10;
    }

    const population = await this.prisma.flowPopulation.create({
      data: {
        tenantId,
        studyId,
        parentId: dto.parentId || null,
        name: dto.name,
        sortOrder,
        status: "PENDING",
      } as any,
    });

    await this.logAudit(tenantId, userId, "CREATE", "FlowPopulation", population.id, {
      action: "FLOW_POPULATION_ADDED",
      studyId,
    });

    return population;
  }

  async updatePopulation(tenantId: string, populationId: string, dto: UpdatePopulationDto, userId?: string) {
    const population = await this.prisma.flowPopulation.findFirst({
      where: { id: populationId, tenantId },
      include: { study: { select: { labOrder: { select: { status: true } } } } },
    });
    if (!population) throw new NotFoundException("Population not found");
    const orderStatus = (population as any).study?.labOrder?.status as string;
    if (IMMUTABLE_STATUSES.includes(orderStatus)) {
      throw new BadRequestException("Study results are finalized for this order");
    }
    if (BLOCKED_STATUSES.includes(orderStatus)) {
      throw new BadRequestException("Cannot edit populations on a cancelled/rejected order");
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.percentage !== undefined) data.percentage = dto.percentage;
    if (dto.absoluteCount !== undefined) data.absoluteCount = dto.absoluteCount;
    if (dto.countUnit !== undefined) data.countUnit = dto.countUnit;
    if (dto.qualitative !== undefined) data.qualitative = dto.qualitative;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const updated = await this.prisma.flowPopulation.update({
      where: { id: populationId },
      data,
    });

    await this.logAudit(tenantId, userId, "UPDATE", "FlowPopulation", populationId, {
      action: "FLOW_POPULATION_UPDATED",
      studyId: population.studyId,
    });

    return updated;
  }

  async setMarkerResult(tenantId: string, populationId: string, dto: SetMarkerResultDto, userId?: string) {
    const population = await this.prisma.flowPopulation.findFirst({
      where: { id: populationId, tenantId },
      include: { study: { select: { id: true, panelId: true, labOrder: { select: { status: true } } } } },
    });
    if (!population) throw new NotFoundException("Population not found");
    const orderStatus = (population as any).study?.labOrder?.status as string;
    if (IMMUTABLE_STATUSES.includes(orderStatus)) {
      throw new BadRequestException("Study results are finalized for this order");
    }
    if (BLOCKED_STATUSES.includes(orderStatus)) {
      throw new BadRequestException("Cannot edit results on a cancelled/rejected order");
    }

    const link = await this.prisma.flowPanelMarker.findFirst({
      where: { tenantId, panelId: population.study.panelId, markerId: dto.markerId },
      select: { id: true },
    });
    if (!link) throw new BadRequestException("Marker is not part of this study panel");

    const values: number[] = [dto.percentage, dto.absoluteCount, dto.mfi].filter(
      (v): v is number => v !== undefined && v !== null,
    );
    for (const v of values) {
      if (Number.isNaN(Number(v))) throw new BadRequestException("Invalid numeric marker value");
    }

    const data: any = {
      percentage: dto.percentage !== undefined ? dto.percentage : undefined,
      absoluteCount: dto.absoluteCount !== undefined ? dto.absoluteCount : undefined,
      mfi: dto.mfi !== undefined ? dto.mfi : undefined,
      unit: dto.unit !== undefined ? dto.unit : undefined,
      valueText: dto.valueText !== undefined ? dto.valueText : undefined,
      isAbnormal: dto.isAbnormal !== undefined ? dto.isAbnormal : undefined,
      isCritical: dto.isCritical !== undefined ? dto.isCritical : undefined,
      notes: dto.notes !== undefined ? dto.notes : undefined,
      status: "RESULT_ENTERED",
      resultEnteredBy: userId || null,
      resultEnteredAt: new Date(),
    };

    const markerResult = await this.prisma.flowMarkerResult.upsert({
      where: {
        populationId_markerId: { populationId, markerId: dto.markerId },
      },
      update: data,
      create: {
        tenantId,
        studyId: population.studyId,
        populationId,
        markerId: dto.markerId,
        ...data,
      } as any,
    });

    await this.logAudit(tenantId, userId, "UPSERT", "FlowMarkerResult", markerResult.id, {
      action: "FLOW_MARKER_RESULT_SET",
      populationId,
      studyId: population.studyId,
    });

    return markerResult;
  }

  async submitResults(tenantId: string, studyId: string, dto: SubmitResultsDto, userId?: string) {
    const study = await this.prisma.flowCytometryStudy.findFirst({
      where: { id: studyId, tenantId },
      include: { labOrder: { select: { id: true, status: true } }, populations: true },
    });
    if (!study) throw new NotFoundException("Flow cytometry study not found");
    const orderStatus = study.labOrder.status as string;
    if (BLOCKED_STATUSES.includes(orderStatus)) {
      throw new BadRequestException("Cannot submit results on a cancelled/rejected order");
    }
    if (IMMUTABLE_STATUSES.includes(orderStatus)) {
      throw new BadRequestException("Study results are already finalized");
    }

    const reportable = study.populations.filter(
      (pop) => (pop as any).status === "RESULT_ENTERED" || (pop as any).status === "FINALIZED",
    );
    if (reportable.length === 0) {
      throw new BadRequestException("Add at least one population with entered marker results before submitting");
    }

    const finalized = await this.prisma.$transaction(async (tx) => {
      for (const pop of reportable) {
        await tx.flowPopulation.update({
          where: { id: pop.id },
          data: { status: "FINALIZED" },
        });
      }
      return tx.flowCytometryStudy.update({
        where: { id: studyId },
        data: {
          status: "RESULT_ENTERED",
          resultSummary: dto.resultSummary ?? undefined,
          gatingStrategy: dto.gatingStrategy ?? undefined,
        } as any,
      });
    });

    await this.prisma.labOrderItem.update({
      where: { id: study.labOrderItemId },
      data: { status: "RESULT_ENTERED", resultEnteredBy: userId || null, resultEnteredAt: new Date() },
    });

    await this.prisma.labOrder.update({
      where: { id: study.labOrder.id },
      data: { status: "RESULT_READY", processedAt: new Date() },
    });

    const critical = await this.prisma.flowMarkerResult.count({
      where: { studyId, isCritical: true },
    });
    if (critical > 0) {
      await this.alertCriticalStudy(tenantId, study.labOrder.id);
    }

    await this.logAudit(tenantId, userId, "UPDATE", "FlowCytometryStudy", studyId, {
      action: "FLOW_RESULTS_SUBMITTED",
      orderId: study.labOrder.id,
      criticalResults: critical,
    });

    return finalized;
  }

  // ---------- Verification / approval ----------

  async verify(tenantId: string, id: string, userId?: string) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException("Lab order not found");

    const flowItem = (order.items || []).find(
      (it: any) => it.status === "RESULT_ENTERED",
    );
    if (!flowItem) {
      throw new BadRequestException("Flow cytometry results must be submitted before verification");
    }

    const pending = await this.prisma.flowMarkerResult.count({
      where: { tenantId, study: { labOrderId: id }, status: { not: "RESULT_ENTERED" } },
    });
    if (pending > 0) {
      throw new BadRequestException("All marker results must be entered before verification");
    }

    return this.laboratory.transitionStatus(tenantId, id, "VERIFIED", userId);
  }

  async approve(tenantId: string, id: string, userId?: string) {
    return this.laboratory.transitionStatus(tenantId, id, "APPROVED", userId);
  }

  async report(tenantId: string, id: string, userId?: string) {
    return this.laboratory.transitionStatus(tenantId, id, "REPORTED", userId);
  }

  // ---------- Report ----------

  async getReport(tenantId: string, id: string) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id, tenantId },
      include: {
        patient: {
          select: {
            firstName: true,
            middleName: true,
            lastName: true,
            mrn: true,
            hospitalNumber: true,
            gender: true,
            dateOfBirth: true,
            age: true,
          },
        },
        items: { include: { flowStudy: true } },
        samples: true,
      },
    });
    if (!order) throw new NotFoundException("Lab order not found");

    const flowItem = (order.items || []).find((it: any) => it.flowStudy);
    if (!flowItem?.flowStudy) {
      throw new BadRequestException("No flow cytometry study attached to this order");
    }

    const study = await this.prisma.flowCytometryStudy.findFirst({
      where: { id: flowItem.flowStudy.id, tenantId },
      include: {
        panel: { include: { flowPanelMarkers: { orderBy: { sortOrder: "asc" }, include: { marker: true } } } },
        runs: { orderBy: { createdAt: "asc" }, include: { instrument: { select: { id: true, name: true } } } },
        populations: {
          orderBy: { sortOrder: "asc" },
          include: { markerResults: { include: { marker: true } } },
        },
      },
    });
    if (!study) throw new NotFoundException("Flow cytometry study not found");

    const [verifiedByName, approvedByName] = await Promise.all([
      order.verifiedBy ? this.findUserName(order.verifiedBy) : null,
      order.approvedBy ? this.findUserName(order.approvedBy) : null,
    ]);

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      isStat: order.isStat,
      isEmergency: order.isEmergency,
      orderedAt: order.orderedAt,
      collectedAt: order.collectedAt,
      receivedAt: order.receivedAt,
      processedAt: order.processedAt,
      verifiedAt: order.verifiedAt,
      approvedAt: order.approvedAt,
      reportedAt: order.reportedAt,
      verifiedByName,
      approvedByName,
      clinicalNote: order.clinicalNote,
      patient: {
        name: [order.patient?.firstName, order.patient?.middleName, order.patient?.lastName].filter(Boolean).join(" ") || "",
        mrn: order.patient?.mrn,
        hospitalNumber: order.patient?.hospitalNumber,
        gender: order.patient?.gender,
        age: order.patient?.age,
        dateOfBirth: order.patient?.dateOfBirth,
      },
      samples: (order.samples || []).map((s: any) => ({
        specimenType: s.specimenType,
        barcode: s.barcode,
        container: s.container,
        status: s.status,
        collectedAt: s.collectedAt,
      })),
      panel: {
        code: study.panel.code,
        name: study.panel.name,
        specimenType: study.panel.specimenType,
        container: study.panel.container,
        markers: (study.panel.flowPanelMarkers || []).map((pm: any) => ({
          code: pm.marker.code,
          name: pm.marker.name,
          fluorochrome: pm.fluorochrome,
        })),
      },
      gatingStrategy: study.gatingStrategy,
      resultSummary: study.resultSummary,
      runs: (study.runs || []).map((r: any) => ({
        acquisitionStatus: r.acquisitionStatus,
        qcStatus: r.qcStatus,
        compensationStatus: r.compensationStatus,
        numberOfEvents: r.numberOfEvents,
        numberOfParameters: r.numberOfParameters,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        instrumentName: r.instrument?.name ?? null,
      })),
      populations: this.serializePopulations(study.populations),
    };
  }

  // ---------- PDF ----------

  async generateReportPdf(tenantId: string, id: string, userId?: string) {
    const report = await this.getReport(tenantId, id);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found");

    let generatedBy: string | undefined;
    if (userId) {
      generatedBy = (await this.findUserName(userId)) ?? undefined;
    }

    return buildFlowCytometryReportPdf(
      report as any,
      {
        name: tenant.name || "Hospital",
        addressLine1: (tenant as any).addressLine1,
        addressLine2: (tenant as any).addressLine2,
        city: (tenant as any).city,
        district: (tenant as any).district,
        province: (tenant as any).province,
        country: (tenant as any).country,
        phone: tenant.phone ?? undefined,
        email: tenant.email ?? undefined,
        website: (tenant as any).website,
        panNumber: (tenant as any).panNumber,
        vatNumber: (tenant as any).vatNumber,
        registrationNumber: (tenant as any).registrationNumber,
      },
      generatedBy,
    );
  }

  // ---------- Internals ----------

  private serializeStudy(study: any) {
    return {
      ...study,
      runs: (study.runs || []).map((r: any) => ({
        id: r.id,
        instrumentId: r.instrumentId,
        instrumentName: r.instrument?.name ?? null,
        acquisitionStatus: r.acquisitionStatus,
        qcStatus: r.qcStatus,
        compensationStatus: r.compensationStatus,
        numberOfEvents: r.numberOfEvents,
        numberOfParameters: r.numberOfParameters,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
      })),
      populations: this.serializePopulations(study.populations || []),
    };
  }

  private serializePopulations(pops: any[]) {
    const rows = (pops || []).map((pop: any) => ({
      id: pop.id,
      parentId: pop.parentId,
      name: pop.name,
      sortOrder: pop.sortOrder,
      percentage: pop.percentage != null ? Number(pop.percentage) : null,
      absoluteCount: pop.absoluteCount != null ? Number(pop.absoluteCount) : null,
      countUnit: pop.countUnit,
      qualitative: pop.qualitative,
      status: pop.status,
      notes: pop.notes,
      markerResults: (pop.markerResults || []).map((mr: any) => ({
        id: mr.id,
        markerId: mr.markerId,
        markerCode: mr.marker?.code ?? undefined,
        percentage: mr.percentage != null ? Number(mr.percentage) : null,
        absoluteCount: mr.absoluteCount != null ? Number(mr.absoluteCount) : null,
        mfi: mr.mfi != null ? Number(mr.mfi) : null,
        unit: mr.unit,
        valueText: mr.valueText,
        isAbnormal: mr.isAbnormal,
        isCritical: mr.isCritical,
        status: mr.status,
        notes: mr.notes,
      })),
      children: (pop.children || []).map((c: any) => c.id),
    }));

    const byParent = new Map<string | null, any[]>();
    for (const row of rows) {
      const key = row.parentId ?? "";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(row);
    }
    const tree = (parentKey: string | null): any[] =>
      (byParent.get(parentKey) || []).map((row) => ({ ...row, children: tree(row.id) }));

    return { rows, tree: tree(null) };
  }

  private async alertCriticalStudy(tenantId: string, orderId: string) {
    try {
      const order = await this.prisma.labOrder.findUnique({
        where: { id: orderId },
        include: { patient: { select: { firstName: true, lastName: true, mrn: true } } },
      });
      if (!order) return;
      const targets: string[] = [];
      if (order.doctorId) targets.push(order.doctorId);
      for (const userId of new Set(targets.filter(Boolean))) {
        this.notifications.create(tenantId, {
          userId,
          title: "CRITICAL Flow Cytometry Result",
          body: `Critical flow cytometry finding for ${order.patient?.firstName ?? ""} ${order.patient?.lastName ?? ""} (MRN ${order.patient?.mrn ?? "N/A"}). Order: ${order.orderNumber}`,
          type: "CRITICAL_LAB_RESULT",
          referenceType: "LabOrder",
          referenceId: orderId,
        }).catch((err) => this.logger.warn("critical result notification failed", err));
      }
    } catch {}
  }

  private async generateOrderNumber(tenantId: string): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await this.prisma.labOrder.findFirst({
      where: { tenantId, orderNumber: { startsWith: `LAB-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { orderNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.orderNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `LAB-${ymd}-${String(seq).padStart(4, "0")}`;
  }

  private async findUserName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, middleName: true, lastName: true },
    });
    if (!user) return null;
    return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ");
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
        data: { tenantId, userId, entity, entityId, action: action as any, metadata },
      });
    } catch (error) {
      this.logger.warn(`Failed to write audit log: ${error}`);
    }
  }
}