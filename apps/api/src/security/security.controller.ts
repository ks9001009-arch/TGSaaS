import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { SecurityService } from './security.service';

class AddIpDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  ip!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;
}

@Controller('security')
@UseGuards(JwtAuthGuard)
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @Get('ip-allowlist')
  listIp(@CurrentUser() u: AuthUser) {
    return this.security.listAllowlist(u.userId);
  }

  @Post('ip-allowlist')
  addIp(@CurrentUser() u: AuthUser, @Body() dto: AddIpDto) {
    return this.security.addAllowlist(u.userId, dto.ip, dto.label);
  }

  @Delete('ip-allowlist/:id')
  removeIp(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.security.removeAllowlist(u.userId, id);
  }

  @Get('login-audits')
  audits(@CurrentUser() u: AuthUser, @Query('limit') limit?: string) {
    return this.security.listLoginAudits(u.userId, limit ? parseInt(limit, 10) : 50);
  }
}
