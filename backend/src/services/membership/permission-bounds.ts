import { AbilityTuple } from "@casl/ability";

import { Permission, TBoundsCheck } from "@app/domains/platform/access-control/ce/module";
import { PermissionBoundaryError } from "@app/lib/errors";

export const permissionBoundsMessage = ({
  message,
  usesNewPrivilegeSystem,
  action,
  subject
}: {
  message: string;
  usesNewPrivilegeSystem: boolean;
  action: string;
  subject: string;
}) =>
  `${message}${
    usesNewPrivilegeSystem
      ? `. Permission denied: ${action} on ${subject}. Check that the actor's role grants this permission and that all permission conditions are met.`
      : ". Actor privilege level is not high enough to perform this action"
  }`;

// Throws PermissionBoundaryError when the actor may not change what the targets hold (see Permission.boundsViolations).
export const assertPermissionBounds = <TSet extends AbilityTuple>(
  permission: Permission<TSet>,
  { message, ...check }: TBoundsCheck<TSet> & { message: string }
) => {
  const missingPermissions = permission.boundsViolations(check);
  if (!missingPermissions.length) return;

  const action = Array.isArray(check.actions) ? check.actions[0] : check.actions;
  throw new PermissionBoundaryError({
    message: permissionBoundsMessage({
      message,
      usesNewPrivilegeSystem: check.usesNewPrivilegeSystem,
      action: action as string,
      subject: check.subject
    }),
    details: { missingPermissions }
  });
};
