import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CatalogService } from "./catalog.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

@ApiTags("Catalog")
@Controller("catalog")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("icd10")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Search the ICD-10 reference catalog" })
  async icd10(
    @Req() req: any,
    @Query("search") search?: string,
    @Query("limit") limit?: string,
  ) {
    return this.catalogService.searchIcd10(search, Number(limit) || 25);
  }

  @Get("lab-tests")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List tenant lab test catalog" })
  async labTests(@Req() req: any, @Query("search") search?: string) {
    return this.catalogService.labTests(req.user.tenantId, search);
  }

  @Get("medicines")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List tenant medicine catalog" })
  async medicines(@Req() req: any, @Query("search") search?: string) {
    return this.catalogService.medicines(req.user.tenantId, search);
  }
}
