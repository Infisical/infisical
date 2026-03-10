import { MongoAbility, RawRuleOf, subject } from "@casl/ability";

import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext";
import {
  PermissionConditionOperators,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub,
  SecretSubjectFields
} from "@app/context/ProjectPermissionContext/types";

type MemberAssignRoleConditions = {
  emails?: string[];
  roles?: string[];
  forbiddenEmails?: string[];
  forbiddenRoles?: string[];
};

type MemberAssignPrivilegesConditions = {
  emails?: string[];
  subjects?: string[];
  actions?: string[];
  forbiddenEmails?: string[];
  forbiddenSubjects?: string[];
  forbiddenActions?: string[];
};

type IdentityAssignRoleConditions = {
  identityIds?: string[];
  roles?: string[];
  forbiddenIdentityIds?: string[];
  forbiddenRoles?: string[];
};

type IdentityAssignPrivilegesConditions = {
  identityIds?: string[];
  subjects?: string[];
  actions?: string[];
  forbiddenIdentityIds?: string[];
  forbiddenSubjects?: string[];
  forbiddenActions?: string[];
};

type GroupGrantPrivilegeConditions = {
  groupNames?: string[];
  roles?: string[];
  forbiddenGroupNames?: string[];
  forbiddenRoles?: string[];
};

type ConditionValue =
  | string
  | {
      [PermissionConditionOperators.$EQ]?: string;
      [PermissionConditionOperators.$NEQ]?: string;
      [PermissionConditionOperators.$IN]?: string[];
      [PermissionConditionOperators.$GLOB]?: string;
    };

type ConditionMapping = {
  conditionKey: string;
  resultKey: string;
  forbiddenResultKey: string;
};

type MemberConditions = {
  userEmail?: ConditionValue;
  assignableRole?: ConditionValue;
  assignableSubject?: ConditionValue;
  assignableAction?: ConditionValue;
};

type IdentityConditions = {
  identityId?: ConditionValue;
  assignableRole?: ConditionValue;
  assignableSubject?: ConditionValue;
  assignableAction?: ConditionValue;
};

type GroupConditions = {
  groupName?: ConditionValue;
  assignableRole?: ConditionValue;
};

const MEMBER_ASSIGN_ROLE_CONDITION_MAPPINGS: ConditionMapping[] = [
  { conditionKey: "userEmail", resultKey: "emails", forbiddenResultKey: "forbiddenEmails" },
  { conditionKey: "assignableRole", resultKey: "roles", forbiddenResultKey: "forbiddenRoles" }
];

const MEMBER_ASSIGN_PRIVILEGES_CONDITION_MAPPINGS: ConditionMapping[] = [
  { conditionKey: "userEmail", resultKey: "emails", forbiddenResultKey: "forbiddenEmails" },
  {
    conditionKey: "assignableSubject",
    resultKey: "subjects",
    forbiddenResultKey: "forbiddenSubjects"
  },
  { conditionKey: "assignableAction", resultKey: "actions", forbiddenResultKey: "forbiddenActions" }
];

const IDENTITY_ASSIGN_ROLE_CONDITION_MAPPINGS: ConditionMapping[] = [
  {
    conditionKey: "identityId",
    resultKey: "identityIds",
    forbiddenResultKey: "forbiddenIdentityIds"
  },
  { conditionKey: "assignableRole", resultKey: "roles", forbiddenResultKey: "forbiddenRoles" }
];

const IDENTITY_ASSIGN_PRIVILEGES_CONDITION_MAPPINGS: ConditionMapping[] = [
  {
    conditionKey: "identityId",
    resultKey: "identityIds",
    forbiddenResultKey: "forbiddenIdentityIds"
  },
  {
    conditionKey: "assignableSubject",
    resultKey: "subjects",
    forbiddenResultKey: "forbiddenSubjects"
  },
  { conditionKey: "assignableAction", resultKey: "actions", forbiddenResultKey: "forbiddenActions" }
];

