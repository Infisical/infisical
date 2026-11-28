import { RuleSet, TRuleLike } from "@app/domains/platform/access-control/ce/module";
import { OauthScope } from "@app/lib/auth/oauth-scopes";

import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "./project-permission-set";

const CASL_ALL_SUBJECT = "all";

// A delegated OAuth token keeps the user's rules only where a granted scope covers them.
export const PROJECT_OAUTH_SCOPE_RULES: Record<OauthScope, { subject: ProjectPermissionSub; actions: string[] }[]> = {
  [OauthScope.SecretsDescribe]: [
    // Not the legacy combined "read" action, which also grants secret values.
    { subject: ProjectPermissionSub.Secrets, actions: [ProjectPermissionSecretActions.DescribeSecret] },
    { subject: ProjectPermissionSub.SecretFolders, actions: [ProjectPermissionActions.Read] },
    { subject: ProjectPermissionSub.SecretImports, actions: [ProjectPermissionActions.Read] }
  ],
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
  ],
  [OauthScope.SecretsWrite]: [
    {
      subject: ProjectPermissionSub.Secrets,
      actions: [
        ProjectPermissionSecretActions.Create,
        ProjectPermissionSecretActions.Edit,
        ProjectPermissionSecretActions.Delete
      ]
    },
    { subject: ProjectPermissionSub.SecretFolders, actions: [ProjectPermissionActions.Create] }
  ]
};

const projectOauthAllowlist = (scopes: string[]) =>
  RuleSet.allowlistOf(scopes.flatMap((scope) => PROJECT_OAUTH_SCOPE_RULES[scope as OauthScope] ?? []));

// The legacy secrets "read" action grants what describeSecret and readValue grant together.
const splitLegacySecretRead = (actions: string[]) =>
  actions.includes(ProjectPermissionSecretActions.DescribeAndReadValue)
    ? [
        ...new Set([
          ...actions,
          ProjectPermissionSecretActions.DescribeSecret,
          ProjectPermissionSecretActions.ReadValue
        ])
      ]
    : actions;

// When the scopes allow only part of the legacy secrets "read" action, it is split on every rule that covers secrets,
// so Describe Only still lists names for a role that has only "read". Denies are split too: a whole "read" deny would
// not match the describeSecret allow the split creates, and the user would see names they are denied.
export const narrowToProjectOauthScopes = <T extends TRuleLike>(rules: RuleSet<T>, scopes: string[]): RuleSet<T> => {
  const allowed = projectOauthAllowlist(scopes);
  const secretActions = allowed.get(ProjectPermissionSub.Secrets);
  if (!secretActions || secretActions.has(ProjectPermissionSecretActions.DescribeAndReadValue)) {
    return rules.narrowTo(allowed);
  }
  const split = rules.rules.map((rule) => {
    const subjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    const coversSecrets = subjects.some(
      (subject) => subject === ProjectPermissionSub.Secrets || subject === CASL_ALL_SUBJECT
    );
    if (!coversSecrets) return rule;
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    const splitActions = splitLegacySecretRead(actions);
    return splitActions === actions ? rule : { ...rule, action: splitActions };
  });
  return RuleSet.of(split).narrowTo(allowed);
};
