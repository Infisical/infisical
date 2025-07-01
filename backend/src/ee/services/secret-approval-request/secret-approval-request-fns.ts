import { TSecretApprovalRequests } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";

type TSendApprovalEmails = {
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findProjectWithOrg">;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectId: string;
  secretApprovalRequest: TSecretApprovalRequests;
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
        approvalUrl: `${cfg.SITE_URL}/projects/${project.id}/secret-manager/approval?requestId=${secretApprovalRequest.id}`
      },
      template: SmtpTemplates.SecretApprovalRequestNeedsReview
    });
  }
};
