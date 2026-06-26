import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  inviteCode?: string;
}

export class LoginDto {
  // login account: admin username (or email for tenant owners) — not forced to be an email
  @IsString()
  email: string;

  @IsString()
  password: string;
}
