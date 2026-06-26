import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export const LINK_TYPES = ['URL', 'USER', 'GROUP', 'CHANNEL', 'MINIAPP'] as const;
export const TEMPLATE_KINDS = [
  'WELCOME',
  'VERIFY',
  'AUTO_REPLY',
  'SCHEDULED',
  'ANNOUNCEMENT',
  'AD',
  'GENERIC',
] as const;

// ---------------- Button Library ----------------

export class CreateButtonDto {
  @IsString()
  name: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsIn(LINK_TYPES as unknown as string[])
  linkType?: string;

  @IsString()
  target: string;

  @IsOptional()
  @IsInt()
  sort?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  botId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  ownerAdminId?: string;
}

export class UpdateButtonDto extends CreateButtonDto {
  @IsOptional()
  @IsString()
  declare name: string;

  @IsOptional()
  @IsString()
  declare displayName: string;

  @IsOptional()
  @IsString()
  declare target: string;
}

export class ToggleDto {
  @IsBoolean()
  enabled: boolean;
}

export class ReorderDto {
  @IsArray()
  ids: string[];
}

// ---------------- Message Templates ----------------

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsIn(TEMPLATE_KINDS as unknown as string[])
  kind?: string;

  @IsOptional()
  @IsArray()
  components?: any[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  botId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  ownerAdminId?: string;
}

export class UpdateTemplateDto extends CreateTemplateDto {
  @IsOptional()
  @IsString()
  declare name: string;
}

// ---------------- Batch assignment ----------------

export class ApplyTemplateDto {
  @IsString()
  templateId: string;

  @IsArray()
  groupIds: string[];
}

export class ToggleAssignmentDto {
  @IsString()
  templateId: string;

  @IsString()
  groupId: string;

  @IsBoolean()
  enabled: boolean;
}

export class OverrideAssignmentDto {
  @IsString()
  templateId: string;

  @IsString()
  groupId: string;

  // { disabledButtonIds?: string[], components?: any[] }
  overrides: any;
}
