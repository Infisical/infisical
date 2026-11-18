import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import {
  genericProjectRoles,
  ProjectPermissionCmekActions,
  ProjectPermissionSet,
  ProjectPermissionSub,
  StandardProjectRoles
} from "@app/domains/platform/projects/ce/module";

const buildCryptographicOperatorPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(
    [
      ProjectPermissionCmekActions.Encrypt,
      ProjectPermissionCmekActions.Decrypt,
      ProjectPermissionCmekActions.Sign,
      ProjectPermissionCmekActions.Verify,
      ProjectPermissionCmekActions.GenerateMac,
      ProjectPermissionCmekActions.VerifyMac
    ],
    ProjectPermissionSub.Cmek
  );

  return rules;
};

export const cryptographicOperatorPermissions = buildCryptographicOperatorPermissionRules();

// The cryptographic operator only means something in a KMS project.
export const kmsProjectRoles = new StandardProjectRoles(ProjectType.KMS, {
  ...genericProjectRoles,
  [ProjectMembershipRole.KmsCryptographicOperator]: cryptographicOperatorPermissions
});
