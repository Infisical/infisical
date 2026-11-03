import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { ApprovalPolicyType, ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import { DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT } from "./delegated-approval-events";
import { delegatedApprovalServiceFactory } from "./delegated-approval-service";

const failedRequest = {
  id: "delegated-1",
  requestId: "req-1",
  status: DelegatedApprovalRequestStatus.FailedDispatch,
  details: { statusReason: "ServiceNow could not be reached." },
  dispatchEventId: "44444444-4444-4444-8444-444444444444"
};
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
const PRIMARY = { primary: true } as never;

const createService = ({
  delegatedRequest = failedRequest as unknown,
  delegatedPolicy = serviceNowPolicy as unknown,
  resendMatches = true
} = {}) => {
  const emit = vi.fn().mockResolvedValue(undefined);
  const findOne = vi.fn().mockResolvedValue(delegatedRequest);
  const create = vi.fn().mockImplementation(async (row: { requestId: string; status: string; details: object }) => ({
    id: "delegated-1",
    ...row
  }));
  const update = vi
    .fn()
    .mockImplementation(async (_filter: unknown, patch: { dispatchEventId: string }) =>
      resendMatches ? [{ ...(delegatedRequest as object), ...patch }] : []
    );
  const service = delegatedApprovalServiceFactory({
    delegatedApprovalRequestDAL: {
      findOne,
      create,
      update,
      primaryNode: () => PRIMARY,
      transaction: async (cb: (tx: never) => Promise<unknown>) => cb(TX)
    },
    delegatedApprovalPolicyDAL: { findOne: vi.fn().mockResolvedValue(delegatedPolicy) },
    eventEmitter: { emit }
  } as never);
  return { service, emit, create, update, findOne };
};

const dispatchRequestedEvent = (id: string) => [
  {
    id,
    type: DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
    data: { delegatedRequestId: "delegated-1" }
  }
];

describe("delegatedApprovalService.createRequest", () => {
  test("records the dispatch event in the same transaction as the request row", async () => {
    const { service, emit, create } = createService();

    const request = await service.createRequest(
      { approvalRequest: pendingApprovalRequest as never, delegatedPolicy: serviceNowPolicy },
      TX
    );

    expect(request).toMatchObject({
      id: "delegated-1",
      providerType: DelegatedApprovalPolicyType.ServiceNow,
      status: DelegatedApprovalRequestStatus.PendingDispatch
    });
    expect(create).toHaveBeenCalledWith(
      {
        requestId: "req-1",
        providerType: DelegatedApprovalPolicyType.ServiceNow,
        status: DelegatedApprovalRequestStatus.PendingDispatch,
        details: {},
        dispatchEventId: expect.any(String) as string
      },
      TX
    );
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(dispatchRequestedEvent(request.dispatchEventId), TX);
  });
});

describe("delegatedApprovalService.retryDispatch", () => {
  test("supersedes the previous dispatch event with a new one in the same transaction", async () => {
    const { service, emit, update, findOne } = createService();

    const { delegatedRequest, delegatedPolicy } = await service.retryDispatch({
      approvalRequest: pendingApprovalRequest
    });

    expect(delegatedPolicy).toEqual(serviceNowPolicy);
    expect(delegatedRequest.dispatchEventId).not.toBe(failedRequest.dispatchEventId);
    expect(findOne).toHaveBeenCalledWith({ requestId: "req-1" }, PRIMARY);
    expect(update).toHaveBeenCalledWith(
      { id: "delegated-1", status: DelegatedApprovalRequestStatus.FailedDispatch },
      { dispatchEventId: delegatedRequest.dispatchEventId },
      TX
    );
    expect(emit).toHaveBeenCalledWith(dispatchRequestedEvent(delegatedRequest.dispatchEventId), TX);
  });

  test("emits a new event id on every resend", async () => {
    const { service, emit } = createService();

    await service.retryDispatch({ approvalRequest: pendingApprovalRequest });
    await service.retryDispatch({ approvalRequest: pendingApprovalRequest });

    expect(emit).toHaveBeenCalledTimes(2);
    const [[[first]], [[second]]] = emit.mock.calls as [{ id: string }[]][];
    expect(first.id).not.toBe(second.id);
  });

  test("refuses a resend when the request left failed_dispatch before it landed", async () => {
    const { service, emit } = createService({ resendMatches: false });

    await expect(service.retryDispatch({ approvalRequest: pendingApprovalRequest })).rejects.toThrow(
      "Only requests that failed to reach ServiceNow can be sent again"
    );
    expect(emit).not.toHaveBeenCalled();
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
    const { service, emit, update } = createService({ delegatedRequest: { ...failedRequest, status } });

    await expect(service.retryDispatch({ approvalRequest: pendingApprovalRequest })).rejects.toThrow(
      "Only requests that failed to reach ServiceNow can be sent again"
    );
    expect(update).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("delegatedApprovalService.assertPlanAllowsPolicyEdit", () => {
  const createPlanService = (enterpriseAppConnections: boolean) => {
    const getPlan = vi.fn().mockResolvedValue({ enterpriseAppConnections });
    const service = delegatedApprovalServiceFactory({ licenseService: { getPlan } } as never);
    return { service, getPlan };
  };

  test("refuses the edit when the org's plan lacks enterprise app connections", async () => {
    const { service, getPlan } = createPlanService(false);

    await expect(service.assertPlanAllowsPolicyEdit(DelegatedApprovalPolicyType.ServiceNow, "org-1")).rejects.toThrow(
      "remove the delegated approver to edit this policy"
    );
    expect(getPlan).toHaveBeenCalledWith("org-1");
  });

  test("allows the edit when the org's plan includes enterprise app connections", async () => {
    const { service } = createPlanService(true);

    await expect(
      service.assertPlanAllowsPolicyEdit(DelegatedApprovalPolicyType.ServiceNow, "org-1")
    ).resolves.toBeUndefined();
  });
});
