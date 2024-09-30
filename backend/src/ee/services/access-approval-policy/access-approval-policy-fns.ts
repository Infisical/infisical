import { ForbiddenError, subject } from "@casl/ability";

import { ActorType } from "@app/services/auth/auth-type";

import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TIsApproversValid } from "./access-approval-policy-types";

export const isApproversValid = async ({
  userIds,
  projectId,
  orgId,
  envSlug,
  actorAuthMethod,
  secretPath,
  permissionService
}: TIsApproversValid) => {
  try {
    for await (const userId of userIds) {
      const { permission: approverPermission } = await permissionService.getProjectPermission(
        ActorType.USER,
        userId,
        projectId,
        actorAuthMethod,
        orgId
      );

      ForbiddenError.from(approverPermission).throwUnlessCan(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.Secrets, { environment: envSlug, secretPath })
      );
    }
  } catch {
    return false;
  }
  return true;
};
