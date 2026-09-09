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
    dicomNode: { findFirst: jest.fn().mockResolvedValue(localNode) },
    dicomStudy: { upsert: jest.fn(async ({ create }: any) => ({ id: "study-1", ...create })) },
    dicomSeries: { upsert: jest.fn(async ({ create }: any) => ({ id: "series-1", ...create })) },
    dicomInstance: {
      upsert: jest.fn(async ({ create }: any) => ({ id: "instance-1", ...create })),
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

const SECONDARY_CAPTURE = "1.2.840.10008.5.1.4.1.1.7";

describe("DICOM load and conformance", () => {
  let storage: ReturnType<typeof makeStorage>;
  let prisma: ReturnType<typeof makePrisma>;
  let port: number;
  let scp: DicomScpService;

  beforeEach(async () => {
    port = await freePort();
    storage = makeStorage();
    const node = { id: "local-node", aeTitle: "HMS_LOCAL", hostname: "127.0.0.1", port, isLocal: true };
    prisma = makePrisma(node);
  });

  afterEach(async () => {
    if (scp?.isRunning()) {
      await scp.stop();
    }
  });

  it(
    "handles 30 sequential C-ECHO associations without degradation",
    async () => {
      const dicom = new DicomService(prisma as any, storage as any);
      scp = new DicomScpService(prisma as any, dicom, storage as any);
      await scp.start("local-node", "t1");
      const scu = new DicomScuService(prisma as any, storage as any);

      const start = Date.now();
      for (let i = 0; i < 30; i++) {
        const res = await scu.echo("127.0.0.1", port, "HMS_LOCAL");
        expect(res.status).toBe(0);
      }
      const elapsed = Date.now() - start;
      const stats = scp.getStats();
      expect(stats.echoRequests).toBe(30);
      expect(stats.associations).toBe(30);
      expect(stats.failedInstances).toBe(0);
      expect(elapsed).toBeLessThan(15000);
    },
    30000,
  );

  it(
    "round-trips 5 concurrent C-STORE associations and stats every stored instance",
    async () => {
      const dicom = new DicomService(prisma as any, storage as any);
      scp = new DicomScpService(prisma as any, dicom, storage as any);
      await scp.start("local-node", "t1");
      const scu = new DicomScuService(prisma as any, storage as any);

      const file = buildDicomP10File();
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          scu.store("127.0.0.1", port, "HMS_LOCAL", [
            {
              sopClassUid: SECONDARY_CAPTURE,
              sopInstanceUid: `1.2.826.0.1.3680043.8.498.2026.0999.000${i}`,
              p10: file,
            },
          ]),
        ),
      );

      for (const r of results) {
        expect(r).toHaveLength(1);
        expect(r[0].status).toBe(0);
      }
      const stats = scp.getStats();
      expect(stats.storedInstances).toBe(5);
      expect(stats.associations).toBeGreaterThanOrEqual(5);
      expect(stats.failedInstances).toBe(0);
    },
    30000,
  );

  it(
    "keeps serving new associations while stores are in flight",
    async () => {
      const dicom = new DicomService(prisma as any, storage as any);
      scp = new DicomScpService(prisma as any, dicom, storage as any);
      await scp.start("local-node", "t1");
      const scu = new DicomScuService(prisma as any, storage as any);

      const file = buildDicomP10File();
      const inflight = scu.store("127.0.0.1", port, "HMS_LOCAL", [
        { sopClassUid: SECONDARY_CAPTURE, sopInstanceUid: "1.2.840.1.2.3.4.5", p10: file },
      ]);
      const echo = await scu.echo("127.0.0.1", port, "HMS_LOCAL");
      expect(echo.status).toBe(0);
      await inflight;
      expect(scp.getStats().storedInstances).toBe(1);
    },
    30000,
  );
});