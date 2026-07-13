import { describe, expect, it, vi } from "vitest";

import { TApprovalRequests } from "@app/db/schemas";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";

import { ApprovalPolicyType, ApproverType } from "./approval-policy-enums";
import { ApprovalPolicyStep } from "./approval-policy-types";
import { sendApprovalEmailsForStep } from "./approval-request-fns";

const mockRequest = {
  id: "request-1",
  organizationId: "org-1",
  projectId: "project-1",
  type: ApprovalPolicyType.CertCodeSigning,
  requesterName: "Dan Cooper",
  requesterEmail: "dan@infisical.com",
  justification: "Need to sign release artifacts"
} as unknown as TApprovalRequests;

const emailContext = {
  requestTypeLabel: "code signing request",
  projectName: "PKI Project",
  approvalUrl: "https://app.infisical.com/organizations/org-1/projects/cert-manager/project-1/approvals/request-1"
};

const buildDeps = (users: Array<{ id: string; email: string | null }>) => ({
  userGroupMembershipDAL: {
    find: vi.fn().mockResolvedValue([{ userId: "group-member-1" }])
  },
  userDAL: {
    find: vi.fn().mockResolvedValue(users)
  },
  smtpService: {
    sendMail: vi.fn().mockResolvedValue(undefined)
  }
});

describe("sendApprovalEmailsForStep", () => {
  it("sends an email to user and group approvers", async () => {
    const step: ApprovalPolicyStep = {
      requiredApprovals: 1,
      notifyApprovers: true,
      approvers: [
        { type: ApproverType.User, id: "user-1" },
        { type: ApproverType.Group, id: "group-1" }
      ]
    };
    const deps = buildDeps([
      { id: "user-1", email: "approver@infisical.com" },
      { id: "group-member-1", email: "member@infisical.com" }
    ]);

    await sendApprovalEmailsForStep(step, mockRequest, emailContext, deps);

    expect(deps.userDAL.find).toHaveBeenCalledWith({ $in: { id: ["user-1", "group-member-1"] } });
    expect(deps.smtpService.sendMail).toHaveBeenCalledWith({
      recipients: ["approver@infisical.com", "member@infisical.com"],
      subjectLine: "Approval Request",
      template: SmtpTemplates.ApprovalRequestNeedsReview,
      substitutions: {
        requesterName: "Dan Cooper",
        requesterEmail: "dan@infisical.com",
        requestType: "code signing request",
        projectName: "PKI Project",
        justification: "Need to sign release artifacts",
        approvalUrl: emailContext.approvalUrl
      }
    });
  });

  it("does not send emails when notifyApprovers is disabled", async () => {
    const step: ApprovalPolicyStep = {
      requiredApprovals: 1,
      notifyApprovers: false,
      approvers: [{ type: ApproverType.User, id: "user-1" }]
    };
    const deps = buildDeps([{ id: "user-1", email: "approver@infisical.com" }]);

    await sendApprovalEmailsForStep(step, mockRequest, emailContext, deps);

    expect(deps.smtpService.sendMail).not.toHaveBeenCalled();
  });

  it("does not send emails when no approver has an email", async () => {
    const step: ApprovalPolicyStep = {
      requiredApprovals: 1,
      notifyApprovers: true,
      approvers: [{ type: ApproverType.User, id: "user-1" }]
    };
    const deps = buildDeps([{ id: "user-1", email: null }]);

    await sendApprovalEmailsForStep(step, mockRequest, emailContext, deps);

    expect(deps.smtpService.sendMail).not.toHaveBeenCalled();
  });
});
