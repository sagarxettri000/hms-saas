import * as net from "net";
import { Hl7OutboundService } from "./hl7-outbound.service";

function makePrisma(order: Record<string, unknown> | null) {
  return {
    integrationSetting: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.tenantId_provider.provider === "hl7-outbound") {
          return {
            config: { enabled: true, host: "127.0.0.1", port: 0 },
          };
        }
        return null;
      }),
      upsert: jest.fn(async () => ({ id: "is-1" })),
    },
    radiologyOrder: {
      findFirst: jest.fn().mockResolvedValue(order),
    },
  };
}

const order = {
  id: "order-1",
  tenantId: "t1",
  orderNumber: "RAD-1",
  accessionNumber: "ACC-9",
  modality: "XRAY",
  bodyPart: "CHEST",
  status: "REPORTED",
  reportedAt: new Date("2026-09-08T10:00:00Z"),
  impression: "Normal",
  findings: "None",
  report: "No abnormality",
  patient: {
    mrn: "M1",
    firstName: "A",
    lastName: "B",
    dateOfBirth: new Date("1980-01-01"),
    gender: "M",
  },
};

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

async function ackServer(
  ack = "MSH|^~\\&|RIS|||||20060101120000||ACK|a1|P|2.5\rMSA|AA|ctl\r",
  timeoutMs = 5000,
) {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve()),
  );
  const port = (server.address() as net.AddressInfo).port;

  const received = new Promise<string>((resolve) => {
    server.on("connection", (socket) => {
      socket.on("data", (data: Buffer) => {
        resolve(data.toString("utf8"));
        socket.write(
          Buffer.from([0x0b, ...Buffer.from(ack, "utf8"), 0x1c, 0x0d]),
        );
      });
    });
  });

  const stop = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));

  return { port, received, timeoutMs, stop };
}

describe("HL7 outbound service", () => {
  it("relays an ORU report to the configured MLLP endpoint and reports acknowledgement", async () => {
    const ack = await ackServer();
    const prisma = makePrisma(order);
    const service = new Hl7OutboundService(prisma as any);

    // Patch the ephemeral port into the stored config.
    prisma.integrationSetting.findUnique.mockResolvedValue({
      config: { enabled: true, host: "127.0.0.1", port: ack.port },
    });

    try {
      const result = await service.sendRadiologyReport("t1", "order-1");
      expect(result.sent).toBe(true);
      expect(result.error).toBeUndefined();

      const raw = await ack.received;
      expect(raw.charCodeAt(0)).toBe(0x0b);
      expect(raw).toContain("ORU^R01");
      expect(raw).toContain("OBX|1|TX|1^IMPRESSION||Normal|");
    } finally {
      await ack.stop();
    }
  });

  it("skips transmission when outbound relay is disabled", async () => {
    const prisma = makePrisma(order);
    prisma.integrationSetting.findUnique.mockResolvedValue({
      config: { enabled: false },
    } as any);
    const service = new Hl7OutboundService(prisma as any);
    const result = await service.sendRadiologyReport("t1", "order-1");
    expect(result).toMatchObject({
      orderId: "order-1",
      sent: false,
      skipped: true,
    });
  });

  it("updates the relay configuration", async () => {
    const prisma = makePrisma(order);
    const service = new Hl7OutboundService(prisma as any);
    await service.setConfig("t1", {
      enabled: true,
      host: "ris.example.com",
      port: 2575,
    });
    expect(prisma.integrationSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_provider: { tenantId: "t1", provider: "hl7-outbound" },
        },
        create: expect.objectContaining({
          tenantId: "t1",
          provider: "hl7-outbound",
        }),
      }),
    );
  });
});