const GROUP_CONDITION_MAPPINGS: ConditionMapping[] = [
  {
    conditionKey: "groupName",
    resultKey: "groupNames",
    forbiddenResultKey: "forbiddenGroupNames"
  },
  { conditionKey: "assignableRole", resultKey: "roles", forbiddenResultKey: "forbiddenRoles" }
];

const PERMISSION_DISPLAY_NAMES: Record<string, string> = {
  [ProjectPermissionSub.Secrets]: "Secrets",
  [ProjectPermissionSub.SecretFolders]: "Secret Folders",
  [ProjectPermissionSub.SecretImports]: "Secret Imports",
  [ProjectPermissionSub.DynamicSecrets]: "Dynamic Secrets",
  [ProjectPermissionSub.SecretRotation]: "Secret Rotation",
  [ProjectPermissionSub.SecretSyncs]: "Secret Syncs",
  [ProjectPermissionSub.SecretEventSubscriptions]: "Secret Event Subscriptions",
  [ProjectPermissionSub.SecretApproval]: "Secret Approval Policies",
  [ProjectPermissionSub.SecretApprovalRequest]: "Secret Approval Requests",
  [ProjectPermissionSub.Identity]: "Machine Identity Management",
  [ProjectPermissionSub.SshHosts]: "SSH Hosts",
  [ProjectPermissionSub.PkiSubscribers]: "PKI Subscribers",
  [ProjectPermissionSub.CertificateTemplates]: "Certificate Templates",
  [ProjectPermissionSub.CertificateAuthorities]: "Certificate Authorities",
  [ProjectPermissionSub.Certificates]: "Certificates",
  [ProjectPermissionSub.CertificateProfiles]: "Certificate Profiles",
  [ProjectPermissionSub.CertificatePolicies]: "Certificate Policies",
  [ProjectPermissionSub.AppConnections]: "App Connections",
  [ProjectPermissionSub.PamAccounts]: "PAM Accounts",
  [ProjectPermissionSub.McpEndpoints]: "MCP Endpoints",
  [ProjectPermissionSub.Role]: "Roles",
  [ProjectPermissionSub.Member]: "User Management",
  [ProjectPermissionSub.Groups]: "Groups",
  [ProjectPermissionSub.Integrations]: "Native Integrations",
  [ProjectPermissionSub.Webhooks]: "Webhooks",
  [ProjectPermissionSub.AuditLogs]: "Audit Logs",
  [ProjectPermissionSub.Environments]: "Environments",
  [ProjectPermissionSub.IpAllowList]: "IP Allow List",
  [ProjectPermissionSub.Settings]: "Settings",
  [ProjectPermissionSub.ServiceTokens]: "Service Tokens",
  [ProjectPermissionSub.Tags]: "Tags",
  [ProjectPermissionSub.Project]: "Project",
  [ProjectPermissionSub.Cmek]: "KMS",
  [ProjectPermissionSub.Kms]: "Project KMS Configuration",
  [ProjectPermissionSub.Kmip]: "KMIP",
  [ProjectPermissionSub.Commits]: "Commits",
  [ProjectPermissionSub.PamFolders]: "PAM Folders",
  [ProjectPermissionSub.PamResources]: "PAM Resources",
  [ProjectPermissionSub.PamSessions]: "PAM Sessions",
  [ProjectPermissionSub.ApprovalRequests]: "Approval Requests",
  [ProjectPermissionSub.ApprovalRequestGrants]: "Approval Request Grants"
};

// ─── Condition extraction ───────────────────────────────────────────

