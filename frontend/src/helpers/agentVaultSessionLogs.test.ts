import { describe, expect, it } from "vitest";

import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultSessionLogSettings } from "@app/hooks/api/agentVault/types";

import {
  canTurnOnAgentVaultSessionLogs,
  getAgentVaultSessionLogRetentionDays,
  isAgentVaultSessionLogBlockedByPlan,
  isAgentVaultSessionLogStorageOnPlan
} from "./agentVaultSessionLogs";

const defaultStorage = { type: AgentVaultSessionLogStorageType.Default } as const;
const externalStorage = {
  type: AgentVaultSessionLogStorageType.External,
  appConnectionId: "4c7a3a1e-7b2f-4b9e-9f0d-1a2b3c4d5e6f",
  bucket: "globex-audit",
  region: "eu-west-1",
  keyPrefix: null
} as const;

const settings = (
  storage: TAgentVaultSessionLogSettings["storage"],
  overrides: Partial<TAgentVaultSessionLogSettings> = {}
): TAgentVaultSessionLogSettings => ({ enabled: true, storage, ...overrides });

const fullPlan = { agentVaultManagedStorage: true, agentVaultByoS3: true };
const noPlan = { agentVaultManagedStorage: false, agentVaultByoS3: false };
const defaultOnly = { agentVaultManagedStorage: true, agentVaultByoS3: false };
const externalOnly = { agentVaultManagedStorage: false, agentVaultByoS3: true };

describe("agent vault session log helpers", () => {
  it("reads each storage type's own plan flag", () => {
    expect(
      isAgentVaultSessionLogStorageOnPlan(AgentVaultSessionLogStorageType.Default, defaultOnly)
    ).toBe(true);
    expect(
      isAgentVaultSessionLogStorageOnPlan(AgentVaultSessionLogStorageType.External, defaultOnly)
    ).toBe(false);
    expect(
      isAgentVaultSessionLogStorageOnPlan(AgentVaultSessionLogStorageType.External, externalOnly)
    ).toBe(true);
  });

  it("uses 30 days when the plan doesn't set a retention", () => {
    expect(getAgentVaultSessionLogRetentionDays({ agentVaultSessionLogRetentionDays: null })).toBe(
      30
    );
    expect(getAgentVaultSessionLogRetentionDays({ agentVaultSessionLogRetentionDays: 365 })).toBe(
      365
    );
  });

  it.each([
    ["default storage on, not on the plan", settings(defaultStorage), externalOnly, true],
    ["external storage on, not on the plan", settings(externalStorage), defaultOnly, true],
    ["on and on the plan", settings(externalStorage), externalOnly, false],
    ["default storage on, on the plan", settings(defaultStorage), fullPlan, false],
    ["off", settings(defaultStorage, { enabled: false }), noPlan, false]
  ])("blocked by plan: %s", (_, value, plan, expected) => {
    expect(isAgentVaultSessionLogBlockedByPlan(value, plan)).toBe(expected);
  });

  it.each([
    ["instance bucket and default storage on the plan", true, defaultOnly, true],
    ["no instance bucket, only default storage on the plan", false, defaultOnly, false],
    ["no instance bucket, external storage on the plan", false, externalOnly, true],
    ["neither on the plan", true, noPlan, false]
  ])("can turn on: %s", (_, isConfigured, plan, expected) => {
    expect(canTurnOnAgentVaultSessionLogs(isConfigured, plan)).toBe(expected);
  });
});
