import { UnrecoverableError } from "bullmq";
import { describe, expect, test } from "vitest";

import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalPolicyType } from "./delegated-approval-enums";
import {
  DelegatedApprovalRequestBlocker,
  getDelegatedApprovalRequestBlocker,
  requireDelegatedApprovalConnection
} from "./delegated-approval-guards";

const pending = { status: ApprovalRequestStatus.Pending, expiresAt: null as Date | null };
const policy = { type: DelegatedApprovalPolicyType.ServiceNow, connectionId: "connection-1" };

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

describe("requireDelegatedApprovalConnection", () => {
  test("returns the policy's connection when it is in the request's org", () => {
    const rawConnection = { orgId: "org-1" };

    expect(
      requireDelegatedApprovalConnection({ rawConnection, delegatedPolicy: policy, organizationId: "org-1" })
    ).toBe(rawConnection);
  });

  test.each([
    ["is missing", null],
    ["belongs to another org", { orgId: "org-2" }]
  ])("names the connection and the app to pick when the connection %s", (_, rawConnection) => {
    const requireConnection = () =>
      requireDelegatedApprovalConnection({ rawConnection, delegatedPolicy: policy, organizationId: "org-1" });

    expect(requireConnection).toThrow(UnrecoverableError);
    expect(requireConnection).toThrow("App Connection with ID 'connection-1' was not found");
    expect(requireConnection).toThrow("ServiceNow Connection");
  });
});
