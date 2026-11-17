import { nativeTargetText } from "@app/components/agent-vault/nativeServiceMeta";
import { displayHostPattern } from "@app/components/agent-vault/service-sheet/serviceSchema";
import { AgentVaultServiceType } from "@app/hooks/api/agentVault/enums";
import {
  TAgentVaultSession,
  TAgentVaultSessionAccessBundle,
  TAgentVaultSessionInlineService
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

export type TSessionAccessItem =
  | { kind: "bundle"; bundle: TAgentVaultSessionAccessBundle }
  | { kind: "inline"; services: TAgentVaultSessionInlineService[] };

// A session's bundle, then one more badge for the services it was sent with.
export const toAccessItems = (
  session: Pick<TAgentVaultSession, "accessBundle" | "services">
): TSessionAccessItem[] => [
  ...(session.accessBundle ? [{ kind: "bundle" as const, bundle: session.accessBundle }] : []),
  ...(session.services.length ? [{ kind: "inline" as const, services: session.services }] : [])
];
