import { describe, expect, it } from "vitest";

import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import { TApprovalRequest } from "@app/hooks/api/approvalRequests";

import { getDecisionText } from "./decisionText";

const renewalRequest = (renewal: { certificateId: string; raisedByAutoRenewal?: boolean }) =>
  ({
    type: ApprovalPolicyType.CertRequest,
    requestData: { requestData: { certificateRequestId: "cert-req-1", renewal } }
  }) as unknown as TApprovalRequest;

describe("getDecisionText", () => {
  it("says rejecting a renewal auto-renewal raised stops automatic renewal", () => {
    expect(
      getDecisionText(renewalRequest({ certificateId: "cert-1", raisedByAutoRenewal: true })).reject
    ).toBe(
      "The request is closed and the certificate isn't renewed. Infisical stops renewing it automatically until a manual renewal completes."
    );
  });

  it("says rejecting a manual renewal stops automatic renewal only for an imported or discovered certificate", () => {
    expect(
      getDecisionText(renewalRequest({ certificateId: "cert-1", raisedByAutoRenewal: false }))
        .reject
    ).toBe(
      "The request is closed and the certificate isn't renewed. If the certificate was imported or discovered, Infisical stops renewing it automatically until a manual renewal completes."
    );
  });

  it("treats a renewal raised before the flag existed as manual", () => {
    expect(getDecisionText(renewalRequest({ certificateId: "cert-1" }))).toEqual(
      getDecisionText(renewalRequest({ certificateId: "cert-1", raisedByAutoRenewal: false }))
    );
  });

  it("says approving a deletion deletes the certificate and rejecting it keeps the certificate", () => {
    const text = getDecisionText({ type: ApprovalPolicyType.CertDeletion } as TApprovalRequest);
    expect(text.approve).toBe(
      "Once every step approves, the certificate is deleted. This can't be undone."
    );
    expect(text.reject).toBe(
      "The request is closed and the certificate isn't deleted. The requester can ask again."
    );
  });
});
