import { nativeTargetText } from "@app/components/agent-vault/nativeServiceMeta";
import { displayHostPattern } from "@app/components/agent-vault/service-sheet/serviceSchema";
import { AgentVaultServiceType } from "@app/hooks/api/agentVault/enums";
import {
  TAgentVaultSession,
  TAgentVaultSessionAccessBundle,
  TAgentVaultSessionInlineService,
  TAgentVaultSessionNamedService
} from "@app/hooks/api/agentVault/types";

// Where the service reaches, shown the way an access bundle's services are: an MCP server by its URL, and a
// database or SSH service by its address.
export const inlineServiceTarget = (service: TAgentVaultSessionInlineService) => {
  if (service.type === AgentVaultServiceType.Mcp)
    return service.serverUrl.replace(/^https:\/\//i, "");
  if (service.type === AgentVaultServiceType.Http) return displayHostPattern(service.hostPattern);
  return nativeTargetText(service);
};

export const inlineServicesLabel = (count: number) =>
  count === 1 ? "1 inline service" : `${count} inline services`;

export const sessionInlineServices = (session: Pick<TAgentVaultSession, "services">) =>
  session.services.flatMap((service) => (service.isInline ? [service] : []));

export const sessionNamedServices = (session: Pick<TAgentVaultSession, "services">) =>
  session.services.flatMap((service) => (service.isInline ? [] : [service]));

export type TSessionAccessItem =
  | { kind: "bundle"; bundle: TAgentVaultSessionAccessBundle }
  | { kind: "service"; service: TAgentVaultSessionNamedService }
  | { kind: "inline"; services: TAgentVaultSessionInlineService[] };

// A session's bundle, each project service it names, then one more badge for the services it was sent with.
export const toAccessItems = (
  session: Pick<TAgentVaultSession, "accessBundle" | "services">
): TSessionAccessItem[] => {
  const inline = sessionInlineServices(session);
  return [
    ...(session.accessBundle ? [{ kind: "bundle" as const, bundle: session.accessBundle }] : []),
    ...sessionNamedServices(session).map((service) => ({ kind: "service" as const, service })),
    ...(inline.length ? [{ kind: "inline" as const, services: inline }] : [])
  ];
};
