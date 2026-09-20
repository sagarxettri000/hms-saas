import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { MailService } from "./mail.service";
import { TwoFactorService } from "./two-factor.service";
import { TwoFactorSetupGuard } from "./guards/two-factor-setup.guard";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      global: true,
      secret: JwtStrategy.secretOrKey(),
      signOptions: { expiresIn: "8h" },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    MailService,
    TwoFactorService,
    TwoFactorSetupGuard,
  ],
  exports: [AuthService, MailService],
})
export class AuthModule {}
