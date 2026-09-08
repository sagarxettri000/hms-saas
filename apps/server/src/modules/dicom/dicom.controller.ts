import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { TenantGuard } from "../../common/guards/tenant.guard";
import {
  Permissions,
  TenantScoped,
} from "../../common/decorators/permissions.decorator";
import { PermissionAction } from "@hms/shared";
import { DicomService, DicomUploadFile, StudySearchParams } from "./dicom.service";
import { DicomWebService } from "./dicomweb.service";

@ApiTags("DICOM")
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard, TenantGuard)
@TenantScoped()
@ApiBearerAuth()
export class DicomController {
  constructor(
    private readonly dicomService: DicomService,
    private readonly dicomWeb: DicomWebService,
  ) {}

  @Post("dicom/upload")
  @Permissions(PermissionAction.CREATE)
  @UseInterceptors(
    FilesInterceptor("files", 50, {
      limits: { fileSize: 200 * 1024 * 1024, files: 50 },
    }),
  )
  @ApiOperation({
    summary: "Upload DICOM file(s); auto-parses study/series/instance metadata",
  })
  async upload(
    @Req() req: Request,
    @UploadedFiles() files: DicomUploadFile[],
    @Body("patientId") patientId?: string,
    @Body("radiologyOrderId") radiologyOrderId?: string,
  ) {
    const user = req.user as any;
    if (!files?.length) {
      throw new BadRequestException("No files received");
    }
    return this.dicomService.upload({
      tenantId: user.tenantId,
      userId: user.id,
      files,
      patientId,
      radiologyOrderId,
    });
  }

  @Get("dicom/studies")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List DICOM studies" })
  listStudies(@Query() query: StudySearchParams, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomService.findStudies(user.tenantId, query);
  }

  @Get("dicom/studies/:id")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Get a DICOM study with its series and instances" })
  getStudy(@Param("id") id: string, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomService.findStudy(user.tenantId, id);
  }

  @Delete("dicom/studies/:id")
  @HttpCode(200)
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Delete a DICOM study and its stored files" })
  deleteStudy(@Param("id") id: string, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomService.deleteStudy(user.tenantId, id);
  }

  @Get("dicom/studies/:studyId/instances/:instanceId/wado")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "WADO-URI-like retrieval of a single DICOM instance" })
  async wadoByInstance(
    @Param("studyId") studyId: string,
    @Param("instanceId") instanceId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as any;
    const { data, contentType } = await this.dicomWeb.wadoById(
      user.tenantId,
      studyId,
      instanceId,
    );
    res.set({ "Content-Type": contentType });
    res.send(data);
  }

  // ---- DICOMweb (STOW not exposed here; use /dicom/upload) ----

  @Get("dicomweb/studies")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "QIDO-RS: query studies" })
  qidoStudies(@Query() query: Record<string, string>, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomWeb.qidoStudies(user.tenantId, query);
  }

  @Get("dicomweb/studies/:studyUid/series/:seriesUid/instances/:instanceUid")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "WADO-RS: retrieve a DICOM instance" })
  async wadoRs(
    @Param("studyUid") studyUid: string,
    @Param("seriesUid") seriesUid: string,
    @Param("instanceUid") instanceUid: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as any;
    const { data, contentType } = await this.dicomWeb.wadoInstance(user.tenantId, {
      studyInstanceUid: studyUid,
      seriesInstanceUid: seriesUid,
      instanceUid,
    });
    res.set({
      "Content-Type": contentType,
      "Content-Disposition": 'inline; filename="instance.dcm"',
    });
    res.send(data);
  }

  @Get("dicomweb/wado")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "WADO-URI: retrieve a DICOM object" })
  async wadoUri(@Query() query: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    const { data, contentType } = await this.dicomWeb.wadoUri(user.tenantId, query);
    res.set({
      "Content-Type": contentType,
      "Content-Disposition": 'inline; filename="object.dcm"',
    });
    res.send(data);
  }

  // ---- DICOM node management (remote PACS/AE peers) ----

  @Get("dicom/nodes")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "List configured DICOM nodes" })
  listNodes(@Req() req: Request) {
    const user = req.user as any;
    return this.dicomService.listNodes(user.tenantId);
  }

  @Post("dicom/nodes")
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "Register a remote DICOM node (PACS/AE)" })
  createNode(
    @Body() body: { name: string; aeTitle: string; hostname: string; port?: number; isLocal?: boolean },
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.dicomService.createNode(user.tenantId, body);
  }

  @Post("dicom/nodes/:id")
  @HttpCode(200)
  @Permissions(PermissionAction.EDIT)
  @ApiOperation({ summary: "Update a DICOM node" })
  updateNode(
    @Param("id") id: string,
    @Body() body: { name?: string; aeTitle?: string; hostname?: string; port?: number; isLocal?: boolean },
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.dicomService.updateNode(user.tenantId, id, body);
  }

  @Delete("dicom/nodes/:id")
  @HttpCode(200)
  @Permissions(PermissionAction.DELETE)
  @ApiOperation({ summary: "Remove a DICOM node" })
  deleteNode(@Param("id") id: string, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomService.deleteNode(user.tenantId, id);
  }

  @Post("dicom/nodes/:id/echo")
  @HttpCode(200)
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "Check DICOM node reachability (TCP)" })
  echoNode(@Param("id") id: string, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomService.echoNode(user.tenantId, id);
  }
}