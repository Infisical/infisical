export enum EndpointSecretFindingStatus {
  Open = "open",
  Resolved = "resolved"
}

export enum EndpointScanTrigger {
  Schedule = "schedule",
  Requested = "requested"
}

export type TEndpointScanPolicy = {
  isEnabled: boolean;
  roots: string[];
  excludePatterns: string[];
  maxFileMegabytes: number | null;
  intervalHours: number;
};

// inaccessibleRoots is the field that keeps this page honest: on macOS a device cannot read Desktop,
// Documents or Downloads until the agent is granted Full Disk Access, and a scan that could read
// nothing must not be presented as a device with no credentials on it.
export type TEndpointDeviceScan = {
  id: string;
  deviceId: string;
  deviceName: string;
  scanRequestId?: string | null;
  requestedAt?: string | null;
  lastScanStartedAt?: string | null;
  lastScanFinishedAt?: string | null;
  lastTrigger?: EndpointScanTrigger | null;
  filesScanned?: number | null;
  findingCount?: number | null;
  rootsScanned?: string[] | null;
  inaccessibleRoots?: string[] | null;
  truncated: boolean;
  createdAt: string;
  updatedAt: string;
};

// There is deliberately no field for the secret itself. The agent redacts on the device, so
// redactedMatch is the matched line with the credential already replaced.
export type TEndpointSecretFinding = {
  id: string;
  projectId: string;
  deviceId: string;
  deviceName: string;
  fingerprint: string;
  ruleId: string;
  description?: string | null;
  file: string;
  startLine: number;
  entropy?: number | null;
  redactedMatch?: string | null;
  fileModifiedAt?: string | null;
  status: EndpointSecretFindingStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TUpdateEndpointScanPolicyDTO = {
  isEnabled: boolean;
  roots: string[];
  excludePatterns: string[];
  maxFileMegabytes?: number;
  intervalHours: number;
};

export type TListEndpointSecretFindingsDTO = {
  deviceId?: string;
};

export type TRequestEndpointScanDTO = {
  deviceId: string;
};
