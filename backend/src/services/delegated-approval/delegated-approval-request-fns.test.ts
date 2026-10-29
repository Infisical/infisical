import { describe, expect, test, vi } from "vitest";

import { DelegatedApprovalPolicyType } from "./delegated-approval-enums";
import { parseDelegatedApprovalRequestDetails } from "./delegated-approval-request-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

describe("parseDelegatedApprovalRequestDetails", () => {
  const provider = { type: DelegatedApprovalPolicyType.ServiceNow, recordNumber: "INFAR1000000" };

  test("reads what the workers stored", () => {
    expect(parseDelegatedApprovalRequestDetails({ id: "d1", details: {} })).toEqual({});
    expect(parseDelegatedApprovalRequestDetails({ id: "d1", details: { statusReason: null } })).toEqual({
      statusReason: null
    });
    expect(
      parseDelegatedApprovalRequestDetails({ id: "d1", details: { statusReason: "Retrying.", provider } })
    ).toEqual({ statusReason: "Retrying.", provider });
  });

  test("serves a row whose details cannot be read as if it had none", () => {
    expect(parseDelegatedApprovalRequestDetails({ id: "d1", details: null })).toEqual({});
    expect(parseDelegatedApprovalRequestDetails({ id: "d1", details: "oops" })).toEqual({});
    expect(parseDelegatedApprovalRequestDetails({ id: "d1", details: { statusReason: 42 } })).toEqual({});
    expect(
      parseDelegatedApprovalRequestDetails({ id: "d1", details: { provider: { type: "jira", recordNumber: "J-1" } } })
    ).toEqual({});
  });
});
