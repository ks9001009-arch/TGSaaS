import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    const forwarded = (req.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const ip = forwarded || req.ip || req.socket?.remoteAddress;
    const ua = req.headers?.['user-agent'] as string | undefined;
    return this.auth.login(dto, ip, ua);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    const admin = await this.prisma.admin.findUnique({ where: { id: u.userId } });
    return this.auth.publicUser(admin);
  }
}
