import { createMongoAbility, MongoAbility, subject } from "@casl/ability";

import { validatePermissionBoundary } from "@app/lib/casl/boundary";
import { PermissionBoundaryError } from "@app/lib/errors";

// This function serves as a transition layer between the old and new privilege management system
// the old privilege management system is based on the actor having more privileges than the managed permission
// the new privilege management system is based on the actor having the appropriate permission to perform the privilege change,
// regardless of the actor's privilege level.
export const validatePrivilegeChangeOperation = (
  shouldUseNewPrivilegeSystem: boolean,
  opActions: string | string[],
  opSubject: string,
  actorPermission: MongoAbility,
  managedPermission: MongoAbility,
  subjectFields?: Record<string, string | undefined>
) => {
  const actions = Array.isArray(opActions) ? opActions : [opActions];

  if (shouldUseNewPrivilegeSystem) {
    const subjectToCheck = subjectFields ? subject(opSubject, subjectFields) : opSubject;

    for (const opAction of actions) {
      if (actorPermission.can(opAction, subjectToCheck)) {
        return {
          isValid: true,
          missingPermissions: []
        };
      }
    }

    // Report the first (primary) action in missingPermissions.
    // For example, when evaluating legacy actions fallback, it returns the error related to the new one not the legacy one.
    return {
      isValid: false,
      missingPermissions: [
        {
          action: actions[0],
          subject: opSubject
        }
      ]
    };
  }

  // if not, we check if the actor is indeed more privileged than the managed permission - this is the old system
  return validatePermissionBoundary(actorPermission, managedPermission);
};

export const constructPermissionErrorMessage = (
  baseMessage: string,
  shouldUseNewPrivilegeSystem: boolean,
  opAction: string,
  opSubject: string
) => {
  return `${baseMessage}${
    shouldUseNewPrivilegeSystem
      ? `. Permission denied: ${opAction} on ${opSubject}. Check that the actor's role grants this permission and that all permission conditions are met.`
      : ". Actor privilege level is not high enough to perform this action"
  }`;
};

export type TAssertRoleSetBoundaryArg = {
  shouldUseNewPrivilegeSystem: boolean;
  opActions: string | string[];
  opSubject: string;
  actorPermission: MongoAbility;
  targetPermissions: { permission: MongoAbility; role?: { slug: string } }[];
  baseMessage: string;
  subjectFields?: Record<string, string | undefined>;
};

// Bounds a privilege change against every role the target holds, not just the first one.
export const assertRoleSetBoundary = ({
  shouldUseNewPrivilegeSystem,
  opActions,
  opSubject,
  actorPermission,
  targetPermissions,
  baseMessage,
  subjectFields
}: TAssertRoleSetBoundaryArg) => {
  const primaryAction = Array.isArray(opActions) ? opActions[0] : opActions;

  const targets = targetPermissions.length ? targetPermissions : [{ permission: createMongoAbility([]) }];

  for (const target of targets) {
    const targetSubjectFields = target.role ? { ...subjectFields, assignableRole: target.role.slug } : subjectFields;

    const boundary = validatePrivilegeChangeOperation(
      shouldUseNewPrivilegeSystem,
      opActions,
      opSubject,
      actorPermission,
      target.permission,
      targetSubjectFields
    );

    if (!boundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(baseMessage, shouldUseNewPrivilegeSystem, primaryAction, opSubject),
        details: { missingPermissions: boundary.missingPermissions }
      });
  }
};
