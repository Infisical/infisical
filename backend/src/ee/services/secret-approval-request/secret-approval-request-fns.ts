import { TSecretApprovalRequests } from "@app/db/schemas/secret-approval-requests";
import { getConfig } from "@app/lib/config/env";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";

type TSendApprovalEmails = {
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findProjectWithOrg">;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectId: string;
  secretApprovalRequest: TSecretApprovalRequests;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
};

export const sendApprovalEmailsFn = async ({
  secretApprovalPolicyDAL,
  projectDAL,
  smtpService,
  projectId,
  secretApprovalRequest,
  notificationService
}: TSendApprovalEmails) => {
  const cfg = getConfig();

  const policy = await secretApprovalPolicyDAL.findById(secretApprovalRequest.policyId);

  const project = await projectDAL.findProjectWithOrg(projectId);

  await notificationService.createUserNotifications(
    policy.userApprovers.map((approver) => ({
      userId: approver.userId,
      orgId: project.orgId,
      type: NotificationType.SECRET_CHANGE_REQUEST,
      title: "Secret Change Request",
      body: `You have a new secret change request pending your review for the project **${project.name}** in the organization **${project.organization.name}**.`,
      link: `/organizations/${project.orgId}/projects/secret-management/${project.id}/approval`
    }))
  );

  // now we need to go through each of the reviewers and print out all the commits that they need to approve
  for await (const reviewerUser of policy.userApprovers) {
    await smtpService.sendMail({
      recipients: [reviewerUser?.email as string],
      subjectLine: "Infisical Secret Change Request",

      substitutions: {
        firstName: reviewerUser.firstName,
        projectName: project.name,
        organizationName: project.organization.name,
        approvalUrl: `${cfg.SITE_URL}/organizations/${project.orgId}/projects/secret-management/${project.id}/approval}`
      },
      template: SmtpTemplates.SecretApprovalRequestNeedsReview
    });
  }
};
