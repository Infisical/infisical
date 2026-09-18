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
// Only secrets:read is exposed for now: the sole delegated use case is `infisical run` fetching
// secrets at runtime (e.g. via Coder External Auth). Add further scopes only when a route is opted
// into AuthMode.OAUTH to serve them.
export enum OauthScope {
  SecretsRead = "secrets:read"
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
};

export const OAUTH_SCOPE_DEFINITIONS: Record<OauthScope, TOauthScopeDefinition> = {
  [OauthScope.SecretsRead]: {
    description: "Read secrets, folders, and imports",
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

// Intersects a CASL rule set with the actions permitted by the granted scopes. This is purely
// subtractive: allow-rules are dropped if their subject is out of scope, and otherwise narrowed to
// the scope-permitted actions (conditions are preserved, so resource constraints still apply).
// Inverted ("cannot") rules are kept untouched because they only further restrict access.
const intersectRulesWithScopes = <T extends TCaslRuleLike>(rules: T[], allowed: Map<string, Set<string>>): T[] =>
  rules.flatMap((rule) => {
    if (rule.inverted) return [rule];

    const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
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

export const applyOauthScopeToOrgRules = <T extends TCaslRuleLike>(rules: T[], scopes: OauthScope[]): T[] =>
  intersectRulesWithScopes(rules, buildAllowedActionMap(scopes, "org"));

export const applyOauthScopeToProjectRules = <T extends TCaslRuleLike>(rules: T[], scopes: OauthScope[]): T[] =>
  intersectRulesWithScopes(rules, buildAllowedActionMap(scopes, "project"));
