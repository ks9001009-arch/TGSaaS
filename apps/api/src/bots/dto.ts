import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBotDto {
  @IsString()
  @MinLength(40)
  token: string; // BotFather token like 123456:ABC...

  @IsOptional()
  @IsString()
  name?: string;
}

export class UpdateBotHomeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  welcomeHomeText?: string;

  @IsOptional()
  @IsString()
  homeMediaType?: string;

  @IsOptional()
  @IsString()
  homeMediaUrl?: string;

  @IsOptional()
  @IsString()
  defaultLocale?: string;
}

export class ChangeTokenDto {
  @IsString()
  @MinLength(40)
  token: string;
}
