import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
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
  scanHistory: (filters: TGetScanHistoryDTO) =>
    [...pkiDiscoveryKeys.all, "scanHistory", filters.discoveryId, filters] as const
};

export const pkiInstallationKeys = {
  all: ["pkiInstallation"] as const,
  list: (projectId: string) => [...pkiInstallationKeys.all, "list", projectId] as const,
  listWithOpts: (filters: TListPkiInstallationsDTO) =>
    [...pkiInstallationKeys.list(filters.projectId), filters] as const,
  installation: (installationId: string) =>
    [...pkiInstallationKeys.all, "detail", installationId] as const
};

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
    enabled: Boolean(discoveryId)
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

export const useGetScanHistory = ({ discoveryId, offset = 0, limit = 25 }: TGetScanHistoryDTO) => {
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
    placeholderData: (previousData) => previousData
  });
};

export const useListPkiInstallations = ({
  projectId,
  discoveryId,
  offset = 0,
  limit = 25,
  search
}: TListPkiInstallationsDTO) => {
  return useQuery({
    queryKey: pkiInstallationKeys.listWithOpts({ projectId, discoveryId, offset, limit, search }),
    queryFn: async () => {
      const params = new URLSearchParams({
        projectId,
        offset: String(offset),
        limit: String(limit)
      });
      if (discoveryId) {
        params.append("discoveryId", discoveryId);
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
    placeholderData: (previousData) => previousData
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

export const useGetPkiInstallationsByCertificateId = (certificateId: string) => {
  return useQuery({
    queryKey: [...pkiInstallationKeys.all, "byCertificate", certificateId] as const,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ installations: TPkiInstallation[] }>(
        `/api/v1/cert-manager/installations/by-certificate/${certificateId}`
      );
      return data.installations;
    },
    enabled: Boolean(certificateId)
  });
};
