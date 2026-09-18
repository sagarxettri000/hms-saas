import { NotificationsService } from "./notifications.service";

describe("NotificationsService", () => {
  const prisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  const hub = { emit: jest.fn() };
  const communications = {
    sendEmail: jest.fn().mockResolvedValue(true),
    sendSms: jest.fn().mockResolvedValue(true),
  };

  const makeService = () =>
    new NotificationsService(prisma as any, hub as any, communications as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.notification.create.mockResolvedValue({
      id: "n1",
      tenantId: "t1",
      userId: "u1",
      title: "Test",
      body: "Hello",
      type: "INFO",
      channel: "IN_APP",
      createdAt: new Date(),
    });
  });

  it("creates an in-app notification without external dispatch", async () => {
    const service = makeService();
    await service.create("t1", { userId: "u1", title: "Test", body: "Hello" });
    expect(prisma.notification.create).toHaveBeenCalled();
    expect(hub.emit).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(communications.sendEmail).not.toHaveBeenCalled();
    expect(communications.sendSms).not.toHaveBeenCalled();
  });

  it("dispatches email for an EMAIL-channel notification", async () => {
    prisma.user.findFirst.mockResolvedValue({
      email: "doc@hosp.com",
      phone: null,
    });
    const service = makeService();
    await service.create("t1", {
      userId: "u1",
      title: "Report",
      body: "Ready",
      channel: "EMAIL",
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(communications.sendEmail).toHaveBeenCalledWith("t1", {
      to: "doc@hosp.com",
      subject: "Report",
      html: "<p>Ready</p>",
      text: "Ready",
    });
    expect(communications.sendSms).not.toHaveBeenCalled();
  });

  it("dispatches SMS for an SMS-channel notification", async () => {
    prisma.user.findFirst.mockResolvedValue({ phone: "+9779800000000" });
    const service = makeService();
    await service.create("t1", {
      userId: "u1",
      title: "Alert",
      body: "Critical",
      channel: "SMS",
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(communications.sendSms).toHaveBeenCalledWith("t1", {
      to: "+9779800000000",
      message: "Alert: Critical",
    });
    expect(communications.sendEmail).not.toHaveBeenCalled();
  });

  it("dispatches both for an ALL-channel notification", async () => {
    prisma.user.findFirst.mockResolvedValue({
      email: "doc@hosp.com",
      phone: "+9779800000000",
    });
    const service = makeService();
    await service.create("t1", {
      userId: "u1",
      title: "Both",
      body: "B",
      channel: "ALL",
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(communications.sendEmail).toHaveBeenCalled();
    expect(communications.sendSms).toHaveBeenCalled();
  });

  it("does not dispatch when the user has no contact info", async () => {
    prisma.user.findFirst.mockResolvedValue({ email: null, phone: null });
    const service = makeService();
    await service.create("t1", {
      userId: "u1",
      title: "None",
      body: "X",
      channel: "ALL",
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(communications.sendEmail).not.toHaveBeenCalled();
    expect(communications.sendSms).not.toHaveBeenCalled();
  });

  it("returns null without a tenant", async () => {
    const service = makeService();
    expect(await service.create("", { title: "t", body: "b" })).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("marks a notification as read", async () => {
    const service = makeService();
    await service.markAsRead("t1", "n1", "u1");
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "n1", tenantId: "t1", userId: "u1" },
      data: expect.objectContaining({ status: "READ" }),
    });
  });
});
