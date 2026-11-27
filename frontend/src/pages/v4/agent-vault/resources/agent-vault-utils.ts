import type { IconSource } from "@infisical/cipher/ui/icon";
import { format } from "date-fns";
import { DatabaseIcon, SquareTerminalIcon } from "lucide-react";

import { isNativeService } from "@app/components/agent-vault/service-sheet/serviceSchema";
import { keepInClassic } from "@app/helpers/v4Bridge";
import {
  AgentVaultMemberType,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  type TAgentVaultNativeServiceType
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultActor,
  TAgentVaultMember,
  TAgentVaultProductActor,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";

import { useOrgId } from "../../access/permissions";

const DOCS = "https://infisical.com/docs/documentation/platform/agent-vault";

export const AgentVaultDocs = {
  accessBundles: `${DOCS}/access-bundles`,
  services: `${DOCS}/services`,
  hooks: `${DOCS}/hooks`,
  memberProvidedValues: `${DOCS}/http-apis#member-provided-values`,
  variables: `${DOCS}/variables`,
  skills: `${DOCS}/skills`,
  proxies: `${DOCS}/proxies`
} as const;

export const formatDay = (value: string) => format(new Date(value), "MMM d, yyyy");
export const formatMoment = (value: string) => format(new Date(value), "MMM d, yyyy h:mm a");

export const nameList = (names: string[]) => {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const MEMBER_KIND: Record<AgentVaultMemberType, { label: string; icon: IconSource }> = {
  [AgentVaultMemberType.User]: { label: "User", icon: "user" },
  [AgentVaultMemberType.MachineIdentity]: {
    label: "Machine identity",
    icon: "machine"
  },
  [AgentVaultMemberType.Group]: { label: "Group", icon: "users" }
};

export const memberDisplayName = (
  actor: TAgentVaultActor | TAgentVaultMember | TAgentVaultProductActor
) => {
  if (actor.type !== AgentVaultMemberType.User) return actor.name;
  const fullName = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return fullName || actor.username || actor.email || "Unknown";
};

export const memberSubtitle = (
  actor: TAgentVaultActor | TAgentVaultMember | TAgentVaultProductActor
) => {
  if (actor.type !== AgentVaultMemberType.User) return MEMBER_KIND[actor.type].label;
  return actor.email || actor.username;
};

export const NATIVE_SERVICE_META: Record<
  TAgentVaultNativeServiceType,
  { label: string; image: string; icon: IconSource; aliases: string[] }
> = {
  [AgentVaultServiceType.Postgres]: {
    label: "PostgreSQL",
    image: "Postgres.png",
    icon: DatabaseIcon,
    aliases: ["database", "db", "sql", "psql"]
  },
  [AgentVaultServiceType.Mysql]: {
    label: "MySQL",
    image: "MySql.png",
    icon: DatabaseIcon,
    aliases: ["database", "db", "sql"]
  },
  [AgentVaultServiceType.Ssh]: {
    label: "SSH",
    image: "SSH.png",
    icon: SquareTerminalIcon,
    aliases: ["server", "shell", "terminal"]
  }
};

const bracketIpv6 = (host: string) => (host.includes(":") ? `[${host}]` : host);

export const nativeTargetText = ({
  host,
  port,
  database
}: {
  host: string | null;
  port: number | null;
  database?: string | null;
}) => {
  if (!host) return "";
  const address = port ? `${bracketIpv6(host)}:${port}` : bracketIpv6(host);
  return database ? `${address}/${database}` : address;
};

export const targetOf = (service: TAgentVaultService) => {
  if (isNativeService(service)) return nativeTargetText(service);
  return service.type === AgentVaultServiceType.Mcp ? service.serverUrl : service.hostPattern;
};

// v4 can't sign an OAuth variable in yet. The tab opens with an opener so it inherits the session's classic paths,
// and whatever is half-filled here stays open.
export const useClassicVariablesHref = (projectId: string) =>
  `/organizations/${useOrgId()}/projects/agent-vault/${projectId}/variables`;

export const openClassicVariables = (href: string) => {
  keepInClassic(href);
  window.open(href, "_blank");
};

export const OAUTH_STATUS_TEXT: Record<AgentVaultOauthStatus, string> = {
  [AgentVaultOauthStatus.Connected]: "Authorized",
  [AgentVaultOauthStatus.NeedsReauthorization]: "Needs reauthorization",
  [AgentVaultOauthStatus.NeedsAdditionalScopes]: "Missing scopes",
  [AgentVaultOauthStatus.NotConnected]: "Not connected"
};
