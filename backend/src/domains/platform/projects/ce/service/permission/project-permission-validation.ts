/* eslint-disable no-nested-ternary */
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";

import {
  ActionAllowedConditions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub,
  ProjectPermissionV2Schema
} from "./project-permission";

export const OptionalArrayPermissionSchema = ProjectPermissionV2Schema.array().optional();
export function checkForInvalidPermissionCombination(permissions: z.infer<typeof OptionalArrayPermissionSchema>) {
  if (!permissions) return;

  for (const permission of permissions) {
    if (permission.subject === ProjectPermissionSub.Secrets) {
      if (permission.action.includes(ProjectPermissionSecretActions.DescribeAndReadValue)) {
        const hasReadValue = permission.action.includes(ProjectPermissionSecretActions.ReadValue);
        const hasDescribeSecret = permission.action.includes(ProjectPermissionSecretActions.DescribeSecret);

        if (hasReadValue || hasDescribeSecret) {
          const hasBothDescribeAndReadValue = hasReadValue && hasDescribeSecret;

          throw new BadRequestError({
            message: `You have selected Read, and ${
              hasBothDescribeAndReadValue
                ? "both Read Value and Describe Secret"
                : hasReadValue
                  ? "Read Value"
                  : hasDescribeSecret
                    ? "Describe Secret"
                    : ""
            }. You cannot select Read Value or Describe Secret if you have selected Read. The Read permission is a legacy action which has been replaced by Describe Secret and Read Value.`
          });
        }
      }
    }

    if (permission.subject === ProjectPermissionSub.Member) {
      if (permission.action.includes(ProjectPermissionMemberActions.GrantPrivileges)) {
        const hasAssignRole = permission.action.includes(ProjectPermissionMemberActions.AssignRole);
        const hasAssignAdditionalPrivileges = permission.action.includes(
          ProjectPermissionMemberActions.AssignAdditionalPrivileges
        );

        if (hasAssignRole || hasAssignAdditionalPrivileges) {
          const hasBothNewActions = hasAssignRole && hasAssignAdditionalPrivileges;

          throw new BadRequestError({
            message: `You have selected Grant Privileges, and ${
              hasBothNewActions
                ? "both Assign Role and Assign Additional Privileges"
                : hasAssignRole
                  ? "Assign Role"
                  : hasAssignAdditionalPrivileges
                    ? "Assign Additional Privileges"
                    : ""
            }. You cannot select Assign Role or Assign Additional Privileges if you have selected Grant Privileges. The Grant Privileges permission is a legacy action which has been replaced by Assign Role and Assign Additional Privileges.`
          });
        }
      }
    }

    if (permission.subject === ProjectPermissionSub.Identity) {
      if (permission.action.includes(ProjectPermissionIdentityActions.GrantPrivileges)) {
        const hasAssignRole = permission.action.includes(ProjectPermissionIdentityActions.AssignRole);
        const hasAssignAdditionalPrivileges = permission.action.includes(
          ProjectPermissionIdentityActions.AssignAdditionalPrivileges
        );

        if (hasAssignRole || hasAssignAdditionalPrivileges) {
          const hasBothNewActions = hasAssignRole && hasAssignAdditionalPrivileges;

          throw new BadRequestError({
            message: `You have selected Grant Privileges, and ${
              hasBothNewActions
                ? "both Assign Role and Assign Additional Privileges"
                : hasAssignRole
                  ? "Assign Role"
                  : hasAssignAdditionalPrivileges
                    ? "Assign Additional Privileges"
                    : ""
            }. You cannot select Assign Role or Assign Additional Privileges if you have selected Grant Privileges. The Grant Privileges permission is a legacy action which has been replaced by Assign Role and Assign Additional Privileges.`
          });
        }
      }
    }

    if (permission.subject === ProjectPermissionSub.Groups) {
      if (permission.action.includes(ProjectPermissionGroupActions.GrantPrivileges)) {
        const hasAssignRole = permission.action.includes(ProjectPermissionGroupActions.AssignRole);

        if (hasAssignRole) {
          throw new BadRequestError({
            message:
              "You have selected Grant Privileges and Assign Role. You cannot select Assign Role if you have selected Grant Privileges. The Grant Privileges permission is a legacy action which has been replaced by Assign Role."
          });
        }
      }
    }

    const subjectConditions = ActionAllowedConditions[permission.subject as ProjectPermissionSub];
    const permissionConditions = "conditions" in permission ? permission.conditions : undefined;
    if (permissionConditions && subjectConditions) {
      const conditionKeys = Object.keys(permissionConditions);
      for (const action of permission.action) {
        const allowedConditions = subjectConditions[action];
        if (allowedConditions) {
          for (const condKey of conditionKeys) {
            if (!allowedConditions.includes(condKey)) {
              throw new BadRequestError({
                message: `Condition "${condKey}" is not allowed for action "${action}" on subject "${permission.subject}"`
              });
            }
          }
        }
      }
    }
  }

  return true;
}
