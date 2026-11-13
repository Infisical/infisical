import { RuleViolationError } from "@app/domains/lib/errors";
import { Plan, PlanProduct } from "@app/domains/platform/license/ce/module";

import { AgentVaultAccessState, TAgentVaultAccessJSON } from "../../ce/models/agent-vault-access-state";

export class AgentVaultAccess {
  private constructor(
    private readonly accessState: AgentVaultAccessState,
    private readonly cardRequested: boolean
  ) {}

  static decide({
    isCloud,
    plan,
    isGrandfathered
  }: {
    isCloud: boolean;
    plan: Plan;
    isGrandfathered: boolean;
  }): AgentVaultAccess {
    if (!isCloud) return new AgentVaultAccess(AgentVaultAccessState.SelfHosted, false);
    if (plan.grants(PlanProduct.AgentVault)) return new AgentVaultAccess(AgentVaultAccessState.Plan, false);
    if (isGrandfathered) return new AgentVaultAccess(AgentVaultAccessState.Grandfathered, true);
    if (plan.allows(PlanProduct.AgentVault)) return new AgentVaultAccess(AgentVaultAccessState.Open, false);
    return new AgentVaultAccess(AgentVaultAccessState.None, false);
  }

  // A fallback plan never proves a purchase, so an outage can't end grandfathering.
  static endsGrandfathering(plan: Plan): boolean {
    return plan.grants(PlanProduct.AgentVault) && !plan.isFallback;
  }

  get allowed(): boolean {
    return this.accessState !== AgentVaultAccessState.None;
  }

  get state(): AgentVaultAccessState {
    return this.accessState;
  }

  get showCardModal(): boolean {
    return this.cardRequested;
  }

  assertAllowed(): void {
    if (this.allowed) return;
    throw new RuleViolationError({
      name: "AgentVaultNotOnPlan",
      message: "Agent Vault isn't on this organization's plan. An organization admin can add it in Billing."
    });
  }

  toJSON(): TAgentVaultAccessJSON {
    return { allowed: this.allowed, state: this.accessState, showCardModal: this.cardRequested };
  }
}
