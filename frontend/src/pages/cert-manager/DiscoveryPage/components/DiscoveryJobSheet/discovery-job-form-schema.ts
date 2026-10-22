import { z } from "zod";

import {
  DEFAULT_LINUX_SEARCH_FOLDERS,
  DEFAULT_MAX_FILE_SIZE_KB,
  DEFAULT_MAX_FOLDER_DEPTH,
  MAX_FILE_SIZE_KB,
  MAX_FOLDER_DEPTH
} from "@app/helpers/pkiDiscovery";
import { PkiDiscoveryType, TPkiDiscovery } from "@app/hooks/api/pkiDiscovery/types";
import { slugSchema } from "@app/lib/schemas/slugSchema";

export const MAX_PORTS = 5;
export const MAX_IPS = 256;
export const MAX_DOMAINS = 20;
export const MIN_CIDR_PREFIX = 24;
export const DEFAULT_TLS_PORTS = "443,8443,636,993,995";
const MAX_LINUX_CONNECTIONS = 100;
export const MAX_SEARCH_FOLDERS = 20;
export const MAX_SKIP_FOLDERS = 50;

const validatePorts = (portsStr: string): string | null => {
  if (!portsStr.trim()) return "Ports are required";
  const ranges = portsStr.split(",").map((rawPart) => {
    const part = rawPart.trim();
    const [start, end = start] = part.split("-").map((p) => parseInt(p.trim(), 10));
    return { part, start, end };
  });
  const invalid = ranges.find(
    ({ start, end }) =>
      Number.isNaN(start) || Number.isNaN(end) || start < 1 || end > 65535 || start > end
  );
  if (invalid) {
    return invalid.part.includes("-")
      ? `Invalid port range: ${invalid.part}`
      : `Invalid port: ${invalid.part}`;
  }
  const portCount = ranges.reduce((count, { start, end }) => count + end - start + 1, 0);
  if (portCount > MAX_PORTS) return `Maximum ${MAX_PORTS} ports allowed (you have ${portCount})`;
  return null;
};

const splitTargets = (targetsStr: string) =>
  targetsStr
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);

const validateTargets = (targetsStr: string): string | null => {
  const targets = splitTargets(targetsStr);
  if (targets.length === 0) return "At least one target is required";

  const cidrRanges = targets.filter((t) => t.includes("/"));
  const singleIps = targets.filter((t) => !t.includes("/") && /^\d/.test(t));
  const domains = targets.filter((t) => /[a-zA-Z]/.test(t) && !t.includes("/"));

  if (domains.some((d) => d.startsWith("*"))) {
    return "Wildcard domains aren't supported";
  }

  const invalidCidr = cidrRanges.find((cidr) => {
    const prefixMatch = cidr.match(/\/(\d+)$/);
    return prefixMatch ? parseInt(prefixMatch[1], 10) < MIN_CIDR_PREFIX : false;
  });
  if (invalidCidr) {
    return `CIDR range too large: ${invalidCidr}. Maximum is /${MIN_CIDR_PREFIX} (256 IPs)`;
  }

  const totalIpCount = cidrRanges.reduce((count, cidr) => {
    const prefixMatch = cidr.match(/\/(\d+)$/);
    return prefixMatch ? count + 2 ** (32 - parseInt(prefixMatch[1], 10)) : count;
  }, singleIps.length);
  if (totalIpCount > MAX_IPS) {
    return `Maximum ${MAX_IPS} total IPs allowed (including expanded CIDR ranges)`;
  }
  if (domains.length > MAX_DOMAINS) return `Maximum ${MAX_DOMAINS} domains allowed per discovery`;
  return null;
};

export const parseTargets = (targetsStr: string) => {
  const domains: string[] = [];
  const ipRanges: string[] = [];
  splitTargets(targetsStr).forEach((target) => {
    if (/[a-zA-Z]/.test(target) && !target.includes("/")) domains.push(target);
    else ipRanges.push(target);
  });
  return { domains, ipRanges };
};

const isAbsoluteFolder = (value: string) =>
  value.startsWith("/") && !/[\r\n]/.test(value) && !/(^|\/)\.\.(\/|$)/.test(value);

export const validateLinuxFolder = (value: string) => {
  if (!isAbsoluteFolder(value)) return "Use an absolute folder path, for example /etc/ssl";
  if (value.length > 1024) return "Folder paths can be at most 1024 characters";
  return null;
};

