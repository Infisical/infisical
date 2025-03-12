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

export const createFolderNode = ({
  folder,
  permissions,
  environment,
  subject,
  secretName,
  actionRuleMap
}: {
  folder: TSecretFolderWithPath;
  permissions: MongoAbility<ProjectPermissionSet, MongoQuery>;
  environment: string;
  subject: ProjectPermissionSub;
  secretName: string;
  actionRuleMap: TActionRuleMap;
}) => {
  const actions = Object.fromEntries(
    Object.values(ACTION_MAP[subject] ?? Object.values(ProjectPermissionActions)).map((action) => {
      let access: PermissionAccess;

      // wrapped in try because while editing certain conditions, if their values are empty it throws an error
      try {
        let hasPermission: boolean;

        const subjectFields = {
          secretPath: folder.path,
          environment,
          secretName: secretName || "*",
          secretTags: ["*"]
        };

        if (
          subject === ProjectPermissionSub.Secrets &&
          (action === ProjectPermissionSecretActions.ReadValue ||
            action === ProjectPermissionSecretActions.DescribeSecret)
        ) {
          hasPermission = hasSecretReadValueOrDescribePermission(
            permissions,
            action,
            subjectFields
          );
        } else {
          hasPermission = permissions.can(
            // @ts-expect-error we are not specifying which so can't resolve if valid
            action,
            abilitySubject(subject, subjectFields)
          );
        }

        if (hasPermission) {
          // we want to show yellow/conditional access if user hasn't specified secret name to fully resolve access
          if (
            !secretName &&
            actionRuleMap.some((el) => {
              // we only show conditional if secretName/secretTags are present - environment and path can be directly determined
              if (!el[action]?.conditions?.secretName && !el[action]?.conditions?.secretTags)
                return false;

              // make sure condition applies to env
              if (el[action]?.conditions?.environment) {
                if (
                  !Object.entries(el[action]?.conditions?.environment).every(([operator, value]) =>
                    evaluateCondition(environment, operator as PermissionConditionOperators, value)
                  )
                ) {
                  return false;
                }
              }

              // and applies to path
              if (el[action]?.conditions?.secretPath) {
                if (
                  !Object.entries(el[action]?.conditions?.secretPath).every(([operator, value]) =>
                    evaluateCondition(folder.path, operator as PermissionConditionOperators, value)
                  )
                ) {
                  return false;
                }
              }

              return true;
            })
          ) {
            access = PermissionAccess.Partial;
          } else {
            access = PermissionAccess.Full;
          }
        } else {
          access = PermissionAccess.None;
        }
      } catch (e) {
        console.error(e);
        access = PermissionAccess.None;
      }

      return [action, access];
    })
  );

  let height: number;

  switch (subject) {
    case ProjectPermissionSub.DynamicSecrets:
      height = 130;
      break;
    case ProjectPermissionSub.Secrets:
      height = 85;
      break;
    default:
      height = 64;
  }

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
