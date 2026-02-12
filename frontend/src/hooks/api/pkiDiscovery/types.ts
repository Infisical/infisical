export enum PkiDiscoveryType {
  Network = "network"
}

export const PkiDiscoveryTypeLabels: Record<PkiDiscoveryType, string> = {
  [PkiDiscoveryType.Network]: "Network"
};

export enum PkiDiscoveryScanStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed"
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

export type TPkiDiscoveryTargetConfig = {
  ipRanges?: string[];
  domains?: string[];
  ports?: string; // Port specification: "443", "443, 8443", "8000-8100", or empty for auto-detect
};

export type TPkiDiscovery = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  discoveryType: PkiDiscoveryType;
  targetConfig: TPkiDiscoveryTargetConfig;
  isAutoScanEnabled: boolean;
  scanIntervalDays: number | null;
  gatewayId: string | null;
  isActive: boolean;
  lastScanStatus: PkiDiscoveryScanStatus | null;
  lastScanJobId: string | null;
  lastScanMessage: string | null;
  lastScannedAt: string | null;
  certificatesFound: number;
  installationsFound: number;
  createdAt: string;
  updatedAt: string;
  linkedInstallationsCount?: number;
};

export type TPkiInstallation = {
  id: string;
  projectId: string;
  locationType: PkiInstallationLocationType;
  locationDetails: {
    ipAddress?: string;
    fqdn?: string; // Fully qualified domain name (for domain-based installations)
    port?: number;
    hostIdentifier?: string;
    filePath?: string;
    keyStoreName?: string;
    cloudProvider?: string;
    cloudResource?: string;
    gatewayName?: string;
  };
  locationFingerprint: string;
  name: string | null;
  type: PkiInstallationType;
  metadata: Record<string, unknown> | null;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  certificates?: TPkiInstallationCert[];
  certificatesCount?: number;
  primaryCertName?: string | null;
};

export type TPkiInstallationCert = {
  id: string;
  installationId: string;
  certificateId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  commonName?: string | null;
  serialNumber?: string | null;
  notBefore?: string | null;
  notAfter?: string | null;
  status?: string | null;
  friendlyName?: string | null;
  fingerprintSha256?: string | null;
};

export type TPkiDiscoveryScan = {
  id: string;
  discoveryConfigId: string;
  startedAt: string;
  completedAt: string | null;
  status: PkiDiscoveryScanStatus;
  targetsScannedCount: number;
  certificatesFoundCount: number;
  installationsFoundCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

// Request/Response types
export type TListPkiDiscoveriesDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  search?: string;
};

export type TListPkiDiscoveriesResponse = {
  discoveries: TPkiDiscovery[];
  totalCount: number;
};

export type TGetPkiDiscoveryDTO = {
  discoveryId: string;
};

export type TCreatePkiDiscoveryDTO = {
  projectId: string;
  name: string;
  description?: string;
  discoveryType?: PkiDiscoveryType;
  targetConfig: TPkiDiscoveryTargetConfig;
  isAutoScanEnabled?: boolean;
  scanIntervalDays?: number;
  gatewayId?: string;
};

export type TUpdatePkiDiscoveryDTO = {
  discoveryId: string;
  name?: string;
  description?: string | null;
  targetConfig?: TPkiDiscoveryTargetConfig;
  isAutoScanEnabled?: boolean;
  scanIntervalDays?: number | null;
  gatewayId?: string | null;
  isActive?: boolean;
};

export type TDeletePkiDiscoveryDTO = {
  discoveryId: string;
};

export type TTriggerPkiDiscoveryScanDTO = {
  discoveryId: string;
};

export type TTriggerPkiDiscoveryScanResponse = {
  message: string;
};

export type TGetLatestScanDTO = {
  discoveryId: string;
};

export type TGetScanHistoryDTO = {
  discoveryId: string;
  offset?: number;
  limit?: number;
};

export type TGetScanHistoryResponse = {
  scans: TPkiDiscoveryScan[];
  totalCount: number;
};

// Installation types
export type TListPkiInstallationsDTO = {
  projectId: string;
  discoveryId?: string;
  offset?: number;
  limit?: number;
  search?: string;
};

export type TListPkiInstallationsResponse = {
  installations: TPkiInstallation[];
  totalCount: number;
};

export type TGetPkiInstallationDTO = {
  installationId: string;
};

export type TUpdatePkiInstallationDTO = {
  installationId: string;
  name?: string;
};

export type TDeletePkiInstallationDTO = {
  installationId: string;
};
