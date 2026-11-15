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

// Infisical's own domains, such as app.infisical.com.
export const isInfisicalDomain = (host: string) => {
  const name = host.toLowerCase();
  return name === "infisical.com" || name.endsWith(".infisical.com");
};

// A request to one of Infisical's domains, or to the Infisical this dashboard runs on, which is the one a proxy's
// --domain names unless the proxy reaches Infisical by another address. The port has to match too, so a request to
// another service on a dev machine's localhost isn't taken for Infisical.
export const isInfisicalLogHost = (
  record: { host: string; port: string },
  page: { hostname: string; port: string; protocol: string } = window.location
) => {
  if (isInfisicalDomain(record.host)) return true;
  const pagePort = page.port || (page.protocol === "https:" ? "443" : "80");
  return record.host.toLowerCase() === page.hostname.toLowerCase() && record.port === pagePort;
};

const SESSION_ENDPOINT_PATHS = [
  "/v1/agent-vault/session/services",
  "/v1/agent-vault/session/skills"
];

// A request to the session's own endpoints on Infisical, such as a POST the proxy refused as the wrong method. Making
// Infisical's host a service wouldn't help, so the logs offer no Add Service for it.
export const isInfisicalSessionEndpointRequest = (
  record: { host: string; port: string; path: string },
  page: { hostname: string; port: string; protocol: string } = window.location
) => {
  const path = record.path.split("?")[0];
  return (
    SESSION_ENDPOINT_PATHS.some((endpoint) => path.endsWith(endpoint)) &&
    isInfisicalLogHost(record, page)
  );
};
