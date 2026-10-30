import { describe, expect, it } from "vitest";

import {
  TBulkChangeRequestResult,
  TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";
import { ApprovalStatus } from "@app/hooks/api/types";

import {
  computeBulkReviewOutcomes,
  filterRequestsEligibleForMerge,
  filterRequestsNeedingApproval,
  isRequestApprovedByUser
} from "./BulkReviewChangeRequestsSheet.utils";

const createMockRequest = (
  id: string,
  reviewers: { userId: string; status: ApprovalStatus }[] = []
): TSecretApprovalRequest =>
  ({
    id,
    slug: `CR-${id}`,
    environment: "dev",
    folderId: "root",
    commits: [],
    reviewers,
    policy: {
      id: "policy-1",
      approvals: 1,
      approvers: [{ userId: "user-1" }],
      secretPath: "/"
    },
    createdAt: new Date().toISOString()
  }) as unknown as TSecretApprovalRequest;

describe("BulkReviewChangeRequestsSheet.utils", () => {
  const currentUserId = "user-1";

  describe("isRequestApprovedByUser", () => {
    it("returns false when user has not reviewed the request", () => {
      const request = createMockRequest("1", []);
      expect(isRequestApprovedByUser({ request, userId: currentUserId })).toBe(false);
    });

    it("returns true when request has approved status by current user", () => {
      const request = createMockRequest("1", [
        { userId: currentUserId, status: ApprovalStatus.APPROVED }
      ]);
      expect(isRequestApprovedByUser({ request, userId: currentUserId })).toBe(true);
    });

    it("returns false when current user rejected the request", () => {
      const request = createMockRequest("1", [
        { userId: currentUserId, status: ApprovalStatus.REJECTED }
      ]);
      expect(isRequestApprovedByUser({ request, userId: currentUserId })).toBe(false);
    });

    it("checks details reviewers if present", () => {
      const request = createMockRequest("1", []);
      const details = {
        reviewers: [{ userId: currentUserId, status: ApprovalStatus.APPROVED }]
      };
      expect(isRequestApprovedByUser({ request, details, userId: currentUserId })).toBe(true);
    });
  });

  describe("filterRequestsNeedingApproval", () => {
    it("excludes requests that are already approved by current user", () => {
      const req1 = createMockRequest("1", []);
      const req2 = createMockRequest("2", [
        { userId: currentUserId, status: ApprovalStatus.APPROVED }
      ]);

      const needingApproval = filterRequestsNeedingApproval({
        approveIds: ["1", "2"],
        requests: [req1, req2],
        detailsById: {},
        userId: currentUserId
      });

      expect(needingApproval).toEqual(["1"]);
    });

    it("includes all requests if user has not approved any of them", () => {
      const req1 = createMockRequest("1", []);
      const req2 = createMockRequest("2", []);

      const needingApproval = filterRequestsNeedingApproval({
        approveIds: ["1", "2"],
        requests: [req1, req2],
        detailsById: {},
        userId: currentUserId
      });

      expect(needingApproval).toEqual(["1", "2"]);
    });
  });

  describe("filterRequestsEligibleForMerge", () => {
    it("does not attempt to merge requests whose approval failed (#8902)", () => {
      const req1 = createMockRequest("1", []);
      const req2 = createMockRequest("2", []);

      const approveResults: TBulkChangeRequestResult[] = [
        { id: "1", isSuccess: true },
        { id: "2", isSuccess: false, errorMessage: "Self-approval blocked" }
      ];

      const eligibleForMerge = filterRequestsEligibleForMerge({
        approveIds: ["1", "2"],
        requests: [req1, req2],
        detailsById: {},
        approveResults,
        userId: currentUserId
      });

      // Request 2 failed approval, so only Request 1 should be merged
      expect(eligibleForMerge).toEqual(["1"]);
    });

    it("includes already approved requests on retry even if approval call was skipped (#8902)", () => {
      const req1 = createMockRequest("1", [
        { userId: currentUserId, status: ApprovalStatus.APPROVED }
      ]);
      const req2 = createMockRequest("2", []);

      const approveResults: TBulkChangeRequestResult[] = [{ id: "2", isSuccess: true }];

      const eligibleForMerge = filterRequestsEligibleForMerge({
        approveIds: ["1", "2"],
        requests: [req1, req2],
        detailsById: {},
        approveResults,
        userId: currentUserId
      });

      // Both should be merged: 1 was already approved, 2 just succeeded approval
      expect(eligibleForMerge).toEqual(["1", "2"]);
    });
  });

  describe("computeBulkReviewOutcomes", () => {
    it("preserves 'approved' status on merge failure and does not overwrite with review failure on retry (#8902)", () => {
      const req1 = createMockRequest("1", [
        { userId: currentUserId, status: ApprovalStatus.APPROVED }
      ]);

      const outcomes = computeBulkReviewOutcomes({
        approveIds: ["1"],
        requests: [req1],
        detailsById: {},
        rejectResults: [],
        approveResults: [], // skipped because already approved
        mergeResults: [{ id: "1", isSuccess: false, errorMessage: "Secret key conflict with #42" }],
        userId: currentUserId
      });

      expect(outcomes["1"]).toEqual({
        status: "approved",
        message: "Secret key conflict with #42"
      });
    });

    it("marks failed review as 'failed' and does not claim merged", () => {
      const req1 = createMockRequest("1", []);

      const outcomes = computeBulkReviewOutcomes({
        approveIds: ["1"],
        requests: [req1],
        detailsById: {},
        rejectResults: [],
        approveResults: [{ id: "1", isSuccess: false, errorMessage: "Review permission denied" }],
        mergeResults: [], // not merged because approval failed
        userId: currentUserId
      });

      expect(outcomes["1"]).toEqual({
        status: "failed",
        message: "Review permission denied"
      });
    });

    it("marks successfully merged requests as 'merged'", () => {
      const req1 = createMockRequest("1", []);

      const outcomes = computeBulkReviewOutcomes({
        approveIds: ["1"],
        requests: [req1],
        detailsById: {},
        rejectResults: [],
        approveResults: [{ id: "1", isSuccess: true }],
        mergeResults: [{ id: "1", isSuccess: true }],
        userId: currentUserId
      });

      expect(outcomes["1"]).toEqual({
        status: "merged",
        reviewError: undefined
      });
    });

    it("marks requests awaiting other reviewers as 'awaiting'", () => {
      const req1 = createMockRequest("1", []);

      const outcomes = computeBulkReviewOutcomes({
        approveIds: ["1"],
        requests: [req1],
        detailsById: {},
        rejectResults: [],
        approveResults: [{ id: "1", isSuccess: true }],
        mergeResults: [
          { id: "1", isSuccess: false, errorMessage: "Request needs 2 approval(s) before merging" }
        ],
        userId: currentUserId
      });

      expect(outcomes["1"]).toEqual({
        status: "awaiting"
      });
    });
  });
});
