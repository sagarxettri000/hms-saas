import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PermissionsService } from "./permissions.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { Public } from "../../common/decorators/permissions.decorator";

@ApiTags("Permissions")
@Controller("permissions")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: "List all permission actions" })
  listAll() {
    return this.permissionsService.listAll();
  }

  @Get("resources")
  @Public()
  @ApiOperation({ summary: "List all permission resources" })
  listResources() {
    return this.permissionsService.listResources();
  }
}
