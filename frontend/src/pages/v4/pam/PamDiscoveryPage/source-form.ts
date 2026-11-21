import {
  PamAccountType,
  PamDiscoverySchedule,
  PamDiscoveryType,
  type TPamAccountListItem,
  type TPamDiscoverySource
} from "@app/hooks/api/pam";

import { type GatewayPickerValue } from "../../networking/gateway-picker";

export const HOST_RANGE_SOURCES = {
  [PamDiscoveryType.Unix]: {
    accountType: PamAccountType.SSH,
    placeholder: "Select SSH accounts",
    description:
      "A target is matched to an account by host, otherwise each account is tried until one connects.",
    warning:
      "Password accounts send their password to every host scanned in the range, including hosts you don't control. Use a key or certificate account for scanning.",
    configKey: "cidrRanges",
    allowCidr: true,
    targetsPlaceholder: "10.0.0.0/24, 192.168.1.10, host.internal",
    targetsDescription:
      "IP addresses, IPv4 CIDR ranges, or hostnames, one per line or comma-separated."
  },
  [PamDiscoveryType.Postgres]: {
    accountType: PamAccountType.Postgres,
    placeholder: "Select PostgreSQL accounts",
    description:
      "The username and password authenticate to each instance scanned. The account's database and TLS settings are reused for the connection.",
    warning:
      "The account password is sent to every instance scanned, including any you don't control. Only list hosts you trust.",
    configKey: "hosts",
    allowCidr: false,
    targetsPlaceholder: "192.168.1.10, db-primary.internal",
    targetsDescription:
      "IP addresses or hostnames of the instances to scan, one per line or comma-separated. CIDR ranges are not supported."
  },
  [PamDiscoveryType.MsSQL]: {
    accountType: PamAccountType.MsSQL,
    placeholder: "Select SQL Server accounts",
    description:
      "Accounts must use SQL Server authentication and hold VIEW ANY DEFINITION or ALTER ANY LOGIN to see every login. The account's database and TLS settings are reused for the connection.",
    warning:
      "The account password is sent to every instance scanned, including any you don't control. Only list hosts you trust.",
    configKey: "hosts",
    allowCidr: false,
    targetsPlaceholder: "192.168.1.10, sql-primary.internal",
    targetsDescription:
      "IP addresses or hostnames of the instances to scan, one per line or comma-separated. CIDR ranges are not supported."
  }
} as const;

type THostRangeDiscoveryType = keyof typeof HOST_RANGE_SOURCES;

export const isHostRangeDiscoveryType = (
  type: PamDiscoveryType | null | undefined
): type is THostRangeDiscoveryType => Boolean(type && type in HOST_RANGE_SOURCES);

export type TSourceForm = {
  name: string;
  schedule: PamDiscoverySchedule;
  gateway: GatewayPickerValue;
  credentialAccountId: string;
  credentialAccountIds: string[];
  targets: string;
  scanLocalAccounts: boolean;
  discoverDependencies: boolean;
  winrmPort: string;
  useWinrmHttps: boolean;
  winrmRejectUnauthorized: boolean;
  winrmCaCert: string;
};

export const emptySourceForm = (): TSourceForm => ({
  name: "",
  schedule: PamDiscoverySchedule.Manual,
  gateway: { gatewayId: null, gatewayPoolId: null },
  credentialAccountId: "",
  credentialAccountIds: [],
  targets: "",
  scanLocalAccounts: true,
  discoverDependencies: false,
  winrmPort: "5985",
  useWinrmHttps: false,
  winrmRejectUnauthorized: true,
  winrmCaCert: ""
});

