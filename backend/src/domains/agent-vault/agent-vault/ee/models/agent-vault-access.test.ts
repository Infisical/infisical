import { RuleViolationError } from "@app/domains/lib/errors";
import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";

import { AgentVaultAccessState } from "../../ce/models/agent-vault-access-state";
import { AgentVaultAccess } from "./agent-vault-access";

const plan = (agentVault: boolean | null) => Plan.restore({ ...testFeatures(), agentVault });

describe("AgentVaultAccess.decide", () => {
  test.each([
    // isCloud, agentVault, isGrandfathered, state, allowed, showCardModal
    [false, false, false, AgentVaultAccessState.SelfHosted, true, false],
    [true, true, false, AgentVaultAccessState.Plan, true, false],
    [true, true, true, AgentVaultAccessState.Plan, true, false],
    [true, null, false, AgentVaultAccessState.Open, true, false],
    [true, null, true, AgentVaultAccessState.Grandfathered, true, true],
    [true, false, true, AgentVaultAccessState.Grandfathered, true, true],
    [true, false, false, AgentVaultAccessState.None, false, false]
  ] as const)(
    "cloud=%s plan=%s grandfathered=%s is %s",
    (isCloud, agentVault, isGrandfathered, state, allowed, showCardModal) => {
      // Action
      const access = AgentVaultAccess.decide({ isCloud, plan: plan(agentVault), isGrandfathered });

      // Assert
      expect(access.toJSON()).toEqual({ state, allowed, showCardModal });
    }
  );

  test("should refuse with AgentVaultNotOnPlan only when not allowed", () => {
    // Setup
    const refused = AgentVaultAccess.decide({ isCloud: true, plan: plan(false), isGrandfathered: false });
    const allowed = AgentVaultAccess.decide({ isCloud: true, plan: plan(true), isGrandfathered: false });

    // Action, Assert
    expect(() => refused.assertAllowed()).toThrow(RuleViolationError);
    expect(() => refused.assertAllowed()).toThrow(/isn't on this organization's plan/);
    expect(() => allowed.assertAllowed()).not.toThrow();
  });
});

describe("AgentVaultAccess.endsGrandfathering", () => {
  test("should end grandfathering only on an explicit grant that isn't a fallback plan", () => {
    // Action
    const ends = [plan(true), plan(null), plan(false), plan(true).asFallback()].map((p) =>
      AgentVaultAccess.endsGrandfathering(p)
    );

    // Assert
    expect(ends).toEqual([true, false, false, false]);
  });
});
