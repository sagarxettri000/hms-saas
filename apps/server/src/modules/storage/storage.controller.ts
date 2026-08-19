import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
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
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload a file to object storage" })
  async upload(
    @UploadedFile() file: UploadedFileLike,
    @Body("folder") folder?: string,
  ) {
    const safeFolder = (folder || "uploads")
      .replace(/[^a-zA-Z0-9-_/]/g, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    const key = `${safeFolder}/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const result = await this.storageService.put(key, file.buffer, file.mimetype);
    return result;
  }

  @Get("file/:key")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Read a file from object storage" })
  async read(@Param("key") key: string) {
    const { data, contentType } = await this.storageService.get(key);
    return new StreamableFile(data, { type: contentType });
  }

  @Delete("file/:key")
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a file from object storage" })
  async remove(@Param("key") key: string) {
    await this.storageService.delete(key);
    return { deleted: true };
  }
}
