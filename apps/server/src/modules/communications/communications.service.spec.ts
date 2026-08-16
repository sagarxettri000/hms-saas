import { CommunicationsService } from "./communications.service";

describe("CommunicationsService", () => {
  const integrationSetting = {
    findUnique: jest.fn().mockResolvedValue(null),
  };
  const prisma = { integrationSetting } as any;
  const service = new CommunicationsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("skips email when SMTP is not configured", async () => {
    integrationSetting.findUnique.mockResolvedValue(null);
    const ok = await service.sendEmail("t1", {
      to: "a@b.com",
      subject: "S",
      html: "<p>H</p>",
    });
    expect(ok).toBe(false);
  });

  it("skips email when SMTP is disabled", async () => {
    integrationSetting.findUnique.mockResolvedValue({
      enabled: false,
      config: { host: "smtp.x.com" },
    });
    expect(await service.sendEmail("t1", { to: "a@b.com", subject: "S", html: "" })).toBe(false);
  });

  it("skips SMS when the gateway is not configured", async () => {
    integrationSetting.findUnique.mockResolvedValue(null);
    expect(await service.sendSms("t1", { to: "+9771", message: "Hi" })).toBe(false);
  });

  it("attempts a real SMTP send when configured", async () => {
    integrationSetting.findUnique.mockResolvedValue({
      enabled: true,
      config: { host: "smtp.x.com", port: 587, user: "u", password: "p", fromEmail: "n@x.com" },
    });
    const createTransport = jest
      .spyOn(require("nodemailer"), "createTransport")
      .mockReturnValue({ sendMail: jest.fn().mockResolvedValue({}) });
    const ok = await service.sendEmail("t1", {
      to: "a@b.com",
      subject: "S",
      html: "<p>H</p>",
    });
    expect(ok).toBe(true);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.x.com" }),
    );
    createTransport.mockRestore();
  });

  it("returns false when SMTP send throws", async () => {
    integrationSetting.findUnique.mockResolvedValue({
      enabled: true,
      config: { host: "smtp.x.com", user: "u", password: "p" },
    });
    jest
      .spyOn(require("nodemailer"), "createTransport")
      .mockReturnValue({ sendMail: jest.fn().mockRejectedValue(new Error("boom")) });
    const ok = await service.sendEmail("t1", { to: "a@b.com", subject: "S", html: "" });
    expect(ok).toBe(false);
  });

  it("returns false when the generic gateway has no endpoint", async () => {
    integrationSetting.findUnique.mockResolvedValue({
      enabled: true,
      config: { apiKey: "k" },
    });
    expect(await service.sendSms("t1", { to: "+9771", message: "Hi" })).toBe(false);
  });

  it("calls the generic gateway endpoint", async () => {
    integrationSetting.findUnique.mockResolvedValue({
      enabled: true,
      config: { apiKey: "k", endpoint: "https://gateway.test/send", senderId: "HMS" },
    });
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as any);
    const ok = await service.sendSms("t1", { to: "+9779800000000", message: "Hi" });
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.test/send",
      expect.objectContaining({ method: "POST" }),
    );
    fetchMock.mockRestore();
  });

  it("handles a twilio provider", async () => {
    integrationSetting.findUnique.mockResolvedValue({
      enabled: true,
      config: { provider: "twilio", apiKey: "ACsid", apiSecret: "tok", senderId: "+1500" },
    });
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as any);
    const ok = await service.sendSms("t1", { to: "+9771", message: "Hi" });
    expect(ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("api.twilio.com");
    fetchMock.mockRestore();
  });
});
