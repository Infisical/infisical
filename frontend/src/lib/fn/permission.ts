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

export type GrantPrivilegeConditions = {
  emails?: string[];
  roles?: string[];
  subjects?: string[];
  actions?: string[];
  forbiddenEmails?: string[];
  forbiddenRoles?: string[];
  forbiddenSubjects?: string[];
  forbiddenActions?: string[];
};

type ConditionValue =
  | string
  | {
      [PermissionConditionOperators.$EQ]?: string;
      [PermissionConditionOperators.$NEQ]?: string;
      [PermissionConditionOperators.$IN]?: string[];
      [PermissionConditionOperators.$GLOB]?: string;
    };

type MemberConditions = {
  email?: ConditionValue;
  role?: ConditionValue;
  subject?: ConditionValue;
  action?: ConditionValue;
};

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

const isGrantPrivilegesMemberRule = (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) => {
  const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  if (!ruleSubjects.includes(ProjectPermissionSub.Member)) return false;

  const privilegeActions = [
    ProjectPermissionMemberActions.GrantPrivileges,
    ProjectPermissionMemberActions.AssignRole,
    ProjectPermissionMemberActions.AssignAdditionalPrivileges
  ];

  const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
  return ruleActions.some((action) =>
    privilegeActions.includes(action as ProjectPermissionMemberActions)
  );
};

export function getGrantPrivilegeConditions(
  permission: MongoAbility<ProjectPermissionSet>
): GrantPrivilegeConditions | null {
  const allowedRules = permission.rules.filter(
    (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) =>
      !rule.inverted && isGrantPrivilegesMemberRule(rule)
  );
  const invertedRules = permission.rules.filter(
    (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) =>
      rule.inverted && isGrantPrivilegesMemberRule(rule)
  );

  if (allowedRules.length === 0 && invertedRules.length === 0) return null;

  const hasUnconditionalAllowRule = allowedRules.some(
    (rule) => !rule.conditions || Object.keys(rule.conditions).length === 0
  );

  const result: GrantPrivilegeConditions = {};

  if (!hasUnconditionalAllowRule) {
    allowedRules.forEach((rule) => {
      const conditions = (rule.conditions ?? {}) as MemberConditions;

      const emailValues = extractConditionValues(conditions.email);
      const roleValues = extractConditionValues(conditions.role);
      const subjectValues = extractConditionValues(conditions.subject);
      const actionValues = extractConditionValues(conditions.action);

      if (emailValues.length > 0) result.emails = [...(result.emails || []), ...emailValues];
      if (roleValues.length > 0) result.roles = [...(result.roles || []), ...roleValues];
      if (subjectValues.length > 0)
        result.subjects = [...(result.subjects || []), ...subjectValues];
      if (actionValues.length > 0) result.actions = [...(result.actions || []), ...actionValues];

      // Extract $NEQ values from allow rules as forbidden values
      const neqEmailValues = extractNegatedConditionValues(conditions.email);
      const neqRoleValues = extractNegatedConditionValues(conditions.role);
      const neqSubjectValues = extractNegatedConditionValues(conditions.subject);
      const neqActionValues = extractNegatedConditionValues(conditions.action);

      if (neqEmailValues.length > 0)
        result.forbiddenEmails = [...(result.forbiddenEmails || []), ...neqEmailValues];
      if (neqRoleValues.length > 0)
        result.forbiddenRoles = [...(result.forbiddenRoles || []), ...neqRoleValues];
      if (neqSubjectValues.length > 0)
        result.forbiddenSubjects = [...(result.forbiddenSubjects || []), ...neqSubjectValues];
      if (neqActionValues.length > 0)
        result.forbiddenActions = [...(result.forbiddenActions || []), ...neqActionValues];
    });
  }

  invertedRules
    .filter((rule) => {
      const conditions = rule.conditions as MemberConditions | undefined;
      return conditions && Object.keys(conditions).length > 0;
    })
    .forEach((rule) => {
      const conditions = (rule.conditions ?? {}) as MemberConditions;
      const emailValues = extractConditionValues(conditions.email);
      const roleValues = extractConditionValues(conditions.role);
      const subjectValues = extractConditionValues(conditions.subject);
      const actionValues = extractConditionValues(conditions.action);

      if (emailValues.length > 0)
        result.forbiddenEmails = [...(result.forbiddenEmails || []), ...emailValues];
      if (roleValues.length > 0)
        result.forbiddenRoles = [...(result.forbiddenRoles || []), ...roleValues];
      if (subjectValues.length > 0)
        result.forbiddenSubjects = [...(result.forbiddenSubjects || []), ...subjectValues];
      if (actionValues.length > 0)
        result.forbiddenActions = [...(result.forbiddenActions || []), ...actionValues];
    });

  const dedupe = (arr: string[]) => [...new Set(arr)];
  if (result.emails) result.emails = dedupe(result.emails);
  if (result.roles) result.roles = dedupe(result.roles);
  if (result.subjects) result.subjects = dedupe(result.subjects);
  if (result.actions) result.actions = dedupe(result.actions);
  if (result.forbiddenEmails) result.forbiddenEmails = dedupe(result.forbiddenEmails);
  if (result.forbiddenRoles) result.forbiddenRoles = dedupe(result.forbiddenRoles);
  if (result.forbiddenSubjects) result.forbiddenSubjects = dedupe(result.forbiddenSubjects);
  if (result.forbiddenActions) result.forbiddenActions = dedupe(result.forbiddenActions);

  return Object.keys(result).length > 0 ? result : null;
}

