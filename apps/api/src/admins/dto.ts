import { IsArray, IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateAdminDto {
  @IsString()
  botId: string;

  // login account: unique admin username — letters, digits and underscore only
  @IsString()
  @MinLength(2, { message: '管理员用户名至少需要 2 个字符' })
  @Matches(/^[A-Za-z0-9_]+$/, { message: '管理员用户名仅支持字母、数字、下划线' })
  email: string;

  // login password: no complexity requirement
  @IsString()
  @MinLength(1, { message: '请输入登录密码' })
  password: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  telegramUsername?: string;

  @IsOptional()
  @IsArray()
  permissions?: string[];
}

export class UpdatePermissionsDto {
  @IsArray()
  permissions: string[];
}

export class ToggleActiveDto {
  @IsBoolean()
  active: boolean;
}

export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  telegramUsername?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;
}

export class AssignBotDto {
  @IsString()
  botId: string;
}
