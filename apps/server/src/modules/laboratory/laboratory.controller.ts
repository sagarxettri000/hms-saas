import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  LaboratoryService,
  CreateLabTestDto,
  CreateLabOrderDto,
  LabOrderSearchParams,
} from "./laboratory.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Laboratory")
@Controller("lab")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class LaboratoryController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  // ---------- Catalog ----------

  @Get("tests")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List lab test catalog" })
  findTests(@Query() query: any, @Req() req: any) {
    return this.laboratoryService.findTests(req.user.tenantId, query);
  }

  @Post("tests")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a lab test" })
  createTest(@Body() dto: CreateLabTestDto, @Req() req: any) {
    return this.laboratoryService.createTest(req.user.tenantId, dto);
  }

  @Get("tests/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get lab test" })
  findTestById(@Param("id") id: string, @Req() req: any) {
    return this.laboratoryService.findTestById(req.user.tenantId, id);
  }

  @Patch("tests/:id")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update lab test" })
  updateTest(
    @Param("id") id: string,
    @Body() dto: Partial<CreateLabTestDto>,
    @Req() req: any,
  ) {
    return this.laboratoryService.updateTest(req.user.tenantId, id, dto);
  }

  // ---------- Orders ----------

  @Post("orders")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create a lab order" })
  createOrder(@Body() dto: CreateLabOrderDto, @Req() req: any) {
    return this.laboratoryService.createOrder(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("orders")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List lab orders" })
  findOrders(@Query() query: LabOrderSearchParams, @Req() req: any) {
    return this.laboratoryService.findOrders(req.user.tenantId, query);
  }

  @Get("orders/pending-results")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Orders awaiting results" })
  getPending(@Req() req: any) {
    return this.laboratoryService.getPendingResultOrders(req.user.tenantId);
  }

  @Get("orders/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get lab order with items and samples" })
  findOrderById(@Param("id") id: string, @Req() req: any) {
    return this.laboratoryService.findOrderById(req.user.tenantId, id);
  }

  @Post("orders/:id/sample")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Add a sample to the order" })
  addSample(
    @Param("id") id: string,
    @Body()
    dto: { specimenType: string; container?: string; quantity?: string },
    @Req() req: any,
  ) {
    return this.laboratoryService.addSample(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Patch("orders/:id/status")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Transition order status" })
  transitionStatus(
    @Param("id") id: string,
    @Body() body: { status: string },
    @Req() req: any,
  ) {
    return this.laboratoryService.transitionStatus(
      req.user.tenantId,
      id,
      body.status,
      req.user.id,
    );
  }

  @Patch("orders/:id/items/:itemId/result")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Enter result for an order item" })
  enterResult(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body()
    dto: {
      result?: string;
      resultValue?: number;
      unit?: string;
      referenceRange?: string;
      isAbnormal?: boolean;
      isCritical?: boolean;
      notes?: string;
    },
    @Req() req: any,
  ) {
    return this.laboratoryService.enterResult(
      req.user.tenantId,
      id,
      itemId,
      dto,
      req.user.id,
    );
  }

  @Post("orders/:id/verify")
  @Permissions(PermissionAction.VERIFY)
  @ApiOperation({ summary: "Verify results" })
  verify(@Param("id") id: string, @Req() req: any) {
    return this.laboratoryService.transitionStatus(
      req.user.tenantId,
      id,
      "VERIFIED",
      req.user.id,
    );
  }

  @Post("orders/:id/approve")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Approve results" })
  approve(@Param("id") id: string, @Req() req: any) {
    return this.laboratoryService.transitionStatus(
      req.user.tenantId,
      id,
      "APPROVED",
      req.user.id,
    );
  }

  @Post("orders/:id/report")
  @Permissions(PermissionAction.SIGN)
  @ApiOperation({ summary: "Mark as reported" })
  report(@Param("id") id: string, @Req() req: any) {
    return this.laboratoryService.transitionStatus(
      req.user.tenantId,
      id,
      "REPORTED",
      req.user.id,
    );
  }

  @Get("orders/:id/pdf")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Download lab report PDF" })
  async downloadReportPdf(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const buffer = await this.laboratoryService.generateReportPdf(
      req.user.tenantId,
      id,
      req.user.id,
    );
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="lab-report-${id.slice(0, 8)}.pdf"`,
    });
    res.send(buffer);
  }

  @Patch("orders/:id/samples/:sampleId/reject")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Reject a sample" })
  rejectSample(
    @Param("id") id: string,
    @Param("sampleId") sampleId: string,
    @Body() body: { reason: string; note?: string },
    @Req() req: any,
  ) {
    return this.laboratoryService.rejectSample(
      req.user.tenantId,
      id,
      sampleId,
      body.reason,
      body.note,
      req.user.id,
    );
  }

  @Get("summary")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Lab module summary stats" })
  getSummary(@Req() req: any) {
    return this.laboratoryService.getLabSummary(req.user.tenantId);
  }
}
