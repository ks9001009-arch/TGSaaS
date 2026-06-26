import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from './permissions';

export const PERMISSIONS_KEY = 'required_permissions';
export const SUPER_ONLY_KEY = 'super_only';

// Require the caller to hold ALL of these permissions (super admin bypasses).
export const RequirePermissions = (...perms: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

// Require the caller to be the tenant super admin.
export const RequireSuper = () => SetMetadata(SUPER_ONLY_KEY, true);
