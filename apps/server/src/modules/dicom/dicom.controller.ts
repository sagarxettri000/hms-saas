import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
import { readRawBody } from "./multipart-related";

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

  // ---- DICOMweb ----

  // STOW-RS
  @Post("dicomweb/studies")
  @HttpCode(200)
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "STOW-RS: store DICOM instances (multipart/related)" })
  async stow(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as any;
    const contentType = String(req.headers["content-type"] || "");
    const body = await readRawBody(req);
    const result = await this.dicomWeb.stow(user.tenantId, user.id, body, contentType);
    res.set({ "Content-Type": "application/dicom+json" });
    return result;
  }

  @Post("dicomweb/studies/:studyUid")
  @HttpCode(200)
  @Permissions(PermissionAction.CREATE)
  @ApiOperation({ summary: "STOW-RS: store instances into a study (multipart/related)" })
  async stowIntoStudy(
    @Param("studyUid") studyUid: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as any;
    const contentType = String(req.headers["content-type"] || "");
    const body = await readRawBody(req);
    const result = await this.dicomWeb.stow(user.tenantId, user.id, body, contentType, studyUid);
    res.set({ "Content-Type": "application/dicom+json" });
    return result;
  }

  // QIDO-RS
  @Get("dicomweb/studies")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "QIDO-RS: query studies" })
  qidoStudies(@Query() query: Record<string, string>, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomWeb.qidoStudies(user.tenantId, query);
  }

  @Get("dicomweb/series")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "QIDO-RS: query series" })
  qidoSeriesAll(@Query() query: Record<string, string>, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomWeb.qidoSeries(user.tenantId, undefined, query);
  }

  @Get("dicomweb/studies/:studyUid/series")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "QIDO-RS: query series within a study" })
  qidoSeries(
    @Param("studyUid") studyUid: string,
    @Query() query: Record<string, string>,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.dicomWeb.qidoSeries(user.tenantId, studyUid, query);
  }

  @Get("dicomweb/instances")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "QIDO-RS: query instances across all studies" })
  qidoInstances(@Query() query: Record<string, string>, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomWeb.qidoInstances(user.tenantId, undefined, undefined, query);
  }

  @Get("dicomweb/studies/:studyUid/series/:seriesUid/instances")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "QIDO-RS: query instances within a study/series" })
  async qidoInstancesInStudy(
    @Param("studyUid") studyUid: string,
    @Param("seriesUid") seriesUid: string,
    @Query() query: Record<string, string>,
    @Headers("accept") accept: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as any;
    if ((accept || "").includes("multipart/related")) {
      const { parts } = await this.dicomWeb.retrieveSeriesInstances(
        user.tenantId,
        studyUid,
        seriesUid,
      );
      sendMultipart(res, parts);
      return;
    }
    const result = await this.dicomWeb.qidoInstances(user.tenantId, studyUid, seriesUid, query);
    res.set({ "Content-Type": "application/dicom+json" });
    res.send(JSON.stringify(result));
  }

  // WADO-RS metadata
  @Get("dicomweb/studies/:studyUid/metadata")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "WADO-RS: study metadata (application/dicom+json)" })
  async metadataStudy(@Param("studyUid") studyUid: string, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomWeb.metadataStudy(user.tenantId, studyUid);
  }

  @Get("dicomweb/series/:seriesUid/metadata")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "WADO-RS: series metadata (application/dicom+json)" })
  async metadataSeries(@Param("seriesUid") seriesUid: string, @Req() req: Request) {
    const user = req.user as any;
    return this.dicomWeb.metadataSeries(user.tenantId, seriesUid);
  }

  @Get("dicomweb/studies/:studyUid/series/:seriesUid/instances/:instanceUid/metadata")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "WADO-RS: instance metadata (application/dicom+json)" })
  async metadataInstance(
    @Param("studyUid") studyUid: string,
    @Param("seriesUid") seriesUid: string,
    @Param("instanceUid") instanceUid: string,
    @Req() req: Request,
  ) {
    const user = req.user as any;
    return this.dicomWeb.metadataInstance(user.tenantId, studyUid, seriesUid, instanceUid);
  }

  // WADO-RS object/bulk retrieval
  @Get("dicomweb/studies/:studyUid")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "WADO-RS: retrieve study (multipart) or metadata (JSON)" })
  async retrieveStudy(
    @Param("studyUid") studyUid: string,
    @Headers("accept") accept: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as any;
    if ((accept || "").includes("multipart/related")) {
      const { parts } = await this.dicomWeb.retrieveStudy(user.tenantId, studyUid);
      sendMultipart(res, parts);
      return;
    }
    const result = await this.dicomWeb.metadataStudy(user.tenantId, studyUid);
    res.set({ "Content-Type": "application/dicom+json" });
    res.send(JSON.stringify(result));
  }

  @Get("dicomweb/studies/:studyUid/series/:seriesUid")
  @Permissions(PermissionAction.VIEW)
  @ApiOperation({ summary: "WADO-RS: retrieve series instances (multipart) or metadata (JSON)" })
  async retrieveSeries(
    @Param("studyUid") studyUid: string,
    @Param("seriesUid") seriesUid: string,
    @Headers("accept") accept: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as any;
    if ((accept || "").includes("multipart/related")) {
      const { parts } = await this.dicomWeb.retrieveSeriesInstances(user.tenantId, studyUid, seriesUid);
      sendMultipart(res, parts);
      return;
    }
    const result = await this.dicomWeb.metadataSeries(user.tenantId, seriesUid);
    res.set({ "Content-Type": "application/dicom+json" });
    res.send(JSON.stringify(result));
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

function sendMultipart(
  res: Response,
  parts: { data: Buffer; contentType: string }[],
) {
  const boundary = `--hms-dicomweb-${Date.now()}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `\r\n--${boundary}\r\nContent-Type: ${part.contentType}\r\nContent-Length: ${part.data.length}\r\n\r\n`,
        "utf8",
      ),
    );
    chunks.push(part.data);
  }
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"));
  res.set({
    "Content-Type": `multipart/related; type="application/dicom"; boundary=${boundary}`,
  });
  res.send(Buffer.concat(chunks));
}