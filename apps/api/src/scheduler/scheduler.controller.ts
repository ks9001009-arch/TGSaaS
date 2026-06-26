import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { PERMISSIONS } from '../rbac/permissions';
import { SchedulerService } from './scheduler.service';

@UseGuards(JwtAuthGuard)
@Controller('schedule')
export class SchedulerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
    private readonly rbac: RbacService,
  ) {}

  // verify the bot is in the caller's tenant scope and they can manage it
  private async assertBot(userId: string, botId: string) {
    const ctx = await this.rbac.context(userId);
    if (!ctx.botIds.includes(botId) || !this.rbac.has(ctx, PERMISSIONS.SCHEDULE_MANAGE)) {
      throw new ForbiddenException('无权操作该机器人');
    }
    return ctx;
  }

  @Get('posts')
  async list(@CurrentUser() u: AuthUser) {
    const ctx = await this.rbac.context(u.userId);
    return this.prisma.scheduledPost.findMany({
      where: { tenantId: ctx.tenantId, botId: { in: ctx.botIds } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('posts')
  async create(@CurrentUser() u: AuthUser, @Body() body: any) {
    const ctx = await this.assertBot(u.userId, body.botId);
    const nextRunAt = this.scheduler.computeNextRun({
      scheduleType: body.scheduleType || 'DAILY',
      intervalMinutes: Number(body.intervalMinutes) || 0,
      dailyTime: body.dailyTime,
    });
    return this.prisma.scheduledPost.create({
      data: {
        tenantId: ctx.tenantId,
        botId: body.botId,
        targetType: body.targetType || 'GROUP',
        targetChatId: String(body.targetChatId),
        title: body.title || '',
        text: body.text,
        scheduleType: body.scheduleType || 'DAILY',
        intervalMinutes: Number(body.intervalMinutes) || 0,
        dailyTime: body.dailyTime || null,
        enabled: body.enabled ?? true,
        nextRunAt,
      },
    });
  }

  @Patch('posts/:id')
  async toggle(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body('enabled') enabled: boolean) {
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertBot(u.userId, post.botId);
    return this.prisma.scheduledPost.update({ where: { id }, data: { enabled } });
  }

  @Delete('posts/:id')
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertBot(u.userId, post.botId);
    await this.prisma.scheduledPost.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- channels ----------

  @Get('channels')
  async channels(@CurrentUser() u: AuthUser) {
    const ctx = await this.rbac.context(u.userId);
    return this.prisma.channel.findMany({
      where: { tenantId: ctx.tenantId, botId: { in: ctx.botIds } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('channels')
  async addChannel(@CurrentUser() u: AuthUser, @Body() body: any) {
    const ctx = await this.assertBot(u.userId, body.botId);
    return this.prisma.channel.upsert({
      where: { botId_chatId: { botId: body.botId, chatId: String(body.chatId) } },
      create: {
        tenantId: ctx.tenantId,
        botId: body.botId,
        chatId: String(body.chatId),
        title: body.title || 'Channel',
        username: body.username || null,
      },
      update: { title: body.title || 'Channel', username: body.username || null },
    });
  }

  @Delete('channels/:id')
  async delChannel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const ch = await this.prisma.channel.findUnique({ where: { id } });
    if (!ch) throw new NotFoundException('Channel not found');
    await this.assertBot(u.userId, ch.botId);
    await this.prisma.channel.delete({ where: { id } });
    return { ok: true };
  }
}
