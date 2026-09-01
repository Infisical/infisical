import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import {
  TQoveryConnectionEnvironment,
  TQoveryConnectionOrganization,
  TQoveryConnectionProject
} from "./types";

const qoveryConnectionKeys = {
  all: [...appConnectionKeys.all, "qovery"] as const,
  listOrganizations: (connectionId: string) =>
    [...qoveryConnectionKeys.all, "organizations", connectionId] as const,
  listProjects: (connectionId: string, organizationId: string) =>
    [...qoveryConnectionKeys.all, "projects", connectionId, organizationId] as const,
  listEnvironments: (connectionId: string, projectId: string) =>
    [...qoveryConnectionKeys.all, "environments", connectionId, projectId] as const
};

export const useQoveryConnectionListOrganizations = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TQoveryConnectionOrganization[],
      unknown,
      TQoveryConnectionOrganization[],
      ReturnType<typeof qoveryConnectionKeys.listOrganizations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: qoveryConnectionKeys.listOrganizations(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TQoveryConnectionOrganization[]>(
        `/api/v1/app-connections/qovery/${connectionId}/organizations`
      );

      return data;
    },
    ...options
  });
};

export const useQoveryConnectionListProjects = (
  connectionId: string,
  organizationId: string,
  options?: Omit<
    UseQueryOptions<
      TQoveryConnectionProject[],
      unknown,
      TQoveryConnectionProject[],
      ReturnType<typeof qoveryConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: qoveryConnectionKeys.listProjects(connectionId, organizationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TQoveryConnectionProject[]>(
        `/api/v1/app-connections/qovery/${connectionId}/organizations/${organizationId}/projects`
      );

      return data;
    },
    ...options
  });
};

export const useQoveryConnectionListEnvironments = (
  connectionId: string,
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TQoveryConnectionEnvironment[],
      unknown,
      TQoveryConnectionEnvironment[],
      ReturnType<typeof qoveryConnectionKeys.listEnvironments>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: qoveryConnectionKeys.listEnvironments(connectionId, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TQoveryConnectionEnvironment[]>(
        `/api/v1/app-connections/qovery/${connectionId}/projects/${projectId}/environments`
      );

      return data;
    },
    ...options
  });
};
