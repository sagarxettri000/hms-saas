import {
  Body,
  BadRequestException,
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

const SAFE_UPLOAD_TYPES = new Set([
  "application/dicom",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function assertSafeUpload(
  file: UploadedFileLike | undefined,
): asserts file is UploadedFileLike {
  if (!file?.buffer?.length) {
    throw new BadRequestException("A non-empty file is required");
  }
  if (!SAFE_UPLOAD_TYPES.has(file.mimetype.toLowerCase())) {
    throw new BadRequestException("Unsupported or unsafe file type");
  }
  if (file.originalname.length > 180) {
    throw new BadRequestException("File name is too long");
  }

  const type = file.mimetype.toLowerCase();
  const signature = file.buffer.subarray(0, 8).toString("hex");
  const isPdf =
    type === "application/pdf" &&
    file.buffer.subarray(0, 5).toString() === "%PDF-";
  const isPng = type === "image/png" && signature === "89504e470d0a1a0a";
  const isJpeg = type === "image/jpeg" && signature.startsWith("ffd8ff");
  const isWebp =
    type === "image/webp" &&
    file.buffer.subarray(0, 4).toString() === "RIFF" &&
    file.buffer.subarray(8, 12).toString() === "WEBP";
  const isDicom =
    type === "application/dicom" &&
    file.buffer.length >= 132 &&
    file.buffer.subarray(128, 132).toString() === "DICM";
  if (!(isPdf || isPng || isJpeg || isWebp || isDicom)) {
    throw new BadRequestException("File content does not match its declared type");
  }
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
    assertSafeUpload(file);
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
