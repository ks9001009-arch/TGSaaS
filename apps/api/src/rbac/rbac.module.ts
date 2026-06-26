import { Global, Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RbacBootstrapService } from './rbac-bootstrap.service';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  providers: [RbacService, RbacBootstrapService, PermissionsGuard],
  exports: [RbacService, RbacBootstrapService, PermissionsGuard],
})
export class RbacModule {}
