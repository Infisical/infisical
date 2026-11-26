import {
  OrgPermissionActions,
  OrgPermissionProjectActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

// Coarse, named OAuth delegation scopes. A delegated OAuth access token can never do more than the
// underlying user; scopes only *narrow* that ability (effective = userPermissions ∩ grantedScopes).
// Each scope maps to a set of (level, subject, actions) rules that are intersected against the user's
// CASL rules in permission-service. Keep this list curated — it is a public contract.
//
// The delegated use cases are `infisical run` fetching secrets at runtime (e.g. via Coder External Auth) and
// the MCP server's tools. Each product gets describe, read and write scopes, which the consent page offers as
// Describe Only, Read Only and Full Access. Add further scopes only when a route or MCP tool accepting
// AuthMode.OAUTH needs them.
export enum OauthScope {
  SecretsDescribe = "secrets:describe",
  SecretsRead = "secrets:read",
  SecretsWrite = "secrets:write"
}

// Which permission ability a rule applies to. getOrgPermission builds org-level abilities,
// getProjectPermission builds project-level abilities; a scope can contribute to either or both.
export type OauthScopeLevel = "org" | "project";

export type TOauthScopeRule = {
  level: OauthScopeLevel;
  subject: string;
  actions: string[];
};

type TOauthScopeDefinition = {
  description: string;
  rules: TOauthScopeRule[];
  // OAuth applications using the REST API have only ever been offered secrets:read. Scopes that serve only the MCP tools
  // are granted only to tokens bound to the MCP endpoint; offering them to every OAuth application is a separate
  // decision.
  mcpOnly: boolean;
};

export const OAUTH_SCOPE_DEFINITIONS: Record<OauthScope, TOauthScopeDefinition> = {
  [OauthScope.SecretsDescribe]: {
    description: "See projects, folders and secrets, without their values",
    mcpOnly: true,
    rules: [
      // Not the legacy combined "read" action, which also grants secret values.
      {
        level: "project",
        subject: ProjectPermissionSub.Secrets,
        actions: [ProjectPermissionSecretActions.DescribeSecret]
      },
      { level: "project", subject: ProjectPermissionSub.SecretFolders, actions: [ProjectPermissionActions.Read] },
      { level: "project", subject: ProjectPermissionSub.SecretImports, actions: [ProjectPermissionActions.Read] }
    ]
  },
  [OauthScope.SecretsWrite]: {
    description: "Create, change and delete secrets, create folders, and create projects",
    mcpOnly: true,
    rules: [
      {
        level: "project",
        subject: ProjectPermissionSub.Secrets,
        actions: [
          ProjectPermissionSecretActions.Create,
          ProjectPermissionSecretActions.Edit,
          ProjectPermissionSecretActions.Delete
        ]
      },
      { level: "project", subject: ProjectPermissionSub.SecretFolders, actions: [ProjectPermissionActions.Create] },
      // Creating a project takes either of these, depending on how the user's org role was written.
      { level: "org", subject: OrgPermissionSubjects.Workspace, actions: [OrgPermissionActions.Create] },
      { level: "org", subject: OrgPermissionSubjects.Project, actions: [OrgPermissionProjectActions.Create] }
    ]
  },
  [OauthScope.SecretsRead]: {
    description: "Read secrets, folders, and imports",
    mcpOnly: false,
    rules: [
      {
        level: "project",
        subject: ProjectPermissionSub.Secrets,
        actions: [
          ProjectPermissionSecretActions.DescribeAndReadValue,
          ProjectPermissionSecretActions.DescribeSecret,
          ProjectPermissionSecretActions.ReadValue
        ]
      },
      { level: "project", subject: ProjectPermissionSub.SecretFolders, actions: [ProjectPermissionActions.Read] },
      { level: "project", subject: ProjectPermissionSub.SecretImports, actions: [ProjectPermissionActions.Read] }
    ]
  }
};

export const isValidOauthScope = (value: string): value is OauthScope =>
  Object.prototype.hasOwnProperty.call(OAUTH_SCOPE_DEFINITIONS, value);

// OAuth scope requests are a space-delimited string (RFC 6749 §3.3). Splits, de-duplicates, and
// partitions into recognized scopes vs. unknown ones so the caller can reject `invalid_scope`.
export const parseOauthScopeString = (raw?: string): { granted: OauthScope[]; invalid: string[] } => {
  const seen = new Set<string>();
  const granted: OauthScope[] = [];
  const invalid: string[] = [];

  (raw ?? "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((value) => {
      const keep = Boolean(value) && !seen.has(value);
      seen.add(value);
      return keep;
    })
    .forEach((value) => {
      if (isValidOauthScope(value)) granted.push(value);
      else invalid.push(value);
    });

  return { granted, invalid };
};

