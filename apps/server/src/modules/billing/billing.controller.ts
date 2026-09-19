import {
  Body,
  Controller,
  Delete,
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
  BillingService,
  CreateInvoiceDto,
  CreatePaymentDto,
  CreateRefundDto,
  CreateDepositDto,
  CreateBillingServiceDto,
  UpdateBillingServiceDto,
  CloseDayDto,
} from "./billing.service";
import { DischargeBillingService } from "./discharge-billing.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { ForbidRolesGuard } from "../../common/guards/forbid-roles.guard";
import {
  ForbidRoles,
  Permissions,
  Roles,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction, UserRole } from "@hms/shared";

@ApiTags("Billing")
@Controller("billing")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard, ForbidRolesGuard)
@ForbidRoles(UserRole.DOCTOR, UserRole.NURSE)
@TenantScoped()
@ApiBearerAuth()
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly dischargeBillingService: DischargeBillingService,
  ) {}

  // ---------- Invoices ----------

  @Get("invoices")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List invoices" })
  findInvoices(@Query() query: any, @Req() req: any) {
    return this.billingService.findInvoices(req.user.tenantId, query);
  }

  @Post("invoices")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Create invoice" })
  createInvoice(@Body() dto: CreateInvoiceDto, @Req() req: any) {
    return this.billingService.createInvoice(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("invoices/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get invoice" })
  findInvoiceById(@Param("id") id: string, @Req() req: any) {
    return this.billingService.findInvoiceById(req.user.tenantId, id);
  }

  @Post("invoices/refresh-overdue")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Refresh overdue invoice statuses" })
  refreshOverdue(@Req() req: any) {
    return this.billingService.refreshOverdueStatus(req.user.tenantId);
  }

  @Patch("invoices/:id/finalize")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Finalize invoice — freezes it and persists revenue allocations" })
  finalizeInvoice(@Param("id") id: string, @Req() req: any) {
    return this.billingService.finalizeInvoice(req.user.tenantId, id, req.user.id);
  }

  @Patch("invoices/:id/discount")
  @Permissions(PermissionAction.DISCOUNT)
  @ApiOperation({ summary: "Apply discount to invoice" })
  applyDiscount(
    @Param("id") id: string,
    @Body() body: { amount: number; reason?: string },
    @Req() req: any,
  ) {
    return this.billingService.applyDiscount(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Patch("invoices/:id/discount/approval")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Approve or reject a pending discount" })
  approveDiscount(
    @Param("id") id: string,
    @Body() body: { approve: boolean; reason?: string },
    @Req() req: any,
  ) {
    return this.billingService.approveDiscount(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Patch("invoices/:id/cancel")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Cancel invoice" })
  cancelInvoice(
    @Param("id") id: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    return this.billingService.cancelInvoice(
      req.user.tenantId,
      id,
      body.reason || "Cancelled",
      req.user.id,
    );
  }

  @Post("invoices/:id/reprint")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Log receipt reprint" })
  reprintInvoice(@Param("id") id: string, @Req() req: any) {
    return this.billingService.reprintInvoice(
      req.user.tenantId,
      id,
      req.user.id,
    );
  }

  @Get("invoices/:id/pdf")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Download invoice PDF" })
  async downloadInvoicePdf(
    @Param("id") id: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const { buffer, filename } = await this.billingService.generateInvoicePdf(
      req.user.tenantId,
      id,
      req.user.id,
    );
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Get("invoices/:id/receipt")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Download payment receipt PDF" })
  async downloadReceiptPdf(
    @Param("id") id: string,
    @Query("paymentId") paymentId: string | undefined,
    @Req() req: any,
    @Res() res: any,
  ) {
    const { buffer, filename } = await this.billingService.generateReceiptPdf(
      req.user.tenantId,
      id,
      paymentId,
      req.user.id,
    );
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  // ---------- Payments ----------

  @Get("payments")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List payments" })
  findPayments(@Query() query: any, @Req() req: any) {
    return this.billingService.findPayments(req.user.tenantId, query);
  }

  @Post("payments")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Record payment" })
  createPayment(@Body() dto: CreatePaymentDto, @Req() req: any) {
    return this.billingService.createPayment(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Post("deposits")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Receive deposit" })
  createDeposit(@Body() dto: CreateDepositDto, @Req() req: any) {
    return this.billingService.createDeposit(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Post("deposits/:id/apply")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Apply deposit to invoice" })
  applyDeposit(
    @Param("id") id: string,
    @Body() body: { invoiceId: string; amount: number },
    @Req() req: any,
  ) {
    return this.billingService.applyDepositToInvoice(
      req.user.tenantId,
      id,
      body.invoiceId,
      body.amount,
      req.user.id,
    );
  }

  @Post("deposits/:id/refund")
  @Permissions(PermissionAction.REFUND)
  @Roles(
    UserRole.FINANCE_MANAGER,
    UserRole.HOSPITAL_ADMIN,
    UserRole.HOSPITAL_OWNER,
    UserRole.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: "Refund deposit balance" })
  refundDeposit(
    @Param("id") id: string,
    @Body()
    body: {
      amount: number;
      reason: string;
      refundMethod?: string;
      referenceNumber?: string;
      notes?: string;
    },
    @Req() req: any,
  ) {
    return this.billingService.refundDeposit(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Get("deposits")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List deposits" })
  findDeposits(@Query() query: any, @Req() req: any) {
    return this.billingService.findDeposits(req.user.tenantId, query);
  }

  @Get("patients/:patientId/deposits")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get patient deposits" })
  getPatientDeposits(@Param("patientId") patientId: string, @Req() req: any) {
    return this.billingService.getPatientDeposits(req.user.tenantId, patientId);
  }

  @Get("deposits/:id/transactions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get deposit transactions" })
  getDepositTransactions(@Param("id") id: string, @Req() req: any) {
    return this.billingService.getDepositTransactions(req.user.tenantId, id);
  }

  // ---------- Billing Services (Catalog) ----------

  @Get("service-categories")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List service categories" })
  findServiceCategories(@Query() query: any, @Req() req: any) {
    return this.billingService.findServiceCategories(req.user.tenantId, query);
  }

  @Post("service-categories")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Create service category" })
  createServiceCategory(@Body() body: any, @Req() req: any) {
    return this.billingService.createServiceCategory(
      req.user.tenantId,
      body,
      req.user.id,
    );
  }

  @Get("service-categories/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get service category with services" })
  findServiceCategoryById(@Param("id") id: string, @Req() req: any) {
    return this.billingService.findServiceCategoryById(req.user.tenantId, id);
  }

  @Patch("service-categories/:id")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Update service category" })
  updateServiceCategory(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.billingService.updateServiceCategory(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Get("services")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List billing services" })
  findBillingServices(@Query() query: any, @Req() req: any) {
    return this.billingService.findBillingServices(req.user.tenantId, query);
  }

  @Post("services")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Create billing service" })
  createBillingService(@Body() dto: CreateBillingServiceDto, @Req() req: any) {
    return this.billingService.createBillingService(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("services/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get billing service" })
  findBillingServiceById(@Param("id") id: string, @Req() req: any) {
    return this.billingService.findBillingServiceById(req.user.tenantId, id);
  }

  @Patch("services/:id")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Update billing service" })
  updateBillingService(
    @Param("id") id: string,
    @Body() dto: UpdateBillingServiceDto,
    @Req() req: any,
  ) {
    return this.billingService.updateBillingService(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  // ---------- Billing Schemes ----------

  @Get("schemes")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List billing schemes" })
  findBillingSchemes(@Query() query: any, @Req() req: any) {
    return this.billingService.findBillingSchemes(req.user.tenantId, query);
  }

  @Post("schemes")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Create billing scheme" })
  createBillingScheme(@Body() body: any, @Req() req: any) {
    return this.billingService.createBillingScheme(
      req.user.tenantId,
      body,
      req.user.id,
    );
  }

  @Get("schemes/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get billing scheme" })
  findBillingSchemeById(@Param("id") id: string, @Req() req: any) {
    return this.billingService.findBillingSchemeById(req.user.tenantId, id);
  }

  @Patch("schemes/:id")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Update billing scheme" })
  updateBillingScheme(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.billingService.updateBillingScheme(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Delete("schemes/:id")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Delete billing scheme" })
  removeBillingScheme(@Param("id") id: string, @Req() req: any) {
    return this.billingService.removeBillingScheme(
      req.user.tenantId,
      id,
      req.user.id,
    );
  }

  // ---------- Billing Settings ----------

  @Get("settings")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get billing settings" })
  getBillingSettings(@Req() req: any) {
    return this.billingService.getBillingSettings(req.user.tenantId);
  }

  @Patch("settings/:key")
  @Permissions(PermissionAction.CONFIGURE)
  @ApiOperation({ summary: "Update billing setting" })
  updateBillingSetting(
    @Param("key") key: string,
    @Body() body: { value: any },
    @Req() req: any,
  ) {
    return this.billingService.updateBillingSetting(
      req.user.tenantId,
      key,
      body.value,
      req.user.id,
    );
  }

  // ---------- Financial Transactions ----------

  @Get("transactions")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List financial transactions" })
  findFinancialTransactions(@Query() query: any, @Req() req: any) {
    return this.billingService.findFinancialTransactions(
      req.user.tenantId,
      query,
    );
  }

  // ---------- Daily Closing ----------

  @Post("daily-closings")
  @Permissions(PermissionAction.APPROVE)
  @Roles(
    UserRole.FINANCE_MANAGER,
    UserRole.HOSPITAL_ADMIN,
    UserRole.HOSPITAL_OWNER,
    UserRole.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: "Close day (end of day)" })
  closeDay(@Body() dto: CloseDayDto, @Req() req: any) {
    return this.billingService.closeDay(req.user.tenantId, dto, req.user.id);
  }

  @Get("daily-closings")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List daily closings" })
  findDailyClosings(@Query() query: any, @Req() req: any) {
    return this.billingService.findDailyClosings(req.user.tenantId, query);
  }

  // ---------- Summary ----------

  @Get("summary")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Billing summary" })
  getBillingSummary(@Query() query: any, @Req() req: any) {
    return this.billingService.getBillingSummary(req.user.tenantId, query);
  }

  @Get("analytics")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Billing analytics dashboard" })
  getBillingAnalytics(@Req() req: any) {
    return this.billingService.getBillingAnalytics(req.user.tenantId);
  }

  // ---------- Refunds ----------

  @Get("refunds")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List refunds" })
  findRefunds(@Query() query: any, @Req() req: any) {
    return this.billingService.findRefunds(req.user.tenantId, query);
  }

  @Post("refunds")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Request refund" })
  createRefund(@Body() dto: CreateRefundDto, @Req() req: any) {
    return this.billingService.createRefund(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Patch("refunds/:id/approve")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({ summary: "Approve and process refund" })
  approveRefund(@Param("id") id: string, @Req() req: any) {
    return this.billingService.approveRefund(
      req.user.tenantId,
      id,
      req.user.id,
    );
  }

  // ---------- Credit ----------

  @Get("credit-accounts")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List credit accounts" })
  getCreditAccounts(@Req() req: any) {
    return this.billingService.getCreditAccounts(req.user.tenantId);
  }

  @Get("patients/:patientId/credit")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get patient credit account" })
  getPatientCredit(@Param("patientId") patientId: string, @Req() req: any) {
    return this.billingService.getPatientCredit(req.user.tenantId, patientId);
  }

  @Patch("credit-accounts/:id/settle")
  @Permissions(PermissionAction.SETTLE)
  @Roles(
    UserRole.FINANCE_MANAGER,
    UserRole.HOSPITAL_ADMIN,
    UserRole.HOSPITAL_OWNER,
    UserRole.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: "Settle credit account" })
  settleCredit(@Param("id") id: string, @Req() req: any) {
    return this.billingService.settleCredit(req.user.tenantId, id, req.user.id);
  }

  // ---------- Discharge Billing ----------

  @Get("discharge/bills")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List discharge bills" })
  findDischargeBills(@Query() query: any, @Req() req: any) {
    return this.dischargeBillingService.findBills(req.user.tenantId, query);
  }

  @Get("discharge/bills/draft/:admissionId")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get or create draft discharge bill for admission" })
  getDraftBill(@Param("admissionId") admissionId: string, @Req() req: any) {
    return this.dischargeBillingService.getDraftBill(
      req.user.tenantId,
      admissionId,
    );
  }

  @Post("discharge/bills")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({
    summary: "Create discharge bill draft with auto-collected charges",
  })
  createDischargeBill(@Body() dto: any, @Req() req: any) {
    return this.dischargeBillingService.createDraftBill(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("discharge/bills/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get discharge bill details" })
  getDischargeBill(@Param("id") id: string, @Req() req: any) {
    return this.dischargeBillingService.getBill(req.user.tenantId, id);
  }

  @Post("discharge/bills/:id/charges")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Add manual charge to draft bill" })
  addManualCharge(@Param("id") id: string, @Body() dto: any, @Req() req: any) {
    return this.dischargeBillingService.addManualCharge(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Delete("discharge/bills/:id/charges/:detailId")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Remove charge from draft bill" })
  removeCharge(
    @Param("id") id: string,
    @Param("detailId") detailId: string,
    @Req() req: any,
  ) {
    return this.dischargeBillingService.removeCharge(
      req.user.tenantId,
      id,
      detailId,
      req.user.id,
    );
  }

  @Patch("discharge/bills/:id/discount")
  @Permissions(PermissionAction.DISCOUNT)
  @ApiOperation({ summary: "Apply discount to draft discharge bill" })
  applyDischargeDiscount(
    @Param("id") id: string,
    @Body() body: { amount: number; reason: string },
    @Req() req: any,
  ) {
    return this.dischargeBillingService.applyDiscount(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Post("discharge/bills/:id/finalize")
  @Permissions(PermissionAction.APPROVE)
  @ApiOperation({
    summary: "Finalize discharge bill (server-side calculation, lock)",
  })
  finalizeDischargeBill(@Param("id") id: string, @Req() req: any) {
    return this.dischargeBillingService.finalizeBill(
      req.user.tenantId,
      id,
      req.user.id,
    );
  }

  @Patch("discharge/bills/:id/cancel")
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Cancel draft discharge bill" })
  cancelDischargeBill(
    @Param("id") id: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    return this.dischargeBillingService.cancelBill(
      req.user.tenantId,
      id,
      body.reason,
      req.user.id,
    );
  }

  @Post("discharge/bills/:id/payments")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Record payment against discharge bill" })
  recordDischargePayment(
    @Param("id") id: string,
    @Body() dto: any,
    @Req() req: any,
  ) {
    return this.dischargeBillingService.recordPayment(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }
}