const boundedInt = (max: number, requiredMessage: string, rangeMessage: string) =>
  z
    .number({ required_error: requiredMessage, invalid_type_error: requiredMessage })
    .int(rangeMessage)
    .min(1, rangeMessage)
    .max(max, rangeMessage);

const BaseSchema = z.object({
  name: slugSchema({ field: "Name", max: 100 }),
  description: z.string().trim().max(255, "Description can be at most 255 characters").optional(),
  isAutoScanEnabled: z.boolean(),
  scanIntervalDays: z
    .number()
    .min(1, "Enter an interval between 1 and 365 days")
    .max(365, "Enter an interval between 1 and 365 days")
});

const NetworkSchema = BaseSchema.extend({
  discoveryType: z.literal(PkiDiscoveryType.Network),
  targets: z.string().superRefine((val, ctx) => {
    const error = validateTargets(val);
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
  }),
  ports: z.string().superRefine((val, ctx) => {
    const error = validatePorts(val);
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
  }),
  gatewayId: z.string().nullable().optional(),
  gatewayPoolId: z.string().nullable().optional()
});

const LinuxServerSchema = BaseSchema.extend({
  discoveryType: z.literal(PkiDiscoveryType.LinuxServer),
  connections: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .min(1, "Select at least one SSH connection")
    .max(MAX_LINUX_CONNECTIONS, `Select up to ${MAX_LINUX_CONNECTIONS} SSH connections`),
  searchFolderPaths: z
    .array(z.string())
    .min(1, "Add at least one folder to search")
    .max(MAX_SEARCH_FOLDERS, `Add up to ${MAX_SEARCH_FOLDERS} search folders`),
  skipFolderPaths: z
    .array(z.string())
    .max(MAX_SKIP_FOLDERS, `Add up to ${MAX_SKIP_FOLDERS} skip folders`),
  maxFolderDepth: boundedInt(
    MAX_FOLDER_DEPTH,
    "Enter how many folder levels to search",
    `Enter a depth between 1 and ${MAX_FOLDER_DEPTH}`
  ),
  maxFileSizeKb: boundedInt(
    MAX_FILE_SIZE_KB,
    "Enter the largest file size to read, in KB",
    `Enter a size between 1 and ${MAX_FILE_SIZE_KB} KB`
  ),
  importStandaloneCaCertificates: z.boolean()
});

export const DiscoveryJobFormSchema = z.discriminatedUnion("discoveryType", [
  NetworkSchema,
  LinuxServerSchema
]);

export type TDiscoveryJobForm = z.infer<typeof DiscoveryJobFormSchema>;
export type TNetworkDiscoveryJobForm = z.infer<typeof NetworkSchema>;
export type TLinuxServerDiscoveryJobForm = z.infer<typeof LinuxServerSchema>;

export const getDefaultFormValues = (
  type: PkiDiscoveryType,
  discovery?: TPkiDiscovery
): Partial<TDiscoveryJobForm> => {
  const base = {
    name: discovery?.name ?? "",
    description: discovery?.description ?? "",
    isAutoScanEnabled: discovery?.isAutoScanEnabled ?? false,
    scanIntervalDays: discovery?.scanIntervalDays ?? 7
  };

  if (type === PkiDiscoveryType.LinuxServer) {
    const config = discovery?.targetConfig;
    return {
      ...base,
      discoveryType: PkiDiscoveryType.LinuxServer,
      connections: discovery?.connections ?? [],
      searchFolderPaths: config?.searchFolderPaths ?? DEFAULT_LINUX_SEARCH_FOLDERS,
      skipFolderPaths: config?.skipFolderPaths ?? [],
      maxFolderDepth: config?.maxFolderDepth ?? DEFAULT_MAX_FOLDER_DEPTH,
      maxFileSizeKb: config?.maxFileSizeKb ?? DEFAULT_MAX_FILE_SIZE_KB,
      importStandaloneCaCertificates: config?.importStandaloneCaCertificates ?? false
    };
  }

  const targets = [
    ...(discovery?.targetConfig.domains ?? []),
    ...(discovery?.targetConfig.ipRanges ?? [])
  ].join("\n");
  return {
    ...base,
    discoveryType: PkiDiscoveryType.Network,
    targets,
    ports: discovery?.targetConfig.ports ?? DEFAULT_TLS_PORTS,
    gatewayId: discovery?.gatewayId ?? null,
    gatewayPoolId: discovery?.gatewayPoolId ?? null
  };
};
