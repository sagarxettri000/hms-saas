import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
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
import { Hl7ListenerConfig } from "./hl7.types";

@ApiTags("HL7")
@Controller("hl7")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class Hl7Controller {
  constructor(private readonly hl7: Hl7Service) {}

  @Post("raw")
  @HttpCode(200)
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({
    summary: "Ingest a raw HL7 v2 message (ADT/ORM/ORU/SIU) with Content-Type text/plain",
  })
  ingestRaw(
    @Body() body: string,
    @Headers("content-type") contentType: string | undefined,
    @Req() req: Request,
  ) {
    if (!contentType?.toLowerCase().includes("text/plain") && !contentType?.includes("hl7")) {
      // Nest may parse text/plain as a JSON string; fall back to string coercion.
    }
    const user = req.user as any;
    return this.hl7.processMessage(String(body ?? ""), {
      tenantId: user.tenantId,
      userId: user.id,
    });
  }

  @Post()
  @HttpCode(200)
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Ingest an HL7 v2 message wrapped in JSON { message }" })
  ingestJson(
    @Body() body: { message?: string },
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.hl7.processMessage(body?.message ?? "", {
      tenantId: user.tenantId,
      userId: user.id,
    });
  }

  @Get("listener")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Report MLLP listener status" })
  listenerStatus() {
    return { enabled: this.hl7.isMllpRunning() };
  }

  @Post("listener")
  @HttpCode(200)
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Start/stop the MLLP listener for this tenant" })
  async setListener(@Body() config: Hl7ListenerConfig, @Req() req: Request) {
    const user = req.user as any;
    if (config.enabled) {
      await this.hl7.startMllpListener(user.tenantId, config);
    } else {
      await this.hl7.stopMllpListener();
    }
    return { enabled: this.hl7.isMllpRunning() };
  }
}