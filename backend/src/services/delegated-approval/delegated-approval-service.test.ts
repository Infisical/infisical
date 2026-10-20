import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import { DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT } from "./delegated-approval-events";
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
  type: ApprovalPolicyType.SecretAccess,
  status: ApprovalRequestStatus.Pending,
  expiresAt: null
};

// emit has to receive the caller's tx untouched; a second connection is how the pool deadlocks.
const TX = { sentinel: true } as never;

const createService = ({
  delegatedRequest = failedRequest as unknown,
  delegatedPolicy = serviceNowPolicy as unknown
} = {}) => {
  const emit = vi.fn().mockResolvedValue(undefined);
  const create = vi.fn().mockImplementation(async (row: { requestId: string; status: string }) => ({
    id: "delegated-1",
    ...row
  }));
  const service = delegatedApprovalServiceFactory({
    delegatedApprovalRequestDAL: { findOne: vi.fn().mockResolvedValue(delegatedRequest), create },
    delegatedApprovalPolicyDAL: { findOne: vi.fn().mockResolvedValue(delegatedPolicy) },
    eventEmitter: { emit }
  } as never);
  return { service, emit, create };
};

const dispatchRequestedEvent = {
  eventType: DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
  payload: { delegatedRequestId: "delegated-1" }
};

describe("delegatedApprovalService.createRequest", () => {
  test("records the dispatch event in the same transaction as the request row", async () => {
    const { service, emit, create } = createService();

    const request = await service.createRequest({ approvalRequest: pendingApprovalRequest as never }, TX);

    expect(request).toMatchObject({ id: "delegated-1", status: DelegatedApprovalRequestStatus.PendingDispatch });
    expect(create).toHaveBeenCalledWith(
      { requestId: "req-1", status: DelegatedApprovalRequestStatus.PendingDispatch },
      TX
    );
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(dispatchRequestedEvent, TX);
  });
});

describe("delegatedApprovalService.retryDispatch", () => {
  test("asks for a new dispatch of a pending request that failed to reach the delegated system", async () => {
    const { service, emit } = createService();

    await expect(service.retryDispatch({ approvalRequest: pendingApprovalRequest })).resolves.toEqual({
      delegatedRequest: failedRequest,
      delegatedPolicy: serviceNowPolicy
    });
    expect(emit).toHaveBeenCalledWith(dispatchRequestedEvent, undefined);
  });

  test("refuses a request without a delegated approval", async () => {
    const { service, emit } = createService({ delegatedRequest: null });

    await expect(service.retryDispatch({ approvalRequest: pendingApprovalRequest })).rejects.toThrow(
      new BadRequestError({ message: "Request with ID 'req-1' is not reviewed in an external approval system" })
    );
    expect(emit).not.toHaveBeenCalled();
  });

  test("refuses a request that is no longer pending", async () => {
    const { service, emit } = createService();

    await expect(
      service.retryDispatch({
        approvalRequest: { ...pendingApprovalRequest, status: ApprovalRequestStatus.Cancelled }
      })
    ).rejects.toThrow("Only pending requests can be sent again");
    expect(emit).not.toHaveBeenCalled();
  });

  test("refuses an expired request", async () => {
    const { service, emit } = createService();

    await expect(
      service.retryDispatch({
        approvalRequest: { ...pendingApprovalRequest, expiresAt: new Date("2020-01-01T00:00:00.000Z") }
      })
    ).rejects.toThrow("This request has expired. Create a new request instead.");
    expect(emit).not.toHaveBeenCalled();
  });

  test("refuses a request whose policy no longer delegates approval", async () => {
    const { service, emit } = createService({ delegatedPolicy: null });

    await expect(service.retryDispatch({ approvalRequest: pendingApprovalRequest })).rejects.toThrow(
      "The policy for this request no longer uses an external approval system. Create a new request instead."
    );
    expect(emit).not.toHaveBeenCalled();
  });

  test.each([
    DelegatedApprovalRequestStatus.PendingDispatch,
    DelegatedApprovalRequestStatus.WaitingApproval,
    DelegatedApprovalRequestStatus.Approved
  ])("refuses a request in the %s state", async (status) => {
    const { service, emit } = createService({ delegatedRequest: { ...failedRequest, status } });

    await expect(service.retryDispatch({ approvalRequest: pendingApprovalRequest })).rejects.toThrow(
      "Only requests that failed to reach ServiceNow can be sent again"
    );
    expect(emit).not.toHaveBeenCalled();
  });
});
