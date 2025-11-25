import { MongoAbility, MongoQuery, subject as abilitySubject } from "@casl/ability";
import picomatch from "picomatch";

import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext";
import {
  PermissionConditionOperators,
  ProjectPermissionSecretActions
} from "@app/context/ProjectPermissionContext/types";
import { TSecretFolderWithPath } from "@app/hooks/api/secretFolders/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";

import { PermissionAccess, PermissionNode } from "../types";
import { TActionRuleMap } from "./getActionRuleMap";

const ACTION_MAP: Record<string, string[] | undefined> = {
  [ProjectPermissionSub.Secrets]: [
    ProjectPermissionSecretActions.DescribeSecret,
    ProjectPermissionSecretActions.ReadValue,
    ProjectPermissionSecretActions.Create,
    ProjectPermissionSecretActions.Edit,
    ProjectPermissionSecretActions.Delete
  ],
  [ProjectPermissionSub.DynamicSecrets]: Object.values(ProjectPermissionDynamicSecretActions),
  [ProjectPermissionSub.SecretFolders]: [
    ProjectPermissionSecretActions.Create,
    ProjectPermissionSecretActions.Edit,
    ProjectPermissionSecretActions.Delete
  ]
};

const SUBJECT_HEIGHT_MAP: Record<string, number> = {
  [ProjectPermissionSub.DynamicSecrets]: 130,
  [ProjectPermissionSub.Secrets]: 85,
  default: 64
};

const evaluateCondition = (
  value: string,
  operator: PermissionConditionOperators,
  comparison: string | string[]
) => {
  switch (operator) {
    case PermissionConditionOperators.$EQ:
      return value === comparison;
    case PermissionConditionOperators.$NEQ:
      return value !== comparison;
    case PermissionConditionOperators.$GLOB:
      return picomatch.isMatch(value, comparison);
    case PermissionConditionOperators.$IN:
      return (comparison as string[]).map((v: string) => v.trim()).includes(value);
    default:
      throw new Error(`Unhandled operator: ${operator}`);
  }
};

const doesConditionMatch = (
  conditions: Record<string, any> | undefined,
  value: string
): boolean => {
  if (!conditions) return true;

  return Object.entries(conditions).every(([operator, comparisonValue]) =>
    evaluateCondition(value, operator as PermissionConditionOperators, comparisonValue)
  );
};

const doBaseConditionsApply = (
  ruleConditions: any,
  environment: string,
  folderPath: string
): boolean => {
  return (
    doesConditionMatch(ruleConditions?.environment, environment) &&
    doesConditionMatch(ruleConditions?.secretPath, folderPath)
  );
};

const shouldShowConditionalAccess = (
  actionRuleMap: TActionRuleMap,
  action: string,
  environment: string,
  folderPath: string,
  conditionalFields: string[]
): boolean => {
  // Find all rules that apply to this environment/path
  const applicableRules = actionRuleMap.filter((rule) => {
    const ruleConditions = rule[action]?.conditions;
    if (!ruleConditions) return false;
    return doBaseConditionsApply(ruleConditions, environment, folderPath);
  });

  // If no rules apply, don't show conditional
  if (applicableRules.length === 0) return false;

  // Check if ALL applicable rules have conditional fields and if at least one rule applies without conditional fields, show full access
  const allRulesHaveConditionalFields = applicableRules.every((rule) => {
    const ruleConditions = rule[action]?.conditions;
    if (!ruleConditions) return false;
    return conditionalFields.some((field) => ruleConditions[field]);
  });

  return allRulesHaveConditionalFields;
};

const determineAccessLevel = (
  hasPermission: boolean,
  subject: ProjectPermissionSub,
  action: string,
  actionRuleMap: TActionRuleMap,
  environment: string,
  folderPath: string,
  secretName: string,
  metadata: Array<{ key: string; value: string }>
): PermissionAccess => {
  if (!hasPermission) {
    return PermissionAccess.None;
  }

  if (subject === ProjectPermissionSub.Secrets) {
    if (
      !secretName &&
      shouldShowConditionalAccess(actionRuleMap, action, environment, folderPath, [
        "secretName",
        "secretTags"
      ])
    ) {
      return PermissionAccess.Partial;
    }
  } else if (subject === ProjectPermissionSub.DynamicSecrets) {
    if (
      !metadata.length &&
      shouldShowConditionalAccess(actionRuleMap, action, environment, folderPath, ["metadata"])
    ) {
      return PermissionAccess.Partial;
    }
  }

  return PermissionAccess.Full;
};

const checkPermission = (
  permissions: MongoAbility<ProjectPermissionSet, MongoQuery>,
  subject: ProjectPermissionSub,
  action: string,
  subjectFields: any
): boolean => {
  if (
    subject === ProjectPermissionSub.Secrets &&
    (action === ProjectPermissionSecretActions.ReadValue ||
      action === ProjectPermissionSecretActions.DescribeSecret)
  ) {
    return hasSecretReadValueOrDescribePermission(permissions, action, subjectFields);
  }

  return permissions.can(
    // @ts-expect-error we are not specifying which so can't resolve if valid
    action,
    abilitySubject(subject, subjectFields)
  );
};

export const createFolderNode = ({
  folder,
  permissions,
  environment,
  subject,
  secretName,
  actionRuleMap,
  metadata
}: {
  folder: TSecretFolderWithPath;
  permissions: MongoAbility<ProjectPermissionSet, MongoQuery>;
  environment: string;
  subject: ProjectPermissionSub;
  secretName: string;
  actionRuleMap: TActionRuleMap;
  metadata: Array<{ key: string; value: string }>;
}) => {
  const actions = Object.fromEntries(
    Object.values(ACTION_MAP[subject] ?? Object.values(ProjectPermissionActions)).map((action) => {
      let access: PermissionAccess;

      // wrapped in try because while editing certain conditions, if their values are empty it throws an error
      try {
        const subjectFields = {
          secretPath: folder.path,
          environment,
          secretName: secretName || "*",
          secretTags: ["*"],
          metadata: metadata.length ? metadata : ["*"]
        };

        const hasPermission = checkPermission(permissions, subject, action, subjectFields);

        access = determineAccessLevel(
          hasPermission,
          subject,
          action,
          actionRuleMap,
          environment,
          folder.path,
          secretName,
          metadata
        );
      } catch (e) {
        console.error(e);
        access = PermissionAccess.None;
      }

      return [action, access];
    })
  );

  const height = SUBJECT_HEIGHT_MAP[subject] ?? SUBJECT_HEIGHT_MAP.default;

  return {
    type: PermissionNode.Folder,
    id: folder.id,
    data: {
      ...folder,
      actions,
      environment,
      actionRuleMap,
      subject
    },
    position: { x: 0, y: 0 },
    width: 264,
    height
  };
};
