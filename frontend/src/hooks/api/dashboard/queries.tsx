import { useCallback } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import {
  DashboardProjectSecretsDetails,
  DashboardProjectSecretsDetailsResponse,
  DashboardProjectSecretsOverview,
  DashboardProjectSecretsOverviewResponse,
  DashboardSecretsOrderBy,
  TGetDashboardProjectSecretsDetailsDTO,
  TGetDashboardProjectSecretsOverviewDTO
} from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { mergePersonalSecrets } from "@app/hooks/api/secrets/queries";

export const dashboardKeys = {
  all: () => ["dashboard"] as const,
  getDashboardSecrets: ({
    projectId,
    secretPath
  }: Pick<TGetDashboardProjectSecretsDetailsDTO, "projectId" | "secretPath">) =>
    [...dashboardKeys.all(), { projectId, secretPath }] as const,
  getProjectSecretsOverview: ({
    projectId,
    secretPath,
    ...params
  }: TGetDashboardProjectSecretsOverviewDTO) =>
    [
      ...dashboardKeys.getDashboardSecrets({ projectId, secretPath }),
      "secrets-overview",
      params
    ] as const,
  getProjectSecretsDetails: ({
    projectId,
    secretPath,
    environment,
    ...params
  }: TGetDashboardProjectSecretsDetailsDTO) =>
    [
      ...dashboardKeys.getDashboardSecrets({ projectId, secretPath }),
      environment,
      "secrets-details",
      params
    ] as const
};

export const fetchProjectSecretsOverview = async ({
  includeFolders,
  includeSecrets,
  includeDynamicSecrets,
  environments,
  ...params
}: TGetDashboardProjectSecretsOverviewDTO) => {
  const { data } = await apiRequest.get<DashboardProjectSecretsOverviewResponse>(
    "/api/v3/dashboard/secrets-overview",
    {
      params: {
        ...params,
        environments: encodeURIComponent(environments.join(",")),
        includeFolders: includeFolders ? "1" : "",
        includeSecrets: includeSecrets ? "1" : "",
        includeDynamicSecrets: includeDynamicSecrets ? "1" : ""
      }
    }
  );

  return data;
};

export const fetchProjectSecretsDetails = async ({
  includeFolders,
  includeImports,
  includeSecrets,
  includeDynamicSecrets,
  tags,
  ...params
}: TGetDashboardProjectSecretsDetailsDTO) => {
  const { data } = await apiRequest.get<DashboardProjectSecretsDetailsResponse>(
    "/api/v3/dashboard/secrets-details",
    {
      params: {
        ...params,
        includeImports: includeImports ? "1" : "",
        includeFolders: includeFolders ? "1" : "",
        includeSecrets: includeSecrets ? "1" : "",
        includeDynamicSecrets: includeDynamicSecrets ? "1" : "",
        tags: encodeURIComponent(
          Object.entries(tags)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .filter(([_, enabled]) => enabled)
            .map(([tag]) => tag)
            .join(",")
        )
      }
    }
  );

  return data;
};

export const useGetProjectSecretsOverview = (
  {
    projectId,
    secretPath,
    offset = 0,
    limit = 100,
    orderBy = DashboardSecretsOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = "",
    includeSecrets,
    includeFolders,
    includeDynamicSecrets,
    environments
  }: TGetDashboardProjectSecretsOverviewDTO,
  options?: Omit<
    UseQueryOptions<
      DashboardProjectSecretsOverviewResponse,
      unknown,
      DashboardProjectSecretsOverview,
      ReturnType<typeof dashboardKeys.getProjectSecretsOverview>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    ...options,
    // wait for all values to be available
    enabled: Boolean(projectId) && (options?.enabled ?? true) && Boolean(environments.length),
    queryKey: dashboardKeys.getProjectSecretsOverview({
      secretPath,
      search,
      limit,
      orderBy,
      orderDirection,
      offset,
      projectId,
      includeSecrets,
      includeFolders,
      includeDynamicSecrets,
      environments
    }),
    queryFn: () =>
      fetchProjectSecretsOverview({
        secretPath,
        search,
        limit,
        orderBy,
        orderDirection,
        offset,
        projectId,
        includeSecrets,
        includeFolders,
        includeDynamicSecrets,
        environments
      }),
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const serverResponse = error.response?.data as { message: string };
        createNotification({
          title: "Error fetching secret details",
          type: "error",
          text: serverResponse.message
        });
      }
    },
    select: useCallback((data: Awaited<ReturnType<typeof fetchProjectSecretsOverview>>) => {
      const { secrets, ...select } = data;

      return {
        ...select,
        secrets: secrets ? mergePersonalSecrets(secrets) : undefined
      };
    }, []),
    keepPreviousData: true
  });
};

export const useGetProjectSecretsDetails = (
  {
    projectId,
    secretPath,
    environment,
    offset = 0,
    limit = 100,
    orderBy = DashboardSecretsOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = "",
    includeSecrets,
    includeFolders,
    includeImports,
    includeDynamicSecrets,
    tags
  }: TGetDashboardProjectSecretsDetailsDTO,
  options?: Omit<
    UseQueryOptions<
      DashboardProjectSecretsDetailsResponse,
      unknown,
      DashboardProjectSecretsDetails,
      ReturnType<typeof dashboardKeys.getProjectSecretsDetails>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    ...options,
    // wait for all values to be available
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    queryKey: dashboardKeys.getProjectSecretsDetails({
      secretPath,
      search,
      limit,
      orderBy,
      orderDirection,
      offset,
      projectId,
      environment,
      includeSecrets,
      includeFolders,
      includeImports,
      includeDynamicSecrets,
      tags
    }),
    queryFn: () =>
      fetchProjectSecretsDetails({
        secretPath,
        search,
        limit,
        orderBy,
        orderDirection,
        offset,
        projectId,
        environment,
        includeSecrets,
        includeFolders,
        includeImports,
        includeDynamicSecrets,
        tags
      }),
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const serverResponse = error.response?.data as { message: string };
        createNotification({
          title: "Error fetching secret details",
          type: "error",
          text: serverResponse.message
        });
      }
    },
    select: useCallback(
      (data: Awaited<ReturnType<typeof fetchProjectSecretsDetails>>) => ({
        ...data,
        secrets: data.secrets ? mergePersonalSecrets(data.secrets) : undefined
      }),
      []
    ),
    keepPreviousData: true
  });
};
