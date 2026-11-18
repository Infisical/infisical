import { Permission } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub,
  SecretSubjectFields
} from "@app/domains/platform/projects/ce/module";

type TSecretReadAction = ProjectPermissionSecretActions.ReadValue | ProjectPermissionSecretActions.DescribeSecret;

type TSecretPermission = Permission<ProjectPermissionSet>;

const secretCheck = (action: ProjectPermissionSecretActions, fields?: SecretSubjectFields) => ({
  action,
  subject: ProjectPermissionSub.Secrets as const,
  fields
});

// Read Value and Describe Secret replaced the combined read action; a role granting the combined action still grants
// both, so every read check accepts either.
export class SecretReadAccess {
  private constructor() {}

  static can(permission: TSecretPermission, action: TSecretReadAction, fields?: SecretSubjectFields): boolean {
    return (
      permission.can(secretCheck(action, fields)) ||
      permission.can(secretCheck(ProjectPermissionSecretActions.DescribeAndReadValue, fields))
    );
  }

  // Throws PermissionDeniedError naming the requested action, not the combined one.
  static assert(permission: TSecretPermission, action: TSecretReadAction, fields?: SecretSubjectFields): void {
    if (SecretReadAccess.can(permission, action, fields)) return;
    permission.assert(secretCheck(action, fields));
  }

  // A move deletes the secrets at the source and creates or edits them at the destination, and reading them at the
  // source needs Read Value and Describe Secret. Checked per path, without secret names or tags, so one call covers
  // a batch sharing a source and a destination. Throws on the first missing permission.
  static assertMove(
    permission: TSecretPermission,
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
  ): void {
    const destination = { environment: destinationEnvironment, secretPath: destinationSecretPath };
    const source = { environment: sourceEnvironment, secretPath: sourceSecretPath };

    permission.assert(secretCheck(ProjectPermissionSecretActions.Create, destination));
    permission.assert(secretCheck(ProjectPermissionSecretActions.Edit, destination));

    permission.assert(secretCheck(ProjectPermissionSecretActions.Delete, source));
    SecretReadAccess.assert(permission, ProjectPermissionSecretActions.DescribeSecret, source);
    SecretReadAccess.assert(permission, ProjectPermissionSecretActions.ReadValue, source);
  }
}