const extractConditionValues = (condition: ConditionValue | undefined): string[] => {
  if (!condition) return [];

  if (typeof condition === "string") {
    return [condition];
  }

  const value =
    condition[PermissionConditionOperators.$EQ] ??
    condition[PermissionConditionOperators.$IN] ??
    condition[PermissionConditionOperators.$GLOB];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const extractNegatedConditionValues = (condition: ConditionValue | undefined): string[] => {
  if (!condition) return [];
  if (typeof condition === "string") return [];

  const neqValue = condition[PermissionConditionOperators.$NEQ];
  if (neqValue === undefined) return [];
  return Array.isArray(neqValue) ? neqValue : [neqValue];
};

function extractGrantConditions<T extends Record<string, string[]>>(
  permission: MongoAbility<ProjectPermissionSet>,
  config: {
    isRelevantRule: (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) => boolean;
    mappings: ConditionMapping[];
    getConditions: (
      rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>
    ) => Record<string, ConditionValue | undefined>;
  }
): T | null {
  const { isRelevantRule, mappings, getConditions } = config;
  const allowedRules = permission.rules.filter((r) => !r.inverted && isRelevantRule(r));
  const invertedRules = permission.rules.filter((r) => r.inverted && isRelevantRule(r));

  if (allowedRules.length === 0 && invertedRules.length === 0) return null;

  const hasUnconditionalAllowRule = allowedRules.some(
    (r) => !r.conditions || Object.keys(r.conditions).length === 0
  );

  const result: Record<string, string[]> = {};

  if (!hasUnconditionalAllowRule) {
    allowedRules.forEach((rule) => {
      const conditions = getConditions(rule);
      mappings.forEach(({ conditionKey, resultKey, forbiddenResultKey }) => {
        const cond = conditions[conditionKey];
        const values = extractConditionValues(cond);
        if (values.length > 0) {
          result[resultKey] = [...(result[resultKey] ?? []), ...values];
        }
        const neqValues = extractNegatedConditionValues(cond);
        if (neqValues.length > 0) {
          result[forbiddenResultKey] = [...(result[forbiddenResultKey] ?? []), ...neqValues];
        }
      });
    });
  }

  invertedRules
    .filter((rule) => {
      const conditions = getConditions(rule);
      return conditions && Object.keys(conditions).length > 0;
    })
    .forEach((rule) => {
      const conditions = getConditions(rule);
      mappings.forEach(({ conditionKey, forbiddenResultKey }) => {
        const values = extractConditionValues(conditions[conditionKey]);
        if (values.length > 0) {
          result[forbiddenResultKey] = [...(result[forbiddenResultKey] ?? []), ...values];
        }
      });
    });

  const dedupe = (arr: string[]) => [...new Set(arr)];
  Object.keys(result).forEach((key) => {
    result[key] = dedupe(result[key]);
  });

  return Object.keys(result).length > 0 ? (result as T) : null;
}

// ─── Rule predicates ──────────────────────────────────────────────

const isAssignRoleMemberRule = (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) => {
  const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  if (!ruleSubjects.includes(ProjectPermissionSub.Member)) return false;

  const assignRoleActions = [
    ProjectPermissionMemberActions.GrantPrivileges,
    ProjectPermissionMemberActions.AssignRole
  ];

  const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
  return ruleActions.some((action) =>
    assignRoleActions.includes(action as ProjectPermissionMemberActions)
  );
};

const isAssignRoleIdentityRule = (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) => {
  const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  if (!ruleSubjects.includes(ProjectPermissionSub.Identity)) return false;

  const assignRoleActions = [
    ProjectPermissionIdentityActions.GrantPrivileges,
    ProjectPermissionIdentityActions.AssignRole
  ];

  const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
  return ruleActions.some((action) =>
    assignRoleActions.includes(action as ProjectPermissionIdentityActions)
  );
};

const isAssignRoleGroupRule = (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) => {
  const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  if (!ruleSubjects.includes(ProjectPermissionSub.Groups)) return false;
  const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
  return actions.some(
    (a) =>
      String(a) === ProjectPermissionGroupActions.GrantPrivileges ||
      String(a) === ProjectPermissionGroupActions.AssignRole
  );
};

// Predicates for assign-additional-privileges (includes legacy grant-privileges for backward compatibility)
const isAssignPrivilegesMemberRule = (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) => {
  const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  if (!ruleSubjects.includes(ProjectPermissionSub.Member)) return false;

  const assignPrivilegesActions = [
    ProjectPermissionMemberActions.GrantPrivileges,
    ProjectPermissionMemberActions.AssignAdditionalPrivileges
  ];

  const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
  return ruleActions.some((action) =>
    assignPrivilegesActions.includes(action as ProjectPermissionMemberActions)
  );
};

const isAssignPrivilegesIdentityRule = (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) => {
  const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  if (!ruleSubjects.includes(ProjectPermissionSub.Identity)) return false;

  const assignPrivilegesActions = [
    ProjectPermissionIdentityActions.GrantPrivileges,
    ProjectPermissionIdentityActions.AssignAdditionalPrivileges
  ];

  const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
  return ruleActions.some((action) =>
    assignPrivilegesActions.includes(action as ProjectPermissionIdentityActions)
  );
};

// ─── Subject helpers ─────────────────────────────────────────────────

/**
 * Builds the permission subject for a Secret Sync. Uses connectionId, environment, and secretPath
 * when present so connectionId is still checked even when environment or folder are missing.
 */
export function getSecretSyncPermissionSubject(sync: {
  connectionId?: string;
  environment?: { slug: string } | null;
  folder?: { path: string } | null;
}) {
  const { connectionId, environment, folder } = sync;
  const envSlug = environment?.slug ?? undefined;
  const secretPathVal = folder?.path ?? undefined;
  const hasAny = connectionId || envSlug || secretPathVal;
  if (!hasAny) return ProjectPermissionSub.SecretSyncs;
  return subject(ProjectPermissionSub.SecretSyncs, {
    ...(envSlug && { environment: envSlug }),
    ...(secretPathVal && { secretPath: secretPathVal }),
    ...(connectionId && { connectionId })
  });
}

// ─── Permission checks (can) ─────────────────────────────────────────

export function hasSecretReadValueOrDescribePermission(
  permission: MongoAbility<ProjectPermissionSet>,
  action: Extract<
    ProjectPermissionSecretActions,
    ProjectPermissionSecretActions.DescribeSecret | ProjectPermissionSecretActions.ReadValue
  >,
  subjectFields?: SecretSubjectFields
) {
  let canNewPermission = false;
  let canOldPermission = false;

  if (subjectFields) {
    canNewPermission = permission.can(action, subject(ProjectPermissionSub.Secrets, subjectFields));
    canOldPermission = permission.can(
      ProjectPermissionSecretActions.DescribeAndReadValue,
      subject(ProjectPermissionSub.Secrets, subjectFields)
    );
  } else {
    canNewPermission = permission.can(action, ProjectPermissionSub.Secrets);
    canOldPermission = permission.can(
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSub.Secrets
    );
  }

  return canNewPermission || canOldPermission;
}

// ─── Grant condition extractors ─────────────────────────────────────

// Member extractors
export function getMemberAssignRoleConditions(
  permission: MongoAbility<ProjectPermissionSet>
): MemberAssignRoleConditions | null {
  return extractGrantConditions<MemberAssignRoleConditions>(permission, {
    isRelevantRule: isAssignRoleMemberRule,
    mappings: MEMBER_ASSIGN_ROLE_CONDITION_MAPPINGS,
    getConditions: (rule) => (rule.conditions ?? {}) as MemberConditions
  });
}

export function getMemberAssignPrivilegesConditions(
  permission: MongoAbility<ProjectPermissionSet>
): MemberAssignPrivilegesConditions | null {
  return extractGrantConditions<MemberAssignPrivilegesConditions>(permission, {
    isRelevantRule: isAssignPrivilegesMemberRule,
    mappings: MEMBER_ASSIGN_PRIVILEGES_CONDITION_MAPPINGS,
    getConditions: (rule) => (rule.conditions ?? {}) as MemberConditions
  });
}

// Identity extractors
export function getIdentityAssignRoleConditions(
  permission: MongoAbility<ProjectPermissionSet>
): IdentityAssignRoleConditions | null {
  return extractGrantConditions<IdentityAssignRoleConditions>(permission, {
    isRelevantRule: isAssignRoleIdentityRule,
    mappings: IDENTITY_ASSIGN_ROLE_CONDITION_MAPPINGS,
    getConditions: (rule) => (rule.conditions ?? {}) as IdentityConditions
  });
}

export function getIdentityAssignPrivilegesConditions(
  permission: MongoAbility<ProjectPermissionSet>
): IdentityAssignPrivilegesConditions | null {
  return extractGrantConditions<IdentityAssignPrivilegesConditions>(permission, {
    isRelevantRule: isAssignPrivilegesIdentityRule,
    mappings: IDENTITY_ASSIGN_PRIVILEGES_CONDITION_MAPPINGS,
    getConditions: (rule) => (rule.conditions ?? {}) as IdentityConditions
  });
}

// Group extractor (assign-role only, groups don't have additional privileges)
export const getGroupAssignRoleConditions = (
  permission: MongoAbility<ProjectPermissionSet>
): GroupGrantPrivilegeConditions | null => {
  return extractGrantConditions<GroupGrantPrivilegeConditions>(permission, {
    isRelevantRule: isAssignRoleGroupRule,
    mappings: GROUP_CONDITION_MAPPINGS,
    getConditions: (rule) => (rule.conditions ?? {}) as GroupConditions
  });
};

// ─── Grant condition utilities ──────────────────────────────────────

export function filterByGrantConditions<T>(
  items: T[],
  options: {
    getKey: (item: T) => string;
    allowed?: string[];
    forbidden?: string[];
  }
): T[] {
  const { getKey, allowed, forbidden } = options;
  let result = items;
  if (allowed?.length) {
    result = result.filter((item) => allowed.includes(getKey(item)));
  }
  if (forbidden?.length) {
    result = result.filter((item) => !forbidden.includes(getKey(item)));
  }
  return result;
}

export function canModifyByGrantConditions(options: {
  targetValue: string;
  allowed?: string[];
  forbidden?: string[];
  /** For glob patterns (e.g. email). Default: exact match */
  isMatch?: (value: string, pattern: string) => boolean;
}): boolean {
  const { targetValue, allowed, forbidden, isMatch } = options;
  const matches = isMatch ?? ((v, p) => v === p);

  if (forbidden?.length && forbidden.some((p) => matches(targetValue, p))) {
    return false;
  }
  if (!allowed?.length) return true;
  return allowed.some((p) => matches(targetValue, p));
}

// ─── Validation / formatting ─────────────────────────────────────────

export function formatValidationErrorPath(
  path: (string | number)[],
  requestBody?: Record<string, unknown> | null
): string {
  if (!requestBody) {
    return path.join(".");
  }

  // Find permissions.N.action pattern anywhere in the path
  const permissionsKeyIndex = path.findIndex((segment) => segment === "permissions");
  const permissionIndex = path[permissionsKeyIndex + 1];

  if (
    permissionsKeyIndex === -1 ||
    path[permissionsKeyIndex + 2] !== "action" ||
    typeof permissionIndex !== "number"
  ) {
    return path.join(".");
  }

  // Traverse the path to find the container holding permissions
  let container: unknown = requestBody;
  for (let i = 0; i < permissionsKeyIndex; i += 1) {
    container = (container as Record<string | number, unknown>)?.[path[i]];
  }

  const permissions = (container as { permissions?: { subject?: string }[] })?.permissions;
  const subjectValue = permissions?.[permissionIndex]?.subject;

  if (typeof subjectValue === "string") {
    return `${PERMISSION_DISPLAY_NAMES[subjectValue] ?? subjectValue} - Actions`;
  }

  return `Permission rule #${permissionIndex + 1}`;
}
