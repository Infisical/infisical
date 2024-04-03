import { ForbiddenError, subject } from "@casl/ability";

import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TVerifyApprovers } from "./access-approval-policy-types";

export const verifyApprovers = async ({
  approverProjectMemberships,
  projectId,
  orgId,
  envSlug,
  actorAuthMethod,
  secretPath,
  permissionService
}: TVerifyApprovers) => {
  for (const approver of approverProjectMemberships) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { permission: approverPermission } = await permissionService.getProjectPermission(
        ActorType.USER,
        approver.userId,
        projectId,
        actorAuthMethod,
        orgId
      );

      ForbiddenError.from(approverPermission).throwUnlessCan(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.Secrets, { environment: envSlug, secretPath })
      );
    } catch (err) {
      throw new BadRequestError({ message: "One or more approvers doesn't have access to be specified secret path" });
    }
  }
};
