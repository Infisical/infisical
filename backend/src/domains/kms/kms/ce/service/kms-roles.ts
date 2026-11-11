import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";

import {
  ProjectPermissionCmekActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/domains/platform/projects/ce/module";

// KMS project roles on top of the generic ones.
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

// KMS
export const cryptographicOperatorPermissions = buildCryptographicOperatorPermissionRules();
