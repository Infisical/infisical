import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import {
  TGcpCertificateMap,
  TGcpLocation,
  TGcpProject,
  TListCertificateManagerResources,
  TListProjectLocations
} from "./types";

const gcpConnectionKeys = {
  all: [...appConnectionKeys.all, "gcp"] as const,
  listProjects: (connectionId: string) =>
    [...gcpConnectionKeys.all, "projects", connectionId] as const,
  listProjectLocations: ({ projectId, connectionId }: TListProjectLocations) =>
    [...gcpConnectionKeys.all, "project-locations", connectionId, projectId] as const,
  listCertificateManagerProjects: (connectionId: string) =>
    [...gcpConnectionKeys.all, "certificate-manager-projects", connectionId] as const,
  listCertificateManagerLocations: ({
    connectionId,
    gcpProjectId
  }: TListCertificateManagerResources) =>
    [
      ...gcpConnectionKeys.all,
      "certificate-manager-locations",
      connectionId,
      gcpProjectId
    ] as const,
  listCertificateMaps: ({ connectionId, gcpProjectId }: TListCertificateManagerResources) =>
    [...gcpConnectionKeys.all, "certificate-maps", connectionId, gcpProjectId] as const
};

export const useGcpConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TGcpProject[],
      unknown,
      TGcpProject[],
      ReturnType<typeof gcpConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gcpConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGcpProject[]>(
        `/api/v1/app-connections/gcp/${connectionId}/secret-manager-projects`
      );

      return data;
    },
    ...options
  });
};

export const useGcpConnectionListProjectLocations = (
  { connectionId, projectId }: TListProjectLocations,
  options?: Omit<
    UseQueryOptions<
      TGcpLocation[],
      unknown,
      TGcpLocation[],
      ReturnType<typeof gcpConnectionKeys.listProjectLocations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gcpConnectionKeys.listProjectLocations({ connectionId, projectId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGcpLocation[]>(
        `/api/v1/app-connections/gcp/${connectionId}/secret-manager-project-locations`,
        { params: { projectId } }
      );

      return data;
    },
    ...options
  });
};

export const useGcpConnectionListCertificateManagerProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TGcpProject[],
      unknown,
      TGcpProject[],
      ReturnType<typeof gcpConnectionKeys.listCertificateManagerProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gcpConnectionKeys.listCertificateManagerProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGcpProject[]>(
        `/api/v1/app-connections/gcp/${connectionId}/certificate-manager-projects`
      );

      return data;
    },
    ...options
  });
};

export const useGcpConnectionListCertificateManagerLocations = (
  { connectionId, gcpProjectId }: TListCertificateManagerResources,
  options?: Omit<
    UseQueryOptions<
      TGcpLocation[],
      unknown,
      TGcpLocation[],
      ReturnType<typeof gcpConnectionKeys.listCertificateManagerLocations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gcpConnectionKeys.listCertificateManagerLocations({ connectionId, gcpProjectId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGcpLocation[]>(
        `/api/v1/app-connections/gcp/${connectionId}/certificate-manager-locations`,
        { params: { gcpProjectId } }
      );

      return data;
    },
    ...options
  });
};

export const useGcpConnectionListCertificateMaps = (
  { connectionId, gcpProjectId }: TListCertificateManagerResources,
  options?: Omit<
    UseQueryOptions<
      TGcpCertificateMap[],
      unknown,
      TGcpCertificateMap[],
      ReturnType<typeof gcpConnectionKeys.listCertificateMaps>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gcpConnectionKeys.listCertificateMaps({ connectionId, gcpProjectId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGcpCertificateMap[]>(
        `/api/v1/app-connections/gcp/${connectionId}/certificate-maps`,
        { params: { gcpProjectId } }
      );

      return data;
    },
    ...options
  });
};
