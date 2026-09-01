import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { UserRole, getRolePermissions } from "@hms/shared";
import { LoginDto, RegisterDto, ResetPasswordDto, ChangePasswordDto, EnableTwoFactorDto, DisableTwoFactorDto } from "./dto/auth.dto";
import { MailService } from "./mail.service";
import { TwoFactorService } from "./two-factor.service";
import { JwtStrategy } from "./strategies/jwt.strategy";

export interface AuthUser {
  id: string;
  email: string;
  tenantId: string | null;
  role: UserRole;
  permissions: string[];
  firstName: string;
  lastName: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly twoFactorFailures = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private static readonly TWO_FACTOR_MAX_ATTEMPTS = 5;
  private static readonly TWO_FACTOR_WINDOW_MS = 15 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException("User with this email already exists");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        phone: dto.phone,
        role: UserRole.HOSPITAL_OWNER,
        status: "PENDING",
        emailVerifiedAt: new Date(),
        mustChangePassword: true,
      },
    });

    // Grant only a restricted set of permissions pending admin approval.
    // A PENDING account cannot log in; an admin must first set an appropriate
    // role and activate the account.
    return {
      id: user.id,
      email: user.email,
      message:
        "Account created. A platform administrator will review and activate your account.",
    };
  }

  private checkUserAccessible(user: {
    status: string;
    deletedAt: Date | null;
    isActive?: boolean;
  }): void {
    if (user.deletedAt) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (user.status === "INACTIVE") {
      throw new UnauthorizedException("Account deactivated");
    }
    if (user.isActive === false) {
      throw new UnauthorizedException("Account deactivated");
    }
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        tenant: true,
        doctorProfile: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      await this.recordFailedLogin(user.id);
      throw new UnauthorizedException("Invalid credentials");
    }

    // If the lock window has passed, unlock the account and proceed.
    if (user.status === "LOCKED") {
      if (user.lockedUntil && user.lockedUntil <= new Date()) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
        });
      } else {
        throw new UnauthorizedException(
          "Account locked due to too many failed attempts",
        );
      }
    }

    if (user.status === "SUSPENDED") {
      throw new UnauthorizedException("Account suspended");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException("Account locked. Try again later.");
    }

    if (user.status === "PENDING") {
      throw new UnauthorizedException("Account not yet activated");
    }

    this.checkUserAccessible(user);

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      this.canAttemptTwoFactor(dto.email);
      try {
        this.twoFactorService.assertValid(user.twoFactorSecret, dto.twoFactorCode);
        this.clearTwoFactorFailures(dto.email);
      } catch (err) {
        this.recordTwoFactorFailure(dto.email);
        throw err;
      }
    }

    const permissions = this.getUserPermissions(user.role);

    const sessionExpiryMs = dto.rememberMe
      ? 30 * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;

    const refreshToken = crypto.randomBytes(40).toString("hex");
    const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        token: "",
        refreshToken,
        refreshTokenHash,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + sessionExpiryMs),
        isActive: true,
      },
    });

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        permissions,
        mustChangePassword: user.mustChangePassword,
        sid: session.id,
      },
      { secret: JwtStrategy.secretOrKey(), expiresIn: "15m" },
    );

    await this.prisma.session.update({
      where: { id: session.id },
      data: { token: accessToken },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    await this.logAudit(
      user.id,
      user.tenantId,
      "LOGIN",
      "User",
      user.id,
      user.role,
      { method: "password" },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        permissions,
        doctorProfileId: user.doctorProfile?.id,
        mustChangePassword: user.mustChangePassword,
      },
      sessionId: session.id,
    };
  }

  async refreshToken(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || !session.isActive) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { isActive: false, revokedAt: new Date() },
      });
      throw new UnauthorizedException("Refresh token expired");
    }

    const user = session.user;
    this.checkUserAccessible(user);
    const permissions = this.getUserPermissions(user.role);

    const newRefreshToken = crypto.randomBytes(40).toString("hex");

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        tenantId: user.tenantId,
        role: user.role,
        permissions,
        mustChangePassword: user.mustChangePassword,
        sid: session.id,
      },
      { secret: JwtStrategy.secretOrKey(), expiresIn: "15m" },
    );

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        token: accessToken,
        refreshToken: newRefreshToken,
        lastActivityAt: new Date(),
      },
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    await this.prisma.session.updateMany({
      where: { refreshToken },
      data: { isActive: false, revokedAt: new Date() },
    });
    return { success: true };
  }

  async logoutAll(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });
    return { success: true };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent user enumeration
    if (!user) {
      return { message: "If the email exists, a reset link will be sent." };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: tokenHash,
        expiresAt,
      },
    });

    const resetUrl = `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;

    const sent = await this.mailService.send({
      to: user.email,
      subject: "Reset your HMS password",
      text: `You requested a password reset. Open this link to choose a new password (valid for 1 hour):\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>You requested a password reset. Open this link to choose a new password (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });

    if (sent) {
      return { message: "If the email exists, a reset link will be sent." };
    }

    if (process.env.NODE_ENV !== "production") {
      return { message: "If the email exists, a reset link will be sent.", resetUrl };
    }

    return { message: "If the email exists, a reset link will be sent." };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto
      .createHash("sha256")
      .update(dto.token)
      .digest("hex");
    const tokenRecord = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (
      !tokenRecord ||
      tokenRecord.expiresAt < new Date() ||
      tokenRecord.usedAt
    ) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: tokenRecord.userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: tokenRecord.userId, isActive: true },
        data: { isActive: false, revokedAt: new Date() },
      }),
    ]);

    return { message: "Password reset successfully" };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const passwordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!passwordValid) {
      throw new BadRequestException("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.session.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false, revokedAt: new Date() },
      }),
    ]);

    await this.logAudit(
      userId,
      user.tenantId,
      "UPDATE",
      "User",
      userId,
      user.role,
      { field: "password" },
    );

    return { message: "Password changed successfully" };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: true,
        doctorProfile: true,
        staffProfile: true,
        department: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const { passwordHash: _, twoFactorSecret: __, ...safeUser } = user;
    return safeUser;
  }

  async setupTwoFactor(userId: string, email: string) {
    const secret = this.twoFactorService.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });
    return {
      secret,
      otpauthUrl: this.twoFactorService.generateOtpUrl(email, secret),
      message:
        "Scan the code with your authenticator app, then verify with /auth/2fa/enable using a code.",
    };
  }

  async enableTwoFactor(userId: string, dto: EnableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("User not found");

    if (!user.twoFactorSecret) {
      throw new BadRequestException(
        "No 2FA secret set. Call /auth/2fa/setup first.",
      );
    }

    this.twoFactorService.assertValid(user.twoFactorSecret, dto.code);

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    await this.logAudit(
      userId,
      user.tenantId,
      "UPDATE",
      "User",
      userId,
      user.role,
      { field: "twoFactorEnabled", value: true },
    );

    return { message: "2FA enabled" };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("User not found");

    if (!user.twoFactorSecret) {
      throw new BadRequestException("2FA is not enabled");
    }

    this.twoFactorService.assertValid(user.twoFactorSecret, dto.code);

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });

    await this.logAudit(
      userId,
      user.tenantId,
      "UPDATE",
      "User",
      userId,
      user.role,
      { field: "twoFactorEnabled", value: false },
    );

    return { message: "2FA disabled" };
  }

  private getUserPermissions(role: string): string[] {
    return getRolePermissions(role as UserRole);
  }

  private canAttemptTwoFactor(email: string) {
    const entry = this.twoFactorFailures.get(email);
    if (!entry) return;
    if (entry.resetAt <= Date.now()) {
      this.twoFactorFailures.delete(email);
      return;
    }
    if (entry.count >= AuthService.TWO_FACTOR_MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        "Too many 2FA attempts. Try again later.",
      );
    }
  }

  private recordTwoFactorFailure(email: string) {
    const now = Date.now();
    const entry = this.twoFactorFailures.get(email);
    if (!entry || entry.resetAt <= now) {
      this.twoFactorFailures.set(email, {
        count: 1,
        resetAt: now + AuthService.TWO_FACTOR_WINDOW_MS,
      });
      return;
    }
    entry.count += 1;
    if (entry.count >= AuthService.TWO_FACTOR_MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        "Too many 2FA attempts. Try again later.",
      );
    }
  }

  private clearTwoFactorFailures(email: string) {
    this.twoFactorFailures.delete(email);
  }

  private async recordFailedLogin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const failedCount = user.failedLoginCount + 1;
    const shouldLock = failedCount >= 5;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: failedCount,
        lockedUntil: shouldLock
          ? new Date(Date.now() + 30 * 60 * 1000)
          : undefined,
        status: shouldLock ? "LOCKED" : user.status,
      },
    });
  }

  private async logAudit(
    userId: string,
    tenantId: string | null,
    action: string,
    entity: string,
    entityId: string,
    userRole: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    if (!tenantId) return;
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          userRole,
          entity,
          entityId,
          action: action as any,
          metadata: metadata || undefined,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log: ${(err as Error).message}`);
    }
  }
}
