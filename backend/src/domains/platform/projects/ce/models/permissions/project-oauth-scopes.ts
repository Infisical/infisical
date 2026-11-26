import { RuleSet } from "@app/domains/platform/access-control/ce/module";
import { OauthScope } from "@app/lib/auth/oauth-scopes";

import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "./project-permission-set";

// A delegated OAuth token keeps the user's rules only where a granted scope covers them.
export const PROJECT_OAUTH_SCOPE_RULES: Record<OauthScope, { subject: ProjectPermissionSub; actions: string[] }[]> = {
  [OauthScope.SecretsRead]: [
    {
      subject: ProjectPermissionSub.Secrets,
      actions: [
        ProjectPermissionSecretActions.DescribeAndReadValue,
        ProjectPermissionSecretActions.DescribeSecret,
        ProjectPermissionSecretActions.ReadValue
      ]
    },
    { subject: ProjectPermissionSub.SecretFolders, actions: [ProjectPermissionActions.Read] },
    { subject: ProjectPermissionSub.SecretImports, actions: [ProjectPermissionActions.Read] }
  ]
};

// In the shape RuleSet.narrowTo expects.
export const projectOauthAllowlist = (scopes: string[]) =>
  RuleSet.allowlistOf(scopes.flatMap((scope) => PROJECT_OAUTH_SCOPE_RULES[scope as OauthScope] ?? []));
