import { TAgentVaultSessionLogSettings } from "@app/hooks/api/agentVault/types";

export const areAgentVaultSessionLogsOn = (settings: TAgentVaultSessionLogSettings) =>
  Boolean(settings.enabled && settings.appConnectionId && settings.bucket && settings.region);