export type IdentityGrantPrivilegeConditions = {
  identityIds?: string[];
  roles?: string[];
  subjects?: string[];
  actions?: string[];
  forbiddenIdentityIds?: string[];
  forbiddenRoles?: string[];
  forbiddenSubjects?: string[];
  forbiddenActions?: string[];
};

type IdentityConditions = {
  identityId?: ConditionValue;
  role?: ConditionValue;
  subject?: ConditionValue;
  action?: ConditionValue;
};

const isGrantPrivilegesIdentityRule = (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) => {
  const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  if (!ruleSubjects.includes(ProjectPermissionSub.Identity)) return false;

  const privilegeActions = [
    ProjectPermissionIdentityActions.GrantPrivileges,
    ProjectPermissionIdentityActions.AssignRole,
    ProjectPermissionIdentityActions.AssignAdditionalPrivileges
  ];

  const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
  return ruleActions.some((action) =>
    privilegeActions.includes(action as ProjectPermissionIdentityActions)
  );
};

export function getIdentityGrantPrivilegeConditions(
  permission: MongoAbility<ProjectPermissionSet>
): IdentityGrantPrivilegeConditions | null {
  const allowedRules = permission.rules.filter(
    (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) =>
      !rule.inverted && isGrantPrivilegesIdentityRule(rule)
  );
  const invertedRules = permission.rules.filter(
    (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) =>
      rule.inverted && isGrantPrivilegesIdentityRule(rule)
  );

  if (allowedRules.length === 0 && invertedRules.length === 0) return null;

  const hasUnconditionalAllowRule = allowedRules.some(
    (rule) => !rule.conditions || Object.keys(rule.conditions).length === 0
  );

  const result: IdentityGrantPrivilegeConditions = {};

  if (!hasUnconditionalAllowRule) {
    allowedRules.forEach((rule) => {
      const conditions = (rule.conditions ?? {}) as IdentityConditions;

      const identityIdValues = extractConditionValues(conditions.identityId);
      const roleValues = extractConditionValues(conditions.role);
      const subjectValues = extractConditionValues(conditions.subject);
      const actionValues = extractConditionValues(conditions.action);

      if (identityIdValues.length > 0)
        result.identityIds = [...(result.identityIds || []), ...identityIdValues];
      if (roleValues.length > 0) result.roles = [...(result.roles || []), ...roleValues];
      if (subjectValues.length > 0)
        result.subjects = [...(result.subjects || []), ...subjectValues];
      if (actionValues.length > 0) result.actions = [...(result.actions || []), ...actionValues];

      // Extract $NEQ values from allow rules as forbidden values
      const neqIdentityIdValues = extractNegatedConditionValues(conditions.identityId);
      const neqRoleValues = extractNegatedConditionValues(conditions.role);
      const neqSubjectValues = extractNegatedConditionValues(conditions.subject);
      const neqActionValues = extractNegatedConditionValues(conditions.action);

      if (neqIdentityIdValues.length > 0)
        result.forbiddenIdentityIds = [
          ...(result.forbiddenIdentityIds || []),
          ...neqIdentityIdValues
        ];
      if (neqRoleValues.length > 0)
        result.forbiddenRoles = [...(result.forbiddenRoles || []), ...neqRoleValues];
      if (neqSubjectValues.length > 0)
        result.forbiddenSubjects = [...(result.forbiddenSubjects || []), ...neqSubjectValues];
      if (neqActionValues.length > 0)
        result.forbiddenActions = [...(result.forbiddenActions || []), ...neqActionValues];
    });
  }

  invertedRules
    .filter((rule) => {
      const conditions = rule.conditions as IdentityConditions | undefined;
      return conditions && Object.keys(conditions).length > 0;
    })
    .forEach((rule) => {
      const conditions = (rule.conditions ?? {}) as IdentityConditions;
      const identityIdValues = extractConditionValues(conditions.identityId);
      const roleValues = extractConditionValues(conditions.role);
      const subjectValues = extractConditionValues(conditions.subject);
      const actionValues = extractConditionValues(conditions.action);

      if (identityIdValues.length > 0)
        result.forbiddenIdentityIds = [...(result.forbiddenIdentityIds || []), ...identityIdValues];
      if (roleValues.length > 0)
        result.forbiddenRoles = [...(result.forbiddenRoles || []), ...roleValues];
      if (subjectValues.length > 0)
        result.forbiddenSubjects = [...(result.forbiddenSubjects || []), ...subjectValues];
      if (actionValues.length > 0)
        result.forbiddenActions = [...(result.forbiddenActions || []), ...actionValues];
    });

  const dedupe = (arr: string[]) => [...new Set(arr)];
  if (result.identityIds) result.identityIds = dedupe(result.identityIds);
  if (result.roles) result.roles = dedupe(result.roles);
  if (result.subjects) result.subjects = dedupe(result.subjects);
  if (result.actions) result.actions = dedupe(result.actions);
  if (result.forbiddenIdentityIds)
    result.forbiddenIdentityIds = dedupe(result.forbiddenIdentityIds);
  if (result.forbiddenRoles) result.forbiddenRoles = dedupe(result.forbiddenRoles);
  if (result.forbiddenSubjects) result.forbiddenSubjects = dedupe(result.forbiddenSubjects);
  if (result.forbiddenActions) result.forbiddenActions = dedupe(result.forbiddenActions);

  return Object.keys(result).length > 0 ? result : null;
}

