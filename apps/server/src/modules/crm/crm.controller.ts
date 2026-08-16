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
  CrmService,
  CreateEnquiryDto,
  CreateTourismCaseDto,
  CreateBlogPostDto,
} from "./crm.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("CRM")
@Controller("crm")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get("enquiries")
  @Permissions(PermissionAction.VIEW)
  findEnquiries(@Query() query: any, @Req() req: any) {
    return this.crmService.findEnquiries(req.user.tenantId, query);
  }

  @Post("enquiries")
  @Permissions(PermissionAction.CREATE)
  createEnquiry(@Body() dto: CreateEnquiryDto, @Req() req: any) {
    return this.crmService.createEnquiry(req.user.tenantId, dto);
  }

  @Patch("enquiries/:id")
  @Permissions(PermissionAction.EDIT)
  updateEnquiry(
    @Param("id") id: string,
    @Body() dto: Partial<CreateEnquiryDto>,
    @Req() req: any,
  ) {
    return this.crmService.updateEnquiry(req.user.tenantId, id, dto);
  }

  @Patch("enquiries/:id/convert")
  @Permissions(PermissionAction.EDIT)
  convertEnquiry(
    @Param("id") id: string,
    @Body() body: { patientId: string },
    @Req() req: any,
  ) {
    return this.crmService.convertEnquiry(
      req.user.tenantId,
      id,
      body.patientId,
    );
  }

  @Get("tourism")
  @Permissions(PermissionAction.VIEW)
  findTourismCases(@Req() req: any) {
    return this.crmService.findTourismCases(req.user.tenantId);
  }

  @Post("tourism")
  @Permissions(PermissionAction.CREATE)
  createTourismCase(@Body() dto: CreateTourismCaseDto, @Req() req: any) {
    return this.crmService.createTourismCase(req.user.tenantId, dto);
  }

  @Patch("tourism/:id")
  @Permissions(PermissionAction.EDIT)
  updateTourismCase(
    @Param("id") id: string,
    @Body() dto: Partial<CreateTourismCaseDto>,
    @Req() req: any,
  ) {
    return this.crmService.updateTourismCase(req.user.tenantId, id, dto);
  }

  @Get("blog")
  @Permissions(PermissionAction.VIEW)
  findBlogPosts(@Query("status") status: string, @Req() req: any) {
    return this.crmService.findBlogPosts(req.user.tenantId, status);
  }

  @Post("blog")
  @Permissions(PermissionAction.CREATE)
  createBlogPost(@Body() dto: CreateBlogPostDto, @Req() req: any) {
    return this.crmService.createBlogPost(req.user.tenantId, dto);
  }

  @Patch("blog/:id")
  @Permissions(PermissionAction.EDIT)
  updateBlogPost(
    @Param("id") id: string,
    @Body() dto: Partial<CreateBlogPostDto>,
    @Req() req: any,
  ) {
    return this.crmService.updateBlogPost(req.user.tenantId, id, dto);
  }
}
