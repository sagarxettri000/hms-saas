import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { Public } from "../../common/decorators/permissions.decorator";
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
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto, req.headers["user-agent"], req.ip);
  }

  @Post("refresh")
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: "Refresh access token" })
  refreshToken(@Body() dto: RefreshTokenDto, @Req() req: any) {
    return this.authService.refreshToken(
      dto.refreshToken,
      req.headers["user-agent"],
      req.ip,
    );
  }

  @Post("logout")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Logout and invalidate session" })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
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
  @UseGuards(JwtAuthGuard)
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
  logoutAll(@Req() req: any) {
    return this.authService.logoutAll(req.user.id);
  }

  @Post("2fa/setup")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Generate a 2FA secret and authenticator URL" })
  setupTwoFactor(@Req() req: any) {
    return this.authService.setupTwoFactor(req.user.id, req.user.email);
  }

  @Post("2fa/enable")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Verify a code and enable 2FA" })
  enableTwoFactor(@Body() dto: EnableTwoFactorDto, @Req() req: any) {
    return this.authService.enableTwoFactor(req.user.id, dto);
  }

  @Post("2fa/disable")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Disable 2FA with a verification code" })
  disableTwoFactor(@Body() dto: DisableTwoFactorDto, @Req() req: any) {
    return this.authService.disableTwoFactor(req.user.id, dto);
  }
}
