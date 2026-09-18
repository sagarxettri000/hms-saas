import { BadRequestException } from "@nestjs/common";
import { DicomWebService } from "./dicomweb.service";
import { DicomService } from "./dicom.service";
import { buildDicomP10File } from "./dicom-sample-file";
import { parseMultipartRelated } from "./multipart-related";

function makeStorage() {
  const store = new Map<string, Buffer>();
  const contentType = new Map<string, string>();
  return {
    store,
    contentType,
    put: jest.fn(async (key: string, data: Buffer, type: string) => {
      store.set(key, data);
      contentType.set(key, type);
      return { key, size: data.length };
    }),
    get: jest.fn(async (key: string) => ({
      data: store.get(key) || Buffer.from([]),
      contentType: contentType.get(key) ?? "application/dicom",
    })),
    delete: jest.fn(async () => ({ deleted: true })),
  };
}

function makePrisma() {
  const studies: any[] = [];
  return {
    dicomStudy: {
      upsert: jest.fn(async ({ create, update }) => {
        const record = { id: "study-1", ...create, ...update };
        studies.push(record);
        return create || update;
      }),
      update: jest.fn(async ({ data }: any) => ({ id: "study-1", ...data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    dicomSeries: {
      upsert: jest.fn(async ({ create, update }) => ({
        id: "series-1",
        ...create,
        ...update,
      })),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    dicomInstance: {
      upsert: jest.fn(async ({ create, update }) => ({
        id: "instance-1",
        ...create,
        ...update,
      })),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    patient: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    radiologyOrder: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function withStoredInstance(
  prisma: ReturnType<typeof makePrisma>,
  storage: ReturnType<typeof makeStorage>,
) {
  const key = "t1/dicom/study-uid/series-uid/instance-uid.dcm";
  const payload = buildDicomP10File();
  storage.store.set(key, payload);
  storage.contentType.set(key, "application/dicom");

  prisma.dicomInstance.findFirst.mockResolvedValue({
    id: "instance-1",
    storageKey: key,
    contentType: "application/dicom",
  });

  prisma.dicomInstance.findMany.mockResolvedValue([
    { id: "instance-1", storageKey: key, contentType: "application/dicom" },
  ]);

  return payload;
}

describe("DICOMweb service", () => {
  let storage: ReturnType<typeof makeStorage>;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    storage = makeStorage();
    prisma = makePrisma();
    (global as any).process.env = {
      ...(global as any).process.env,
      API_BASE_URL: "https://example.com",
    };
  });

  it("rejects STOW with a non-multipart content type", async () => {
    const service = new DicomWebService(
      prisma as any,
      storage as any,
      new DicomService(prisma as any, storage as any),
    );
    await expect(
      service.stow("t1", "u1", Buffer.from("x"), "application/json"),
    ).rejects.toThrow(BadRequestException);
  });

  it("stores DICOM parts via STOW-RS and returns the STOW JSON response", async () => {
    const service = new DicomWebService(
      prisma as any,
      storage as any,
      new DicomService(prisma as any, storage as any),
    );

    const file = buildDicomP10File();
    const boundary = "stowBoundary123";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/dicom\r\nContent-Length: ${file.length}\r\n\r\n`,
        "utf8",
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    const result = await service.stow(
      "t1",
      "u1",
      body,
      `multipart/related; type="application/dicom"; boundary=${boundary}`,
    );

    expect(result.numberOfInstancesStored).toBeGreaterThanOrEqual(1);
    expect(result["00081198"].Value?.[0]).toBe(result.numberOfInstancesStored);
    expect(result.failedItems).toEqual([]);
  });

  it("parses multipart/related bodies into typed parts", async () => {
    const file = buildDicomP10File();
    const boundary = "abc";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/dicom\r\nContent-Length: ${file.length}\r\n\r\n`,
        "utf8",
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    const parts = await parseMultipartRelated(
      body,
      `multipart/related; boundary=${boundary}`,
    );
    expect(parts).toHaveLength(1);
    expect(parts[0].headers["content-type"]).toBe("application/dicom");
    expect(parts[0].data.equals(file)).toBe(true);
  });

  it("builds DICOM JSON metadata for studies", async () => {
    prisma.dicomStudy.findFirst.mockResolvedValue({
      id: "study-1",
      tenantId: "t1",
      studyInstanceUid: "1.2.3.4",
      studyDate: new Date("2026-09-08T10:30:00Z"),
      studyDescription: "Chest",
      accessionNumber: "ACC-1",
      modality: "CT",
      referringPhysician: "Dr^Smith",
      bodyPart: "CHEST",
      patientId: "PT001",
      series: [],
    });
    prisma.dicomStudy.findMany.mockResolvedValue([]);

    const service = new DicomWebService(
      prisma as any,
      storage as any,
      new DicomService(prisma as any, storage as any),
    );

    const meta = await service.metadataStudy("t1", "1.2.3.4");
    expect(meta["0020000D"].Value).toEqual(["1.2.3.4"]);
    expect(meta["00081030"].Value).toEqual(["Chest"]);
    expect(meta["00080050"].Value).toEqual(["ACC-1"]);
    expect(meta["00080061"].Value).toEqual(["CT"]);
    expect(meta["00100020"].Value).toEqual(["PT001"]);
  });

  it("supports QIDO series and instances queries", async () => {
    prisma.dicomSeries.findMany.mockResolvedValue([
      {
        seriesInstanceUid: "9.9.9",
        seriesNumber: "1",
        seriesDescription: "Localizer",
        modality: "CT",
        numberOfInstances: 2,
        dicomStudy: { studyInstanceUid: "1.2.3.4", studyDate: new Date() },
      },
    ]);
    prisma.dicomInstance.findMany.mockResolvedValue([
      {
        sopInstanceUid: "8.8.8",
        sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
        instanceNumber: "1",
        rows: 512,
        columns: 512,
        dicomSeries: {
          seriesInstanceUid: "9.9.9",
          seriesNumber: "1",
          modality: "CT",
          dicomStudy: { studyInstanceUid: "1.2.3.4", studyDate: new Date() },
        },
      },
    ]);

    const service = new DicomWebService(
      prisma as any,
      storage as any,
      new DicomService(prisma as any, storage as any),
    );

    const series = await service.qidoSeries("t1", "1.2.3.4", {});
    expect(series).toHaveLength(1);
    expect(series[0]["0020000E"].Value).toEqual(["9.9.9"]);
    expect(series[0]["00080060"].Value).toEqual(["CT"]);

    const instances = await service.qidoInstances("t1", "1.2.3.4", "9.9.9", {});
    expect(instances).toHaveLength(1);
    expect(instances[0]["00080018"].Value).toEqual(["8.8.8"]);
    expect(instances[0]["00280010"].Value).toEqual([512]);
  });

  it("retrieves raw instances via WADO-RS object retrieval", async () => {
    const payload = withStoredInstance(prisma, storage);
    const service = new DicomWebService(
      prisma as any,
      storage as any,
      new DicomService(prisma as any, storage as any),
    );

    const { data, contentType } = await service.wadoInstance("t1", {
      studyInstanceUid: "study-uid",
      seriesInstanceUid: "series-uid",
      instanceUid: "instance-uid",
    });
    expect(data.equals(payload)).toBe(true);
    expect(contentType).toBe("application/dicom");
  });

  it("retrieves series instances as multipart parts", async () => {
    const payload = withStoredInstance(prisma, storage);
    const service = new DicomWebService(
      prisma as any,
      storage as any,
      new DicomService(prisma as any, storage as any),
    );

    const { parts } = await service.retrieveSeriesInstances(
      "t1",
      "study-uid",
      "series-uid",
    );
    expect(parts).toHaveLength(1);
    expect(parts[0].data.equals(payload)).toBe(true);
  });

  it("auto-links an uploaded study to a radiology order by accession number", async () => {
    prisma.radiologyOrder.findFirst.mockResolvedValue({ id: "order-777" });
    prisma.radiologyOrder.updateMany.mockResolvedValue({ count: 1 });

    const file = buildDicomP10File({ accessionNumber: "ACC-777" });
    const boundary = "accBoundary";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/dicom\r\nContent-Length: ${file.length}\r\n\r\n`,
        "utf8",
      ),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    const service = new DicomWebService(
      prisma as any,
      storage as any,
      new DicomService(prisma as any, storage as any),
    );

    await service.stow(
      "t1",
      "u1",
      body,
      `multipart/related; type="application/dicom"; boundary=${boundary}`,
    );

    expect(prisma.radiologyOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accessionNumber: "ACC-777" }),
      }),
    );
    expect(prisma.dicomStudy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ radiologyOrderId: "order-777" }),
      }),
    );
    expect(prisma.radiologyOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "IMAGES_UPLOADED" } }),
    );
    expect(prisma.radiologyOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "order-777" }),
      }),
    );
  });
});
