import { describe, expect, test } from "vitest";

import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalPolicyType } from "./delegated-approval-enums";
import {
  DelegatedApprovalRequestBlocker,
  getDelegatedApprovalConnectionError,
  getDelegatedApprovalRequestBlocker,
  isApprovalRequestExpired
} from "./delegated-approval-guards";

const pending = { status: ApprovalRequestStatus.Pending, expiresAt: null as Date | null };
const policy = { type: DelegatedApprovalPolicyType.ServiceNow, connectionId: "connection-1" };

describe("isApprovalRequestExpired", () => {
  test("is false without a deadline or before it, true after it", () => {
    const now = new Date("2026-10-21T10:00:00Z");

    expect(isApprovalRequestExpired({ expiresAt: null }, now)).toBe(false);
    expect(isApprovalRequestExpired({ expiresAt: new Date("2026-10-21T11:00:00Z") }, now)).toBe(false);
    expect(isApprovalRequestExpired({ expiresAt: "2026-10-21T09:00:00Z" }, now)).toBe(true);
  });
});

describe("getDelegatedApprovalRequestBlocker", () => {
  test.each([
    ["the request is gone", null, policy, DelegatedApprovalRequestBlocker.Missing],
    [
      "the request is no longer pending",
      { ...pending, status: ApprovalRequestStatus.Cancelled },
      policy,
      DelegatedApprovalRequestBlocker.NotPending
    ],
    ["the request expired", { ...pending, expiresAt: new Date(0) }, policy, DelegatedApprovalRequestBlocker.Expired],
    ["the delegated policy was removed", pending, null, DelegatedApprovalRequestBlocker.PolicyRemoved],
    ["nothing blocks it", pending, policy, null]
  ])("reports when %s", (_, request, delegatedPolicy, expected) => {
    expect(getDelegatedApprovalRequestBlocker(request, delegatedPolicy)).toBe(expected);
  });
});

describe("getDelegatedApprovalConnectionError", () => {
  test("accepts the policy's connection in the request's org", () => {
    expect(
      getDelegatedApprovalConnectionError({
        rawConnection: { orgId: "org-1" },
        delegatedPolicy: policy,
        organizationId: "org-1"
      })
    ).toBeNull();
  });

  test.each([
    ["is missing", null],
    ["belongs to another org", { orgId: "org-2" }]
  ])("names the connection and the app to pick when the connection %s", (_, rawConnection) => {
    const error = getDelegatedApprovalConnectionError({
      rawConnection,
      delegatedPolicy: policy,
      organizationId: "org-1"
    });

    expect(error).toContain("App Connection with ID 'connection-1' was not found");
    expect(error).toContain("ServiceNow Connection");
  });
});
