import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateButtonDto, UpdateButtonDto, LINK_TYPES } from './dto';

@Injectable()
export class ButtonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // sub-admins see their own buttons + tenant-wide (unowned) shared buttons.
  private scopeWhere(ctx: any) {
    return ctx.isSuper
      ? { tenantId: ctx.tenantId }
      : { tenantId: ctx.tenantId, OR: [{ ownerAdminId: ctx.adminId }, { ownerAdminId: null }] };
  }

  private async getMutable(ctx: any, id: string) {
    const b = await this.prisma.marketingButton.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!b) throw new NotFoundException('按钮不存在');
    if (!ctx.isSuper && b.ownerAdminId !== ctx.adminId) {
      throw new ForbiddenException('只能管理自己的按钮');
    }
    return b;
  }

  private normalizeLinkType(v?: string) {
    return v && (LINK_TYPES as readonly string[]).includes(v) ? (v as any) : 'URL';
  }

  async list(userId: string) {
    const ctx = await this.rbac.context(userId);
    return this.prisma.marketingButton.findMany({
      where: this.scopeWhere(ctx),
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateButtonDto) {
    const ctx = await this.rbac.context(userId);
    let ownerAdminId: string | null = ctx.isSuper ? null : ctx.adminId;
    if (ctx.isSuper && dto.ownerAdminId) {
      const owner = await this.prisma.admin.findFirst({ where: { id: dto.ownerAdminId, tenantId: ctx.tenantId } });
      if (!owner) throw new BadRequestException('指定的管理员不存在');
      ownerAdminId = owner.id;
    }
    const max = await this.prisma.marketingButton.aggregate({
      where: { tenantId: ctx.tenantId },
      _max: { sort: true },
    });
    return this.prisma.marketingButton.create({
      data: {
        tenantId: ctx.tenantId,
        name: dto.name,
        displayName: dto.displayName,
        emoji: dto.emoji || null,
        linkType: this.normalizeLinkType(dto.linkType),
        target: dto.target,
        sort: dto.sort ?? (max._max.sort ?? 0) + 1,
        enabled: dto.enabled ?? true,
        botId: dto.botId || null,
        groupId: dto.groupId || null,
        ownerAdminId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateButtonDto) {
    const ctx = await this.rbac.context(userId);
    await this.getMutable(ctx, id);
    return this.prisma.marketingButton.update({
      where: { id },
      data: {
        name: dto.name,
        displayName: dto.displayName,
        emoji: dto.emoji === undefined ? undefined : dto.emoji || null,
        linkType: dto.linkType ? this.normalizeLinkType(dto.linkType) : undefined,
        target: dto.target,
        sort: dto.sort,
        enabled: dto.enabled,
        botId: dto.botId === undefined ? undefined : dto.botId || null,
        groupId: dto.groupId === undefined ? undefined : dto.groupId || null,
      },
    });
  }

  async toggle(userId: string, id: string, enabled: boolean) {
    const ctx = await this.rbac.context(userId);
    await this.getMutable(ctx, id);
    return this.prisma.marketingButton.update({ where: { id }, data: { enabled } });
  }

  async remove(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    await this.getMutable(ctx, id);
    await this.prisma.marketingButton.delete({ where: { id } });
    return { ok: true };
  }

  async copy(userId: string, id: string) {
    const ctx = await this.rbac.context(userId);
    const src = await this.getMutable(ctx, id);
    return this.prisma.marketingButton.create({
      data: {
        tenantId: src.tenantId,
        name: `${src.name} 副本`,
        displayName: src.displayName,
        emoji: src.emoji,
        linkType: src.linkType,
        target: src.target,
        sort: src.sort + 1,
        enabled: src.enabled,
        botId: src.botId,
        groupId: src.groupId,
        ownerAdminId: ctx.isSuper ? src.ownerAdminId : ctx.adminId,
      },
    });
  }

  // drag-and-drop reorder: persist new order as sort indices.
  async reorder(userId: string, ids: string[]) {
    const ctx = await this.rbac.context(userId);
    const owned = await this.prisma.marketingButton.findMany({
      where: { id: { in: ids }, ...this.scopeWhere(ctx) },
      select: { id: true },
    });
    const allowed = new Set(owned.map((b) => b.id));
    await this.prisma.$transaction(
      ids
        .filter((id) => allowed.has(id))
        .map((id, idx) =>
          this.prisma.marketingButton.update({ where: { id }, data: { sort: idx } }),
        ),
    );
    return { ok: true };
  }
}
