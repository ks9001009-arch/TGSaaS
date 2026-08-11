import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAccountDto {
  // E.164 phone, e.g. +8613800138000
  @IsString()
  @Matches(/^\+?[0-9]{6,15}$/, { message: '手机号格式不正确（示例：+8613800138000）' })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ConfirmCodeDto {
  @IsString()
  @Matches(/^[0-9]{3,8}$/, { message: '验证码格式不正确' })
  code!: string;
}

export class PasswordDto {
  @IsString()
  password!: string;
}

export class SetListenDto {
  @IsBoolean()
  listening!: boolean;
}

export class BatchListenDto {
  @IsArray()
  @ArrayNotEmpty()
  ids!: string[];

  @IsBoolean()
  listening!: boolean;
}

export class CreateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsIn(['TENANT', 'ACCOUNT', 'GROUP'])
  scope!: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsArray()
  @IsString({ each: true })
  include!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exclude?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  regex?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsIn(['TENANT', 'ACCOUNT', 'GROUP'])
  scope?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  include?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exclude?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  regex?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreateTargetDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @IsIn(['BOT', 'GROUP', 'CHANNEL', 'ADMIN_DM'])
  type!: string;

  @IsString()
  chatId!: string;

  @IsOptional()
  @IsIn(['PREFER_FORWARD', 'FORWARD_ONLY', 'LINK_ONLY', 'FORWARD_THEN_LINK'])
  mode?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateTargetDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @IsOptional()
  @IsIn(['BOT', 'GROUP', 'CHANNEL', 'ADMIN_DM'])
  type?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsIn(['PREFER_FORWARD', 'FORWARD_ONLY', 'LINK_ONLY', 'FORWARD_THEN_LINK'])
  mode?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreateBotWhitelistDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{3,20}$/, { message: '用户ID 必须是纯数字' })
  userId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateBotWhitelistDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
