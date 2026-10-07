import net from "net";
import { z } from "zod";

import { CertificateScanRpcStatus, TCertificateScanRpcFailure } from "@app/lib/gateway-v2/certificate-scan-rpc";

import { DB_SHORT_VARCHAR_LIMIT, truncateString } from "./pki-discovery-scan-run-fns";
import {
  HostCertificateChainKind,
  HostCertificateFileStatus,
  HostFileImportAction,
  HostScanTruncationReason,
  PkiCertificateFileFormat,
  PkiInstallationLocationType,
  PkiKeystoreStatus
} from "./pki-discovery-types";

const CertificateScanChainSchema = z.object({
  kind: z.nativeEnum(HostCertificateChainKind).catch(HostCertificateChainKind.Ca),
  certificates: z.array(z.string()).default([])
});

const CertificateScanFileSchema = z.object({
  path: z.string(),
  realPath: z.string(),
  status: z.nativeEnum(HostCertificateFileStatus).catch(HostCertificateFileStatus.ReadFailed),
  format: z.nativeEnum(PkiCertificateFileFormat).optional().catch(undefined),
  isKeystore: z.boolean().default(false),
  chains: z
    .array(CertificateScanChainSchema)
    .nullish()
    .transform((value) => value ?? [])
});

export const CertificateScanResponseSchema = z.object({
  host: z.object({
    hostname: z.string().default("")
  }),
  files: z
    .array(CertificateScanFileSchema)
    .nullish()
    .transform((value) => value ?? []),
  deniedFolders: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  truncatedReason: z.string().optional()
});

export type TCertificateScanFile = z.infer<typeof CertificateScanFileSchema>;
export type TCertificateScanResponse = z.infer<typeof CertificateScanResponseSchema>;

type THostFileImportPlan =
  | { action: HostFileImportAction.Skip }
  | {
      action: HostFileImportAction.Refresh;
      locationType: PkiInstallationLocationType.Keystore;
      keystoreStatus: PkiKeystoreStatus;
    }
  | {
      action: HostFileImportAction.Upsert;
      locationType: PkiInstallationLocationType;
      keystoreStatus?: PkiKeystoreStatus;
      chainsToImport: Buffer[][];
    };

const refreshKeystoreOrSkip = (file: TCertificateScanFile): THostFileImportPlan =>
  file.isKeystore
    ? {
        action: HostFileImportAction.Refresh,
        locationType: PkiInstallationLocationType.Keystore,
        keystoreStatus: PkiKeystoreStatus.Readable
      }
    : { action: HostFileImportAction.Skip };

export const planHostFileImport = (
  file: TCertificateScanFile,
  { importStandaloneCaCertificates }: { importStandaloneCaCertificates: boolean }
): THostFileImportPlan => {
  switch (file.status) {
    case HostCertificateFileStatus.Locked:
    case HostCertificateFileStatus.PasswordFailed:
      return {
        action: HostFileImportAction.Upsert,
        locationType: PkiInstallationLocationType.Keystore,
        keystoreStatus:
          file.status === HostCertificateFileStatus.Locked
            ? PkiKeystoreStatus.Locked
            : PkiKeystoreStatus.PasswordFailed,
        chainsToImport: []
      };
    case HostCertificateFileStatus.Ok: {
      const chainsToImport = file.chains
        .filter((chain) => chain.kind === HostCertificateChainKind.Leaf || importStandaloneCaCertificates)
        .map((chain) => chain.certificates.map((certificate) => Buffer.from(certificate, "base64")))
        .filter((chain) => chain.length > 0);
      if (chainsToImport.length === 0) return refreshKeystoreOrSkip(file);
      return {
        action: HostFileImportAction.Upsert,
        locationType: file.isKeystore ? PkiInstallationLocationType.Keystore : PkiInstallationLocationType.Filesystem,
        keystoreStatus: file.isKeystore ? PkiKeystoreStatus.Readable : undefined,
        chainsToImport
      };
    }
    case HostCertificateFileStatus.NoCertificates:
      return refreshKeystoreOrSkip(file);
    default:
      return { action: HostFileImportAction.Skip };
  }
};

