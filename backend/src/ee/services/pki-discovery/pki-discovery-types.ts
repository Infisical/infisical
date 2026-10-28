import { z } from "zod";

import { OrgServiceActor, TProjectPermission } from "@app/lib/types";

import type { LinuxServerTargetConfigSchema } from "./pki-discovery-schemas";

export enum PkiDiscoveryType {
  Network = "network",
  LinuxServer = "linux-server"
}

export enum PkiKeystoreStatus {
  Locked = "locked",
  Readable = "readable",
  PasswordFailed = "password_failed"
}

export enum PkiCertificateFileFormat {
  Pem = "pem",
  Der = "der",
  Pkcs7 = "pkcs7",
  Pkcs12 = "pkcs12",
  Jks = "jks",
  Jceks = "jceks"
}

export enum HostCertificateFileStatus {
  Ok = "ok",
  Locked = "locked",
  PasswordFailed = "passwordFailed",
  AccessDenied = "accessDenied",
  NotFound = "notFound",
  TooLarge = "tooLarge",
  ParseError = "parseError",
  Unsupported = "unsupported",
  NoCertificates = "noCertificates",
  ReadFailed = "readFailed"
}

export enum HostScanTruncationReason {
  FileList = "fileList",
  MaxFiles = "maxFiles",
  ResponseSize = "responseSize",
  TimeLimit = "timeLimit"
}

export enum PkiKeystorePasswordChange {
  Set = "set",
  Cleared = "cleared"
}

export enum HostFileImportAction {
  Skip = "skip",
  Refresh = "refresh",
  Upsert = "upsert"
}

export enum HostCertificateChainKind {
  Leaf = "leaf",
  Ca = "ca"
}

export enum PkiDiscoveryScanStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled"
}

export enum PkiInstallationLocationType {
  Network = "network",
  Filesystem = "filesystem",
  Keystore = "keystore",
  OsStore = "os_store",
  Cloud = "cloud"
}

export enum PkiInstallationType {
  Server = "server",
  LoadBalancer = "load_balancer",
  Cdn = "cdn",
  Hsm = "hsm",
  Container = "container",
  Unknown = "unknown"
}

export enum CertificateSource {
  Issued = "issued",
  Discovered = "discovered",
  Imported = "imported"
}

export type TNetworkTargetConfig = {
  ipRanges?: string[];
  domains?: string[];
  ports?: string;
};

export type TLinuxServerTargetConfig = z.infer<typeof LinuxServerTargetConfigSchema>;

export type TPkiDiscoveryTargetConfig = TNetworkTargetConfig | TLinuxServerTargetConfig;

export type TPkiInstallationLocationDetails = {
  ipAddress?: string;
  fqdn?: string;
  port?: number;
  hostIdentifier?: string;
  filePath?: string;
  protocol?: string;
  gatewayName?: string;
  hostname?: string;
  connectionId?: string;
  format?: PkiCertificateFileFormat;
};

export type TPkiInstallationMetadata = {
  keystoreStatus?: PkiKeystoreStatus;
  lastReadAt?: string;
  lastCheckedAt?: string;
  lastError?: string;
};

export type TCreatePkiDiscoveryDTO = {
  projectId: string;
  name: string;
  description?: string;
  discoveryType?: PkiDiscoveryType;
  targetConfig: TPkiDiscoveryTargetConfig;
  isAutoScanEnabled?: boolean;
  scanIntervalDays?: number;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  orgActor: OrgServiceActor;
} & Omit<TProjectPermission, "projectId">;

export type TUpdatePkiDiscoveryDTO = {
  discoveryId: string;
  name?: string;
  description?: string;
  targetConfig?: TPkiDiscoveryTargetConfig;
  isAutoScanEnabled?: boolean;
  scanIntervalDays?: number;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  isActive?: boolean;
  orgActor: OrgServiceActor;
} & Omit<TProjectPermission, "projectId">;

export type TDeletePkiDiscoveryDTO = {
  discoveryId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetPkiDiscoveryDTO = {
  discoveryId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListPkiDiscoveriesDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  search?: string;
} & Omit<TProjectPermission, "projectId">;

export type TTriggerPkiDiscoveryScanDTO = {
  discoveryId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetLatestScanDTO = {
  discoveryId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetScanHistoryDTO = {
  discoveryId: string;
  offset?: number;
  limit?: number;
} & Omit<TProjectPermission, "projectId">;

export type TListPkiInstallationsDTO = {
  projectId: string;
  discoveryId?: string;
  certificateId?: string;
  offset?: number;
  limit?: number;
  search?: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetPkiInstallationDTO = {
  installationId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdatePkiInstallationDTO = {
  installationId: string;
  name?: string;
  keystorePassword?: string | null;
} & Omit<TProjectPermission, "projectId">;

export type TDeletePkiInstallationDTO = {
  installationId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetPkiInstallationsByCertificateIdDTO = {
  certificateId: string;
} & Omit<TProjectPermission, "projectId">;

export type TScanTarget = {
  host: string;
  port: number;
  isResolved: boolean;
  originalTarget?: string;
  sniHostname?: string;
};

export type TScanCertificateResult = {
  pemChain: string[];
  fingerprint: string;
  fingerprintSha1: string;
  commonName: string;
  altNames?: string;
  notBefore: Date;
  notAfter: Date;
  serialNumber: string;
  subjectOrganization?: string;
  subjectOrganizationalUnit?: string;
  subjectCountry?: string;
  subjectState?: string;
  subjectLocality?: string;
  keyAlgorithm?: string;
  signatureAlgorithm?: string;
  keyUsages?: string[];
  extendedKeyUsages?: string[];
  isCA?: boolean;
  pathLength?: number;
  issuerCommonName?: string;
  issuerOrganization?: string;
};

export enum ScanEndpointFailureReason {
  ConnectionFailed = "connection_failed",
  CertificateParseError = "certificate_parse_error"
}

export type TScanEndpointResult = {
  success: boolean;
  host: string;
  port: number;
  certificates?: TScanCertificateResult[];
  error?: string;
  failureReason?: ScanEndpointFailureReason;
  sniHostname?: string;
};
