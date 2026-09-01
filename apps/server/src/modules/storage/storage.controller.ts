import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { StorageService } from "./storage.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";

interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@ApiTags("Storage")
@Controller("storage")
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post("upload")
  @Permissions(PermissionAction.CREATE)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiOperation({ summary: "Upload a file to object storage" })
  async upload(
    @Req() req: Request,
    @UploadedFile() file: UploadedFileLike,
    @Body("folder") folder?: string,
  ) {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException("Tenant context is required");
    }
    const safeFolder = (folder || "uploads")
      .replace(/[^a-zA-Z0-9-_/]/g, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    const key = `${tenantId}/${safeFolder}/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const result = await this.storageService.put(
      key,
      file.buffer,
      file.mimetype,
    );
    return result;
  }

  @Get("file/:key")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Read a file from object storage" })
  async read(@Req() req: Request, @Param("key") key: string) {
    this.assertTenantKey(req, key);
    const { data, contentType } = await this.storageService.get(key);
    return new StreamableFile(data, {
      type: contentType,
      disposition: "attachment",
    });
  }

  @Delete("file/:key")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a file from object storage" })
  async remove(@Req() req: Request, @Param("key") key: string) {
    this.assertTenantKey(req, key);
    await this.storageService.delete(key);
    return { deleted: true };
  }

  private assertTenantKey(req: Request, key: string): void {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId || !key.startsWith(`${tenantId}/`)) {
      throw new ForbiddenException("Access denied to this file");
    }
  }
}
