import { TAgentVaultSessionLogSettings } from "@app/hooks/api/agentVault/types";
import { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

export const areAgentVaultSessionLogsOn = (settings: TAgentVaultSessionLogSettings) =>
  Boolean(settings.enabled && settings.appConnectionId && settings.bucket && settings.region);

export const isAgentVaultSessionLogPlanLapsed = (
  settings: TAgentVaultSessionLogSettings,
  subscription: Pick<SubscriptionPlan, "agentVaultByoS3">
) => Boolean(settings.bucket) && !subscription.agentVaultByoS3;
