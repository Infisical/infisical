import { TSecretApprovalRequests } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { triggerSlackNotification } from "@app/services/slack/slack-fns";
import { SlackTriggerFeature } from "@app/services/slack/slack-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";

type TSendApprovalEmails = {
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findProjectWithOrg">;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectId: string;
  secretApprovalRequest: TSecretApprovalRequests;
};

type TTriggerSecretApprovalSlackNotif = {
  environment: string;
  projectId: string;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectWithOrg">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  secretApprovalRequest: TSecretApprovalRequests;
  secretPath: string;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export const triggerSecretApprovalSlackNotif = async ({
  projectId,
  projectDAL,
  kmsService,
  secretApprovalRequest,
  projectSlackConfigDAL,
  userDAL,
  environment,
  secretPath
}: TTriggerSecretApprovalSlackNotif) => {
  // construct message here
  const appCfg = getConfig();
  const project = await projectDAL.findProjectWithOrg(projectId);
  const user = await userDAL.findById(secretApprovalRequest.committerUserId);

  const messageBody = `A secret approval request has been opened by ${user.email}.
  *Environment*: ${environment}
  *Secret path*: ${secretPath || "/"}

  View the complete details <${appCfg.SITE_URL}/project/${project.id}/approval?requestId=${
    secretApprovalRequest.id
  }|here>.`;

  const payloadBlocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Secret approval request",
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
    feature: SlackTriggerFeature.SECRET_APPROVAL
  });
};

export const sendApprovalEmailsFn = async ({
  secretApprovalPolicyDAL,
  projectDAL,
  smtpService,
  projectId,
  secretApprovalRequest
}: TSendApprovalEmails) => {
  const cfg = getConfig();

  const policy = await secretApprovalPolicyDAL.findById(secretApprovalRequest.policyId);

  const project = await projectDAL.findProjectWithOrg(projectId);

  // now we need to go through each of the reviewers and print out all the commits that they need to approve
  for await (const reviewerUser of policy.userApprovers) {
    await smtpService.sendMail({
      recipients: [reviewerUser?.email as string],
      subjectLine: "Infisical Secret Change Request",

      substitutions: {
        firstName: reviewerUser.firstName,
        projectName: project.name,
        organizationName: project.organization.name,
        approvalUrl: `${cfg.SITE_URL}/project/${project.id}/approval?requestId=${secretApprovalRequest.id}`
      },
      template: SmtpTemplates.SecretApprovalRequestNeedsReview
    });
  }
};
