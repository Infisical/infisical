import { RuleViolationError } from "@app/domains/lib/errors";
import { Plan, PlanProduct } from "@app/domains/platform/license/ce/module";

import {
  AgentVaultAccessState,
  TAgentVaultAccessJSON,
  TAgentVaultFreeUsageJSON
} from "../../ce/models/agent-vault-access-state";
import { UsageMonth } from "./usage-month";

const AGENT_VAULT_FREE_MONTHLY_REQUESTS = 5_000;
const WARN_AT_SHARE_OF_LIMIT = 0.8;

export class AgentVaultAccess {
  private constructor(
    private readonly accessState: AgentVaultAccessState,
    private readonly usage: TAgentVaultFreeUsageJSON | null
  ) {}

  // Whether the org brokers on the free tier, so its monthly count decides. Self-hosted is never counted, and a plan
  // that says nothing (null) is not limited, so a missing switch never blocks anyone.
  static isLimited({ isCloud, plan }: { isCloud: boolean; plan: Plan }): boolean {
    return isCloud && !plan.allows(PlanProduct.AgentVault);
  }

  // `used` is null when the count couldn't be read, which allows: an outage never blocks.
  static decide({
    isCloud,
    plan,
    used,
    now = new Date()
  }: {
    isCloud: boolean;
    plan: Plan;
    used: number | null;
    now?: Date;
  }): AgentVaultAccess {
    if (!isCloud) return new AgentVaultAccess(AgentVaultAccessState.SelfHosted, null);
    if (plan.grants(PlanProduct.AgentVault)) return new AgentVaultAccess(AgentVaultAccessState.Plan, null);
    if (plan.allows(PlanProduct.AgentVault)) return new AgentVaultAccess(AgentVaultAccessState.Open, null);
    if (used === null) return new AgentVaultAccess(AgentVaultAccessState.Free, null);

    const usage = { used, limit: AGENT_VAULT_FREE_MONTHLY_REQUESTS, resetsAt: UsageMonth.of(now).resetsAt };
    return new AgentVaultAccess(
      used >= AGENT_VAULT_FREE_MONTHLY_REQUESTS ? AgentVaultAccessState.LimitReached : AgentVaultAccessState.Free,
      usage
    );
  }

  get allowed(): boolean {
    return this.accessState !== AgentVaultAccessState.LimitReached;
  }

  get state(): AgentVaultAccessState {
    return this.accessState;
  }

  get freeUsage(): TAgentVaultFreeUsageJSON | null {
    return this.usage ? { ...this.usage } : null;
  }

  get warn(): boolean {
    return this.usage !== null && this.usage.used >= this.usage.limit * WARN_AT_SHARE_OF_LIMIT;
  }

  assertAllowed(): void {
    if (this.allowed || !this.usage) return;
    const limit = this.usage.limit.toLocaleString("en-US");
    const resetsOn = this.usage.resetsAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    });
    throw new RuleViolationError({
      name: "AgentVaultFreeLimitReached",
      message: `This organization used its ${limit} free Agent Vault requests this month. An admin with billing access can add a card in Usage & Billing, or the limit resets on ${resetsOn}.`
    });
  }

  toJSON(): TAgentVaultAccessJSON {
    return { state: this.accessState, allowed: this.allowed, freeUsage: this.freeUsage, warn: this.warn };
  }
}
