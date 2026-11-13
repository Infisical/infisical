import { ApprovalPolicyScope, ApproverType } from "@app/services/approval-policy/approval-policy-enums";

import { request } from "./request";

// Certificate issuance approvals (`cert-request`), which also gate renewals. Policies need the
// pkiApprovals plan feature (see overrideLicenseFeatures).
const BASE_URL = "/api/v1/approval-policies/cert-request";

const authHeaders = (authToken: string) => ({ authorization: `Bearer ${authToken}` });

export type TCertRequestApprovalRequest = {
  id: string;
  status: string;
  requesterName: string;
  requesterId?: string | null;
  createdAt: string;
  requestData: {
    requestData: {
      certificateRequestId: string;
      profileName: string;
      renewal?: { certificateId: string } | null;
    };
  };
};

export const createApplicationCertRequestPolicy = (dto: {
  authToken: string;
  applicationId: string;
  profileSlug: string;
  approverUserId: string;
  constraints?: Record<string, unknown>;
}) =>
  request(
    {
      method: "POST",
      url: BASE_URL,
      headers: authHeaders(dto.authToken),
      body: {
        scope: ApprovalPolicyScope.PkiApplication,
        scopeId: dto.applicationId,
        name: `issuance-${dto.profileSlug}`,
        conditions: [{ profileNames: [dto.profileSlug] }],
        ...(dto.constraints && { constraints: dto.constraints }),
        steps: [{ requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: dto.approverUserId }] }]
      }
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(200);
      return res.json<{ policy: { id: string; constraints: { constraints: Record<string, unknown> } } }>().policy;
    }
  );

export const listApplicationCertRequestApprovals = (dto: { authToken: string; applicationId: string }) =>
  request(
    {
      method: "GET",
      url: `${BASE_URL}/requests?scope=${ApprovalPolicyScope.PkiApplication}&id=${dto.applicationId}`,
      headers: authHeaders(dto.authToken)
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(200);
      return res.json<{ requests: TCertRequestApprovalRequest[] }>().requests;
    }
  );

export const renewalApprovalsFor = (requests: TCertRequestApprovalRequest[], certificateId: string) =>
  requests.filter((req) => req.requestData.requestData.renewal?.certificateId === certificateId);

const review = (decision: "approve" | "reject") => (dto: { authToken: string; requestId: string; comment?: string }) =>
  request(
    {
      method: "POST",
      url: `${BASE_URL}/requests/${dto.requestId}/${decision}`,
      headers: authHeaders(dto.authToken),
      body: dto.comment ? { comment: dto.comment } : {}
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(200);
      return res.json<{ request: TCertRequestApprovalRequest }>().request;
    }
  );

export const approveCertRequestApproval = review("approve");
export const rejectCertRequestApproval = review("reject");
