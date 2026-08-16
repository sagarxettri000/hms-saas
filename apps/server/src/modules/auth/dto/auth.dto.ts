import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
} from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "admin@hospital.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "password123" })
  @IsString()
  password!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @ApiProperty({ required: false, description: "2FA code when enabled" })
  @IsOptional()
  @IsString()
  twoFactorCode?: string;
}

export class EnableTwoFactorDto {
  @ApiProperty({ description: "Verification code from authenticator app" })
  @IsString()
  code!: string;
}

export class DisableTwoFactorDto {
  @ApiProperty({ description: "Verification code from authenticator app" })
  @IsString()
  code!: string;
}

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class VerifyOtpDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  otp!: string;
}

export class RequestOtpDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}
