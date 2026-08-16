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
  MembershipService,
  CreatePackageDto,
  CreateMembershipDto,
  CreateFamilyMemberDto,
} from "./membership.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Membership")
@Controller("memberships")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get("packages")
  @Permissions(PermissionAction.VIEW)
  findPackages(@Req() req: any) {
    return this.membershipService.findPackages(req.user.tenantId);
  }

  @Post("packages")
  @Permissions(PermissionAction.CREATE)
  createPackage(@Body() dto: CreatePackageDto, @Req() req: any) {
    return this.membershipService.createPackage(req.user.tenantId, dto);
  }

  @Patch("packages/:id")
  @Permissions(PermissionAction.EDIT)
  updatePackage(
    @Param("id") id: string,
    @Body() dto: Partial<CreatePackageDto>,
    @Req() req: any,
  ) {
    return this.membershipService.updatePackage(req.user.tenantId, id, dto);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  findMemberships(@Query("patientId") patientId: string, @Req() req: any) {
    return this.membershipService.findMemberships(req.user.tenantId, patientId);
  }

  @Post()
  @Permissions(PermissionAction.CREATE)
  createMembership(@Body() dto: CreateMembershipDto, @Req() req: any) {
    return this.membershipService.createMembership(req.user.tenantId, dto);
  }

  @Get("number/:membershipNumber")
  @Permissions(PermissionAction.VIEW)
  getMembershipByNumber(
    @Param("membershipNumber") membershipNumber: string,
    @Req() req: any,
  ) {
    return this.membershipService.getMembershipByNumber(
      req.user.tenantId,
      membershipNumber,
    );
  }

  @Patch(":id/status")
  @Permissions(PermissionAction.EDIT)
  updateMembershipStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    return this.membershipService.updateMembershipStatus(
      req.user.tenantId,
      id,
      body.status,
    );
  }

  @Post(":id/family")
  @Permissions(PermissionAction.CREATE)
  addFamilyMember(
    @Param("id") id: string,
    @Body() dto: CreateFamilyMemberDto,
    @Req() req: any,
  ) {
    return this.membershipService.addFamilyMember(req.user.tenantId, id, dto);
  }
}
