import { ForbiddenError, subject } from "@casl/ability";

import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TVerifyApprovers, VerifyApproversError } from "./access-approval-policy-types";

export const verifyApprovers = async ({
  userIds,
  projectId,
  orgId,
  envSlug,
  actorAuthMethod,
  secretPath,
  permissionService,
  error
}: TVerifyApprovers) => {
  for await (const userId of userIds) {
    try {
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
    } catch (err) {
      if (error === VerifyApproversError.BadRequestError) {
        throw new BadRequestError({
          message: "One or more approvers doesn't have access to be specified secret path"
        });
      }
      if (error === VerifyApproversError.ForbiddenError) {
        throw new ForbiddenRequestError({
          message: "You don't have access to approve this request"
        });
      }
    }
  }
};
