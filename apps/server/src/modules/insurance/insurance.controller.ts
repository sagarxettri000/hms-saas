import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  InsuranceService,
  CreateProviderDto,
  CreatePolicyDto,
  CreateClaimDto,
} from "./insurance.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Insurance")
@Controller("insurance")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Get("providers")
  @Permissions(PermissionAction.VIEW)
  findProviders(@Req() req: any) {
    return this.insuranceService.findProviders(req.user.tenantId);
  }

  @Post("providers")
  @Permissions(PermissionAction.CREATE)
  createProvider(@Body() dto: CreateProviderDto, @Req() req: any) {
    return this.insuranceService.createProvider(req.user.tenantId, dto);
  }

  @Patch("providers/:id")
  @Permissions(PermissionAction.EDIT)
  updateProvider(
    @Param("id") id: string,
    @Body() dto: Partial<CreateProviderDto>,
    @Req() req: any,
  ) {
    return this.insuranceService.updateProvider(req.user.tenantId, id, dto);
  }

  @Get("policies")
  @Permissions(PermissionAction.VIEW)
  findPolicies(@Query("patientId") patientId: string, @Req() req: any) {
    return this.insuranceService.findPolicies(req.user.tenantId, patientId);
  }

  @Post("policies")
  @Permissions(PermissionAction.CREATE)
  createPolicy(@Body() dto: CreatePolicyDto, @Req() req: any) {
    return this.insuranceService.createPolicy(req.user.tenantId, dto);
  }

  @Patch("policies/:id")
  @Permissions(PermissionAction.EDIT)
  updatePolicy(
    @Param("id") id: string,
    @Body() dto: Partial<CreatePolicyDto>,
    @Req() req: any,
  ) {
    return this.insuranceService.updatePolicy(req.user.tenantId, id, dto);
  }

  @Get("claims")
  @Permissions(PermissionAction.VIEW)
  findClaims(@Query("patientId") patientId: string, @Req() req: any) {
    return this.insuranceService.findClaims(req.user.tenantId, patientId);
  }

  @Post("claims")
  @Permissions(PermissionAction.CREATE)
  createClaim(@Body() dto: CreateClaimDto, @Req() req: any) {
    return this.insuranceService.createClaim(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Patch("claims/:id/status")
  @Permissions(PermissionAction.APPROVE)
  updateClaimStatus(
    @Param("id") id: string,
    @Body()
    body: { status: string; approvedAmount?: number; rejectionReason?: string },
    @Req() req: any,
  ) {
    return this.insuranceService.updateClaimStatus(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }
}
