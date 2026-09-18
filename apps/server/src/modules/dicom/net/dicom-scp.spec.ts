import * as net from "net";
import { DicomService } from "../dicom.service";
import { buildDicomP10File } from "../dicom-sample-file";
import { DicomScpService } from "./dicom-scp.service";
import { DicomScuService } from "./dicom-scu.service";

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

function makePrisma(localNode: unknown) {
  return {
    dicomNode: {
      findFirst: jest.fn().mockResolvedValue(localNode),
    },
    dicomStudy: {
      upsert: jest.fn(async ({ create }: any) => ({
        id: "study-1",
        ...create,
      })),
    },
    dicomSeries: {
      upsert: jest.fn(async ({ create }: any) => ({
        id: "series-1",
        ...create,
      })),
    },
    dicomInstance: {
      upsert: jest.fn(async ({ create }: any) => ({
        id: "instance-1",
        ...create,
      })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    patient: { findFirst: jest.fn().mockResolvedValue(null) },
    radiologyOrder: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

const SUPER_SECONDARY_CAPTURE = "1.2.840.10008.5.1.4.1.1.7";

describe("DICOM network SCP/SCU loopback", () => {
  let storage: ReturnType<typeof makeStorage>;
  let prisma: ReturnType<typeof makePrisma>;
  let port: number;
  let scp: DicomScpService;

  beforeEach(async () => {
    port = await freePort();
    storage = makeStorage();
    const node = {
      id: "local-node",
      aeTitle: "HMS_LOCAL",
      hostname: "127.0.0.1",
      port,
      isLocal: true,
    };
    prisma = makePrisma(node);
  });

  afterEach(async () => {
    if (scp?.isRunning()) {
      await scp.stop();
    }
  });

  it("serves a C-ECHO over a real association", async () => {
    const dicom = new DicomService(prisma as any, storage as any);
    scp = new DicomScpService(prisma as any, dicom, storage as any);
    await scp.start("local-node", "t1");

    const scu = new DicomScuService(prisma as any, storage as any);
    const result = await scu.echo("127.0.0.1", port, "HMS_LOCAL");

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.status).toBe(0); // STATUS.SUCCESS
    expect(scp.getStats().echoRequests).toBe(1);
  }, 20000);

  it("stores an instance via C-STORE and persists it through the upload pipeline", async () => {
    const dicom = new DicomService(prisma as any, storage as any);
    scp = new DicomScpService(prisma as any, dicom, storage as any);
    await scp.start("local-node", "t1");

    const scu = new DicomScuService(prisma as any, storage as any);
    const file = buildDicomP10File();
    const results = await scu.store("127.0.0.1", port, "HMS_LOCAL", [
      {
        sopClassUid: SUPER_SECONDARY_CAPTURE,
        sopInstanceUid: "1.2.826.0.1.3680043.8.498.202609080021",
        p10: file,
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe(0);
    expect(scp.getStats().storedInstances).toBe(1);
    expect(scp.getStats().associations).toBeGreaterThanOrEqual(1);

    // The stored instance should be persisted to storage under the study path.
    const storedKeys = [...storage.store.keys()];
    expect(storedKeys.some((k) => k.includes("202609080001"))).toBe(true);
  }, 20000);
});
