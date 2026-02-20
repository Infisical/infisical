export enum PamDiscoveryType {
  ActiveDirectory = "active-directory"
}

export const PAM_DISCOVERY_TYPE_MAP: Record<PamDiscoveryType, { name: string; image: string }> = {
  [PamDiscoveryType.ActiveDirectory]: { name: "Active Directory", image: "ActiveDirectory.png" }
};

export type TPamDiscoverySourceOption = {
  name: string;
  discoveryType: PamDiscoveryType;
};

export type TPamDiscoverySource = {
  id: string;
  projectId: string;
  name: string;
  discoveryType: PamDiscoveryType;
  gatewayId?: string | null;
  discoveryConfiguration?: Record<string, unknown>;
  discoveryCredentials?: Record<string, unknown>;
  schedule?: string | null;
  lastRunAt?: string | null;
  status: string;
  totalResources: number;
  totalAccounts: number;
  createdAt: string;
  updatedAt: string;
};

export type TPamDiscoveryRunProgress = {
  adEnumeration?: {
    status: "running" | "completed" | "failed";
    completedAt?: string;
    error?: string;
  };
  dependencyScan?: {
    status: "running" | "completed" | "failed" | "skipped";
    totalMachines?: number;
    scannedMachines?: number;
    failedMachines?: number;
    reason?: string;
  };
  machineErrors?: Record<string, string>;
};

export type TPamDiscoveryRun = {
  id: string;
  discoverySourceId: string;
  status: string;
  triggeredBy: string;
  resourcesDiscovered: number;
  accountsDiscovered: number;
  dependenciesDiscovered: number;
  newSinceLastRun: number;
  staleSinceLastRun: number;
  progress?: TPamDiscoveryRunProgress;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TDiscoveredResource = {
  id: string;
  resourceId: string;
  resourceName: string;
  resourceType: string;
  lastDiscoveredAt: string;
  isStale: boolean;
  createdAt: string;
};

export type TDiscoveredAccount = {
  id: string;
  accountId: string;
  accountName: string;
  resourceId: string;
  resourceName: string;
  resourceType: string;
  lastDiscoveredAt: string;
  isStale: boolean;
  metadata?: unknown;
  createdAt: string;
};

export type TListPamDiscoverySourcesDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  search?: string;
};

export type TCreatePamDiscoverySourceDTO = {
  projectId: string;
  name: string;
  discoveryType: PamDiscoveryType;
  gatewayId: string;
  discoveryCredentials: Record<string, unknown>;
  discoveryConfiguration: Record<string, unknown>;
  schedule?: string;
};

export type TUpdatePamDiscoverySourceDTO = {
  discoverySourceId: string;
  discoveryType: PamDiscoveryType;
  name?: string;
  gatewayId?: string;
  discoveryCredentials?: Record<string, unknown>;
  discoveryConfiguration?: Record<string, unknown>;
  schedule?: string;
  status?: string;
};

export type TDeletePamDiscoverySourceDTO = {
  discoverySourceId: string;
  discoveryType: PamDiscoveryType;
};

export type TTriggerPamDiscoveryScanDTO = {
  discoverySourceId: string;
  discoveryType: PamDiscoveryType;
};