export const sourceFormOf = (source: TPamDiscoverySource): TSourceForm => {
  const config = source.discoveryConfiguration;
  const stored = isHostRangeDiscoveryType(source.discoveryType)
    ? config[HOST_RANGE_SOURCES[source.discoveryType].configKey]
    : undefined;
  return {
    ...emptySourceForm(),
    name: source.name,
    schedule: source.schedule,
    gateway: { gatewayId: source.gatewayId ?? null, gatewayPoolId: source.gatewayPoolId ?? null },
    credentialAccountId: source.credentialAccountId,
    credentialAccountIds: Array.isArray(config.credentialAccountIds)
      ? (config.credentialAccountIds as string[])
      : [],
    targets: Array.isArray(stored) ? (stored as string[]).join("\n") : "",
    scanLocalAccounts: config.scanLocalAccounts !== false,
    discoverDependencies: Boolean(config.discoverDependencies),
    winrmPort: String(typeof config.winrmPort === "number" ? config.winrmPort : 5985),
    useWinrmHttps: Boolean(config.useWinrmHttps),
    winrmRejectUnauthorized: config.winrmRejectUnauthorized !== false,
    winrmCaCert: typeof config.winrmCaCert === "string" ? config.winrmCaCert : ""
  };
};

const parseTargets = (value: string) =>
  value
    .split(/[\n,]/)
    .map((target) => target.trim())
    .filter(Boolean);

export type TSourceErrors = Partial<Record<keyof TSourceForm, string>>;

export const sourceFormErrors = (type: PamDiscoveryType, form: TSourceForm): TSourceErrors => {
  const errors: TSourceErrors = {};
  if (!form.name.trim()) errors.name = "Name is required";
  else if (form.name.length > 64) errors.name = "Keep the name under 64 characters";
  if (!form.gateway.gatewayId && !form.gateway.gatewayPoolId)
    errors.gateway = "A gateway is required";
  if (isHostRangeDiscoveryType(type)) {
    const targets = parseTargets(form.targets);
    if (!targets.length) errors.targets = "At least one target is required";
    else if (!HOST_RANGE_SOURCES[type].allowCidr && targets.some((target) => target.includes("/")))
      errors.targets =
        "CIDR ranges are not supported. List each instance by IP address or hostname.";
    if (!form.credentialAccountIds.length)
      errors.credentialAccountIds = "Select at least one account";
    return errors;
  }
  if (!form.credentialAccountId) errors.credentialAccountId = "Select a credential account";
  const port = Number(form.winrmPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    errors.winrmPort = "Enter a port from 1 to 65535";
  return errors;
};

export const sourcePayload = (type: PamDiscoveryType, form: TSourceForm) => {
  const base = {
    name: form.name.trim(),
    schedule: form.schedule,
    gatewayId: form.gateway.gatewayId,
    gatewayPoolId: form.gateway.gatewayPoolId
  };
  if (isHostRangeDiscoveryType(type))
    return {
      ...base,
      credentialAccountId: form.credentialAccountIds[0],
      configuration: {
        [HOST_RANGE_SOURCES[type].configKey]: parseTargets(form.targets),
        credentialAccountIds: form.credentialAccountIds
      }
    };
  return {
    ...base,
    credentialAccountId: form.credentialAccountId,
    configuration: {
      scanLocalAccounts: form.scanLocalAccounts,
      discoverDependencies: form.discoverDependencies,
      winrmPort: Number(form.winrmPort),
      useWinrmHttps: form.useWinrmHttps,
      winrmRejectUnauthorized: form.winrmRejectUnauthorized,
      ...(form.winrmCaCert.trim() ? { winrmCaCert: form.winrmCaCert.trim() } : {})
    }
  };
};

export const accountLabel = (account: Pick<TPamAccountListItem, "folderName" | "name">) =>
  account.folderName ? `${account.folderName} / ${account.name}` : account.name;

export const SCHEDULE_LABELS: Record<PamDiscoverySchedule, string> = {
  [PamDiscoverySchedule.Manual]: "Manual",
  [PamDiscoverySchedule.Daily]: "Daily",
  [PamDiscoverySchedule.Weekly]: "Weekly"
};
