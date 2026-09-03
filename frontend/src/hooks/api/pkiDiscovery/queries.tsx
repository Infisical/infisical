import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  PkiDiscoveryScanStatus,
  TGetLatestScanDTO,
  TGetPkiDiscoveryDTO,
  TGetPkiInstallationDTO,
  TGetScanHistoryDTO,
  TGetScanHistoryResponse,
  TListPkiDiscoveriesDTO,
  TListPkiDiscoveriesResponse,
  TListPkiInstallationsDTO,
  TListPkiInstallationsResponse,
  TPkiDiscovery,
  TPkiDiscoveryScan,
  TPkiInstallation
} from "./types";

export const pkiDiscoveryKeys = {
  all: ["pkiDiscovery"] as const,
  list: (projectId: string) => [...pkiDiscoveryKeys.all, "list", projectId] as const,
  listWithOpts: (filters: TListPkiDiscoveriesDTO) =>
    [...pkiDiscoveryKeys.list(filters.projectId), filters] as const,
  discovery: (discoveryId: string) => [...pkiDiscoveryKeys.all, "detail", discoveryId] as const,
  latestScan: (discoveryId: string) =>
    [...pkiDiscoveryKeys.all, "latestScan", discoveryId] as const,
  scanHistoryByDiscovery: (discoveryId: string) =>
    [...pkiDiscoveryKeys.all, "scanHistory", discoveryId] as const,
  scanHistory: (filters: TGetScanHistoryDTO) =>
    [...pkiDiscoveryKeys.scanHistoryByDiscovery(filters.discoveryId), filters] as const
};

export const pkiInstallationKeys = {
  all: ["pkiInstallation"] as const,
  list: (projectId: string) => [...pkiInstallationKeys.all, "list", projectId] as const,
  listWithOpts: (filters: TListPkiInstallationsDTO) =>
    [...pkiInstallationKeys.list(filters.projectId), filters] as const,
  installation: (installationId: string) =>
    [...pkiInstallationKeys.all, "detail", installationId] as const
};

type TPollingOptions = { refetchInterval?: number | false };

const SCAN_IN_FLIGHT_POLL_MS = 5000;
// Slow background poll while idle so a scan started elsewhere (scheduled auto-scan, or a
// stale terminal status read from a replica right after triggering) is still picked up.
const SCAN_IDLE_POLL_MS = 30000;

export const isPkiDiscoveryScanInFlight = (status?: PkiDiscoveryScanStatus | null) =>
  status === PkiDiscoveryScanStatus.Pending || status === PkiDiscoveryScanStatus.Running;

export const useListPkiDiscoveries = ({
  projectId,
  offset = 0,
  limit = 25,
  search
}: TListPkiDiscoveriesDTO) => {
  return useQuery({
    queryKey: pkiDiscoveryKeys.listWithOpts({ projectId, offset, limit, search }),
    queryFn: async () => {
      const params = new URLSearchParams({
        projectId,
        offset: String(offset),
        limit: String(limit)
      });
      if (search) {
        params.append("search", search);
      }
      const { data } = await apiRequest.get<TListPkiDiscoveriesResponse>(
        `/api/v1/cert-manager/discovery-jobs?${params.toString()}`
      );
      return data;
    },
    enabled: Boolean(projectId),
    placeholderData: (previousData) => previousData
  });
};

export const useGetPkiDiscovery = ({ discoveryId }: TGetPkiDiscoveryDTO) => {
  return useQuery({
    queryKey: pkiDiscoveryKeys.discovery(discoveryId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPkiDiscovery>(
        `/api/v1/cert-manager/discovery-jobs/${discoveryId}`
      );
      return data;
    },
    enabled: Boolean(discoveryId),
    refetchInterval: (query) =>
      isPkiDiscoveryScanInFlight(query.state.data?.lastScanStatus)
        ? SCAN_IN_FLIGHT_POLL_MS
        : SCAN_IDLE_POLL_MS
  });
};

export const useGetLatestScan = ({ discoveryId }: TGetLatestScanDTO) => {
  return useQuery({
    queryKey: pkiDiscoveryKeys.latestScan(discoveryId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPkiDiscoveryScan | null>(
        `/api/v1/cert-manager/discovery-jobs/${discoveryId}/latest-scan`
      );
      return data;
    },
    enabled: Boolean(discoveryId)
  });
};

export const useGetScanHistory = (
  { discoveryId, offset = 0, limit = 25 }: TGetScanHistoryDTO,
  options?: TPollingOptions
) => {
  return useQuery({
    queryKey: pkiDiscoveryKeys.scanHistory({ discoveryId, offset, limit }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });
      const { data } = await apiRequest.get<TGetScanHistoryResponse>(
        `/api/v1/cert-manager/discovery-jobs/${discoveryId}/scans?${params.toString()}`
      );
      return data;
    },
    enabled: Boolean(discoveryId),
    placeholderData: (previousData) => previousData,
    refetchInterval: options?.refetchInterval
  });
};

export const useListPkiInstallations = (
  {
    projectId,
    discoveryId,
    certificateId,
    offset = 0,
    limit = 25,
    search
  }: TListPkiInstallationsDTO,
  options?: TPollingOptions
) => {
  return useQuery({
    queryKey: pkiInstallationKeys.listWithOpts({
      projectId,
      discoveryId,
      certificateId,
      offset,
      limit,
      search
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        projectId,
        offset: String(offset),
        limit: String(limit)
      });
      if (discoveryId) {
        params.append("discoveryId", discoveryId);
      }
      if (certificateId) {
        params.append("certificateId", certificateId);
      }
      if (search) {
        params.append("search", search);
      }
      const { data } = await apiRequest.get<TListPkiInstallationsResponse>(
        `/api/v1/cert-manager/installations?${params.toString()}`
      );
      return data;
    },
    enabled: Boolean(projectId),
    placeholderData: (previousData) => previousData,
    refetchInterval: options?.refetchInterval
  });
};

export const useGetPkiInstallation = ({ installationId }: TGetPkiInstallationDTO) => {
  return useQuery({
    queryKey: pkiInstallationKeys.installation(installationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPkiInstallation>(
        `/api/v1/cert-manager/installations/${installationId}`
      );
      return data;
    },
    enabled: Boolean(installationId)
  });
};
