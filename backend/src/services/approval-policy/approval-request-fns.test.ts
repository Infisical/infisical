import { Knex } from "knex";
import { describe, expect, test, vi } from "vitest";

import { ApprovalRequestApprovalDecision, ApproverType } from "./approval-policy-enums";
import { isEligibleStepApprover, upsertApprovalRequestStepDecision } from "./approval-request-fns";

const TX = { isTx: true } as unknown as Knex;

describe("isEligibleStepApprover", () => {
  const step = {
    approvers: [
      { type: ApproverType.User, id: "user-1" },
      { type: ApproverType.Group, id: "group-1" }
    ]
  };

  test("matches a user listed directly on the step", () => {
    expect(isEligibleStepApprover(step, "user-1", new Set())).toBe(true);
  });

  test("matches a member of a group listed on the step", () => {
    expect(isEligibleStepApprover(step, "user-2", new Set(["group-1"]))).toBe(true);
  });

  test("rejects a user who is neither listed nor in a listed group", () => {
    expect(isEligibleStepApprover(step, "user-2", new Set(["group-2"]))).toBe(false);
    expect(isEligibleStepApprover({ approvers: [] }, "user-1", new Set(["group-1"]))).toBe(false);
  });
});

describe("upsertApprovalRequestStepDecision", () => {
  const buildDeps = (existing: { id: string } | null) => ({
    approvalRequestApprovalsDAL: {
      findOne: vi.fn().mockResolvedValue(existing),
      create: vi.fn((row: Record<string, unknown>) => Promise.resolve({ id: "approval-1", ...row })),
      updateById: vi.fn((id: string, row: Record<string, unknown>) => Promise.resolve({ id, ...row }))
    }
  });

  test("creates a decision row for a first review and threads the transaction", async () => {
    const deps = buildDeps(null);

    const result = await upsertApprovalRequestStepDecision(
      { stepId: "step-1", approverUserId: "user-1", decision: ApprovalRequestApprovalDecision.Approved, comment: "ok" },
      deps as unknown as Parameters<typeof upsertApprovalRequestStepDecision>[1],
      TX
    );

    expect(deps.approvalRequestApprovalsDAL.findOne).toHaveBeenCalledWith(
      { stepId: "step-1", approverUserId: "user-1" },
      TX
    );
    expect(deps.approvalRequestApprovalsDAL.create).toHaveBeenCalledWith(
      { stepId: "step-1", approverUserId: "user-1", decision: ApprovalRequestApprovalDecision.Approved, comment: "ok" },
      TX
    );
    expect(deps.approvalRequestApprovalsDAL.updateById).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: "approval-1", decision: ApprovalRequestApprovalDecision.Approved });
  });

  test("updates the existing row when the same user reviews the same step again", async () => {
    const deps = buildDeps({ id: "approval-7" });

    const result = await upsertApprovalRequestStepDecision(
      { stepId: "step-1", approverUserId: "user-1", decision: ApprovalRequestApprovalDecision.Rejected },
      deps as unknown as Parameters<typeof upsertApprovalRequestStepDecision>[1],
      TX
    );

    expect(deps.approvalRequestApprovalsDAL.create).not.toHaveBeenCalled();
    expect(deps.approvalRequestApprovalsDAL.updateById).toHaveBeenCalledWith(
      "approval-7",
      { decision: ApprovalRequestApprovalDecision.Rejected, comment: null },
      TX
    );
    expect(result).toMatchObject({ id: "approval-7", decision: ApprovalRequestApprovalDecision.Rejected });
  });
});
