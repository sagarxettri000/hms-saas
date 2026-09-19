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
  BloodBankService,
  CreateDonorDto,
  RegisterUnitDto,
} from "./blood-bank.service";
import { BloodChainService } from "../interop/blood-chain.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Blood Bank")
@Controller("blood-bank")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class BloodBankController {
  constructor(
    private readonly bloodBankService: BloodBankService,
    private readonly bloodChain: BloodChainService,
  ) {}

  @Get("donors")
  @Permissions(PermissionAction.VIEW)
  findDonors(@Query() query: any, @Req() req: any) {
    return this.bloodBankService.findDonors(req.user.tenantId, {
      bloodGroup: query.bloodGroup,
      search: query.search,
    });
  }

  @Post("donors")
  @Permissions(PermissionAction.CREATE)
  createDonor(@Body() dto: CreateDonorDto, @Req() req: any) {
    return this.bloodBankService.createDonor(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("donors/:id")
  @Permissions(PermissionAction.VIEW)
  getDonor(@Param("id") id: string, @Req() req: any) {
    return this.bloodBankService.getDonor(req.user.tenantId, id);
  }

  @Patch("donors/:id")
  @Permissions(PermissionAction.EDIT)
  updateDonor(
    @Param("id") id: string,
    @Body() dto: Partial<CreateDonorDto> & { isActive?: boolean },
    @Req() req: any,
  ) {
    return this.bloodBankService.updateDonor(
      req.user.tenantId,
      id,
      dto,
      req.user.id,
    );
  }

  @Get("units")
  @Permissions(PermissionAction.VIEW)
  findUnits(@Query() query: any, @Req() req: any) {
    return this.bloodBankService.findUnits(req.user.tenantId, query);
  }

  @Post("units")
  @Permissions(PermissionAction.CREATE)
  registerUnit(@Body() dto: RegisterUnitDto, @Req() req: any) {
    return this.bloodBankService.registerUnit(
      req.user.tenantId,
      dto,
      req.user.id,
    );
  }

  @Get("stock")
  @Permissions(PermissionAction.VIEW)
  getStock(@Req() req: any) {
    return this.bloodBankService.getStock(req.user.tenantId);
  }

  @Patch("units/:id/issue")
  @Permissions(PermissionAction.EDIT)
  async issueUnit(
    @Param("id") id: string,
    @Body() body: { issuedTo?: string; crossMatchTo?: string },
    @Req() req: any,
  ) {
    // §82.4: rule-configured crossmatch gate before any unit leaves the bank.
    if (body.issuedTo) {
      await this.bloodChain.assertIssueAllowed(req.user.tenantId, id, body.issuedTo);
    }
    return this.bloodBankService.issueUnit(
      req.user.tenantId,
      id,
      body,
      req.user.id,
    );
  }

  @Patch("units/:id/discard")
  @Permissions(PermissionAction.EDIT)
  discardUnit(
    @Param("id") id: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    return this.bloodBankService.discardUnit(
      req.user.tenantId,
      id,
      body.reason,
      req.user.id,
    );
  }
}
