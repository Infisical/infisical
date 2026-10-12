import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";

import { request } from "./request";

// Reviewers that must sign off before a secret change in a path takes effect. One user approver and
// one required approval is enough to make a write wait on a request.
export const createSecretApprovalPolicy = (dto: {
  projectId: string;
  environmentSlug: string;
  secretPath: string;
  approverUserIds: string[];
  authToken: string;
}) =>
  request(
    {
      method: "POST",
      url: "/api/v1/secret-approvals",
      headers: { authorization: `Bearer ${dto.authToken}` },
      body: {
        workspaceId: dto.projectId,
        environment: dto.environmentSlug,
        name: `policy${dto.secretPath.replaceAll("/", "-")}`,
        secretPath: dto.secretPath,
        approvers: dto.approverUserIds.map((id) => ({ type: ApproverType.User, id })),
        approvals: 1
      }
    },
    (res) => {
      expect(res.statusCode).toBe(200);
      return res.json<{ approval: { id: string } }>().approval;
    }
  );
