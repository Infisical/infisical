import RE2 from "re2";
import { z } from "zod";

import { DEFAULT_TLS_PORTS } from "./pki-discovery-fns";

const LINUX_SERVER_DEFAULT_MAX_FOLDER_DEPTH = 8;
const LINUX_SERVER_MAX_FOLDER_DEPTH = 20;
const LINUX_SERVER_DEFAULT_MAX_FILE_SIZE_KB = 512;
const LINUX_SERVER_MAX_FILE_SIZE_KB = 10240;
const LINUX_SERVER_MAX_CONNECTIONS = 100;
const LINUX_SERVER_MAX_SEARCH_FOLDERS = 20;
const LINUX_SERVER_MAX_SKIP_FOLDERS = 50;

const FORBIDDEN_PATH_CHARACTERS = new RE2("[\\x00\\r\\n]");
const PARENT_SEGMENT = new RE2("(^|/)\\.\\.(/|$)");

const LinuxFolderPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine((value) => value.startsWith("/"), "Folder paths must be absolute, for example /etc/ssl")
  .refine((value) => !FORBIDDEN_PATH_CHARACTERS.test(value), "Folder paths cannot contain line breaks")
  .refine((value) => !PARENT_SEGMENT.test(value), "Folder paths cannot contain '..'");

export const NetworkTargetConfigSchema = z
  .object({
    ipRanges: z.array(z.string().max(64)).optional().describe("IP addresses or CIDR ranges to scan (Network jobs)."),
    domains: z.array(z.string().max(253)).optional().describe("Domains to scan (Network jobs)."),
    ports: z.string().max(256).default(DEFAULT_TLS_PORTS).describe("Comma-separated ports or ranges (Network jobs).")
  })
  .strict();

export const LinuxServerTargetConfigSchema = z
  .object({
    connectionIds: z
      .array(z.string().uuid())
      .min(1, "Select at least one SSH connection")
      .max(LINUX_SERVER_MAX_CONNECTIONS)
      .refine((ids) => new Set(ids).size === ids.length, "Each SSH connection can be listed once")
      .describe("IDs of the SSH connections to scan. Each connection must use a gateway."),
    searchFolderPaths: z
      .array(LinuxFolderPathSchema)
      .min(1, "Add at least one folder to search")
      .max(LINUX_SERVER_MAX_SEARCH_FOLDERS)
      .describe("Folders to search. Each folder is searched along with the folders below it."),
    skipFolderPaths: z
      .array(LinuxFolderPathSchema)
      .max(LINUX_SERVER_MAX_SKIP_FOLDERS)
      .default([])
      .describe("Folders that are never entered."),
    maxFolderDepth: z
      .number()
      .int()
      .min(1)
      .max(LINUX_SERVER_MAX_FOLDER_DEPTH)
      .default(LINUX_SERVER_DEFAULT_MAX_FOLDER_DEPTH)
      .describe("How many levels below each search folder to go."),
    maxFileSizeKb: z
      .number()
      .int()
      .min(1)
      .max(LINUX_SERVER_MAX_FILE_SIZE_KB)
      .default(LINUX_SERVER_DEFAULT_MAX_FILE_SIZE_KB)
      .describe("Files bigger than this, in KB, are skipped."),
    importStandaloneCaCertificates: z
      .boolean()
      .default(false)
      .describe("Also import CA certificates found on their own. Leaf certificates always bring their chain.")
  })
  .strict();

export const DiscoveryTargetConfigInputSchema = NetworkTargetConfigSchema.partial()
  .merge(LinuxServerTargetConfigSchema.partial())
  .describe(
    "Target configuration. Network jobs use domains, ipRanges and ports. Linux Server jobs use connectionIds, searchFolderPaths, skipFolderPaths, maxFolderDepth, maxFileSizeKb and importStandaloneCaCertificates."
  );

export const formatTargetConfigIssue = ({ path, message }: z.ZodIssue) =>
  path.length > 0 ? `targetConfig.${path.join(".")}: ${message}` : `targetConfig: ${message}`;