export const sshConnectionWithoutGatewayMessage = (connectionName: string) =>
  `SSH connection '${connectionName}' does not use a gateway. Linux Server discovery runs on the gateway, so assign one to the connection.`;

export const buildHostInstallationName = (hostIdentifier: string, hostname: string | undefined, filePath: string) =>
  truncateString(`${hostname?.trim() || hostIdentifier}:${filePath}`, DB_SHORT_VARCHAR_LIMIT);

const DEFAULT_SSH_PORT = 22;

export const normalizeHostIdentifier = (host: string, port?: number) => {
  const normalized = host.trim().toLowerCase();
  if (!port || port === DEFAULT_SSH_PORT) return normalized;
  return net.isIPv6(normalized) ? `[${normalized}]:${port}` : `${normalized}:${port}`;
};

const FILE_STATUS_ERRORS: Partial<Record<HostCertificateFileStatus, string>> = {
  [HostCertificateFileStatus.AccessDenied]: "The SSH user can't read the file",
  [HostCertificateFileStatus.NotFound]: "The file no longer exists",
  [HostCertificateFileStatus.TooLarge]: "The file is bigger than the job's largest file setting",
  [HostCertificateFileStatus.ParseError]: "The file could not be parsed",
  [HostCertificateFileStatus.Unsupported]: "The file uses a format or encryption that isn't supported",
  [HostCertificateFileStatus.NoCertificates]: "The file holds no certificates",
  [HostCertificateFileStatus.ReadFailed]: "The file could not be read"
};

export const describeHostFileError = (status: HostCertificateFileStatus) =>
  FILE_STATUS_ERRORS[status] ?? "The file could not be read";

const TRUNCATION_MESSAGES: Record<string, string | undefined> = {
  [HostScanTruncationReason.MaxFiles]: "stopped after 5,000 files, so some files were not checked",
  [HostScanTruncationReason.FileList]: "found too many files to list, so some files were not checked",
  [HostScanTruncationReason.ResponseSize]:
    "found more certificate data than one scan can return, so some files were not checked",
  [HostScanTruncationReason.TimeLimit]: "ran out of time, so some files were not checked"
};

export const summarizeHostScanIssues = (hostIdentifier: string, response: TCertificateScanResponse): string[] => {
  const issues: string[] = [];
  const counts = new Map<HostCertificateFileStatus, string[]>();
  response.files.forEach((file) => {
    if (
      !FILE_STATUS_ERRORS[file.status] ||
      file.status === HostCertificateFileStatus.NotFound ||
      file.status === HostCertificateFileStatus.NoCertificates
    )
      return;
    counts.set(file.status, [...(counts.get(file.status) ?? []), file.realPath]);
  });
  counts.forEach((paths, status) => {
    const more = paths.length > 1 ? ` and ${paths.length - 1} more` : "";
    issues.push(`${hostIdentifier}: ${FILE_STATUS_ERRORS[status]} (${paths[0]}${more})`);
  });
  if (response.deniedFolders.length > 0) {
    issues.push(
      `${hostIdentifier}: The SSH user can't open ${response.deniedFolders.length} folder(s) (${response.deniedFolders[0]})`
    );
  }
  if (response.truncatedReason) {
    const reason = TRUNCATION_MESSAGES[response.truncatedReason] ?? "stopped early, so some files were not checked";
    issues.push(`${hostIdentifier}: The scan ${reason}`);
  }
  return issues;
};

export const describeCertificateScanFailure = (failure: TCertificateScanRpcFailure, gatewayName: string): string => {
  if (failure.status === CertificateScanRpcStatus.Timeout) {
    return "The scan did not finish in time";
  }
  if (failure.status === CertificateScanRpcStatus.Busy) {
    return `Gateway '${gatewayName}' is busy with other certificate scans. Try again later.`;
  }
  switch (failure.kind) {
    case "auth":
      return "Could not sign in with the SSH connection's credentials";
    case "transport":
      return `Could not reach the host from gateway '${gatewayName}'`;
    default:
      return `Gateway '${gatewayName}' could not scan the host`;
  }
};
