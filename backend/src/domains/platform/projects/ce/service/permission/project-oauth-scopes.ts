import { OauthScope } from "@app/lib/auth/oauth-scopes";

import { ProjectPermissionActions, ProjectPermissionSecretActions, ProjectPermissionSub } from "./project-permission";

// What each delegated OAuth scope allows on project subjects. A token keeps the user's rules only where a granted
// scope covers them.
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

// The subjects and actions the granted scopes allow, in the shape narrowRules takes.
export const projectOauthAllowlist = (scopes: string[]): Map<string, Set<string>> => {
  const allowed = new Map<string, Set<string>>();
  scopes
    .flatMap((scope) => PROJECT_OAUTH_SCOPE_RULES[scope as OauthScope] ?? [])
    .forEach(({ subject, actions }) => {
      const existing = allowed.get(subject) ?? new Set<string>();
      actions.forEach((action) => existing.add(action));
      allowed.set(subject, existing);
    });
  return allowed;
};
