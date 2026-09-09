import { describe, expect, test, vi } from "vitest";

import { BadRequestError, ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

import { ApprovalStatus } from "../access-approval-request/access-approval-request-types";
import { ExternalApprovalRequestStatus } from "./external-approval-enums";
import { externalApprovalServiceFactory } from "./external-approval-service";

const POLICY_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const IDENTITY_ID = "33333333-3333-4333-8333-333333333333";
const EXTERNAL_ID = "sn-sys-id-1";

const identityActor: OrgServiceActor = {
  type: ActorType.IDENTITY,
  id: IDENTITY_ID,
  authMethod: null,
  orgId: "org-1",
  rootOrgId: "org-1",
  parentOrgId: "org-1"
};

const makeService = (policyPatch: Record<string, unknown> = {}, requestPatch: Record<string, unknown> = {}) => {
  const externalApprovalPolicyDAL = {
    findById: vi.fn().mockResolvedValue({ id: POLICY_ID, approverIdentityId: IDENTITY_ID }),
    ...policyPatch
  };
  const externalApprovalRequestDAL = {
    findById: vi.fn().mockResolvedValue({
      id: REQUEST_ID,
      status: ExternalApprovalRequestStatus.WaitingApproval,
      externalId: EXTERNAL_ID
    }),
    updateById: vi
      .fn<(id: string, patch: Record<string, unknown>, tx?: unknown) => Promise<Record<string, unknown>>>()
      .mockImplementation(async (_id, patch) => ({ id: REQUEST_ID, ...patch })),
    ...requestPatch
  };
  const service = externalApprovalServiceFactory({
    appConnectionService: { validateAppConnectionUsageById: vi.fn() } as never,
    identityDAL: { findOne: vi.fn() } as never,
    externalApprovalPolicyDAL: externalApprovalPolicyDAL as never,
    externalApprovalRequestDAL: externalApprovalRequestDAL as never
  });
  return { service, externalApprovalPolicyDAL, externalApprovalRequestDAL };
};

describe("externalApprovalService.authorizeExternalReview", () => {
  test("returns the policy when the calling identity is the configured approver", async () => {
    const { service } = makeService();
    const policy = await service.authorizeExternalReview({ externalApprovalPolicyId: POLICY_ID, actor: identityActor });
    expect(policy.id).toBe(POLICY_ID);
  });

  test("rejects a user actor even if its id matches", async () => {
    const { service } = makeService();
    await expect(
      service.authorizeExternalReview({
        externalApprovalPolicyId: POLICY_ID,
        actor: { ...identityActor, type: ActorType.USER }
      })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("rejects a different identity", async () => {
    const { service } = makeService();
    await expect(
      service.authorizeExternalReview({
        externalApprovalPolicyId: POLICY_ID,
        actor: { ...identityActor, id: "44444444-4444-4444-8444-444444444444" }
      })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("rejects when the policy has no approver identity", async () => {
    const { service } = makeService({
      findById: vi.fn().mockResolvedValue({ id: POLICY_ID, approverIdentityId: null })
    });
    await expect(
      service.authorizeExternalReview({ externalApprovalPolicyId: POLICY_ID, actor: identityActor })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("404s when the policy does not exist", async () => {
    const { service } = makeService({ findById: vi.fn().mockResolvedValue(undefined) });
    await expect(
      service.authorizeExternalReview({ externalApprovalPolicyId: POLICY_ID, actor: identityActor })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("externalApprovalService.resolveExternalApprovalDecision", () => {
  const tx = { marker: "tx" } as never;
  const baseDto = {
    externalApprovalRequestId: REQUEST_ID,
    externalId: EXTERNAL_ID,
    approvedByIdentityId: IDENTITY_ID
  };

  test("records an approval on the external row inside the given transaction", async () => {
    const { service, externalApprovalRequestDAL } = makeService();

    const result = await service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.APPROVED }, tx);

    expect(result.alreadyFinalized).toBe(false);
    expect(externalApprovalRequestDAL.findById).toHaveBeenCalledWith(REQUEST_ID, tx);
    expect(externalApprovalRequestDAL.updateById).toHaveBeenCalledTimes(1);
    const [id, patch, passedTx] = externalApprovalRequestDAL.updateById.mock.calls[0];
    expect(id).toBe(REQUEST_ID);
    expect(patch.status).toBe(ExternalApprovalRequestStatus.Approved);
    expect(patch.approvedByIdentityId).toBe(IDENTITY_ID);
    expect(patch.approvedAt).toBeInstanceOf(Date);
    expect(patch).not.toHaveProperty("externalId");
    expect(passedTx).toBe(tx);
  });

  test("maps a rejection to the external Rejected status", async () => {
    const { service, externalApprovalRequestDAL } = makeService();

    await service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.REJECTED }, tx);

    const [, patch] = externalApprovalRequestDAL.updateById.mock.calls[0];
    expect(patch.status).toBe(ExternalApprovalRequestStatus.Rejected);
  });

  test("replaying the same decision is a no-op", async () => {
    const { service, externalApprovalRequestDAL } = makeService(
      {},
      {
        findById: vi.fn().mockResolvedValue({
          id: REQUEST_ID,
          status: ExternalApprovalRequestStatus.Approved,
          externalId: EXTERNAL_ID
        })
      }
    );

    const result = await service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.APPROVED }, tx);

    expect(result.alreadyFinalized).toBe(true);
    expect(externalApprovalRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test("a conflicting decision after finalization is a 409", async () => {
    const { service, externalApprovalRequestDAL } = makeService(
      {},
      {
        findById: vi.fn().mockResolvedValue({
          id: REQUEST_ID,
          status: ExternalApprovalRequestStatus.Approved,
          externalId: EXTERNAL_ID
        })
      }
    );

    await expect(
      service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.REJECTED }, tx)
    ).rejects.toBeInstanceOf(ConflictError);
    expect(externalApprovalRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test.each([
    [ExternalApprovalRequestStatus.PendingDispatch, EXTERNAL_ID],
    [ExternalApprovalRequestStatus.WaitingApproval, null],
    [ExternalApprovalRequestStatus.FailedDispatch, EXTERNAL_ID]
  ])("refuses a decision while the row is %s with externalId %s", async (status, externalId) => {
    const { service, externalApprovalRequestDAL } = makeService(
      {},
      { findById: vi.fn().mockResolvedValue({ id: REQUEST_ID, status, externalId }) }
    );

    await expect(
      service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.APPROVED }, tx)
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(externalApprovalRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test("refuses a mismatched external id without folding case", async () => {
    const { service, externalApprovalRequestDAL } = makeService();

    await expect(
      service.resolveExternalApprovalDecision(
        { ...baseDto, externalId: EXTERNAL_ID.toUpperCase(), status: ApprovalStatus.APPROVED },
        tx
      )
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(externalApprovalRequestDAL.updateById).not.toHaveBeenCalled();
  });

  test("404s when the external row is missing", async () => {
    const { service } = makeService({}, { findById: vi.fn().mockResolvedValue(undefined) });

    await expect(
      service.resolveExternalApprovalDecision({ ...baseDto, status: ApprovalStatus.APPROVED }, tx)
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
