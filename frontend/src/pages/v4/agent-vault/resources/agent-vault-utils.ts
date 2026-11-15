import type { IconSource } from "@infisical/cipher/ui/icon";
import { format } from "date-fns";
import { DatabaseIcon, SquareTerminalIcon } from "lucide-react";

import { isNativeService } from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  AgentVaultMemberType,
  AgentVaultServiceType,
  type TAgentVaultNativeServiceType
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultActor,
  TAgentVaultMember,
  TAgentVaultProductActor,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { useV4Adapter } from "../../data/adapters";

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

export const useIsAgentVaultAdmin = (projectId: string) => {
  const { data, isPending } = useV4Adapter("agentVault").useProjectPermission({
    projectId
  });
  return {
    isAdmin: Boolean(
      data?.memberships.some((membership) =>
        membership.roles.some(({ role }) => role === ProjectMembershipRole.Admin)
      )
    ),
    isPending
  };
};

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
