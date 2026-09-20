import { UnauthorizedException, BadRequestException } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { AuthService } from "./auth.service";
import { TwoFactorService } from "./two-factor.service";
import { UserRole } from "@hms/shared";

// signAccessToken signs RS256 directly with jsonwebtoken (not via JwtService),
// so the parser must be mocked for deterministic token assertions.
jest.mock("jsonwebtoken", () => ({
  ...jest.requireActual("jsonwebtoken"),
  sign: jest.fn(),
}));

function makeService(
  prisma: any,
  jwtService: any,
  mailService: any,
): AuthService {
  return new AuthService(
    prisma,
    jwtService,
    mailService,
    new TwoFactorService({
      sign: jest.fn(),
      verify: jest.fn(),
    } as any),
  );
}

describe("AuthService", () => {
  describe("register", () => {
    const prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(({ data }) => ({
          ...data,
          id: "user-1",
        })),
      },
    };
    const jwtService = { sign: jest.fn() };
    const mailService = { send: jest.fn().mockResolvedValue(false) };
    const service = makeService(prisma, jwtService, mailService);

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.user.findUnique.mockResolvedValue(null);
    });

    it("returns a generic success for duplicate email to avoid leaking account existence", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "existing" });
      const result = await service.register({
        email: "test@test.com",
        password: "Password123",
        firstName: "Test",
        lastName: "User",
      });
      expect(result).toEqual(
        expect.objectContaining({
          email: "test@test.com",
          message: expect.stringContaining("created"),
        }),
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("creates user with correct defaults", async () => {
      const result = await service.register({
        email: "new@test.com",
        password: "Password123",
        firstName: "New",
        lastName: "User",
      });
      expect(result.email).toBe("new@test.com");
      expect(result.message).toContain("created");
    });
  });

  describe("login", () => {
    const bcrypt = require("bcryptjs");
    const prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      session: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...data, id: "session-1" })),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const jwtService = {
      sign: jest.fn().mockReturnValue("mock-access-token"),
    };
    const mailService = { send: jest.fn().mockResolvedValue(false) };
    const service = makeService(prisma, jwtService, mailService);

    const mockUser = {
      id: "user-1",
      email: "test@test.com",
      passwordHash: bcrypt.hashSync("Password123", 12),
      firstName: "Test",
      lastName: "User",
      role: UserRole.HOSPITAL_ADMIN,
      status: "ACTIVE",
      isActive: true,
      tenantId: "tenant-1",
      tenant: { id: "tenant-1" },
      doctorProfile: null,
      lockedUntil: null,
      failedLoginCount: 0,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.session.create.mockResolvedValue({
        id: "session-1",
        token: "mock-access-token",
      });
      (jwt.sign as jest.Mock).mockReturnValue("mock-access-token");
    });

    it("uses a clinical-friendly access token lifetime", async () => {
      await service.login(
        { email: "test@test.com", password: "Password123" },
        "agent",
        "1.2.3.4",
      );

      const jwtCall = (jwt.sign as jest.Mock).mock.calls[0];
      expect(jwtCall[2]).toMatchObject({ expiresIn: "8h" });
    });

    it("rejects invalid credentials", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: "test@test.com", password: "wrong" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("uses one generic message for all failure states to prevent enumeration", async () => {
      const pending = { ...mockUser, status: "PENDING" };
      prisma.user.findUnique.mockResolvedValue(pending);
      let err: any;
      try {
        await service.login({
          email: "test@test.com",
          password: "Password123",
        });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(UnauthorizedException);
      const first = err.message;

      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: "x@y.z", password: "wrong" }),
      ).rejects.toThrow(`Invalid email or password`);

      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: "SUSPENDED",
      });
      await expect(
        service.login({ email: "test@test.com", password: "Password123" }),
      ).rejects.toThrow("Invalid email or password");

      expect(first).toBe("Invalid email or password");
    });

    it("rejects wrong password", async () => {
      const userWrongPass = {
        ...mockUser,
        passwordHash: bcrypt.hashSync("OtherPass", 12),
      };
      prisma.user.findUnique.mockResolvedValue(userWrongPass);
      await expect(
        service.login({ email: "test@test.com", password: "Password123" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("returns accessToken, refreshToken and user with mustChangePassword", async () => {
      const userMustChange = { ...mockUser, mustChangePassword: true };
      prisma.user.findUnique.mockResolvedValue(userMustChange);
      const result = await service.login({
        email: "test@test.com",
        password: "Password123",
      });
      expect(result.accessToken).toBe("mock-access-token");
      expect(result.refreshToken).toBeDefined();
      expect((result as any).user.mustChangePassword).toBe(true);
      expect(result.sessionId).toBe("session-1");
    });

    it("honors rememberMe for session expiry", async () => {
      const result = await service.login(
        { email: "test@test.com", password: "Password123", rememberMe: true },
        "agent",
        "1.2.3.4",
      );
      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt: expect.any(Date),
          }),
        }),
      );
      const call = prisma.session.create.mock.calls[0][0];
      const expiresInMs = call.data.expiresAt.getTime() - Date.now();
      // 30 days approx
      expect(expiresInMs).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    });
  });

  describe("refreshToken", () => {
    const prisma = {
      session: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const jwtService = { sign: jest.fn().mockReturnValue("new-access-token") };
    const mailService = { send: jest.fn().mockResolvedValue(false) };
    const service = makeService(prisma, jwtService, mailService);

    beforeEach(() => {
      jest.clearAllMocks();
      (jwt.sign as jest.Mock).mockReturnValue("new-access-token");
    });

    it("rejects invalid refresh token", async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      await expect(service.refreshToken("invalid")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects expired session", async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: "session-1",
        refreshToken: "valid",
        isActive: true,
        expiresAt: new Date(Date.now() - 1000),
        user: {
          id: "u1",
          role: UserRole.HOSPITAL_ADMIN,
          tenantId: "t1",
          email: "e@e.com",
        },
      });
      await expect(service.refreshToken("valid")).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: expect.objectContaining({
            isActive: false,
            revokedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("returns new access token with sid", async () => {
      const mockSession = {
        id: "session-1",
        refreshToken: "valid",
        isActive: true,
        expiresAt: new Date(Date.now() + 86400000),
        user: {
          id: "u1",
          role: UserRole.HOSPITAL_ADMIN,
          tenantId: "t1",
          email: "e@e.com",
        },
      };
      prisma.session.findUnique.mockResolvedValue(mockSession);
      const result = await service.refreshToken("valid");
      expect(result.accessToken).toBe("new-access-token");
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: expect.objectContaining({
            token: "new-access-token",
            lastActivityAt: expect.any(Date),
            refreshTokenHash: expect.any(String),
          }),
        }),
      );
    });
  });

  describe("logout", () => {
    const prisma = {
      session: {
        updateMany: jest.fn(),
      },
    };
    const jwtService = { sign: jest.fn() };
    const mailService = { send: jest.fn().mockResolvedValue(false) };
    const service = makeService(prisma, jwtService, mailService);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("revokes session", async () => {
      await service.logout("refresh-token");
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { refreshTokenHash: expect.any(String) },
        data: { isActive: false, revokedAt: expect.any(Date) },
      });
    });
  });

  describe("forgotPassword", () => {
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
      },
    };
    const jwtService = { sign: jest.fn() };
    const mailService = { send: jest.fn().mockResolvedValue(false) };
    const service = makeService(prisma, jwtService, mailService);

    it("returns generic message for non-existent user (anti-enumeration)", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.forgotPassword("nonexistent@test.com");
      expect(result.message).toContain("If the email exists");
    });

    it("creates reset token for existing user", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u1",
        email: "test@test.com",
      });
      const result = await service.forgotPassword("test@test.com");
      expect(result.message).toContain("If the email exists");
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    const bcrypt = require("bcryptjs");
    const prisma = {
      passwordResetToken: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
      session: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (operations) => {
        return Promise.all(operations);
      }),
    };
    const jwtService = { sign: jest.fn() };
    const mailService = { send: jest.fn().mockResolvedValue(false) };
    const service = makeService(prisma, jwtService, mailService);

    it("rejects invalid token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword({ token: "invalid", password: "NewPass123" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects expired token", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "token-1",
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
        userId: "u1",
      });
      await expect(
        service.resetPassword({ token: "expired", password: "NewPass123" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("resets password and revokes sessions", async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "token-1",
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        userId: "u1",
      });
      await service.resetPassword({ token: "valid", password: "NewPass123" });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u1" },
          data: expect.objectContaining({ mustChangePassword: false }),
        }),
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, userId: "u1" },
          data: expect.objectContaining({
            isActive: false,
            revokedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("changePassword", () => {
    const bcrypt = require("bcryptjs");
    const prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      session: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (operations) => {
        return Promise.all(operations);
      }),
    };
    const jwtService = { sign: jest.fn() };
    const mailService = { send: jest.fn().mockResolvedValue(false) };
    const service = makeService(prisma, jwtService, mailService);

    const mockUser = {
      id: "u1",
      passwordHash: bcrypt.hashSync("OldPass123", 12),
      tenantId: "t1",
      role: UserRole.HOSPITAL_ADMIN,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      prisma.user.findUnique.mockResolvedValue(mockUser);
    });

    it("rejects wrong current password", async () => {
      await expect(
        service.changePassword("u1", {
          currentPassword: "WrongPass",
          newPassword: "NewPass123",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("changes password and revokes sessions", async () => {
      await service.changePassword("u1", {
        currentPassword: "OldPass123",
        newPassword: "NewPass123",
      });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u1" },
          data: expect.objectContaining({ mustChangePassword: false }),
        }),
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1", isActive: true },
          data: expect.objectContaining({
            isActive: false,
            revokedAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});
