import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { ApprovalStatus } from "@app/hooks/api/types";

import { getAccessRequestState } from "./AccessApprovalRequest.utils";

const createRequest = (
  overrides: Omit<Partial<TAccessApprovalRequest>, "policy"> & {
    policy?: Partial<TAccessApprovalRequest["policy"]>;
  } = {}
) => {
  const { policy, ...requestOverrides } = overrides;

  return {
    status: ApprovalStatus.PENDING,
    isApproved: false,
    reviewers: [],
    ...requestOverrides,
    policy: {
      deletedAt: null,
      ...policy
    }
  } as TAccessApprovalRequest;
};

describe("access request state", () => {
  const now = new Date("2026-08-27T12:00:00.000Z");

  it("classifies every closed request status independently", () => {
    assert.equal(getAccessRequestState(createRequest(), now), "pending");
    assert.equal(
      getAccessRequestState(createRequest({ status: ApprovalStatus.APPROVED }), now),
      "approved"
    );
    assert.equal(
      getAccessRequestState(
        createRequest({
          reviewers: [
            { status: ApprovalStatus.REJECTED } as TAccessApprovalRequest["reviewers"][number]
          ]
        }),
        now
      ),
      "rejected"
    );
    assert.equal(
      getAccessRequestState(createRequest({ status: ApprovalStatus.REVOKED }), now),
      "revoked"
    );
    assert.equal(
      getAccessRequestState(
        createRequest({ expiresAt: new Date("2026-08-27T11:00:00.000Z") }),
        now
      ),
      "expired"
    );
    assert.equal(
      getAccessRequestState(createRequest({ policy: { deletedAt: now } }), now),
      "policy-deleted"
    );
  });

  it("keeps a finalized outcome when its policy is later deleted", () => {
    assert.equal(
      getAccessRequestState(
        createRequest({ status: ApprovalStatus.APPROVED, policy: { deletedAt: now } }),
        now
      ),
      "approved"
    );
    assert.equal(
      getAccessRequestState(
        createRequest({ status: ApprovalStatus.REVOKED, policy: { deletedAt: now } }),
        now
      ),
      "revoked"
    );
  });
});
