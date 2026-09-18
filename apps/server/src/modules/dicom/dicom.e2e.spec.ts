import { DicomService, DicomUploadFile } from "./dicom.service";
import { buildDicomP10File, parseSampleFile } from "./dicom-sample-file";
import { extractDicomMetadata } from "./dicom-metadata.util";

function makeStorage() {
  const store = new Map<string, Buffer>();
  const contentType = new Map<string, string>();
  return {
    store,
    put: jest.fn(async (key: string, data: Buffer, type: string) => {
      store.set(key, data);
      contentType.set(key, type);
      return { key, size: data.length };
    }),
    get: jest.fn(async (key: string) => ({
      data: store.get(key),
      contentType: contentType.get(key) ?? "application/dicom",
    })),
    delete: jest.fn(async () => ({ deleted: true })),
  };
}

function makePrisma() {
  const studies: any[] = [];
  return {
    dicomStudy: {
      upsert: jest.fn(async ({ update, create }) => {
        const record = { id: "study-1", ...create, ...update };
        studies.push(record);
        return create || update;
      }),
      findFirst: jest.fn(),
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
      findFirst: jest.fn().mockResolvedValue({
        id: "instance-1",
        storageKey:
          "t1/dicom/1.2.826.0.1.3680043.8.498.202609080001/1.2.826.0.1.3680043.8.498.202609080011/1.2.826.0.1.3680043.8.498.202609080021.dcm",
      }),
    },
    radiologyOrder: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe("DICOM ingest end-to-end", () => {
  it("produces a real, parseable DICOM P10 file", () => {
    const file = buildDicomP10File();
    expect(file.subarray(128, 132).toString("ascii")).toBe("DICM");
    const parsed = parseSampleFile(file);
    expect(parsed.text(0x0010, 0x0010)).toBe("TEST^DICOM");
    expect(parsed.text(0x0010, 0x0020)).toBe("PT001");
    expect(parsed.text(0x0008, 0x0060)).toBe("OT");
    expect(parsed.text(0x0028, 0x0004)).toBe("MONOCHROME2");
    expect(parsed.uInt16(0x0028, 0x0010)).toBe(8);
    expect(parsed.uInt16(0x0028, 0x0011)).toBe(8);
  });

  it("extracts study/series/instance metadata from the generated file", () => {
    const file = buildDicomP10File();
    const meta = extractDicomMetadata(file);
    expect(meta.study.studyInstanceUid).toBe(
      "1.2.826.0.1.3680043.8.498.202609080001",
    );
    expect(meta.series.seriesInstanceUid).toBe(
      "1.2.826.0.1.3680043.8.498.202609080011",
    );
    expect(meta.instance.sopInstanceUid).toBe(
      "1.2.826.0.1.3680043.8.498.202609080021",
    );
    expect(meta.study.patient?.patientId).toBe("PT001");
    expect(meta.study.patient?.patientName).toBe("TEST^DICOM");
    expect(meta.instance.rows).toBe(8);
    expect(meta.instance.columns).toBe(8);
    expect(meta.instance.bitsAllocated).toBe(16);
    expect(meta.instance.transferSyntax).toBe("1.2.840.10008.1.2");
  });

  it("uploads the file, stores bytes, and retrieves identical bytes via WADO round-trip", async () => {
    const storage = makeStorage();
    const prisma = makePrisma();
    const service = new DicomService(prisma as any, storage as any);

    const file = buildDicomP10File();
    const uploadFile: DicomUploadFile = {
      buffer: file,
      originalname: "sample.dcm",
      mimetype: "application/dicom",
      size: file.length,
    };

    const result = await service.upload({
      tenantId: "t1",
      userId: "u1",
      files: [uploadFile],
    });

    expect(result.ingested).toHaveLength(1);
    const key = prisma.dicomInstance.upsert.mock.calls[0][0].create.storageKey;
    expect(storage.store.has(key)).toBe(true);

    const stored = await service.fetchInstanceData({ storageKey: key });
    expect(stored.data.equals(file)).toBe(true);
    expect(stored.contentType).toBe("application/dicom");
  });

  it("links a radiology order and transitions it to IMAGES_UPLOADED", async () => {
    const storage = makeStorage();
    const prisma = makePrisma();
    prisma.radiologyOrder.findFirst.mockResolvedValue({ id: "rad-1" });
    const service = new DicomService(prisma as any, storage as any);

    const file = buildDicomP10File();
    await service.upload({
      tenantId: "t1",
      userId: "u1",
      files: [
        {
          buffer: file,
          originalname: "a.dcm",
          mimetype: "application/dicom",
          size: file.length,
        },
      ],
      radiologyOrderId: "rad-1",
    });

    expect(prisma.radiologyOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.radiologyOrder.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "rad-1",
        tenantId: "t1",
        status: { in: ["ORDERED", "SCHEDULED", "IN_PROGRESS"] },
      }),
      data: { status: "IMAGES_UPLOADED" },
    });
  });

  it("skips the transition when no radiology order is linked", async () => {
    const storage = makeStorage();
    const prisma = makePrisma();
    const service = new DicomService(prisma as any, storage as any);

    const file = buildDicomP10File();
    await service.upload({
      tenantId: "t1",
      userId: "u1",
      files: [
        {
          buffer: file,
          originalname: "a.dcm",
          mimetype: "application/dicom",
          size: file.length,
        },
      ],
    });

    expect(prisma.radiologyOrder.updateMany).not.toHaveBeenCalled();
  });
});
