import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getEmptyApprovalStepIndexes } from "./approvalPolicyFormUtils";

describe("approval policy form steps", () => {
  it("identifies every access-policy sequence without an approver", () => {
    const emptySteps = getEmptyApprovalStepIndexes([
      { user: [{ id: "user-id" }], group: [] },
      { user: [], group: [] },
      { user: [], group: [{ id: "group-id" }] },
      { user: [], group: [] }
    ]);

    assert.deepEqual(emptySteps, [1, 3]);
  });
});
