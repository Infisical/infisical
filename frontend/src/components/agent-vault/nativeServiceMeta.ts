import { DatabaseIcon, LucideIcon, SquareTerminalIcon } from "lucide-react";

import { AgentVaultServiceType, TAgentVaultNativeServiceType } from "@app/hooks/api/agentVault";

export const NATIVE_SERVICE_META: Record<
  TAgentVaultNativeServiceType,
  // `image` is the brand logo PAM also shows for these types; `icon` is the fallback if it fails to load.
  // `aliases` are the words someone searching the template picker might use instead of the name.
  { label: string; image: string; icon: LucideIcon; description: string; aliases: string[] }
> = {
  [AgentVaultServiceType.Postgres]: {
    label: "PostgreSQL",
    image: "Postgres.png",
    icon: DatabaseIcon,
    description: "Run SQL against a PostgreSQL database.",
    aliases: ["database", "db", "sql", "psql"]
  },
  [AgentVaultServiceType.Mysql]: {
    label: "MySQL",
    image: "MySql.png",
    icon: DatabaseIcon,
    description: "Run SQL against a MySQL database.",
    aliases: ["database", "db", "sql"]
  },
  [AgentVaultServiceType.Ssh]: {
    label: "SSH",
    image: "SSH.png",
    icon: SquareTerminalIcon,
    description: "Run commands on a server over SSH.",
    aliases: ["server", "shell", "terminal"]
  }
};

const bracketIpv6 = (host: string) => (host.includes(":") ? `[${host}]` : host);

/** Where a database or SSH service connects, as `host:port/database`. */
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
