import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";
import { PatientVisibilityService } from "./patient-visibility.service";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Patient movement workflow (spec §64.7–§64.10, §64.19–§64.20):
 * transfer request → completion (source visibility ends, destination
 * activates atomically), temporary procedure visits, and the location
 * history. Visibility changes ONLY on COMPLETED transfers (Test 7).
 */
@ApiTags("Patient Locations")
@Controller("patients")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class PatientLocationsController {
  constructor(
    private readonly visibility: PatientVisibilityService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(":id/locations/transfer-request")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Request a patient transfer (visibility unchanged until completed)" })
  requestTransfer(
    @Param("id") patientId: string,
    @Body()
    body: {
      toLocationType: string;
      toDepartmentId?: string;
      toWardId?: string;
      toBedId?: string;
      reason?: string;
    },
    @Req() req: any,
  ) {
    const { tenantId, id: userId } = req.user;
    return this.prisma.$transaction((tx: any) =>
      this.visibility.requestTransfer(tx, {
        tenantId,
        patientId,
        toLocationType: body.toLocationType,
        toDepartmentId: body.toDepartmentId,
        toWardId: body.toWardId,
        toBedId: body.toBedId,
        reason: body.reason,
        requestedBy: userId,
      }),
    );
  }

  @Get(":id/transfers")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List the patient's transfer records" })
  listTransfers(@Param("id") patientId: string, @Req() req: any) {
    return this.prisma.patientTransfer.findMany({
      where: { tenantId: req.user.tenantId, patientId },
      orderBy: { requestedAt: "desc" },
    });
  }

  @Post("transfers/:transferId/complete")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({
    summary:
      "Complete a transfer — atomically moves visibility to the destination",
  })
  completeTransfer(@Param("transferId") transferId: string, @Req() req: any) {
    const { tenantId, id: userId } = req.user;
    return this.prisma.$transaction((tx: any) =>
      this.visibility.completeTransfer(tx, tenantId, transferId, userId),
    );
  }

  @Post("transfers/:transferId/cancel")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Cancel a pending transfer" })
  async cancelTransfer(@Param("transferId") transferId: string, @Req() req: any) {
    const { tenantId, id: userId } = req.user;
    return this.prisma.patientTransfer.updateMany({
      where: {
        id: transferId,
        tenantId,
        status: { in: ["REQUESTED", "APPROVED", "PENDING", "IN_TRANSIT"] },
      },
      data: { status: "CANCELLED", cancelledBy: userId },
    });
  }

  @Post(":id/locations/temporary")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({
    summary:
      "Begin a temporary visit (e.g. Radiology procedure) — primary location unchanged",
  })
  beginTemporary(
    @Param("id") patientId: string,
    @Body()
    body: { locationType: string; departmentId?: string; reason?: string },
    @Req() req: any,
  ) {
    const { tenantId, id: userId } = req.user;
    return this.prisma.$transaction((tx: any) =>
      this.visibility.beginTemporaryVisit(tx, {
        tenantId,
        patientId,
        locationType: body.locationType,
        departmentId: body.departmentId,
        reason: body.reason,
        createdBy: userId,
      }),
    );
  }

  @Post("locations/temporary/:locationId/end")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "End a temporary visit — patient returns to primary location" })
  endTemporary(@Param("locationId") locationId: string, @Req() req: any) {
    return this.prisma.$transaction((tx: any) =>
      this.visibility.endTemporaryVisit(tx, req.user.tenantId, locationId),
    );
  }

  @Get(":id/locations")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Patient location history (audit chain)" })
  async locationHistory(@Param("id") patientId: string, @Req() req: any) {
    await this.visibility.assertCanAccess(req.user, patientId);
    return this.visibility.getLocationHistory(req.user.tenantId, patientId);
  }
}
