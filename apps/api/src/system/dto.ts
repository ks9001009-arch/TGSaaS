import { IsOptional, IsString, Matches } from 'class-validator';

export class SetTelegramApiDto {
  // numeric API ID from my.telegram.org (kept as string in transport)
  @IsString()
  @Matches(/^[0-9]+$/, { message: 'API ID 必须是数字' })
  apiId!: string;

  // API Hash (32-char hex). Leave empty to keep the currently stored hash.
  @IsOptional()
  @IsString()
  apiHash?: string;
}
