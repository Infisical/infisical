import { MongoAbility, subject } from "@casl/ability";

import { hasSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TProjectPermissionGrantSource } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

import { TGrantCondition, TGrantPath, TGrantPathStep } from "./secret-blast-radius-types";

export type TSecretSubjectFields = {
  environment: string;
  secretPath: string;
  secretName: string;
  secretTags?: string[];
};

const READ_ACTIONS = [ProjectPermissionSecretActions.DescribeSecret, ProjectPermissionSecretActions.ReadValue] as const;

type TReadAction = (typeof READ_ACTIONS)[number];

const isReadAction = (action: ProjectPermissionSecretActions): action is TReadAction =>
  READ_ACTIONS.includes(action as TReadAction);

export const canPerformSecretAction = (
  permission: MongoAbility<ProjectPermissionSet>,
  action: ProjectPermissionSecretActions,
  subjectFields: TSecretSubjectFields
) => {
  // Read splits into describe-metadata and read-value, and a project on the legacy combined action
  // grants both. The helper owns that fallback, so read actions must not go through `can` directly.
  if (isReadAction(action)) {
    return hasSecretReadValueOrDescribePermission(permission, action, subjectFields);
  }

  return permission.can(action, subject(ProjectPermissionSub.Secrets, subjectFields));
};

export const resolveAllowedSecretActions = (
  permission: MongoAbility<ProjectPermissionSet>,
  subjectFields: TSecretSubjectFields
) =>
  [
    ProjectPermissionSecretActions.DescribeSecret,
    ProjectPermissionSecretActions.ReadValue,
    ProjectPermissionSecretActions.Create,
    ProjectPermissionSecretActions.Edit,
    ProjectPermissionSecretActions.Delete
  ].filter((action) => canPerformSecretAction(permission, action, subjectFields));

// The rule CASL used to decide, so the UI can show the condition that matched rather than a
// re-implementation of the matching. An inverted (forbid) rule is not a grant.
const findGrantingRule = (permission: MongoAbility<ProjectPermissionSet>, subjectFields: TSecretSubjectFields) => {
  const candidateActions: ProjectPermissionSecretActions[] = [
    ProjectPermissionSecretActions.ReadValue,
    ProjectPermissionSecretActions.DescribeSecret,
    ProjectPermissionSecretActions.DescribeAndReadValue
  ];

  for (const action of candidateActions) {
    const secretSubject = subject(ProjectPermissionSub.Secrets, subjectFields);
    if (permission.can(action, secretSubject)) {
      const rule = permission.relevantRuleFor(action, secretSubject);
      if (rule && !rule.inverted) return rule;
    }
  }

  return undefined;
};

export const extractGrantConditions = (conditions: unknown): TGrantCondition[] => {
  if (!conditions || typeof conditions !== "object") return [];

  return Object.entries(conditions as Record<string, unknown>).flatMap(([field, matcher]) => {
    // A bare value is shorthand for equality: `{ environment: "prod" }`.
    if (matcher === null || typeof matcher !== "object") {
      return [{ field, operator: "$eq", value: matcher }];
    }

    return Object.entries(matcher as Record<string, unknown>).map(([operator, value]) => ({
      field,
      operator,
      value
    }));
  });
};

const buildPathSteps = (source: TProjectPermissionGrantSource): TGrantPathStep[] => {
  const steps: TGrantPathStep[] = [];

  if (source.kind === "groupRole" && source.groupId) {
    steps.push({ kind: "group", groupId: source.groupId, groupName: source.groupName ?? "Group" });
  }

  if (source.kind === "additionalPrivilege") {
    steps.push({
      kind: "additionalPrivilege",
      privilegeId: source.id,
      name: source.name,
      isTemporary: source.isTemporary,
      expiresAt: source.temporaryAccessEndTime
    });

    return steps;
  }

  steps.push({
    kind: "role",
    roleName: source.name,
    roleSlug: source.roleSlug,
    isTemporary: source.isTemporary,
    expiresAt: source.temporaryAccessEndTime
  });

  return steps;
};

/**
 * Which of a principal's grant sources actually reach this secret, and under what condition.
 *
 * Only call this for principals whose merged ability already allows the access. A single source
 * cannot see a forbid rule contributed by another source, so run in isolation it would report a
 * path that the merged ability denies.
 */
export const resolveGrantPaths = (
  sources: TProjectPermissionGrantSource[],
  subjectFields: TSecretSubjectFields
): TGrantPath[] =>
  sources
    .filter((source) => READ_ACTIONS.some((action) => canPerformSecretAction(source.permission, action, subjectFields)))
    .map((source) => {
      const rule = findGrantingRule(source.permission, subjectFields);

      return {
        sourceId: source.id,
        via: buildPathSteps(source),
        conditions: extractGrantConditions(rule?.conditions)
      };
    });
