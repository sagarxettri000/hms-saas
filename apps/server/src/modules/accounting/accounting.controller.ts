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
  AccountingService,
  CreateAccountDto,
  CreateJournalEntryDto,
  OpenCashSessionDto,
  CreateHandoverDto,
} from "./accounting.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import {
  Permissions,
  Roles,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction, UserRole } from "@hms/shared";

@ApiTags("Accounting")
@Controller("accounting")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard, RolesGuard)
@Roles(
  UserRole.RECEPTIONIST,
  UserRole.RECEPTION_SUPERVISOR,
  UserRole.FINANCE_MANAGER,
  UserRole.HOSPITAL_ADMIN,
  UserRole.HOSPITAL_OWNER,
  UserRole.PLATFORM_SUPER_ADMIN,
  UserRole.IT_ADMIN,
)
@TenantScoped()
@ApiBearerAuth()
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get("accounts")
  @Permissions(PermissionAction.VIEW)
  findAccounts(@Query("type") type: string, @Req() req: any) {
    return this.accountingService.findAccounts(req.user.tenantId, type);
  }

  @Post("accounts")
  @Permissions(PermissionAction.CREATE)
  createAccount(@Body() dto: CreateAccountDto, @Req() req: any) {
    return this.accountingService.createAccount(req.user.tenantId, dto);
  }

  @Patch("accounts/:id")
  @Permissions(PermissionAction.EDIT)
  updateAccount(
    @Param("id") id: string,
    @Body() dto: Partial<CreateAccountDto>,
    @Req() req: any,
  ) {
    return this.accountingService.updateAccount(req.user.tenantId, id, dto);
  }

  @Get("journal")
  @Permissions(PermissionAction.VIEW)
  findJournalEntries(@Query() query: any, @Req() req: any) {
    return this.accountingService.findJournalEntries(req.user.tenantId, query);
  }

  @Post("journal")
  @Permissions(PermissionAction.CREATE)
  createJournalEntry(@Body() dto: CreateJournalEntryDto, @Req() req: any) {
    return this.accountingService.createJournalEntry(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("trial-balance")
  @Permissions(PermissionAction.VIEW)
  getTrialBalance(@Req() req: any) {
    return this.accountingService.getTrialBalance(req.user.tenantId);
  }

  @Get("cash-sessions")
  @Permissions(PermissionAction.VIEW)
  findCashSessions(@Query("userId") userId: string, @Req() req: any) {
    return this.accountingService.findCashSessions(req.user.tenantId, userId);
  }

  @Post("cash-sessions/open")
  @Permissions(PermissionAction.CREATE)
  openCashSession(@Body() dto: OpenCashSessionDto, @Req() req: any) {
    return this.accountingService.openCashSession(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Patch("cash-sessions/:id/close")
  @Permissions(PermissionAction.EDIT)
  closeCashSession(
    @Param("id") id: string,
    @Body() body: { closingCash?: number },
    @Req() req: any,
  ) {
    return this.accountingService.closeCashSession(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Get("handovers")
  @Permissions(PermissionAction.VIEW)
  findHandovers(@Req() req: any) {
    return this.accountingService.findHandovers(req.user.tenantId);
  }

  @Post("handovers")
  @Permissions(PermissionAction.CREATE)
  createHandover(@Body() dto: CreateHandoverDto, @Req() req: any) {
    return this.accountingService.createHandover(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Patch("handovers/:id/confirm")
  @Permissions(PermissionAction.EDIT)
  confirmHandover(@Param("id") id: string, @Req() req: any) {
    return this.accountingService.confirmHandover(
      req.user.tenantId,
      id,
      req.user.id,
    );
  }
}
