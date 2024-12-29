import { useCallback } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import {
  DashboardProjectSecretsByKeys,
  DashboardProjectSecretsDetails,
  DashboardProjectSecretsDetailsResponse,
  DashboardProjectSecretsOverview,
  DashboardProjectSecretsOverviewResponse,
  DashboardSecretsOrderBy,
  TDashboardProjectSecretsQuickSearch,
  TDashboardProjectSecretsQuickSearchResponse,
  TGetDashboardProjectSecretsByKeys,
  TGetDashboardProjectSecretsDetailsDTO,
  TGetDashboardProjectSecretsOverviewDTO,
  TGetDashboardProjectSecretsQuickSearchDTO
} from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { mergePersonalSecrets } from "@app/hooks/api/secrets/queries";
import { groupBy, unique } from "@app/lib/fn/array";

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
      "secrets-details",
      environment,
      params
    ] as const,
  getProjectSecretsQuickSearch: ({
    projectId,
    secretPath,
    ...params
  }: TGetDashboardProjectSecretsQuickSearchDTO) =>
    [
      ...dashboardKeys.getDashboardSecrets({ projectId, secretPath }),
      "quick-search",
      params
    ] as const
};

export const fetchProjectSecretsOverview = async ({
  environments,
  ...params
}: TGetDashboardProjectSecretsOverviewDTO) => {
  const { data } = await apiRequest.get<DashboardProjectSecretsOverviewResponse>(
    "/api/v1/dashboard/secrets-overview",
    {
      params: {
        ...params,
        environments: encodeURIComponent(environments.join(","))
      }
    }
  );

  return data;
};

export const fetchProjectSecretsDetails = async ({
  tags,
  ...params
}: TGetDashboardProjectSecretsDetailsDTO) => {
  const { data } = await apiRequest.get<DashboardProjectSecretsDetailsResponse>(
    "/api/v1/dashboard/secrets-details",
    {
      params: {
        ...params,
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

export const fetchDashboardProjectSecretsByKeys = async ({
  keys,
  ...params
}: TGetDashboardProjectSecretsByKeys) => {
  const { data } = await apiRequest.get<DashboardProjectSecretsByKeys>(
    "/api/v1/dashboard/secrets-by-keys",
    {
      params: {
        ...params,
        keys: encodeURIComponent(keys.join(","))
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
        const { message, requestId } = error.response?.data as {
          message: string;
          requestId: string;
        };
        createNotification({
          title: "Error fetching secret details",
          type: "error",
          text: message,
          copyActions: [
            {
              value: requestId,
              name: "Request ID",
              label: `Request ID: ${requestId}`
            }
          ]
        });
      }
    },
    select: useCallback((data: Awaited<ReturnType<typeof fetchProjectSecretsOverview>>) => {
      const { secrets, ...select } = data;
      const uniqueSecrets = secrets ? unique(secrets, (i) => i.secretKey) : [];

      const uniqueFolders = select.folders ? unique(select.folders, (i) => i.name) : [];

      const uniqueDynamicSecrets = select.dynamicSecrets
        ? unique(select.dynamicSecrets, (i) => i.name)
        : [];

      return {
        ...select,
        secrets: secrets ? mergePersonalSecrets(secrets) : undefined,
        totalUniqueSecretsInPage: uniqueSecrets.length,
        totalUniqueDynamicSecretsInPage: uniqueDynamicSecrets.length,
        totalUniqueFoldersInPage: uniqueFolders.length
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
        const { message, requestId } = error.response?.data as {
          message: string;
          requestId: string;
        };
        createNotification({
          title: "Error fetching secret details",
          type: "error",
          text: message,
          copyActions: [
            {
              value: requestId,
              name: "Request ID",
              label: `Request ID: ${requestId}`
            }
          ]
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

export const fetchProjectSecretsQuickSearch = async ({
  environments,
  tags,
  ...params
}: TGetDashboardProjectSecretsQuickSearchDTO) => {
  const { data } = await apiRequest.get<TDashboardProjectSecretsQuickSearchResponse>(
    "/api/v1/dashboard/secrets-deep-search",
    {
      params: {
        ...params,
        environments: encodeURIComponent(environments.join(",")),
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

export const useGetProjectSecretsQuickSearch = (
  {
    projectId,
    secretPath,
    search = "",
    environments,
    tags
  }: TGetDashboardProjectSecretsQuickSearchDTO,
  options?: Omit<
    UseQueryOptions<
      TDashboardProjectSecretsQuickSearchResponse,
      unknown,
      TDashboardProjectSecretsQuickSearch,
      ReturnType<typeof dashboardKeys.getProjectSecretsQuickSearch>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    ...options,
    enabled:
      Boolean(search?.trim() || Object.values(tags).length) &&
      (options?.enabled ?? true) &&
      Boolean(environments.length),
    queryKey: dashboardKeys.getProjectSecretsQuickSearch({
      secretPath,
      search,
      projectId,
      environments,
      tags
    }),
    queryFn: () =>
      fetchProjectSecretsQuickSearch({
        secretPath,
        search,
        projectId,
        environments,
        tags
      }),
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const { message, requestId } = error.response?.data as {
          message: string;
          requestId: string;
        };
        createNotification({
          title: "Error fetching secrets deep search",
          type: "error",
          text: message,
          copyActions: [
            {
              value: requestId,
              name: "Request ID",
              label: `Request ID: ${requestId}`
            }
          ]
        });
      }
    },
    select: useCallback((data: Awaited<ReturnType<typeof fetchProjectSecretsQuickSearch>>) => {
      const { secrets, folders, dynamicSecrets } = data;

      const groupedFolders = groupBy(folders, (folder) => folder.path);
      const groupedSecrets = groupBy(
        mergePersonalSecrets(secrets),
        (secret) => `${secret.path === "/" ? "" : secret.path}/${secret.key}`
      );
      const groupedDynamicSecrets = groupBy(
        dynamicSecrets,
        (dynamicSecret) =>
          `${dynamicSecret.path === "/" ? "" : dynamicSecret.path}/${dynamicSecret.name}`
      );

      return {
        folders: groupedFolders,
        secrets: groupedSecrets,
        dynamicSecrets: groupedDynamicSecrets
      };
    }, []),
    keepPreviousData: true
  });
};
