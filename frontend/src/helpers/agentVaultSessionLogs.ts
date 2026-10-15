import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultSessionLogSettings } from "@app/hooks/api/agentVault/types";
import { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

type TSessionLogPlan = Pick<
  SubscriptionPlan,
  "agentVaultManagedStorage" | "agentVaultByoS3" | "agentVaultSessionLogRetentionDays"
>;

const DEFAULT_RETENTION_DAYS = 30;

export const isAgentVaultSessionLogStorageOnPlan = (
  type: AgentVaultSessionLogStorageType,
  plan: Pick<TSessionLogPlan, "agentVaultManagedStorage" | "agentVaultByoS3">
) =>
  Boolean(
    type === AgentVaultSessionLogStorageType.Default
      ? plan.agentVaultManagedStorage
      : plan.agentVaultByoS3
  );

export const getAgentVaultSessionLogRetentionDays = (
  plan: Pick<TSessionLogPlan, "agentVaultSessionLogRetentionDays">
) => plan.agentVaultSessionLogRetentionDays ?? DEFAULT_RETENTION_DAYS;

// A saved storage that was recording and is no longer on the plan. Off rows don't count, so an org that never used
// default storage isn't told its plan "no longer" includes it.
export const isAgentVaultSessionLogPlanLapsed = (
  settings: TAgentVaultSessionLogSettings | null | undefined,
  plan: Pick<TSessionLogPlan, "agentVaultManagedStorage" | "agentVaultByoS3">
) =>
  Boolean(
    settings?.isSaved &&
      settings.enabled &&
      !isAgentVaultSessionLogStorageOnPlan(settings.storage.type, plan)
  );

// On, but not recording because the plan doesn't include the storage, saved or not.
export const isAgentVaultSessionLogBlockedByPlan = (
  settings: TAgentVaultSessionLogSettings | null | undefined,
  plan: Pick<TSessionLogPlan, "agentVaultManagedStorage" | "agentVaultByoS3">
) =>
  Boolean(settings?.enabled && !isAgentVaultSessionLogStorageOnPlan(settings.storage.type, plan));

// Whether any storage this instance offers is on the plan, so session logs can be turned on at all.
export const canTurnOnAgentVaultSessionLogs = (
  isDefaultStorageConfigured: boolean,
  plan: Pick<TSessionLogPlan, "agentVaultManagedStorage" | "agentVaultByoS3">
) =>
  (isDefaultStorageConfigured &&
    isAgentVaultSessionLogStorageOnPlan(AgentVaultSessionLogStorageType.Default, plan)) ||
  isAgentVaultSessionLogStorageOnPlan(AgentVaultSessionLogStorageType.External, plan);
