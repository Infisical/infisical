import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import { delegatedApprovalServiceFactory } from "./delegated-approval-service";

const failedRequest = { id: "delegated-1", requestId: "req-1", status: DelegatedApprovalRequestStatus.FailedDispatch };
const serviceNowPolicy = {
  id: "delegated-policy-1",
  policyId: "policy-1",
  type: DelegatedApprovalPolicyType.ServiceNow
};
const pendingApprovalRequest = {
  id: "req-1",
  policyId: "policy-1",
  status: ApprovalRequestStatus.Pending,
  expiresAt: null
};

const createService = ({
  delegatedRequest = failedRequest as unknown,
  delegatedPolicy = serviceNowPolicy as unknown
} = {}) => {
  const queueDispatch = vi.fn().mockResolvedValue(undefined);
  const service = delegatedApprovalServiceFactory({
    delegatedApprovalRequestDAL: { findOne: vi.fn().mockResolvedValue(delegatedRequest) },
    delegatedApprovalPolicyDAL: { findOne: vi.fn().mockResolvedValue(delegatedPolicy) },
    delegatedApprovalDispatchQueue: { queueDispatch }
  } as never);
  return { service, queueDispatch };
};

describe("delegatedApprovalService.retryDispatch", () => {
  test("re-enqueues a pending request that failed to reach the delegated system", async () => {
    const { service, queueDispatch } = createService();

    await expect(service.retryDispatch({ approvalRequest: pendingApprovalRequest })).resolves.toEqual({
      delegatedRequest: failedRequest,
      delegatedPolicy: serviceNowPolicy
    });
    expect(queueDispatch).toHaveBeenCalledWith({ delegatedRequestId: "delegated-1" });
  });

  test("refuses a request without a delegated approval", async () => {
    const { service, queueDispatch } = createService({ delegatedRequest: null });

    await expect(service.retryDispatch({ approvalRequest: pendingApprovalRequest })).rejects.toThrow(
      new BadRequestError({ message: "Request with ID 'req-1' is not reviewed in an external approval system" })
    );
    expect(queueDispatch).not.toHaveBeenCalled();
  });

  test("refuses a request that is no longer pending", async () => {
    const { service, queueDispatch } = createService();

    await expect(
      service.retryDispatch({
        approvalRequest: { ...pendingApprovalRequest, status: ApprovalRequestStatus.Cancelled }
      })
    ).rejects.toThrow("Only pending requests can be sent again");
    expect(queueDispatch).not.toHaveBeenCalled();
  });

  test("refuses an expired request", async () => {
    const { service, queueDispatch } = createService();

    await expect(
      service.retryDispatch({
        approvalRequest: { ...pendingApprovalRequest, expiresAt: new Date("2020-01-01T00:00:00.000Z") }
      })
    ).rejects.toThrow("This request has expired. Create a new request instead.");
    expect(queueDispatch).not.toHaveBeenCalled();
  });

  test("refuses a request whose policy no longer delegates approval", async () => {
    const { service, queueDispatch } = createService({ delegatedPolicy: null });

    await expect(service.retryDispatch({ approvalRequest: pendingApprovalRequest })).rejects.toThrow(
      "The policy for this request no longer uses an external approval system. Create a new request instead."
    );
    expect(queueDispatch).not.toHaveBeenCalled();
  });

  test.each([
    DelegatedApprovalRequestStatus.PendingDispatch,
    DelegatedApprovalRequestStatus.WaitingApproval,
    DelegatedApprovalRequestStatus.Approved
  ])("refuses a request in the %s state", async (status) => {
    const { service, queueDispatch } = createService({ delegatedRequest: { ...failedRequest, status } });

    await expect(service.retryDispatch({ approvalRequest: pendingApprovalRequest })).rejects.toThrow(
      "Only requests that failed to reach ServiceNow can be sent again"
    );
    expect(queueDispatch).not.toHaveBeenCalled();
  });
});
