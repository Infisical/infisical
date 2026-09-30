import { describe, expect, test } from "vitest";

import { computeApproverChangeMetrics } from "./access-approval-policy-fns";

describe("computeApproverChangeMetrics", () => {
  test("returns unchanged when the sets are identical", () => {
    const before = new Set(["user:1", "group:2"]);
    const after = new Set(["group:2", "user:1"]);

    expect(computeApproverChangeMetrics(before, after)).toEqual({
      approversChanged: false,
      approversCountBefore: 2,
      approversCountAfter: 2
    });
  });

  test("returns changed when a same-size set swaps one approver for another of the same type", () => {
    const before = new Set(["user:1", "group:2"]);
    const after = new Set(["user:3", "group:2"]);

    expect(computeApproverChangeMetrics(before, after)).toEqual({
      approversChanged: true,
      approversCountBefore: 2,
      approversCountAfter: 2
    });
  });

  test("returns changed with the correct counts when the size differs", () => {
    const before = new Set(["user:1"]);
    const after = new Set(["user:1", "group:2", "user:3"]);

    expect(computeApproverChangeMetrics(before, after)).toEqual({
      approversChanged: true,
      approversCountBefore: 1,
      approversCountAfter: 3
    });
  });

  test("returns unchanged, 0, 0 for two empty sets", () => {
    expect(computeApproverChangeMetrics(new Set(), new Set())).toEqual({
      approversChanged: false,
      approversCountBefore: 0,
      approversCountAfter: 0
    });
  });
});
