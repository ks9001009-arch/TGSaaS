import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AdButtonDto {
  @IsString()
  label: string;

  @IsString()
  url: string;

  @IsOptional()
  @IsInt()
  row?: number;

  @IsOptional()
  @IsInt()
  position?: number;
}

export class CreateAdDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  placements?: string[]; // WELCOME | PRIVATE_MENU | POST_VERIFY | SCHEDULED | TEMPLATE

  @IsOptional()
  @IsString()
  botId?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  ownerAdminId?: string; // super admin may assign to a sub-admin

  @IsOptional()
  @IsInt()
  @Min(0)
  intervalMinutes?: number;

  @IsOptional()
  @IsString()
  startAt?: string;

  @IsOptional()
  @IsString()
  endAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdButtonDto)
  buttons?: AdButtonDto[];
}

export class UpdateAdDto extends CreateAdDto {
  @IsOptional()
  @IsString()
  declare title: string;
}

export class SetAdButtonsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdButtonDto)
  buttons: AdButtonDto[];
}

export class ToggleAdDto {
  @IsBoolean()
  enabled: boolean;
}

export class AssignAdDto {
  @IsOptional()
  @IsString()
  botId?: string | null;

  @IsOptional()
  @IsString()
  groupId?: string | null;

  @IsOptional()
  @IsString()
  ownerAdminId?: string | null;
}

export class SendAdDto {
  @IsString()
  groupId: string;
}
