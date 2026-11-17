import { RuleViolationError } from "@app/domains/lib/errors";
import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";

import { AgentVaultAccessState, AgentVaultFreeUsageThreshold } from "../../ce/models/agent-vault-access-state";
import { AgentVaultAccess } from "./agent-vault-access";

const plan = (agentVault: boolean | null) => Plan.restore({ ...testFeatures(), agentVault });
const now = new Date("2026-11-14T10:00:00Z");
const resetsAt = new Date("2026-12-01T00:00:00Z");

describe("AgentVaultAccess.decide", () => {
  test.each([
    // isCloud, agentVault, used, state, allowed, warn
    [false, false, 9_000, AgentVaultAccessState.SelfHosted, true, false],
    [true, true, 9_000, AgentVaultAccessState.Plan, true, false],
    [true, null, 9_000, AgentVaultAccessState.Open, true, false],
    [true, false, 0, AgentVaultAccessState.Free, true, false],
    [true, false, 3_749, AgentVaultAccessState.Free, true, false],
    [true, false, 3_750, AgentVaultAccessState.Free, true, true],
    [true, false, 4_999, AgentVaultAccessState.Free, true, true],
    [true, false, 5_000, AgentVaultAccessState.LimitReached, false, true],
    [true, false, 7_200, AgentVaultAccessState.LimitReached, false, true]
  ] as const)("cloud=%s plan=%s used=%s is %s", (isCloud, agentVault, used, state, allowed, warn) => {
    // Action
    const access = AgentVaultAccess.decide({ isCloud, plan: plan(agentVault), used, now });

    // Assert
    expect(access.state).toBe(state);
    expect(access.allowed).toBe(allowed);
    expect(access.warn).toBe(warn);
  });

  test("should report free usage only for a limited org", () => {
    // Action
    const limited = AgentVaultAccess.decide({ isCloud: true, plan: plan(false), used: 3_120, now });
    const onPlan = AgentVaultAccess.decide({ isCloud: true, plan: plan(true), used: 3_120, now });

    // Assert
    expect(limited.toJSON()).toEqual({
      state: AgentVaultAccessState.Free,
      allowed: true,
      freeUsage: { used: 3_120, limit: 5_000, resetsAt },
      warn: false
    });
    expect(onPlan.freeUsage).toBeNull();
  });

  test("should allow a limited org whose count couldn't be read", () => {
    // Action
    const access = AgentVaultAccess.decide({ isCloud: true, plan: plan(false), used: null, now });

    // Assert
    expect(access.toJSON()).toEqual({ state: AgentVaultAccessState.Free, allowed: true, freeUsage: null, warn: false });
  });

  test("should refuse with AgentVaultFreeLimitReached only at the limit", () => {
    // Setup
    const reached = AgentVaultAccess.decide({ isCloud: true, plan: plan(false), used: 5_000, now });
    const under = AgentVaultAccess.decide({ isCloud: true, plan: plan(false), used: 4_999, now });

    // Action, Assert
    expect(() => reached.assertAllowed()).toThrow(RuleViolationError);
    expect(() => reached.assertAllowed()).toThrow(
      "This organization used its 5,000 free Agent Vault requests this month. An admin can add a payment method in Usage & Billing, or wait for next month."
    );
    expect(() => under.assertAllowed()).not.toThrow();
  });

  test("should never show more used requests than the limit", () => {
    // Setup
    const access = AgentVaultAccess.decide({ isCloud: true, plan: plan(false), used: 5_103, now });

    // Action, Assert
    expect(access.freeUsage?.used).toBe(5_000);
    expect(access.toJSON().state).toBe(AgentVaultAccessState.LimitReached);
  });

  test("should reset at next year's January in December", () => {
    // Setup
    const access = AgentVaultAccess.decide({
      isCloud: true,
      plan: plan(false),
      used: 5_000,
      now: new Date("2026-12-31T23:00:00Z")
    });

    // Action, Assert
    expect(access.freeUsage?.resetsAt).toEqual(new Date("2027-01-01T00:00:00Z"));
  });
});

describe("AgentVaultAccess.isLimited", () => {
  test("should limit only a cloud org whose plan says no", () => {
    // Action
    const limited = [
      [true, false],
      [true, null],
      [true, true],
      [false, false]
    ].map(([isCloud, agentVault]) => AgentVaultAccess.isLimited({ isCloud: Boolean(isCloud), plan: plan(agentVault) }));

    // Assert
    expect(limited).toEqual([true, false, false, false]);
  });
});

describe("AgentVaultAccess.thresholdsReached", () => {
  test.each([
    // used, reached
    [3_749, []],
    [3_750, [AgentVaultFreeUsageThreshold.Warning]],
    [4_999, [AgentVaultFreeUsageThreshold.Warning]],
    [5_000, [AgentVaultFreeUsageThreshold.Warning, AgentVaultFreeUsageThreshold.Limit]],
    [9_000, [AgentVaultFreeUsageThreshold.Warning, AgentVaultFreeUsageThreshold.Limit]]
  ] as const)("at %s reaches %j", (used, reached) => {
    // Action, Assert
    expect(AgentVaultAccess.thresholdsReached(used)).toEqual(reached);
  });

  test("should state each threshold as the percent that triggers it", () => {
    // Action, Assert
    expect(AgentVaultAccess.thresholdPercent(AgentVaultFreeUsageThreshold.Warning)).toBe(75);
    expect(AgentVaultAccess.thresholdPercent(AgentVaultFreeUsageThreshold.Limit)).toBe(100);
  });
});
