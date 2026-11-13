import { describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { ApprovalPolicyScope, ApproverType } from "../approval-policy/approval-policy-enums";
import { ActorType } from "../auth/auth-type";
import { holdCertificateRequestForApproval } from "./certificate-request-approval-fns";

const setup = (steps: unknown[], scopeType: ApprovalPolicyScope | null = ApprovalPolicyScope.PkiApplication) => {
  const deps = {
    certificateRequestDAL: { updateById: vi.fn().mockResolvedValue({}) },
    approvalPolicyService: {
      createRequestFromPolicy: vi.fn().mockResolvedValue({ request: { id: "approval-1" }, notifyApprovers: vi.fn() })
    }
  };
  const createCertificateRequest = vi.fn().mockResolvedValue({ id: "cert-req-1" });
  const hold = () =>
    holdCertificateRequestForApproval(deps as never, {
      approvalPolicy: {
        id: "policy-1",
        name: "production-cert-approval",
        maxRequestTtl: null,
        scopeType,
        steps
      } as never,
      projectId: "project-1",
      organizationId: "org-1",
      createCertificateRequest,
      requestData: {} as never,
      justification: "",
      requester: { actor: ActorType.USER, actorId: "user-1", name: "Alice", email: "alice@example.com" },
      tx: {} as never
    });
  return { deps, createCertificateRequest, hold };
};

describe("holdCertificateRequestForApproval", () => {
  it("refuses to hold a certificate under a policy whose step has no approvers, and writes nothing", async () => {
    const { deps, createCertificateRequest, hold } = setup([
      { id: "step-1", stepNumber: 1, name: "Security review", requiredApprovals: 1, approvers: [] }
    ]);

    const result = hold();

    await expect(result).rejects.toThrow(BadRequestError);
    await expect(result).rejects.toThrow(
      "This certificate needs approval under the approval policy 'production-cert-approval', but that policy can't approve requests. Approval step 1 ('Security review') has no approvers. Add at least one user or group. Ask an Application admin to update the policy."
    );
    expect(createCertificateRequest).not.toHaveBeenCalled();
    expect(deps.approvalPolicyService.createRequestFromPolicy).not.toHaveBeenCalled();
  });

  it("tells the requester to ask a Product Admin when the policy belongs to no Application", async () => {
    const { createCertificateRequest, hold } = setup(
      [{ id: "step-1", stepNumber: 1, requiredApprovals: 1, approvers: [] }],
      null
    );

    await expect(hold()).rejects.toThrow(
      "Approval step 1 has no approvers. Add at least one user or group. Ask a Product Admin to update the policy."
    );
    expect(createCertificateRequest).not.toHaveBeenCalled();
  });

  it("refuses to hold a certificate under a policy with no steps", async () => {
    const { createCertificateRequest, hold } = setup([]);

    await expect(hold()).rejects.toThrow("Add at least one approval step.");
    expect(createCertificateRequest).not.toHaveBeenCalled();
  });

  it("holds a certificate under a policy that can approve it", async () => {
    const { deps, hold } = setup([
      { id: "step-1", stepNumber: 1, requiredApprovals: 1, approvers: [{ type: ApproverType.User, id: "user-2" }] }
    ]);

    await expect(hold()).resolves.toMatchObject({
      certificateRequestId: "cert-req-1",
      approvalRequestId: "approval-1"
    });
    expect(deps.certificateRequestDAL.updateById).toHaveBeenCalledWith(
      "cert-req-1",
      { approvalRequestId: "approval-1" },
      {}
    );
  });
});
