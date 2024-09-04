import { ForbiddenError, subject } from "@casl/ability";

import { BadRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { triggerSlackNotification } from "@app/services/slack/slack-fns";
import { SlackTriggerFeature } from "@app/services/slack/slack-types";

import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TVerifyApprovers } from "./access-approval-policy-types";

export const verifyApprovers = async ({
  userIds,
  projectId,
  orgId,
  envSlug,
  actorAuthMethod,
  secretPath,
  permissionService
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
      throw new BadRequestError({ message: "One or more approvers doesn't have access to be specified secret path" });
    }
  }
};

type TTriggerAccessRequestSlackNotif = {
  projectId: string;
  projectName: string;
  requesterFullName: string;
  isTemporary: boolean;
  requesterEmail: string;
  secretPath: string;
  environment: string;
  permissions: string[];
  approvalUrl: string;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectWithOrg">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
};

export const triggerAccessRequestSlackNotif = async ({
  projectId,
  projectName,
  requesterFullName,
  isTemporary,
  requesterEmail,
  secretPath,
  environment,
  permissions,
  approvalUrl,
  projectDAL,
  kmsService,
  projectSlackConfigDAL
}: TTriggerAccessRequestSlackNotif) => {
  const messageBody = `${requesterFullName} (${requesterEmail}) has requested ${
    isTemporary ? "temporary" : "permanent"
  } access to ${secretPath} in the ${environment} environment of ${projectName}.

  The following permissions are requested: ${permissions.join(", ")}

  View the request and approve or deny it <${approvalUrl}|here>.`;

  const payloadBlocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "New access approval request pending for review",
        emoji: true
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: messageBody
      }
    }
  ];

  await triggerSlackNotification({
    projectId,
    projectDAL,
    kmsService,
    payloadMessage: messageBody,
    projectSlackConfigDAL,
    payloadBlocks,
    feature: SlackTriggerFeature.ACCESS_REQUEST
  });
};
