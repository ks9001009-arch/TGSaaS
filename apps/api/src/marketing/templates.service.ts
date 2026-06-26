import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateTemplateDto, UpdateTemplateDto, TEMPLATE_KINDS } from './dto';

const COMPONENT_TYPES = [
  'TEXT',
  'IMAGE',
  'VIDEO',
  'GIF',
  'FILE',
  'BUTTONS',
  'AD',
  'CHANNEL_CARD',
  'CONTACT_CARD',
  'CUSTOM',
];

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  private scopeWhere(ctx: any) {
    return ctx.isSuper
      ? { tenantId: ctx.tenantId }
      : { tenantId: ctx.tenantId, OR: [{ ownerAdminId: ctx.adminId }, { ownerAdminId: null }] };
  }

  private async getMutable(ctx: any, id: string) {
    const t = await this.prisma.messageTemplate.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!t) throw new NotFoundException('模板不存在');
    if (!ctx.isSuper && t.ownerAdminId !== ctx.adminId) {
      throw new ForbiddenException('只能管理自己的模板');
    }
    return t;
  }

  // keep only recognized component blocks (defensive against arbitrary JSON).
  private sanitizeComponents(components?: any[]): any[] {
    if (!Array.isArray(components)) return [];
    return components
      .filter((c) => c && typeof c === 'object' && COMPONENT_TYPES.includes(c.type))
      .map((c) => ({ ...c }));
  }

  private normalizeKind(v?: string) {
    return v && (TEMPLATE_KINDS as readonly string[]).includes(v) ? v : 'GENERIC';
  }

  async meta(userId: string) {
    const ctx = await this.rbac.context(userId);
    const [bots, groups, admins] = await Promise.all([
      this.prisma.bot.findMany({
        where: { tenantId: ctx.tenantId, id: { in: ctx.botIds } },
        select: { id: true, name: true, username: true },
      }),
      this.prisma.group.findMany({
        where: { tenantId: ctx.tenantId, id: { in: ctx.groupIds } },
        select: { id: true, title: true },
      }),
      ctx.isSuper
        ? this.prisma.admin.findMany({
            where: { tenantId: ctx.tenantId, isSuperAdmin: false },
            select: { id: true, email: true, displayName: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      kinds: TEMPLATE_KINDS,
      componentTypes: COMPONENT_TYPES,
      bots,
      groups,
      admins,
      isSuper: ctx.isSuper,
    };
  }

  async list(userId: string) {
    const ctx = await this.rbac.context(userId);
    return this.prisma.messageTemplate.findMany({
      where: this.scopeWhere(ctx),
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    const t = await this.prisma.messageTemplate.findFirst({ where: { id, ...this.scopeWhere(ctx) } });
    if (!t) throw new NotFoundException('模板不存在');
    return t;
  }

  async create(userId: string, dto: CreateTemplateDto) {
    const ctx = await this.rbac.context(userId);
    let ownerAdminId: string | null = ctx.isSuper ? null : ctx.adminId;
    if (ctx.isSuper && dto.ownerAdminId) {
      const owner = await this.prisma.admin.findFirst({ where: { id: dto.ownerAdminId, tenantId: ctx.tenantId } });
      if (!owner) throw new BadRequestException('指定的管理员不存在');
      ownerAdminId = owner.id;
    }
    return this.prisma.messageTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        name: dto.name,
        kind: this.normalizeKind(dto.kind),
        components: this.sanitizeComponents(dto.components),
        enabled: dto.enabled ?? true,
        botId: dto.botId || null,
        groupId: dto.groupId || null,
        ownerAdminId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateTemplateDto) {
    const ctx = await this.rbac.context(userId);
    await this.getMutable(ctx, id);
    return this.prisma.messageTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        kind: dto.kind ? this.normalizeKind(dto.kind) : undefined,
        components: dto.components ? this.sanitizeComponents(dto.components) : undefined,
        enabled: dto.enabled,
        botId: dto.botId === undefined ? undefined : dto.botId || null,
        groupId: dto.groupId === undefined ? undefined : dto.groupId || null,
      },
    });
  }

  async toggle(userId: string, id: string, enabled: boolean) {
    const ctx = await this.rbac.context(userId);
    await this.getMutable(ctx, id);
    return this.prisma.messageTemplate.update({ where: { id }, data: { enabled } });
  }

  async remove(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    await this.getMutable(ctx, id);
    await this.prisma.messageTemplate.delete({ where: { id } });
    return { ok: true };
  }

  async copy(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    const src = await this.getMutable(ctx, id);
    return this.prisma.messageTemplate.create({
      data: {
        tenantId: src.tenantId,
        name: `${src.name} 副本`,
        kind: src.kind,
        components: src.components as any,
        enabled: src.enabled,
        botId: src.botId,
        groupId: src.groupId,
        ownerAdminId: ctx.isSuper ? src.ownerAdminId : ctx.adminId,
      },
    });
  }
}
