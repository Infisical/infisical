import { describe, expect, it } from "vitest";

import { ApprovalRequestGrantStatus, ApprovalRequestStatus } from "../approval-policy/approval-policy-enums";
import { isSignerRequestRevocable } from "./signer-request-fns";

const now = new Date("2026-11-03T12:00:00.000Z");
const past = new Date("2026-11-03T11:59:00.000Z");
const future = new Date("2026-11-03T12:01:00.000Z");

describe("isSignerRequestRevocable", () => {
  it("allows revoking a pending request", () => {
    expect(isSignerRequestRevocable({ status: ApprovalRequestStatus.Pending }, [], now)).toBe(true);
  });

  it("allows revoking an approved request whose grant is still inside its window", () => {
    expect(
      isSignerRequestRevocable(
        { status: ApprovalRequestStatus.Approved },
        [{ status: ApprovalRequestGrantStatus.Active, expiresAt: future }],
        now
      )
    ).toBe(true);
  });

  it("allows revoking an approved request whose grant has no window", () => {
    expect(
      isSignerRequestRevocable(
        { status: ApprovalRequestStatus.Approved },
        [{ status: ApprovalRequestGrantStatus.Active, expiresAt: null }],
        now
      )
    ).toBe(true);
  });

  it("refuses an approved request whose grant is past its window but not yet marked expired", () => {
    expect(
      isSignerRequestRevocable(
        { status: ApprovalRequestStatus.Approved },
        [{ status: ApprovalRequestGrantStatus.Active, expiresAt: past }],
        now
      )
    ).toBe(false);
  });

  it("refuses an approved request with no active grant", () => {
    expect(isSignerRequestRevocable({ status: ApprovalRequestStatus.Approved }, [], now)).toBe(false);
  });

  it.each([ApprovalRequestStatus.Rejected, ApprovalRequestStatus.Cancelled, ApprovalRequestStatus.Expired])(
    "refuses a %s request",
    (status) => {
      expect(
        isSignerRequestRevocable({ status }, [{ status: ApprovalRequestGrantStatus.Active, expiresAt: future }], now)
      ).toBe(false);
    }
  );
});
