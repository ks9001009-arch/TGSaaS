import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from './rbac.service';
import { PermissionKey } from './permissions';
import { PERMISSIONS_KEY, SUPER_ONLY_KEY } from './require-permissions.decorator';

/**
 * Declarative coarse-grained gate (defense in depth on top of per-bot/group
 * checks in the services). Use with @RequireSuper() / @RequirePermissions(...).
 * Must run after JwtAuthGuard (so request.user is populated).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const superOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!superOnly && (!required || required.length === 0)) return true;

    const req = context.switchToHttp().getRequest();
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('未认证');

    const ctx = await this.rbac.context(userId);
    if (ctx.isSuper) return true;

    if (superOnly) throw new ForbiddenException('需要租户超级管理员权限');

    const ok = (required ?? []).every((p) => ctx.permissions.has(p));
    if (!ok) throw new ForbiddenException('没有访问该资源的权限');
    return true;
  }
}
