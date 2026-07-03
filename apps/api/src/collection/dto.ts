import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class ListSubmissionsQuery {
  @IsOptional() @IsString()
  q?: string;

  @IsOptional() @IsIn(['INSTAGRAM', 'TIKTOK'])
  platform?: string;

  @IsOptional() @IsString()
  groupId?: string;

  @IsOptional() @IsString()
  page?: string;

  @IsOptional() @IsString()
  pageSize?: string;
}

export class SetGroupConfigDto {
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsBoolean()
  collectInstagram?: boolean;

  @IsOptional() @IsBoolean()
  collectTiktok?: boolean;

  @IsOptional() @IsBoolean()
  replyOnCapture?: boolean;
}

export class BulkToggleDto {
  @IsBoolean()
  enabled!: boolean;
}

export class TenantDefaultDto {
  @IsBoolean()
  enabled!: boolean;
}