export const getOauthScopeDescriptions = (scopes: OauthScope[]) =>
  scopes.map((scope) => ({ scope, description: OAUTH_SCOPE_DEFINITIONS[scope].description }));

// CASL wildcards: "manage" matches every action on a subject, "all" matches every subject.
const CASL_MANAGE_ACTION = "manage";
const CASL_ALL_SUBJECT = "all";

type TCaslRuleLike = {
  action: string | string[];
  subject?: string | string[];
  inverted?: boolean;
};

const buildAllowedActionMap = (scopes: OauthScope[], level: OauthScopeLevel) => {
  const allowed = new Map<string, Set<string>>();
  scopes
    .flatMap((scope) => OAUTH_SCOPE_DEFINITIONS[scope].rules)
    .filter((rule) => rule.level === level)
    .forEach((rule) => {
      const existing = allowed.get(rule.subject) ?? new Set<string>();
      rule.actions.forEach((action) => existing.add(action));
      allowed.set(rule.subject, existing);
    });
  return allowed;
};

// A rule on the CASL "all" subject (e.g. org/project admin) fans out to every in-scope subject;
// any other subject maps to itself only when it is in scope, otherwise to nothing.
const resolveTargetSubjects = (ruleSubject: string | undefined, allowed: Map<string, Set<string>>): string[] => {
  if (ruleSubject === CASL_ALL_SUBJECT) return [...allowed.keys()];
  if (ruleSubject && allowed.has(ruleSubject)) return [ruleSubject];
  return [];
};

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

// Intersects a CASL rule set with the actions permitted by the granted scopes. This is purely
// subtractive: allow-rules are dropped if their subject is out of scope, and otherwise narrowed to
// the scope-permitted actions (conditions are preserved, so resource constraints still apply).
// Inverted ("cannot") rules are kept because they only further restrict access.
const intersectRulesWithScopes = <T extends TCaslRuleLike>(rules: T[], allowed: Map<string, Set<string>>): T[] => {
  // When the scope allows only part of the legacy secrets "read" action, it is split on every rule that covers secrets,
  // so Describe Only still lists names for a role that has only "read". Denies are split too: a whole "read" deny would
  // not match the describeSecret allow the split creates, and the user would see names they are denied.
  const secretActions = allowed.get(ProjectPermissionSub.Secrets);
  const splitsLegacyRead = Boolean(
    secretActions && !secretActions.has(ProjectPermissionSecretActions.DescribeAndReadValue)
  );

  return rules.flatMap((rule) => {
    const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    const coversSecrets = ruleSubjects.some(
      (ruleSubject) => ruleSubject === ProjectPermissionSub.Secrets || ruleSubject === CASL_ALL_SUBJECT
    );
    const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
    const ruleActions = splitsLegacyRead && coversSecrets ? splitLegacySecretRead(actions) : actions;

    if (rule.inverted) return [ruleActions === actions ? rule : { ...rule, action: ruleActions }];

    const grantsManage = ruleActions.includes(CASL_MANAGE_ACTION);

    return ruleSubjects.flatMap((ruleSubject) =>
      resolveTargetSubjects(ruleSubject, allowed).flatMap((subject) => {
        const allowedActions = allowed.get(subject) ?? new Set<string>();
        const newActions = grantsManage
          ? [...allowedActions]
          : ruleActions.filter((action) => allowedActions.has(action));
        return newActions.length ? [{ ...rule, subject, action: newActions }] : [];
      })
    );
  });
};

export const applyOauthScopeToOrgRules = <T extends TCaslRuleLike>(rules: T[], scopes: OauthScope[]): T[] =>
  intersectRulesWithScopes(rules, buildAllowedActionMap(scopes, "org"));

export const applyOauthScopeToProjectRules = <T extends TCaslRuleLike>(rules: T[], scopes: OauthScope[]): T[] =>
  intersectRulesWithScopes(rules, buildAllowedActionMap(scopes, "project"));
