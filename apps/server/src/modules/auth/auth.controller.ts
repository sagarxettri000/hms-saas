import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { Public } from "../../common/decorators/permissions.decorator";
import { TwoFactorSetupGuard } from "./guards/two-factor-setup.guard";
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  EnableTwoFactorDto,
  DisableTwoFactorDto,
} from "./dto/auth.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Register a new platform account" })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Login with email and password" })
  async login(
    @Body() dto: LoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const result = await this.authService.login(
      dto,
      req.headers["user-agent"],
      req.ip,
    );
    if (result && (result as any).accessToken) {
      this.setAuthCookies(
        res,
        result as { accessToken: string; refreshToken: string },
        dto.rememberMe,
      );
    }
    return result;
  }

  @Post("refresh")
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: "Refresh access token" })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const refreshToken = dto.refreshToken || req.cookies?.hms_refresh;
    if (!refreshToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const result = await this.authService.refreshToken(
      refreshToken,
      req.headers["user-agent"],
      req.ip,
    );
    res.cookie("hms_access", result.accessToken, {
      ...this.cookieOptions(false),
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });
    return result;
  }

  @Post("logout")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Logout and invalidate session" })
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const refreshToken = dto.refreshToken || req.cookies?.hms_refresh;
    this.clearAuthCookies(res);
    if (refreshToken) {
      return this.authService.logout(refreshToken);
    }
    return { success: true };
  }

  @Post("forgot-password")
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Request password reset" })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post("reset-password")
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Reset password with token" })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change current user password" })
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: any) {
    return this.authService.changePassword(req.user.id, dto);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user profile" })
  getMe(@Req() req: any) {
    return this.authService.getMe(req.user.id);
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Logout from all devices" })
  async logoutAll(@Req() req: any, @Res({ passthrough: true }) res: any) {
    const result = await this.authService.logoutAll(req.user.id);
    this.clearAuthCookies(res);
    return result;
  }

  @Post("2fa/setup")
  @Public()
  @UseGuards(TwoFactorSetupGuard)
  @ApiOperation({ summary: "Generate a 2FA secret and authenticator URL" })
  setupTwoFactor(@Req() req: any) {
    return this.authService.setupTwoFactor(req.user.id, req.user.email);
  }

  @Post("2fa/enable")
  @Public()
  @UseGuards(TwoFactorSetupGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Verify a code and enable 2FA" })
  enableTwoFactor(@Body() dto: EnableTwoFactorDto, @Req() req: any) {
    return this.authService.enableTwoFactor(req.user.id, dto);
  }

  @Post("2fa/disable")
  @UseGuards(JwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Disable 2FA with a verification code" })
  disableTwoFactor(@Body() dto: DisableTwoFactorDto, @Req() req: any) {
    return this.authService.disableTwoFactor(req.user.id, dto);
  }

  private cookieOptions(secureOverride?: boolean) {
    const secure = secureOverride ?? process.env.NODE_ENV === "production";
    return {
      httpOnly: true as const,
      secure,
      sameSite: (secure ? "none" : "lax") as "none" | "lax",
    };
  }

  private setAuthCookies(
    res: any,
    result: { accessToken: string; refreshToken: string },
    rememberMe?: boolean,
  ) {
    const common = this.cookieOptions();
    res.cookie("hms_access", result.accessToken, {
      ...common,
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.cookie("hms_refresh", result.refreshToken, {
      ...common,
      path: "/api/v1/auth",
      maxAge: (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookies(res: any) {
    const common = this.cookieOptions();
    res.clearCookie("hms_access", { ...common, path: "/" });
    res.clearCookie("hms_refresh", { ...common, path: "/api/v1/auth" });
  }
}
