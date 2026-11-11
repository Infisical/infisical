import { OauthScope } from "@app/lib/auth/oauth-scopes";

import { OrgPermissionSubjects } from "./permission/org-permission";

// What each delegated OAuth scope allows on org subjects. No scope reaches org subjects yet, so a delegated token
// keeps only its deny rules at the org level.
const ORG_OAUTH_SCOPE_RULES: Record<OauthScope, { subject: OrgPermissionSubjects; actions: string[] }[]> = {
  [OauthScope.SecretsRead]: []
};

// The subjects and actions the granted scopes allow, in the shape narrowRules takes.
export const orgOauthAllowlist = (scopes: string[]): Map<string, Set<string>> => {
  const allowed = new Map<string, Set<string>>();
  scopes
    .flatMap((scope) => ORG_OAUTH_SCOPE_RULES[scope as OauthScope] ?? [])
    .forEach(({ subject, actions }) => {
      const existing = allowed.get(subject) ?? new Set<string>();
      actions.forEach((action) => existing.add(action));
      allowed.set(subject, existing);
    });
  return allowed;
};
