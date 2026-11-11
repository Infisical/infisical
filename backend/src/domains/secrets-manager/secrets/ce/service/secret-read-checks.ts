import { ForbiddenError, MongoAbility, PureAbility, subject } from "@casl/ability";

import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub,
  SecretSubjectFields
} from "@app/domains/platform/projects/ce/module";

// Read Value and Describe Secret replaced the legacy combined read action; a role granting the legacy action still
// grants both, so every read check accepts either.
export function throwIfMissingSecretReadValueOrDescribePermission(
  permission: MongoAbility<ProjectPermissionSet> | PureAbility,
  action: Extract<
    ProjectPermissionSecretActions,
    ProjectPermissionSecretActions.ReadValue | ProjectPermissionSecretActions.DescribeSecret
  >,
  subjectFields?: SecretSubjectFields
) {
  const secretSubject = subjectFields
    ? subject(ProjectPermissionSub.Secrets, subjectFields)
    : ProjectPermissionSub.Secrets;
  // ForbiddenError captures a stack trace, so only build one when access is actually denied.
  if (
    permission.can(ProjectPermissionSecretActions.DescribeAndReadValue, secretSubject) ||
    permission.can(action, secretSubject)
  ) {
    return;
  }
  ForbiddenError.from(permission).throwUnlessCan(action, secretSubject);
}

export function hasSecretReadValueOrDescribePermission(
  permission: MongoAbility<ProjectPermissionSet>,
  action: Extract<
    ProjectPermissionSecretActions,
    ProjectPermissionSecretActions.DescribeSecret | ProjectPermissionSecretActions.ReadValue
  >,
  subjectFields?: SecretSubjectFields
) {
  let canNewPermission = false;
  let canOldPermission = false;

  if (subjectFields) {
    canNewPermission = permission.can(action, subject(ProjectPermissionSub.Secrets, subjectFields));
    canOldPermission = permission.can(
      ProjectPermissionSecretActions.DescribeAndReadValue,
      subject(ProjectPermissionSub.Secrets, subjectFields)
    );
  } else {
    canNewPermission = permission.can(action, ProjectPermissionSub.Secrets);
    canOldPermission = permission.can(
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSub.Secrets
    );
  }

  return canNewPermission || canOldPermission;
}

// authorizes moving secrets from one (environment, path) to another at the path level: a move is a
// delete-at-source + create/edit-at-destination, and the source read also requires read-value/describe.
// this is path-scoped (no per-secret name/tag conditions), so a single call covers a whole batch of
// secrets sharing the same source and destination path. throws ForbiddenError on the first missing grant.
export function validateSecretMovePermissions(
  permission: MongoAbility<ProjectPermissionSet> | PureAbility,
  {
    sourceEnvironment,
    sourceSecretPath,
    destinationEnvironment,
    destinationSecretPath
  }: {
    sourceEnvironment: string;
    sourceSecretPath: string;
    destinationEnvironment: string;
    destinationSecretPath: string;
  }
) {
  const sourceActions = [
    ProjectPermissionSecretActions.Delete,
    ProjectPermissionSecretActions.DescribeSecret,
    ProjectPermissionSecretActions.ReadValue
  ] as const;
  const destinationActions = [ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.Edit] as const;

  for (const destinationAction of destinationActions) {
    ForbiddenError.from(permission).throwUnlessCan(
      destinationAction,
      subject(ProjectPermissionSub.Secrets, {
        environment: destinationEnvironment,
        secretPath: destinationSecretPath
      })
    );
  }

  for (const sourceAction of sourceActions) {
    if (
      sourceAction === ProjectPermissionSecretActions.ReadValue ||
      sourceAction === ProjectPermissionSecretActions.DescribeSecret
    ) {
      throwIfMissingSecretReadValueOrDescribePermission(permission, sourceAction, {
        environment: sourceEnvironment,
        secretPath: sourceSecretPath
      });
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        sourceAction,
        subject(ProjectPermissionSub.Secrets, {
          environment: sourceEnvironment,
          secretPath: sourceSecretPath
        })
      );
    }
  }
}
