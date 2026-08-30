import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CreateStockTransferDto,
  StockTransfersService,
} from "./stock-transfers.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Procurement Stock Transfers")
@Controller("procurement/transfers")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class StockTransfersController {
  constructor(private readonly service: StockTransfersService) {}

  @Post()
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Record a stock transfer between stores" })
  create(@Body() dto: CreateStockTransferDto, @Req() req: any) {
    return this.service.create(req.user.tenantId, dto, req.user.id);
  }

  @Get()
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List stock transfers" })
  findAll(@Query() query: any, @Req() req: any) {
    return this.service.findAll(req.user.tenantId, query);
  }
}