export type GroupGrantPrivilegeConditions = {
  groupNames?: string[];
  roles?: string[];
  forbiddenGroupNames?: string[];
  forbiddenRoles?: string[];
};

type GroupConditions = {
  groupName?: ConditionValue;
  role?: ConditionValue;
};

const isGrantPrivilegesGroupRule = (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) => {
  const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  if (!ruleSubjects.includes(ProjectPermissionSub.Groups)) return false;
  const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
  return actions.some((a) => String(a) === ProjectPermissionGroupActions.GrantPrivileges);
};

const isAssignRoleGroupRule = (rule: RawRuleOf<MongoAbility<ProjectPermissionSet>>) => {
  const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
  if (!ruleSubjects.includes(ProjectPermissionSub.Groups)) return false;
  const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
  return actions.some((a) => String(a) === ProjectPermissionGroupActions.AssignRole);
};

export const getGroupGrantPrivilegeConditions = (
  permission: MongoAbility<ProjectPermissionSet>
): GroupGrantPrivilegeConditions | null => {
  const allowedRules = permission.rules.filter(
    (rule) => (isGrantPrivilegesGroupRule(rule) || isAssignRoleGroupRule(rule)) && !rule.inverted
  );

  const invertedRules = permission.rules.filter(
    (rule) => (isGrantPrivilegesGroupRule(rule) || isAssignRoleGroupRule(rule)) && rule.inverted
  );

  if (allowedRules.length === 0 && invertedRules.length === 0) return null;

  const hasUnconditionalAllowRule = allowedRules.some(
    (rule) => !rule.conditions || Object.keys(rule.conditions).length === 0
  );

  const result: GroupGrantPrivilegeConditions = {};

  if (!hasUnconditionalAllowRule) {
    allowedRules.forEach((rule) => {
      const conditions = (rule.conditions ?? {}) as GroupConditions;

      const groupNameValues = extractConditionValues(conditions.groupName);
      const roleValues = extractConditionValues(conditions.role);

      if (groupNameValues.length > 0)
        result.groupNames = [...(result.groupNames || []), ...groupNameValues];
      if (roleValues.length > 0) result.roles = [...(result.roles || []), ...roleValues];

      // Extract $NEQ values from allow rules as forbidden values
      const neqGroupNameValues = extractNegatedConditionValues(conditions.groupName);
      const neqRoleValues = extractNegatedConditionValues(conditions.role);

      if (neqGroupNameValues.length > 0)
        result.forbiddenGroupNames = [...(result.forbiddenGroupNames || []), ...neqGroupNameValues];
      if (neqRoleValues.length > 0)
        result.forbiddenRoles = [...(result.forbiddenRoles || []), ...neqRoleValues];
    });
  }

  invertedRules
    .filter((rule) => {
      const conditions = rule.conditions as GroupConditions | undefined;
      return conditions && Object.keys(conditions).length > 0;
    })
    .forEach((rule) => {
      const conditions = (rule.conditions ?? {}) as GroupConditions;
      const groupNameValues = extractConditionValues(conditions.groupName);
      const roleValues = extractConditionValues(conditions.role);

      if (groupNameValues.length > 0)
        result.forbiddenGroupNames = [...(result.forbiddenGroupNames || []), ...groupNameValues];
      if (roleValues.length > 0)
        result.forbiddenRoles = [...(result.forbiddenRoles || []), ...roleValues];
    });

  const dedupe = (arr: string[]) => [...new Set(arr)];
  if (result.groupNames) result.groupNames = dedupe(result.groupNames);
  if (result.roles) result.roles = dedupe(result.roles);
  if (result.forbiddenGroupNames) result.forbiddenGroupNames = dedupe(result.forbiddenGroupNames);
  if (result.forbiddenRoles) result.forbiddenRoles = dedupe(result.forbiddenRoles);

  return Object.keys(result).length > 0 ? result : null;
};

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
