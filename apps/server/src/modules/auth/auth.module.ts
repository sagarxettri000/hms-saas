import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { MailService } from "./mail.service";
import { TwoFactorService } from "./two-factor.service";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      global: true,
      secret:
        process.env.JWT_ACCESS_SECRET ||
        "hms-saas-access-secret-change-in-production-2026",
      signOptions: { expiresIn: "15m" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, MailService, TwoFactorService],
  exports: [AuthService, MailService],
})
export class AuthModule {}
