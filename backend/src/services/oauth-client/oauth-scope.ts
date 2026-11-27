import { RuleSet, TRuleLike } from "@app/domains/platform/access-control/ce/module";
import { ORG_OAUTH_SCOPE_RULES } from "@app/domains/platform/organizations/ce/module";
import { narrowToProjectOauthScopes, PROJECT_OAUTH_SCOPE_RULES } from "@app/domains/platform/projects/ce/module";
import { OauthScope } from "@app/lib/auth/oauth-scopes";

// Coarse, named OAuth delegation scopes. A delegated OAuth access token can never do more than the
// underlying user; scopes only *narrow* that ability (effective = userPermissions ∩ grantedScopes).
// Each scope maps to a set of (level, subject, actions) rules that are intersected against the user's
// CASL rules where the org and project permissions are built. Keep this list curated: it is a public contract.
//
// The delegated use cases are `infisical run` fetching secrets at runtime (e.g. via Coder External Auth) and
// the MCP server's tools. Add further scopes only when a route or MCP tool accepting AuthMode.OAUTH needs them.
export { OauthScope };

// Which permission ability a rule applies to: the org permission or the project permission.
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

const scopeRules = (scope: OauthScope): TOauthScopeRule[] => [
  ...PROJECT_OAUTH_SCOPE_RULES[scope].map((rule) => ({ level: "project" as const, ...rule })),
  ...ORG_OAUTH_SCOPE_RULES[scope].map((rule) => ({ level: "org" as const, ...rule }))
];

export const OAUTH_SCOPE_DEFINITIONS: Record<OauthScope, TOauthScopeDefinition> = {
  [OauthScope.SecretsDescribe]: {
    description: "See projects, folders and secrets, without their values",
    mcpOnly: true,
    rules: scopeRules(OauthScope.SecretsDescribe)
  },
  [OauthScope.SecretsWrite]: {
    description: "Create, change and delete secrets, create folders, and create projects",
    mcpOnly: true,
    rules: scopeRules(OauthScope.SecretsWrite)
  },
  [OauthScope.SecretsRead]: {
    description: "Read secrets, folders, and imports",
    mcpOnly: false,
    rules: scopeRules(OauthScope.SecretsRead)
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

export const applyOauthScopeToOrgRules = <T extends TRuleLike>(rules: T[], scopes: OauthScope[]): T[] =>
  RuleSet.of(rules).narrowTo(RuleSet.allowlistOf(scopes.flatMap((scope) => ORG_OAUTH_SCOPE_RULES[scope]))).rules;

export const applyOauthScopeToProjectRules = <T extends TRuleLike>(rules: T[], scopes: OauthScope[]): T[] =>
  narrowToProjectOauthScopes(RuleSet.of(rules), scopes).rules;
