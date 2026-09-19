import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";
import { Hl7Service } from "./hl7.service";
import { Hl7QueueService } from "./hl7-queue.service";
import { Hl7OutboundService, Hl7OutboundConfig } from "./hl7-outbound.service";
import { Hl7ListenerConfig } from "./hl7.types";

@ApiTags("HL7")
@Controller("hl7")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class Hl7Controller {
  constructor(
    private readonly hl7: Hl7Service,
    private readonly hl7Queue: Hl7QueueService,
    private readonly hl7Outbound: Hl7OutboundService,
  ) {}

  @Post("raw")
  @HttpCode(202)
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({
    summary:
      "Ingest a raw HL7 v2 message (ADT/ORM/ORU/SIU) - async queued processing",
  })
  @ApiQuery({
    name: "async",
    required: false,
    type: Boolean,
    description: "Process asynchronously (default: true)",
  })
  async ingestRaw(
    @Body() body: string,
    @Headers("content-type") contentType: string | undefined,
    @Query("async") asyncMode: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    const isAsync = asyncMode !== "false";

    if (isAsync) {
      const jobId = await this.hl7Queue.enqueueMessage(
        String(body ?? ""),
        {
          tenantId: user.tenantId,
          userId: user.id,
        },
        "http",
      );
      return { accepted: true, jobId, status: "queued" };
    }

    return this.hl7.processMessage(String(body ?? ""), {
      tenantId: user.tenantId,
      userId: user.id,
    });
  }

  @Post()
  @HttpCode(202)
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({
    summary:
      "Ingest an HL7 v2 message wrapped in JSON { message } - async queued",
  })
  @ApiQuery({
    name: "async",
    required: false,
    type: Boolean,
    description: "Process asynchronously (default: true)",
  })
  async ingestJson(
    @Body() body: { message?: string },
    @Query("async") asyncMode: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    const isAsync = asyncMode !== "false";

    if (isAsync) {
      const jobId = await this.hl7Queue.enqueueMessage(
        body?.message ?? "",
        {
          tenantId: user.tenantId,
          userId: user.id,
        },
        "http",
      );
      return { accepted: true, jobId, status: "queued" };
    }

    return this.hl7.processMessage(body?.message ?? "", {
      tenantId: user.tenantId,
      userId: user.id,
    });
  }

  @Get("job/:jobId")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get status of an HL7 processing job" })
  async getJobStatus(@Req() req: Request, @Param("jobId") jobId: string) {
    const user = req.user as any;
    return this.hl7Queue.getJobStatus(jobId);
  }

  @Get("queue/stats")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get HL7 queue statistics" })
  async getQueueStats(@Req() req: Request) {
    return this.hl7Queue.getQueueStats();
  }

  @Post("queue/pause")
  @HttpCode(200)
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Pause HL7 message processing" })
  async pauseQueue(@Req() req: Request) {
    await this.hl7Queue.pauseProcessing();
    return { paused: true };
  }

  @Post("queue/resume")
  @HttpCode(200)
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Resume HL7 message processing" })
  async resumeQueue(@Req() req: Request) {
    await this.hl7Queue.resumeProcessing();
    return { resumed: true };
  }

  @Get("listener")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Report MLLP listener status" })
  listenerStatus() {
    return {
      enabled: this.hl7.isMllpRunning(),
      tlsEnabled: this.hl7.isMllpTlsEnabled?.(),
    };
  }

  @Post("listener")
  @HttpCode(200)
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Start/stop the MLLP listener for this tenant" })
  async setListener(@Body() config: Hl7ListenerConfig, @Req() req: Request) {
    const user = req.user as any;
    if (config.enabled) {
      if (process.env.VERCEL === "1") {
        throw new BadRequestException(
          "MLLP TCP listeners are unavailable on Vercel serverless; use the HTTP HL7 submission endpoint instead.",
        );
      }
      await this.hl7.startMllpListener(user.tenantId, config);
    } else {
      await this.hl7.stopMllpListener();
    }
    return { enabled: this.hl7.isMllpRunning() };
  }

  @Get("metrics")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get HL7 processing metrics" })
  async getMetrics(@Req() req: Request) {
    const stats = await this.hl7Queue.getQueueStats();
    return {
      queue: stats,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("outbound/config")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get the outbound HL7 (ORU report) relay config" })
  getOutboundConfig(@Req() req: Request) {
    const user = req.user as any;
    return this.hl7Outbound.getConfig(user.tenantId);
  }

  @Put("outbound/config")
  @HttpCode(200)
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Set the outbound HL7 (ORU report) relay config" })
  setOutboundConfig(@Body() config: Hl7OutboundConfig, @Req() req: Request) {
    const user = req.user as any;
    return this.hl7Outbound.setConfig(user.tenantId, config);
  }

  @Post("outbound/radiology-report")
  @HttpCode(200)
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({
    summary:
      "Send an ORU^R01 report for a radiology order to configured endpoints",
  })
  async sendOutboundReport(
    @Body() body: { orderId: string },
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.hl7Outbound.sendRadiologyReport(user.tenantId, body.orderId);
  }
}
